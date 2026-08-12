/**
 * The REST snapshot surface is unauthenticated — there is no user→seat binding
 * on `GET /api/game/:id/state` (the same reason REST moves are sandbox-only,
 * server/routes-game.ts). So for a real duel it must never carry the identity
 * of anyone's private cards: rule 108.7.c / 128.4 (hand and decks are private)
 * and rule 723 (a facedown card is private to its owner), with rule 421.4
 * (facedown cards are public once the game ends) as the only relaxation.
 *
 * Per-seat redaction of the WS snapshot, the rule 127 look grant and the
 * harness-view agreement are covered by snapshot-redaction.test.ts; this file
 * guards the REST path, which used to build the snapshot with no viewer at all
 * and therefore served the full unredacted state to any caller.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { P1, P2, scenario } from "@tcg/riftbound/harness";

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "rb-privacy-test-"));
process.env.RIFTBOUND_DB_PATH ??= path.join(TMP_DIR, "test.db");

const { closeDb } = await import("../../src/db/schema");
const { handleGameRoutes } = await import("../routes-game");
const { gameSessions, getInternalSnapshot, lobbies } = await import("../state");
const { createLobby, handleLobbyRoutes } = await import("../routes-lobby");

type GameSession = import("../state").GameSession;

afterAll(() => {
  closeDb();
  fs.rmSync(TMP_DIR, { force: true, recursive: true });
});

const CONSULT_THE_PAST = "ogn-083-298";

type ZoneCard = { id: string; definitionId: string; name: string; owner: string; cardType: string };

function sessionOf(engine: unknown, sandbox: boolean): GameSession {
  return {
    clients: new Map(),
    engine: engine as GameSession["engine"],
    log: [],
    playerNames: { [P1]: "Alice", [P2]: "Bob" },
    players: [P1, P2],
    sandbox,
    seq: 0,
  };
}

function board(victoryScore = 15) {
  return scenario()
    .turn(3)
    .active(P1)
    .victoryScore(victoryScore)
    .resources(P1, { energy: 5 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "P1 Holder" }, "h1")
    .unit(P2, "bf2", { might: 3, name: "Defender D" }, "d")
    .facedown(P2, "bf2", CONSULT_THE_PAST, "ctp");
}

/** Register a session under a fresh id and fetch its REST state snapshot. */
async function restState(session: GameSession): Promise<{ zones: Record<string, ZoneCard[]> }> {
  const gameId = crypto.randomUUID();
  gameSessions.set(gameId, session);
  try {
    const req = new Request(`http://x/api/game/${gameId}/state`);
    const res = await handleGameRoutes(req, new URL(req.url), {} as never);
    expect(res?.status).toBe(200);
    return (await res!.json()) as { zones: Record<string, ZoneCard[]> };
  } finally {
    gameSessions.delete(gameId);
  }
}

describe("GET /api/game/:id/state — an unauthenticated caller never sees private cards", () => {
  test("duel: the facedown card at bf2 is only an opaque token, with its owner but no defId / name / instance id", async () => {
    const game = await board().build();
    const state = await restState(sessionOf(game.engine, false));

    const facedown = state.zones["facedown-bf2"] ?? [];
    expect(facedown).toHaveLength(1); // rule 723: the SLOT is public, the identity is not
    expect(facedown[0]).toMatchObject({ cardType: "unknown", definitionId: "", name: "Hidden card", owner: P2 });
    expect(facedown[0]?.id.startsWith("hidden-facedown-bf2-")).toBe(true);

    const wire = JSON.stringify(state.zones);
    expect(wire).not.toContain(CONSULT_THE_PAST);
    expect(wire).not.toContain("Consult the Past");
    expect(wire).not.toContain('"ctp"');
  });

  test("duel: neither seat's hand or deck is named on the REST wire (rule 108.7.c / 128.4)", async () => {
    const game = await board().build();
    const state = await restState(sessionOf(game.engine, false));

    for (const zoneId of ["hand", "mainDeck", "runeDeck"]) {
      for (const card of state.zones[zoneId] ?? []) {
        expect(card).toMatchObject({ definitionId: "", name: "Hidden card" });
        expect(card.id.startsWith(`hidden-${zoneId}-`)).toBe(true);
      }
    }
    // Public zones still render normally — redaction is scoped to private zones.
    expect((state.zones["battlefield-bf1"] ?? []).map((c) => c.id)).toContain("h1");
  });

  test("goldfish sandbox (one human drives both seats): the REST snapshot is unredacted", async () => {
    const game = await board().build();
    const state = await restState(sessionOf(game.engine, true));
    expect(state.zones["facedown-bf2"]?.[0]).toMatchObject({ definitionId: CONSULT_THE_PAST, id: "ctp" });
  });

  test("vs-Claude: the AI seat is a real opponent, so REST redacts there too", async () => {
    const game = await board().build();
    const vsAi = sessionOf(game.engine, true);
    vsAi.opponent = { info: { kind: "claude", label: "Claude", model: "haiku" }, thinking: false } as unknown as GameSession["opponent"];
    const state = await restState(vsAi);
    expect(state.zones["facedown-bf2"]?.[0]).toMatchObject({ definitionId: "", name: "Hidden card" });
  });

  test("rule 421.4: once the game has ended the facedown card is public on REST as well", async () => {
    const game = await board(1).build();
    const session = sessionOf(game.engine, false);
    expect((await restState(session)).zones["facedown-bf2"]?.[0]).toMatchObject({ definitionId: "" });

    await game.p1.endTurn();
    await game.settle();
    expect(game.gameState.status).toBe("finished");

    const ended = await restState(session);
    expect(ended.zones["facedown-bf2"]?.[0]).toMatchObject({ definitionId: CONSULT_THE_PAST, id: "ctp", owner: P2 });
    // Hands stay private after the game ends — the reveal is facedown-only.
    for (const card of ended.zones["hand"] ?? []) {
      expect(card).toMatchObject({ definitionId: "", name: "Hidden card" });
    }
  });
});

/**
 * WHY the test above is allowed to say "unredacted": a sandbox session holds
 * exactly ONE human — the person who created it. The other seat is a bot
 * (passive Goldfish, or a Claude seat, which redacts anyway) or, in hot seat,
 * the same human acting as Player 2. Nothing in that response is private FROM
 * its only human, which is why per-seat redaction would be wrong here rather
 * than merely stricter: hot seat is one human legitimately driving both seats.
 *
 * That justification is load-bearing for an UNAUTHENTICATED route, so it is
 * pinned here rather than assumed. It holds because `createLobby` fills
 * `lobby.guest` for every sandbox mode and `POST /api/lobby/join` refuses a
 * lobby that already has a guest — a stranger cannot become the second human.
 * If a future change ever leaves a sandbox lobby's guest seat empty, this test
 * fails instead of the unredacted view silently opening to that stranger.
 *
 * The decision, its threat model and the conditions that would flip it are
 * recorded in `.claude/skills/riftbound-rules/DESIGN.md` § "Who may read a
 * game's state (REST)". Read that before changing any of this.
 */
describe("a sandbox session can never hold a second human — the premise the unredacted view rests on", () => {
  /** The real join route. (Creation goes through `createLobby` directly: the
   *  route's own `SANDBOX_ENABLED` gate is an operator switch, not the
   *  invariant under test, and it is read once at module load.) */
  const join = async (body: unknown) =>
    handleLobbyRoutes(
      new Request("http://x/api/lobby/join", { body: JSON.stringify(body), headers: { "Content-Type": "application/json" }, method: "POST" }),
      new URL("http://x/api/lobby/join"),
      {} as never,
    );

  // A Claude seat needs a key OR the mock switch to be creatable at all; the
  // seat itself is never driven here, only the lobby's second-seat occupancy.
  const prevMock = process.env.RB_AI_MOCK;
  beforeAll(() => { process.env.RB_AI_MOCK = "1"; });
  afterAll(() => { if (prevMock === undefined) { delete process.env.RB_AI_MOCK; } else { process.env.RB_AI_MOCK = prevMock; } });

  for (const opponent of [
    { kind: "goldfish", mode: "passive" },
    { kind: "goldfish", mode: "active" }, // hot seat — the host plays both seats
    { kind: "claude", model: "haiku" },
  ] as const) {
    test(`${opponent.kind}/${"mode" in opponent ? opponent.mode : opponent.model}: the second seat is already taken, so joining by code is refused`, async () => {
      const created = createLobby({ name: "Owner", opponent, sandbox: true }, null);
      expect(created.status).toBe(200);
      const { code, lobbyId } = created.body as { code: string; lobbyId: string };

      const lobby = lobbies.get(lobbyId)!;
      expect(lobby.sandbox).toBe(true);
      expect(lobby.guest).not.toBeNull(); // the bot (or the host's own second seat) owns it

      const joined = await join({ code, name: "Stranger" });
      expect(joined?.status).toBe(400);
      expect(await joined!.json()).toMatchObject({ error: "Lobby is full" });
      // …and the refusal did not hand the caller the ids it would need anyway.
      expect(lobby.guest?.name).not.toBe("Stranger");
    });
  }

  test("a NON-sandbox lobby is the one that takes a second human — and that session's REST view is the redacted spectator one", async () => {
    const created = createLobby({ name: "Owner", sandbox: false }, null);
    expect(created.status).toBe(200);
    const { code, lobbyId } = created.body as { code: string; lobbyId: string };
    expect(lobbies.get(lobbyId)?.sandbox).toBe(false);

    const joined = await join({ code, name: "Guest" });
    expect(joined?.status).toBe(200);
    expect(lobbies.get(lobbyId)?.guest?.name).toBe("Guest");

    // Two humans ⇒ `sandbox: false` ⇒ restSnapshot takes the SPECTATOR branch,
    // which the first test in this file pins.
    const game = await board().build();
    const state = await restState(sessionOf(game.engine, false));
    expect(state.zones["facedown-bf2"]?.[0]).toMatchObject({ definitionId: "", name: "Hidden card" });
  });
});

/**
 * rule 486.5 / 128.3 / 108.4.d — the two leaks that live in the PREGAME, both
 * reached through the same shared stream / shared snapshot the game itself uses.
 *
 * They are pinned here rather than in snapshot-redaction.test.ts because a real
 * pregame needs a DB-backed session (`createGameFromDecks` + the deck store),
 * which this file already sets up.
 */
const { buildGameSnapshot } = await import("../snapshot");
const { buildDefaultDeck } = await import("../decks");
const { createGameFromDecks, handlePregameMessage, runBotPregame, selectBattlefield } = await import("../pregame");
const { registry } = await import("../cards");

type LogLine = { text: string };
const logOf = (session: GameSession, viewer?: string): string[] =>
  (buildGameSnapshot(session, viewer).log as LogLine[]).map((e) => e.text);

describe("rule 486.5 — a battlefield lock-in is Secret until BOTH seats have locked", () => {
  test("the bot picks first: the human's log says only THAT it locked one, then names both once the human locks", async () => {
    const deck = buildDefaultDeck();
    const session = createGameFromDecks(deck, deck, "bf-privacy", { gameMode: "match", sandbox: true });
    await runBotPregame(session); // the bot seat (player-2) locks one of its three

    const botPick = session.pregame?.battlefieldSelections[P2] as string;
    const botName = registry.get(botPick)?.name as string;
    expect(botName).toBeTruthy();
    expect(session.pregame?.battlefieldSelections[P1]).toBeUndefined();

    // The line IS in the shared stream — the redaction is per viewer, not a
    // decision to write less.
    expect(session.log.some((e) => e.text.includes(botName))).toBe(true);
    const human = logOf(session, P1);
    expect(human.some((t) => t.includes(botName))).toBe(false);
    expect(human.some((t) => /picked a battlefield/.test(t))).toBe(true);
    // Nor to an unauthenticated / seatless reader.
    expect(logOf(session).some((t) => t.includes(botName))).toBe(false);
    // The seat that chose still reads its own choice.
    expect(logOf(session, P2).some((t) => t.includes(botName))).toBe(true);

    // Both locked (rule 486.5 is satisfied) ⇒ the gate opens for everyone.
    const humanPick = (session.pregame?.battlefieldOptions[P1] ?? [])[1] as string;
    expect(selectBattlefield(session, P1, humanPick).ok).toBe(true);
    const humanName = registry.get(humanPick)?.name as string;
    const after = logOf(session, P1);
    expect(after.some((t) => t.includes(botName))).toBe(true);
    expect(after.some((t) => t.includes(humanName))).toBe(true);
  });

  test("the human picks first: its own lock is named to itself and withheld from the other seat until both are in", async () => {
    const deck = buildDefaultDeck();
    const session = createGameFromDecks(deck, deck, "bf-privacy-2", { gameMode: "match", sandbox: false });
    const pick = (session.pregame?.battlefieldOptions[P1] ?? [])[0] as string;
    expect(selectBattlefield(session, P1, pick).ok).toBe(true);
    const name = registry.get(pick)?.name as string;

    expect(logOf(session, P1).some((t) => t.includes(name))).toBe(true);
    expect(logOf(session, P2).some((t) => t.includes(name))).toBe(false);
    expect(logOf(session, P2).some((t) => /locked in a battlefield/.test(t))).toBe(true);

    const other = (session.pregame?.battlefieldOptions[P2] ?? [])[0] as string;
    expect(selectBattlefield(session, P2, other).ok).toBe(true);
    expect(logOf(session, P2).some((t) => t.includes(name))).toBe(true);
  });
});

describe("rule 128.3 / 108.4.d — the mulligan does not tell a seat WHERE its returned cards went", () => {
  test("after a 2-card mulligan the seat's own Main Deck is a count: neither returned card is locatable in it", async () => {
    const deck = buildDefaultDeck();
    const session = createGameFromDecks(deck, deck, "mull-privacy", { gameMode: "duel", sandbox: false });
    expect(session.pregame?.phase).toBe("mulligan");

    const internal = getInternalSnapshot(session.engine);
    const handBefore = (internal.zones.hand?.cardIds ?? []).filter((id) => internal.cards[id]?.owner === P1);
    expect(handBefore.length).toBeGreaterThanOrEqual(2);
    const sendBack = handBefore.slice(0, 2);

    const ws = { send: () => undefined } as unknown as Parameters<typeof handlePregameMessage>[0];
    handlePregameMessage(ws, { sendBack, type: "pregame_mulligan" }, session, "mull-privacy", P1);
    expect(session.pregame?.mulliganComplete.has(P1)).toBe(true);

    const deckIds = getInternalSnapshot(session.engine).zones.mainDeck?.cardIds ?? [];
    for (const id of sendBack) {
      expect(deckIds).toContain(id); // the cards really did go back into the deck…
    }
    const own = buildGameSnapshot(session, P1).zones as Record<string, { id: string; definitionId: string }[]>;
    const wire = JSON.stringify(own.mainDeck ?? []);
    expect((own.mainDeck ?? []).length).toBe(deckIds.length); // …the COUNT is public…
    for (const id of sendBack) {
      expect(wire).not.toContain(id); // …their POSITION is not.
      expect(wire).not.toContain(getInternalSnapshot(session.engine).cards[id]?.definitionId ?? "@none@");
    }
    // The log says how many were recycled, never which or where.
    const lines = logOf(session, P1);
    expect(lines.some((t) => /finalized mulligan \(2 recycled, 2 redrawn\)/.test(t))).toBe(true);
  });
});
