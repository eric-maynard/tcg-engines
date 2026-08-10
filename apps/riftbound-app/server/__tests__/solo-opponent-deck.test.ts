/**
 * Solo (Goldfish / vs-Claude) lobbies: the host chooses the practice seat's
 * deck — mirror / random of mine / a saved or public deck / starter — and the
 * server enforces ownership (own or public decks only), validates legality
 * like a human's deck, and seats P2 with it before pregame.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ServerWebSocket } from "bun";

// Isolated throwaway DB — must be set before the repo modules load.
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "rb-oppdeck-test-"));
process.env.RIFTBOUND_DB_PATH ??= path.join(TMP_DIR, "test.db");

const { createDeck, getDeck } = await import("../../src/db/deck-repo");
const { closeDb } = await import("../../src/db/schema");
const { createUser } = await import("../../src/db/user-repo");
const { buildDefaultDeck, savedDeckToDeckConfig } = await import("../decks");
const { allCards, registry } = await import("../cards");
const { createLobby } = await import("../routes-lobby");
const { lobbyWsMessage } = await import("../ws-lobby");
const { gameSessions, lobbies } = await import("../state");
const { parseOpponentDeck, resolveOpponentDeckId } = await import("../opponent-deck");
const { ClaudeOpponent, aiSeatMustAct, buildPrompt } = await import("../ai-opponent");
const { buildPregamePayload, finalizePregame } = await import("../pregame");

type WsData = import("../state").WsData;
type DeckConfig = import("../state").DeckConfig;
type GameSession = import("../state").GameSession;
type ModelRequest = import("../ai-opponent").ModelRequest;
type CallModel = import("../ai-opponent").CallModel;

const P1 = "player-1";
const P2 = "player-2";

let prevMock: string | undefined;
beforeAll(() => {
  prevMock = process.env.RB_AI_MOCK;
  process.env.RB_AI_MOCK = "1"; // Claude seats without a key (first-legal provider); swapped for a recorder below
});
afterAll(() => {
  if (prevMock === undefined) {delete process.env.RB_AI_MOCK;} else {process.env.RB_AI_MOCK = prevMock;}
  closeDb();
  fs.rmSync(TMP_DIR, { force: true, recursive: true });
});

/** Persist a DeckConfig as a saved deck for `userId` (grouped quantities per zone). */
function saveDeck(userId: string, name: string, cfg: DeckConfig, isPublic = false) {
  const cards: { cardId: string; quantity: number; zone: "main" | "rune" | "battlefield" | "sideboard" }[] = [];
  const push = (ids: readonly string[], zone: "main" | "rune" | "battlefield" | "sideboard") => {
    const counts = new Map<string, number>();
    for (const id of ids) {counts.set(id, (counts.get(id) ?? 0) + 1);}
    for (const [cardId, quantity] of counts) {cards.push({ cardId, quantity, zone });}
  };
  push(cfg.mainDeckCardIds, "main");
  push(cfg.runeDeckCardIds, "rune");
  push(cfg.battlefieldIds, "battlefield");
  push(cfg.sideboardCardIds ?? [], "sideboard");
  return createDeck({ cards, championId: cfg.championId as string, isPublic, legendId: cfg.legendId as string, name, userId });
}

function fakeWs(lobbyId: string, userId: string | null, role: "host" | "guest" = "host") {
  const sent: Record<string, unknown>[] = [];
  const ws = {
    data: { connId: `c-${crypto.randomUUID()}`, gameId: "", lobbyId, lobbyRole: role, playerId: "", userId } satisfies WsData,
    send(s: string) { sent.push(JSON.parse(s) as Record<string, unknown>); },
  } as unknown as ServerWebSocket<WsData>;
  return { sent, ws };
}

/** create (sandbox) → select host deck → start → choose first ⇒ the started GameSession. */
function playSolo(userId: string | null, opponent: Record<string, unknown>, hostDeckId: string, opts: { first?: "self" | "opponent"; gameMode?: string } = {}) {
  const before = lobbies.size;
  const res = createLobby({ gameMode: opts.gameMode ?? "duel", name: "t", opponent, sandbox: true }, userId);
  if (res.status !== 200) {
    return { res, session: undefined, lobby: undefined, lobbiesAdded: lobbies.size - before };
  }
  const { lobbyId } = res.body as { lobbyId: string };
  const lobby = lobbies.get(lobbyId)!;
  const { ws, sent } = fakeWs(lobbyId, userId);
  lobbyWsMessage(ws, { deckId: hostDeckId, type: "select_deck" });
  lobbyWsMessage(ws, { type: "start_game" });
  lobbyWsMessage(ws, { choice: opts.first ?? "self", type: "choose_first" });
  const session = lobby.gameId ? gameSessions.get(lobby.gameId) : undefined;
  return { lobbiesAdded: lobbies.size - before, lobby, res, sent, session };
}

const norm = (d: DeckConfig | undefined | null) => structuredClone({ ...d, sideboardCardIds: d?.sideboardCardIds ?? [] });

describe("solo lobby: opponent.deck modes seat P2 with the chosen deck before pregame", () => {
  const me = createUser(`oppdeck-me-${crypto.randomUUID()}`, "pw");
  const other = createUser(`oppdeck-other-${crypto.randomUUID()}`, "pw");
  const deckA = saveDeck(me.id, "Calm Mind A", buildDefaultDeck("calm", "mind"));
  const deckB = saveDeck(me.id, "Body Order B", buildDefaultDeck("body", "order"));
  const cfgA = savedDeckToDeckConfig(getDeck(deckA.id)!)!;
  const cfgB = savedDeckToDeckConfig(getDeck(deckB.id)!)!;
  const otherPrivate = saveDeck(other.id, "Their secret brew", buildDefaultDeck("calm", "mind"), false);
  const otherPublic = saveDeck(other.id, "Their public list", buildDefaultDeck("body", "order"), true);
  // A saved deck of mine that is NOT legal (no runes) — must be refused like a human's would be.
  const broken = createDeck({ cards: [{ cardId: cfgA.mainDeckCardIds[0] as string, quantity: 3, zone: "main" }], championId: cfgA.championId as string, legendId: cfgA.legendId as string, name: "Broken", userId: me.id });

  test("fixtures are legal and distinct", () => {
    expect(cfgA.legendId).not.toBe(cfgB.legendId);
    expect(cfgA.mainDeckCardIds.length + 1).toBeGreaterThanOrEqual(40);
    expect(savedDeckToDeckConfig(getDeck(broken.id)!)).toBeNull();
  });

  test("mode 'deck' with one of MY decks → P2's registered deck is exactly that deck (P1 keeps its own)", () => {
    const r = playSolo(me.id, { deck: { deckId: deckB.id, mode: "deck" }, kind: "goldfish" }, deckA.id);
    expect(r.res.status).toBe(200);
    expect(r.lobby?.opponentDeck).toMatchObject({ deckId: deckB.id, mode: "deck" });
    expect(r.lobby?.guest?.deckId).toBe(deckB.id);
    expect(norm(r.session?.decks?.[P2])).toEqual(norm(cfgB));
    expect(norm(r.session?.decks?.[P1])).toEqual(norm(cfgA));
    // The engine really seated that legend for P2.
    expect(r.session!.engine.getState()).toBeDefined();
    const internal = (r.session!.engine as unknown as { internalState: { cards: Record<string, { definitionId: string; owner: string; zone: string }> } }).internalState;
    const p2Legend = Object.entries(internal.cards).find(([, c]) => c.owner === P2 && c.zone === "legendZone");
    expect(p2Legend?.[1].definitionId).toBe(cfgB.legendId);
  });

  test("mode 'mirror' → P2's list equals the host's pick; mirror of the starter ('default') is the starter", () => {
    const r = playSolo(me.id, { deck: { mode: "mirror" }, kind: "goldfish" }, deckA.id);
    expect(r.res.status).toBe(200);
    expect(r.lobby?.guest?.deckId).toBe(deckA.id);
    expect(norm(r.session?.decks?.[P2])).toEqual(norm(r.session?.decks?.[P1]));
    expect(norm(r.session?.decks?.[P2])).toEqual(norm(cfgA));

    const d = playSolo(me.id, { deck: { mode: "mirror" }, kind: "goldfish" }, "default");
    expect(d.lobby?.guest?.deckId).toBe("default");
    expect(norm(d.session?.decks?.[P2])).toEqual(norm(buildDefaultDeck()));
    expect(resolveOpponentDeckId({ mode: "mirror" }, null)).toBe("default");
  });

  test("mode 'random-mine' → drawn from MY legal saved decks only (never the broken one, never someone else's)", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 12; i++) {
      const parsed = parseOpponentDeck({ mode: "random-mine" }, me.id);
      expect(parsed.ok).toBe(true);
      if (parsed.ok) {seen.add(parsed.spec.deckId as string);}
    }
    for (const id of seen) {expect([deckA.id, deckB.id]).toContain(id);}
    expect(seen.has(broken.id)).toBe(false);
    const r = playSolo(me.id, { deck: { mode: "random-mine" }, kind: "goldfish" }, "default");
    expect(r.res.status).toBe(200);
    const picked = r.lobby?.opponentDeck?.deckId as string;
    expect([deckA.id, deckB.id]).toContain(picked);
    expect(norm(r.session?.decks?.[P2])).toEqual(norm(picked === deckA.id ? cfgA : cfgB));
  });

  test("mode 'default' / absent → starter deck (legacy behaviour)", () => {
    const r = playSolo(me.id, { deck: { mode: "default" }, kind: "goldfish" }, deckA.id);
    expect(norm(r.session?.decks?.[P2])).toEqual(norm(buildDefaultDeck()));
    const r2 = playSolo(me.id, { kind: "goldfish" }, deckA.id);
    expect(r2.lobby?.opponentDeck).toEqual({ mode: "default" });
    expect(norm(r2.session?.decks?.[P2])).toEqual(norm(buildDefaultDeck()));
  });

  test("ownership: another user's PRIVATE deck → 404 and no lobby is created; their PUBLIC deck is allowed", () => {
    const denied = playSolo(me.id, { deck: { deckId: otherPrivate.id, mode: "deck" }, kind: "goldfish" }, deckA.id);
    expect(denied.res.status).toBe(404);
    expect((denied.res.body as { error: string }).error).toMatch(/not found/i);
    expect(denied.lobbiesAdded).toBe(0);
    expect(denied.session).toBeUndefined();
    // The body cannot smuggle identity: claiming to be the owner changes nothing (userId comes from the session).
    expect(createLobby({ opponent: { deck: { deckId: otherPrivate.id, mode: "deck", userId: other.id } as unknown, kind: "goldfish" }, sandbox: true }, me.id).status).toBe(404);
    // Anonymous callers get public + starter only.
    expect(parseOpponentDeck({ deckId: deckA.id, mode: "deck" }, null)).toMatchObject({ ok: false, status: 404 });
    expect(parseOpponentDeck({ mode: "random-mine" }, null)).toMatchObject({ ok: false, status: 401 });
    expect(parseOpponentDeck({ deckId: otherPublic.id, mode: "deck" }, null)).toMatchObject({ ok: true });

    const allowed = playSolo(me.id, { deck: { deckId: otherPublic.id, mode: "deck" }, kind: "goldfish" }, deckA.id);
    expect(allowed.res.status).toBe(200);
    expect(norm(allowed.session?.decks?.[P2])).toEqual(norm(savedDeckToDeckConfig(getDeck(otherPublic.id)!)));
  });

  test("invalid / deleted / illegal deck → 4xx with a clear message, nothing created", () => {
    const before = lobbies.size;
    expect(createLobby({ opponent: { deck: { deckId: "no-such-deck", mode: "deck" }, kind: "goldfish" }, sandbox: true }, me.id)).toMatchObject({ status: 404 });
    const illegal = createLobby({ opponent: { deck: { deckId: broken.id, mode: "deck" }, kind: "goldfish" }, sandbox: true }, me.id);
    expect(illegal.status).toBe(400);
    expect((illegal.body as { error: string }).error).toMatch(/not a legal deck/);
    expect(createLobby({ opponent: { deck: { mode: "steal" }, kind: "goldfish" }, sandbox: true }, me.id)).toMatchObject({ status: 400 });
    expect(createLobby({ opponent: { deck: "deckA", kind: "goldfish" }, sandbox: true }, me.id)).toMatchObject({ status: 400 });
    expect(lobbies.size).toBe(before);
  });

  test("lobby socket: select_deck refuses another user's private deck (sibling of the create path); select_opponent_deck applies the same rule", () => {
    const res = createLobby({ opponent: { kind: "goldfish" }, sandbox: true }, me.id);
    const { lobbyId } = res.body as { lobbyId: string };
    const lobby = lobbies.get(lobbyId)!;
    const { ws, sent } = fakeWs(lobbyId, me.id);
    lobby.host.ws = ws; // as lobbyWsOpen would — so lobby_update broadcasts are captured too
    lobbyWsMessage(ws, { deckId: otherPrivate.id, type: "select_deck" });
    expect(lobby.host.deckId).toBeNull();
    expect(lobby.host.ready).toBe(false);
    expect(sent.some((m) => m.type === "lobby_error")).toBe(true);
    lobbyWsMessage(ws, { deckId: otherPublic.id, type: "select_deck" });
    expect(lobby.host.deckId).toBe(otherPublic.id);
    lobbyWsMessage(ws, { deckId: deckA.id, type: "select_deck" });
    expect(lobby.host.deckId).toBe(deckA.id);

    // Host switches the practice seat's deck from the lobby room.
    lobbyWsMessage(ws, { deck: { deckId: otherPrivate.id, mode: "deck" }, type: "select_opponent_deck" });
    expect(lobby.guest?.deckId).toBe("default");
    expect(sent.filter((m) => m.type === "lobby_error").length).toBe(2);
    lobbyWsMessage(ws, { deck: { mode: "mirror" }, type: "select_opponent_deck" });
    expect(lobby.opponentDeck?.mode).toBe("mirror");
    expect(lobby.guest?.deckId).toBe(deckA.id);
    lobbyWsMessage(ws, { deckId: deckB.id, type: "select_deck" }); // mirror follows the host
    expect(lobby.guest?.deckId).toBe(deckB.id);
    lobbyWsMessage(ws, { deck: { deckId: deckA.id, mode: "deck" }, type: "select_opponent_deck" });
    expect(lobby.guest?.deckId).toBe(deckA.id);
    const update = sent.filter((m) => m.type === "lobby_update").at(-1) as { lobby: { opponentDeck?: { mode: string; deckName?: string } } };
    expect(update.lobby.opponentDeck).toMatchObject({ deckName: "Calm Mind A", mode: "deck" });
    // A guest socket cannot set it.
    const g = fakeWs(lobbyId, other.id, "guest");
    lobbyWsMessage(g.ws, { deck: { mode: "default" }, type: "select_opponent_deck" });
    expect(lobby.opponentDeck?.mode).toBe("deck");
  });

  test("Bo3 pregame: P2's battlefield options come from the chosen deck", () => {
    // Give deck B a distinctive battlefield trio (the last three in the pool).
    const pool = allCards.filter((c) => c.cardType === "battlefield").map((c) => c.id);
    const trio = pool.slice(-3);
    expect(trio).toHaveLength(3);
    const custom = saveDeck(me.id, "BF deck", { ...cfgB, battlefieldIds: trio });
    const r = playSolo(me.id, { deck: { deckId: custom.id, mode: "deck" }, kind: "goldfish" }, deckA.id, { gameMode: "match" });
    expect(r.res.status).toBe(200);
    expect(r.session?.pregame?.phase).toBe("battlefield_select");
    expect(r.session?.pregame?.battlefieldOptions[P2]).toEqual(trio);
    expect(r.session?.pregame?.battlefieldOptions[P1]).toEqual(cfgA.battlefieldIds);
    const payload = buildPregamePayload(r.session!, P2) as { battlefieldOptions: { id: string }[] };
    expect(payload.battlefieldOptions.map((b) => b.id)).toEqual(trio);
    // Bo1: the random pick for P2 is one of ITS deck's battlefields.
    const bo1 = playSolo(me.id, { deck: { deckId: custom.id, mode: "deck" }, kind: "goldfish" }, deckA.id);
    expect(trio).toContain(bo1.session?.pregame?.battlefieldSelections[P2] as string);
  });

  test("vs Claude: the seat is a Claude driver and its system prompt describes ITS deck (not the starter, not the human's)", async () => {
    const r = playSolo(me.id, { deck: { deckId: deckB.id, mode: "deck" }, kind: "claude", model: "haiku" }, deckA.id, { first: "opponent" });
    expect(r.res.status).toBe(200);
    const session = r.session as GameSession;
    expect(session.opponent?.info).toMatchObject({ kind: "claude", model: "haiku" });
    expect(r.lobby?.guest?.name).toBe("Claude Haiku 4.5");

    const legendB = registry.get(cfgB.legendId as string)!.name;
    const champB = registry.get(cfgB.championId as string)!.name;
    const legendA = registry.get(cfgA.legendId as string)!.name;
    const onlyInA = cfgA.mainDeckCardIds.map((id) => registry.get(id)!.name).find((n) => !cfgB.mainDeckCardIds.some((id) => registry.get(id)!.name === n)) as string;
    expect(onlyInA).toBeTruthy();

    const prompt = buildPrompt(session, P2, [], "Claude Haiku 4.5");
    expect(prompt.system).toContain("YOUR DECK");
    expect(prompt.system).toContain(`Legend: ${legendB}`);
    expect(prompt.system).toContain(champB);
    expect(prompt.system).toContain(registry.get(cfgB.mainDeckCardIds[0] as string)!.name);
    expect(prompt.system).not.toContain(legendA);
    expect(prompt.system).not.toContain(onlyInA);
    // Not the starter either.
    const starterLegend = registry.get(buildDefaultDeck().legendId as string)!.name;
    expect(prompt.system).not.toContain(`Legend: ${starterLegend}`);

    // Through the driver: the mock model client receives that same system prompt.
    session.pregame?.mulliganComplete.add(P1);
    session.pregame?.mulliganComplete.add(P2);
    finalizePregame(session);
    expect(aiSeatMustAct(session, P2)).toBe(true);
    const calls: ModelRequest[] = [];
    const callModel: CallModel = async (req) => {
      calls.push(req);
      const end = req.meta.menu?.find((it) => /^End turn/.test(it.label)) ?? req.meta.menu?.at(-1);
      return { input: { index: end?.index ?? 0, rationale: "test" }, name: "choose" };
    };
    const ai = new ClaudeOpponent("haiku", "sk-ant-api03-testkeytestkey", { backoffMs: 0, callModel, lookupTools: [], pacingMs: 0, timeoutMs: 2000 });
    session.opponent = ai;
    await ai.act(session);
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0]?.system).toContain(`Legend: ${legendB}`);
    expect(calls[0]?.system).toContain(champB);
    expect(calls[0]?.system).not.toContain(onlyInA);
  });
});
