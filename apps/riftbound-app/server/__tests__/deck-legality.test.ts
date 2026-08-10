/**
 * Deck legality is ADVISORY (server/deck-rules.ts): a 10-card sideboard is
 * legal; over-limit lists import (HTTP 200), save, load and play with a
 * `{legal, problems}` report instead of an error; only a lobby created with
 * `enforceLegality: true` refuses to start with a flagged deck.
 */

import { afterAll, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ServerWebSocket } from "bun";

// Isolated throwaway DB — must be set before the repo modules load.
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "rb-legality-test-"));
process.env.RIFTBOUND_DB_PATH ??= path.join(TMP_DIR, "test.db");

const { getDeck } = await import("../../src/db/deck-repo");
const { closeDb } = await import("../../src/db/schema");
const { createUser } = await import("../../src/db/user-repo");
const { allCards } = await import("../cards");
const { DECK_RULES, validateDeckConfig } = await import("../deck-rules");
const { buildDefaultDeck, deckLegalityForId, loadDeckConfig, parseDeckText, savedDeckToDeckConfig } = await import("../decks");
const { handleSavedDeckRoutes } = await import("../routes-deck");
const { handleCardRoutes } = await import("../routes-cards");
const { generateToken } = await import("../routes-auth");
const { createLobby } = await import("../routes-lobby");
const { lobbyWsMessage } = await import("../ws-lobby");
const { gameSessions, lobbies, lobbyView } = await import("../state");
const { createGameFromDecks } = await import("../pregame");

type WsData = import("../state").WsData;

afterAll(() => {
  closeDb();
  fs.rmSync(TMP_DIR, { force: true, recursive: true });
});

const starter = buildDefaultDeck(); // Fury / Chaos, Jinx
const name = (id: string) => allCards.find((c) => c.id === id)!.name;
// In-identity (fury / chaos) main-deck cards the starter does not already run 2+ of.
const EXTRA = allCards
  .filter((c) => (c.cardType === "spell" || c.cardType === "unit") && !("isChampion" in c && c.isChampion) && (c.domain === "fury" || c.domain === "chaos") && !starter.mainDeckCardIds.includes(c.id))
  .map((c) => c.id);

/** A paste in the builder's export format: full starter + `side` as the Sideboard section + optional extra main lines. */
function deckText(side: string[], extraMain: string[] = []): string {
  const group = (ids: string[]) => {
    const counts = new Map<string, number>();
    for (const id of ids) {counts.set(name(id), (counts.get(name(id)) ?? 0) + 1);}
    return [...counts].map(([n, c]) => `${c} ${n}`).join("\n");
  };
  return [
    `Legend:\n1 ${name(starter.legendId as string)}`,
    `Champion:\n1 ${name(starter.championId as string)}`,
    `MainDeck:\n${group([...starter.mainDeckCardIds, ...extraMain])}`,
    `Battlefields:\n${group(starter.battlefieldIds)}`,
    `Runes:\n${group(starter.runeDeckCardIds)}`,
    `Sideboard:\n${group(side)}`,
  ].join("\n\n");
}

const user = createUser(`legality-${crypto.randomUUID()}`, "pw");
const token = generateToken(user.id);

async function importViaApi(text: string, deckName: string) {
  const req = new Request("http://x/api/saved-decks/import", {
    body: JSON.stringify({ name: deckName, text }),
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    method: "POST",
  });
  const res = await handleSavedDeckRoutes(req, new URL(req.url), {} as never);
  return { body: (await res!.json()) as { deck: { id: string; legality: { legal: boolean; problems: { code: string; severity: string }[] } }; legal: boolean; legality: { legal: boolean; problems: { code: string; cardIds?: string[] }[] }; errors: string[]; error?: string }, status: res!.status };
}

function fakeWs(lobbyId: string, userId: string | null, role: "host" | "guest" = "host") {
  const sent: Record<string, unknown>[] = [];
  const ws = {
    data: { connId: `c-${crypto.randomUUID()}`, gameId: "", lobbyId, lobbyRole: role, playerId: "", userId } satisfies WsData,
    send(s: string) { sent.push(JSON.parse(s) as Record<string, unknown>); },
  } as unknown as ServerWebSocket<WsData>;
  return { sent, ws };
}

describe("single source of truth: /api/config deckRules", () => {
  test("sideboardMax is 10, copyLimit 3, mainMin 40, and enforcement is off", async () => {
    expect(DECK_RULES.sideboardMax).toBe(10);
    const res = await handleCardRoutes(new Request("http://x/api/config"), new URL("http://x/api/config"), {} as never);
    const cfg = (await res!.json()) as { deckRules: Record<string, unknown> };
    expect(cfg.deckRules).toMatchObject({ copyLimit: 3, enforced: false, mainMin: 40, runeCount: 12, sideboardMax: 10 });
  });
});

describe("import is never refused", () => {
  test("a legal list with a 10-card sideboard → 200, legal:true, saved with all 10 sideboard cards (the user's report: this used to error at 8)", async () => {
    const side10 = EXTRA.slice(0, 5).flatMap((id) => [id, id]); // 5 names × 2 = 10, none in the main deck
    expect(side10).toHaveLength(10);
    const { status, body } = await importViaApi(deckText(side10), "Ten-card sideboard");
    expect(status).toBe(200);
    expect(body.errors).toEqual([]);
    expect(body.legality.problems.filter((p) => (p as { severity?: string }).severity === "error")).toEqual([]);
    expect(body.legal).toBe(true);
    const saved = getDeck(body.deck.id)!;
    expect(saved.cards.filter((c) => c.zone === "sideboard").reduce((n, c) => n + c.quantity, 0)).toBe(10);
    // Loads for play with the sideboard intact (nothing dropped) and reports legal.
    const cfg = savedDeckToDeckConfig(saved)!;
    expect(cfg.sideboardCardIds).toHaveLength(10);
    expect(cfg.mainDeckCardIds).toHaveLength(starter.mainDeckCardIds.length); // the champion's own "main" entry went to the champion zone
    expect(deckLegalityForId(saved.id).legal).toBe(true);
    // The builder-session import path agrees: no errors, legal.
  });

  test("4-of + a 12-card sideboard → still 200, deck SAVED, legal:false with TOO_MANY_COPIES and SIDEBOARD_TOO_LARGE (card ids attached)", async () => {
    const four = EXTRA[6] as string;
    const side12 = EXTRA.slice(7, 13).flatMap((id) => [id, id]);
    expect(side12).toHaveLength(12);
    const { status, body } = await importViaApi(deckText(side12, [four, four, four, four]), "Spicy brew");
    expect(status).toBe(200);
    expect(body.legal).toBe(false);
    const codes = body.legality.problems.map((p) => p.code);
    expect(codes).toContain("TOO_MANY_COPIES");
    expect(codes).toContain("SIDEBOARD_TOO_LARGE");
    expect(body.legality.problems.find((p) => p.code === "TOO_MANY_COPIES")?.cardIds).toEqual([four]);
    const saved = getDeck(body.deck.id);
    expect(saved?.name).toBe("Spicy brew");
    expect(saved!.cards.find((c) => c.cardId === four && c.zone === "main")?.quantity).toBe(4);
    // List rows carry the badge data.
    const list = await handleSavedDeckRoutes(new Request("http://x/api/saved-decks", { headers: { Authorization: `Bearer ${token}` } }), new URL("http://x/api/saved-decks"), {} as never);
    const rows = (await list!.json()) as { id: string; legality: { legal: boolean } }[];
    expect(rows.find((r) => r.id === saved!.id)?.legality.legal).toBe(false);
    // And it PLAYS: loadDeckConfig keeps every copy and the whole sideboard; the game seats it with a log note.
    const cfg = loadDeckConfig(saved!.id);
    expect(cfg.mainDeckCardIds.filter((id) => id === four)).toHaveLength(4);
    expect(cfg.sideboardCardIds).toHaveLength(12);
    const session = createGameFromDecks(cfg, buildDefaultDeck(), "legality-goldfish", { gameMode: "duel", sandbox: true });
    expect(session.players).toEqual(["player-1", "player-2"]);
    expect(session.log.some((e) => e.text.includes("Player 1") && e.text.includes("not tournament-legal"))).toBe(true);
  });

  test("unrecognized names are reported in `errors` but never block; a list with no legend/champion gets sensible defaults with warnings", async () => {
    const text = `MainDeck:\n${starter.mainDeckCardIds.slice(0, 12).map((id) => `3 ${name(id)}`).join("\n")}\n2 Totally Made Up Card\n\nRunes:\n12 ${name(starter.runeDeckCardIds[0] as string)}`;
    const req = new Request("http://x/api/saved-decks/import", { body: JSON.stringify({ text }), headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" }, method: "POST" });
    const res = await handleSavedDeckRoutes(req, new URL(req.url), {} as never);
    expect(res!.status).toBe(200);
    const body = (await res!.json()) as { deck: { legendId: string; championId: string }; errors: string[]; warnings: string[] };
    expect(body.errors).toEqual(["Card not found: Totally Made Up Card"]);
    expect(allCards.find((c) => c.id === body.deck.legendId)?.cardType).toBe("legend");
    expect(allCards.find((c) => c.id === body.deck.championId)?.cardType).toBe("unit");
    expect(body.warnings.length).toBe(2);
    // Unauthenticated import is the only refusal (ownership, not legality).
    const anon = await handleSavedDeckRoutes(new Request("http://x/api/saved-decks/import", { body: JSON.stringify({ text }), headers: { "Content-Type": "application/json" }, method: "POST" }), new URL("http://x/api/saved-decks/import"), {} as never);
    expect(anon!.status).toBe(401);
  });

  test("parseDeckText tolerates header aliases, 'Nx' counts and print markers", () => {
    const p = parseDeckText(`Main Deck:\n3x ${name(EXTRA[0] as string)} (OGN 001)\n\nSide Board:\n1 ${name(EXTRA[1] as string)}\n\nRune Deck:\n12 ${name(starter.runeDeckCardIds[0] as string)}`);
    expect(p.errors).toEqual([]);
    expect(p.main).toHaveLength(3);
    expect(p.sideboard).toHaveLength(1);
    expect(p.runes).toHaveLength(12);
  });
});

describe("validateDeckConfig report", () => {
  test("starter decks are legal; 11-card sideboard flagged, 10 not; unknown champion tag data degrades to a warning, not an error", () => {
    expect(validateDeckConfig(starter)).toEqual({ legal: true, problems: [] });
    const side = EXTRA.slice(0, 4).flatMap((id) => [id, id, id]).slice(0, 11);
    expect(validateDeckConfig({ ...starter, sideboardCardIds: side.slice(0, 10) }).legal).toBe(true);
    const eleven = validateDeckConfig({ ...starter, sideboardCardIds: side });
    expect(eleven.legal).toBe(false);
    expect(eleven.problems.map((p) => p.code)).toEqual(["SIDEBOARD_TOO_LARGE"]);
    // Missing legend / champion / empty lists never throw.
    const bare = validateDeckConfig({ battlefieldIds: [], mainDeckCardIds: ["nope"], runeDeckCardIds: [] });
    expect(bare.legal).toBe(false);
    expect(bare.problems.map((p) => p.code).toSorted()).toEqual(["MAIN_DECK_TOO_SMALL", "NO_CHAMPION", "NO_LEGEND", "RUNE_DECK_WRONG_SIZE", "UNKNOWN_CARD"]);
    // A champion unit with no tag data: "unknown", severity warning, deck stays legal on that account.
    const untagged = allCards.find((c) => c.cardType === "unit" && "isChampion" in c && c.isChampion && !(c.tags?.length));
    if (untagged) {
      const r = validateDeckConfig({ ...starter, championId: untagged.id });
      const p = r.problems.find((x) => x.code === "CHAMPION_TAG_UNKNOWN");
      expect(p?.severity).toBe("warning");
      expect(r.problems.some((x) => x.code === "CHAMPION_TAG_MISMATCH")).toBe(false);
    }
  });
});

describe("lobbies: warn both seats; enforceLegality refuses", () => {
  async function flaggedDeckId(): Promise<string> {
    const four = EXTRA[14] as string;
    const { body } = await importViaApi(deckText([], [four, four, four, four]), "Four-of");
    expect(body.legal).toBe(false);
    return body.deck.id;
  }

  test("goldfish (sandbox) lobby with a flagged deck → game starts", async () => {
    const deckId = await flaggedDeckId();
    const res = createLobby({ gameMode: "duel", opponent: { kind: "goldfish" }, sandbox: true }, user.id);
    expect(res.status).toBe(200);
    const { lobbyId } = res.body as { lobbyId: string };
    const lobby = lobbies.get(lobbyId)!;
    const { ws } = fakeWs(lobbyId, user.id);
    lobby.host.ws = ws;
    lobbyWsMessage(ws, { deckId, type: "select_deck" });
    expect(lobbyView(lobby, "host").host.legality).toMatchObject({ codes: ["TOO_MANY_COPIES"], legal: false, problemCount: 1 });
    lobbyWsMessage(ws, { type: "start_game" });
    lobbyWsMessage(ws, { choice: "self", type: "choose_first" });
    expect(lobby.status).toBe("started");
    const session = gameSessions.get(lobby.gameId as string)!;
    expect(session.log.some((e) => e.text.includes("not tournament-legal"))).toBe(true);
  });

  test("duel lobby, enforceLegality:false (default) → starts, and BOTH seats' lobby views carry the warning (own seat: full problems; other seat: codes only)", async () => {
    const deckId = await flaggedDeckId();
    const guestUser = createUser(`legality-guest-${crypto.randomUUID()}`, "pw");
    const res = createLobby({ gameMode: "duel" }, user.id);
    const { lobbyId } = res.body as { lobbyId: string };
    const lobby = lobbies.get(lobbyId)!;
    expect(lobby.enforceLegality).toBe(false);
    lobby.guest = { connId: "", deckId: null, name: "Guest", ready: false, ws: null };
    const host = fakeWs(lobbyId, user.id, "host");
    const guest = fakeWs(lobbyId, guestUser.id, "guest");
    lobby.host.ws = host.ws;
    lobby.guest.ws = guest.ws;
    lobbyWsMessage(host.ws, { deckId, type: "select_deck" });
    lobbyWsMessage(guest.ws, { deckId: "default", type: "select_deck" });
    const hostView = lobbyView(lobby, "host");
    const guestView = lobbyView(lobby, "guest");
    expect(hostView.host.legality?.legal).toBe(false);
    expect(hostView.host.legality?.problems?.[0]?.message).toContain("4 copies");
    expect(guestView.host.legality).toEqual({ codes: ["TOO_MANY_COPIES"], legal: false, problemCount: 1 }); // redacted: no card names
    expect(guestView.guest?.legality).toMatchObject({ legal: true });
    // The last lobby_update each socket received carries the same shape.
    const lastTo = (sent: Record<string, unknown>[]) => sent.filter((m) => m.type === "lobby_update").at(-1) as { lobby: ReturnType<typeof lobbyView> };
    expect(lastTo(guest.sent).lobby.host.legality?.legal).toBe(false);
    expect(lastTo(host.sent).lobby.enforceLegality).toBe(false);
    lobbyWsMessage(host.ws, { type: "start_game" });
    expect(lobby.coinFlip).not.toBeNull();
    const winner = lobby.coinFlip!.winner === "player-1" ? host.ws : guest.ws;
    lobbyWsMessage(winner, { choice: "self", type: "choose_first" });
    expect(lobby.status).toBe("started");
    expect(gameSessions.get(lobby.gameId as string)?.log.some((e) => e.text.includes("not tournament-legal") && !e.text.includes(name(EXTRA[14] as string)))).toBe(true);
  });

  test("duel lobby with enforceLegality:true → start refused with the problem list; the flagged deck stays selected (nothing else changes)", async () => {
    const deckId = await flaggedDeckId();
    const res = createLobby({ enforceLegality: true, gameMode: "duel" }, user.id);
    const { lobbyId } = res.body as { lobbyId: string };
    const lobby = lobbies.get(lobbyId)!;
    expect(lobby.enforceLegality).toBe(true);
    lobby.guest = { connId: "", deckId: null, name: "Guest", ready: false, ws: null };
    const host = fakeWs(lobbyId, user.id, "host");
    const guest = fakeWs(lobbyId, null, "guest");
    lobby.host.ws = host.ws;
    lobby.guest.ws = guest.ws;
    lobbyWsMessage(host.ws, { deckId, type: "select_deck" });
    lobbyWsMessage(guest.ws, { deckId: "default", type: "select_deck" });
    lobbyWsMessage(host.ws, { type: "start_game" });
    expect(lobby.coinFlip).toBeNull();
    expect(lobby.status).toBe("waiting");
    const err = host.sent.find((m) => m.type === "lobby_error") as { error: string; problems: { code: string; seat: string; message: string }[] };
    expect(err.error).toContain("enforces deck legality");
    expect(err.problems).toEqual([expect.objectContaining({ code: "TOO_MANY_COPIES", seat: "host" })]);
    expect(err.problems[0]!.message).toContain("4 copies"); // own deck → full message
    expect(guest.sent.some((m) => m.type === "lobby_error")).toBe(true);
    // Host can switch enforcement off and start.
    lobbyWsMessage(host.ws, { enabled: false, type: "set_enforce_legality" });
    expect(lobby.enforceLegality).toBe(false);
    lobbyWsMessage(host.ws, { type: "start_game" });
    expect(lobby.coinFlip).not.toBeNull();
  });
});
