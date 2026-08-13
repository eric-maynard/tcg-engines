/**
 * Core rules — NEVER BLOCK, NEVER TRAP: the two ways a rules engine can take a
 * real game away from the people playing it.
 *
 *   BLOCK — a prompt is raised that nobody can answer. Rule 355.8 says an
 *     option with no legal object is not offered; rule 358.3.a says an
 *     instruction that can do nothing is skipped as it resolves. Raise the menu
 *     anyway and the position is stuck: no answer exists, `settle()` cannot
 *     drain it, and `advanceTurn()` refuses to end a turn with a choice
 *     pending. The harness invariant `noEmptyPrompt` makes any such prompt a
 *     test failure for good.
 *   TRAP — a player cannot quit. Rule 650 lets a player concede at ANY time,
 *     which means from inside their own open prompt, from inside the
 *     opponent's, and during the pregame — never gated on priority, on holding
 *     the Decision, or on the kind of question being asked.
 *
 * And the third thing a game owes its players: when it ends, it ends PROPERLY —
 * one path (`operations/points.ts finishGame`) writes the end RECORD (rule 196)
 * and reveals every facedown card (rule 421.4), whichever way the win arrived.
 *
 * Rules covered (riftbound-rules ids):
 *   355.8 / 355.3      a mode / option with no legal object is not offered
 *   358.3.a            an impossible instruction is SKIPPED on resolution
 *   355.11.b           a subset re-pick with no legal subset affects nothing
 *   650 / 651.1 / 651.3 / 196   concede at any time; the game ends at once and no prompt survives
 *   113 / 117          the pregame (battlefield keep, Mulligan) is part of the game
 *   194.2 / 472        the Cleanup points win
 *   195 / 472.2        an effect win ("you win the game")
 *   421.4              every facedown card is revealed when the game ends
 */

import { describe, expect, test } from "bun:test";
import type { ServerWebSocket } from "bun";
import type { Decision, Game } from "../../harness";
import { P1, P2, scenario } from "../../harness";
import { DEFAULT_INVARIANTS, noEmptyPrompt } from "../../harness/invariants";
import type { FullSnapshot, HarnessEngine } from "../../harness/internal";
import type { PendingChoice, RiftboundGameState } from "../../types";
import { buildDefaultDeck } from "../../../../../apps/riftbound-app/server/decks";
import { concedeGame, concedeMatch } from "../../../../../apps/riftbound-app/server/match";
import { newMatchState } from "../../../../../apps/riftbound-app/server/match-state";
import { applySessionMove } from "../../../../../apps/riftbound-app/server/turn";
import { createGameFromDecks } from "../../../../../apps/riftbound-app/server/pregame";
import { type GameSession, type WsData, gameSessions } from "../../../../../apps/riftbound-app/server/state";

const ROYAL_ENTOURAGE = "sfd-039-221"; // Unit 3 [calm] — "When you play me, ready or exhaust a legend."
const RELENTLESS_STORM = "ogn-249-298"; // Legend
const LOOSE_CANNON = "ogn-251-298"; // Legend
const APOTHECARY = "unl-021-219"; // "When you play me, you MAY return a friendly unit …" — an opt-in at FIN
const BOTTLED_CONSTELLATION = "ven-067-166"; // base cost: kill 3 friendly permanents — a 3-of-N pick
const BULLET_TIME = "ogn-268-298"; // "Pay any amount of [rainbow]" — an integer Pay at resolution
const TRINITY_FORCE = "sfd-115-221";
const HOSTILE_TAKEOVER = "sfd-202-221"; // something to sit facedown, for 421.4
const PLAZA = "ogn-293-298"; // "When you hold here, if you have 7+ units here, you win the game."

// ===========================================================================
// 1. NEVER BLOCK — a prompt is never raised with an empty answer set
// ===========================================================================

describe("never block: a choice with no legal object is not offered (355.8 / 358.3.a)", () => {
  test("the empty-prompt oracle is part of the DEFAULT invariant set, so every harness test enforces it", () => {
    expect(DEFAULT_INVARIANTS.map((i) => i.name)).toContain("noEmptyPrompt");
  });

  /** The oracle itself, on a hand-built position: an option list of length zero is a violation. */
  function checkPending(pc: PendingChoice): string[] {
    const state = {
      players: { [P1]: {}, [P2]: {} },
      pendingChoice: pc,
      status: "playing",
    } as unknown as RiftboundGameState;
    const cur = { cards: {}, metas: {}, state, zones: {} } as unknown as FullSnapshot;
    return noEmptyPrompt.check({ cur, engine: {} as HarnessEngine, prev: null });
  }

  test("the oracle fires on an option-bearing prompt with zero options, and stays quiet on one with options", () => {
    const empty = checkPending({
      effect: {},
      options: [],
      playerId: P1,
      sourceCardId: "src",
      type: "choose-mode",
    } as unknown as PendingChoice);
    expect(empty).toHaveLength(1);
    expect(empty[0]).toMatch(/zero selectable options/);
    expect(empty[0]).toMatch(/355\.8\/358\.3\.a/);

    expect(
      checkPending({
        effect: {},
        options: [0, 1],
        playerId: P1,
        sourceCardId: "src",
        type: "choose-mode",
      } as unknown as PendingChoice),
    ).toEqual([]);
  });

  test("the oracle leaves the shapes that need no option list alone — a yes/no, a number, a name", () => {
    expect(checkPending({ playerId: P1, resolved: {}, sourceCardId: "s", type: "opt-in" } as unknown as PendingChoice)).toEqual([]);
    expect(checkPending({ effect: {}, playerId: P1, sourceCardId: "s", type: "confirm" } as unknown as PendingChoice)).toEqual([]);
    expect(checkPending({ options: [], playerId: P1, type: "name-card" } as unknown as PendingChoice)).toEqual([]);
  });

  // The concrete hang C3D found: Royal Entourage's "ready or exhaust a legend"
  // with an EMPTY Legend Zone. Neither mode has a legal object, so no mode is
  // offered and the whole instruction is skipped — the unit still arrives and
  // play returns to its controller.
  test("BOTH modes unchoosable ⇒ no menu, the instruction is skipped, and play carries on (Royal Entourage, empty Legend Zone)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { calm: 1 } })
      .hand(P1, ROYAL_ENTOURAGE, "royal")
      .build();
    expect(game.p1.legend()).toBeUndefined();

    await game.p1.play("royal");
    expect(game.decision()?.prompt).not.toMatch(/Choose a mode/);
    await game.settle();

    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("royal")).toBe("base");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
    // …and the turn can still be ended, which is what "not blocked" means.
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
  });

  test("the same instruction with legends present IS a real menu — pruning never eats a mode that has an object", async () => {
    const game = await scenario()
      .legend(P1, RELENTLESS_STORM, "storm")
      .legend(P1, LOOSE_CANNON, "cannon")
      .resources(P1, { energy: 4, power: { calm: 1 } })
      .hand(P1, ROYAL_ENTOURAGE, "royal")
      .build();
    await game.p1.play("royal");
    const d = game.decision() as Extract<Decision, { kind: "pick" }>;
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d.options.map((o) => o.label)).toEqual(["Ready a legend", "Exhaust a legend"]);
    expect(game.violations()).toEqual([]);
  });

});

// ===========================================================================
// 2. NEVER TRAP — concede is accepted from every prompt, both seats
// ===========================================================================

/** Concede from `seat` must be legal, end the game at once and leave no prompt owed. */
async function expectConcedeWorks(game: Game, seat: typeof P1 | typeof P2): Promise<void> {
  const other = seat === P1 ? P2 : P1;
  expect(game.seat(seat).can("concede")).toBe(true);
  await game.seat(seat).concede();
  expect(game.isOver()).toBe(true);
  expect(game.winner()).toBe(other);
  expect(game.decision() ?? null).toBeNull();
  expect(game.gameState.pendingChoice).toBeUndefined();
  expect(game.violations()).toEqual([]);
}

describe("never trap: rule 650 — concede is accepted from inside every prompt kind", () => {
  /** An opt-in (yes-no at FIN): P2's "you may" play trigger. */
  async function optIn(): Promise<Game> {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Buddy" }, "buddy")
      .resources(P2, { energy: 6, power: { body: 3, calm: 3, chaos: 3, fury: 3, mind: 3, order: 3, rainbow: 3 } })
      .hand(P2, APOTHECARY, "apothecary")
      .build();
    await game.p2.play("apothecary", { to: "bf1" });
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2, timing: "FIN" });
    return game;
  }

  /** A choose-mode pick: Royal Entourage with two legends in the Legend Zone. */
  async function chooseMode(): Promise<Game> {
    const game = await scenario()
      .legend(P1, RELENTLESS_STORM, "storm")
      .legend(P1, LOOSE_CANNON, "cannon")
      .resources(P1, { energy: 4, power: { calm: 1 } })
      .hand(P1, ROYAL_ENTOURAGE, "royal")
      .build();
    await game.p1.play("royal");
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "mode" });
    return game;
  }

  /** A choose-target pick: the mode above, one step further in. */
  async function chooseTarget(): Promise<Game> {
    const game = await chooseMode();
    await game.p1.chooseMode(1); // "Exhaust a legend"
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    return game;
  }

  /** A pick-many: Bottled Constellation's base cost — name 3 of the 4 friendly permanents. */
  async function pickMany(): Promise<Game> {
    const game = await scenario()
      .active(P1)
      .gear(P1, BOTTLED_CONSTELLATION, "bottle")
      .unit(P1, "base", { might: 2, name: "Alpha" }, "u1")
      .unit(P1, "base", { might: 2, name: "Beta" }, "u2")
      .unit(P1, "base", { might: 2, name: "Gamma" }, "u3")
      .hand(P1, TRINITY_FORCE, "trinity")
      .resources(P1, { energy: 6, power: { body: 2 } })
      .build();
    await game.p1.play("trinity");
    await game.p1.choose("equipCard:-", { params: { equipmentId: "trinity", unitId: "u1" } });
    await game.settle();
    await game.advanceTurn(); // → P2
    await game.advanceTurn(); // → P1's Main Phase: the gear's trigger offers itself
    await game.p1.yes();
    expect(game.decision()).toMatchObject({ kind: "pick", min: 3, seat: P1 });
    return game;
  }

  /** A Pay: Bullet Time's "pay any amount of [rainbow]" — an integer at resolution. */
  async function payX(): Promise<Game> {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { rainbow: 3 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Big" }, "big")
      .hand(P1, BULLET_TIME, "bt")
      .build();
    await game.p1.cast("bt", { targets: "bf1" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ kind: "integer", seat: P1 });
    return game;
  }

  /** A distribute: combat damage assignment across two Tanks. */
  async function distribute(): Promise<Game> {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { keywords: ["Tank"], might: 2, name: "Tank 1" }, "T1")
      .unit(P2, "bf1", { keywords: ["Tank"], might: 3, name: "Tank 2" }, "T2")
      .unit(P1, "base", { might: 4, name: "Attacker" }, "A")
      .build();
    await game.p1.move("A", "bf1");
    await game.p1.passFocus();
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ kind: "distribute", seat: P1 });
    return game;
  }

  const positions: readonly [string, () => Promise<Game>][] = [
    ["opt-in (yes-no at FIN)", optIn],
    ["choose-mode", chooseMode],
    ["choose-target", chooseTarget],
    ["pick-many (a base cost)", pickMany],
    ["pay (an integer)", payX],
    ["distribute (combat damage)", distribute],
  ];

  for (const [name, position] of positions) {
    test(`${name}: the seat HOLDING the prompt may concede — the answer is not filtered by the question`, async () => {
      const game = await position();
      const asked = game.decision()?.seat as typeof P1 | typeof P2;
      // rule 650 — every Decision advertises the free actions that stay legal
      // while it is open, `concede` above all.
      const d = game.decision() as { actions?: readonly { moveId: string }[] };
      expect(d.actions?.map((a) => a.moveId)).toContain("concede");
      await expectConcedeWorks(game, asked);
    });

    test(`${name}: the seat NOT holding the prompt may concede too — 650 is not gated on the Decision`, async () => {
      const game = await position();
      const asked = game.decision()?.seat;
      const idle = (asked === P1 ? P2 : P1) as typeof P1 | typeof P2;
      expect(game.seat(idle).legal()).toEqual([]); // no ordinary move…
      await expectConcedeWorks(game, idle); // …yet 650 is unconditional
    });
  }

  test("the pregame counts (113 / 117 / 650): the concede move is legal while the engine is still in `setup`", () => {
    const gameId = `never-trap-setup-${made.length + 1}`;
    const session = makeSession(gameId);
    expect(session.engine.getState().status).toBe("setup"); // battlefield keep / Mulligan window
    const r = applySessionMove(session, P1, "concede", { playerId: P1 });
    expect(r.success).toBe(true);
    expect(session.engine.getState().status).toBe("finished");
    expect(session.engine.getState().winner).toBe(P2);
  });

});

// ===========================================================================
// 3. ONE GAME-END PATH — the end record and the 421.4 reveal, every time
// ===========================================================================

describe("every win path records WHY the game ended and reveals the facedown cards (196 / 421.4)", () => {
  test("concede: reason 'concede', the conceder named, and P2's facedown card revealed", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .facedown(P2, "bf1", HOSTILE_TAKEOVER, "fd")
      .build();
    await game.p1.concede();
    expect(game.engine.getGameEndResult()).toMatchObject({
      metadata: { concededBy: P1 },
      reason: "concede",
      winner: P2,
    });
    expect(game.gameState.publicReveals ?? []).toEqual([
      expect.objectContaining({ cardIds: ["fd"], playerId: P2 }),
    ]);
  });

  test("points: reason 'victory_points' — the Cleanup win writes the same record the concede path does", async () => {
    const game = await scenario()
      .victoryScore(2)
      .points(P1, 1)
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
      .facedown(P2, "bf2", HOSTILE_TAKEOVER, "fd")
      .build();
    await game.advanceTurn(); // → P2
    await game.advanceTurn(); // → P1's Beginning Phase: holding bf1 Scores the winning point
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    expect(game.engine.getGameEndResult()).toMatchObject({ reason: "victory_points", winner: P1 });
    expect(game.gameState.publicReveals ?? []).toEqual([
      expect.objectContaining({ cardIds: ["fd"], playerId: P2 }),
    ]);
  });

  test("effect (195 / 472.2): reason 'effect_win' — a win the points predicate cannot even see still records and still reveals", async () => {
    const b = scenario()
      .turn(2)
      .active(P2)
      .battlefield("bf1", { controller: P1, def: PLAZA, inert: false })
      .facedown(P2, "bf1", HOSTILE_TAKEOVER, "fd");
    for (let i = 0; i < 7; i += 1) {
      b.unit(P1, "bf1", { might: 1, name: `Crowd ${i}` }, `u${i}`);
    }
    const game = await b.build();
    await game.p2.endTurn();
    await game.settle();

    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    // 195 / 472.2: not a points win, so endIf/hasPlayerWon never sees it …
    expect(game.engine.checkGameEnd()).toBeUndefined();
    // … which is exactly why the end record has to exist.
    expect(game.engine.getGameEndResult()).toMatchObject({ reason: "effect_win", winner: P1 });
    expect(game.gameState.publicReveals ?? []).toEqual([
      expect.objectContaining({ cardIds: ["fd"], playerId: P2 }),
    ]);
  });
});

// ===========================================================================
// 4. THE APP HALF — Leave / Concede reaches the engine while a prompt is open
// ===========================================================================

const made: string[] = [];

function makeSession(gameId: string): GameSession {
  const session = createGameFromDecks(buildDefaultDeck(), buildDefaultDeck("calm", "mind"), gameId, {
    firstPlayer: P1,
    gameMode: "duel",
    names: { [P1]: "Tester", [P2]: "Goldfish" },
    sandbox: true,
  });
  gameSessions.set(gameId, session);
  made.push(gameId);
  const ws = {
    close: () => undefined,
    data: { connId: `${P1}-${gameId}`, gameId, playerId: P1 },
    send: () => undefined,
  } as unknown as ServerWebSocket<WsData>;
  session.clients.set(`${P1}-${gameId}`, { playerId: P1, ws });
  return session;
}

/** A GameSession wrapped around a harness-built position (no pregame layer in the way). */
function sessionAround(game: Game, gameId: string): GameSession {
  return {
    clients: new Map(),
    engine: game.engine,
    gameId,
    gameMode: "duel",
    gameNumber: 1,
    log: [],
    match: newMatchState("duel"),
    playerNames: { [P1]: "Alice", [P2]: "Bob" },
    players: [P1, P2],
    seq: 0,
  } as unknown as GameSession;
}

/** P1 holding an open mode prompt from Royal Entourage, with two legends to choose between. */
async function promptOpen(): Promise<Game> {
  const game = await scenario()
    .legend(P1, RELENTLESS_STORM, "storm")
    .legend(P1, LOOSE_CANNON, "cannon")
    .resources(P1, { energy: 4, power: { calm: 1 } })
    .hand(P1, ROYAL_ENTOURAGE, "royal")
    .build();
  await game.p1.play("royal");
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
  return game;
}

describe("the app half: a human staring at a prompt can still leave (650)", () => {
  test("concede_game reaches the engine while the conceder's OWN prompt is open", async () => {
    const game = await promptOpen();
    const session = sessionAround(game, "never-trap-app-1");
    const r = concedeGame(session, "never-trap-app-1", P1);
    expect(r.ok).toBe(true);
    expect(session.engine.getState().status).toBe("finished");
    expect(session.engine.getState().winner).toBe(P2);
    expect(session.engine.getState().pendingChoice).toBeUndefined();
  });

  test("concede_game reaches the engine while the OPPONENT's prompt is open", async () => {
    const game = await promptOpen();
    const session = sessionAround(game, "never-trap-app-2");
    const r = concedeGame(session, "never-trap-app-2", P2);
    expect(r.ok).toBe(true);
    expect(session.engine.getState().winner).toBe(P1);
  });

  test("concede_match is accepted from the pregame — the way out is never missing before a game starts", () => {
    const gameId = `never-trap-pre-${made.length + 1}`;
    const session = makeSession(gameId);
    expect(session.pregame).toBeDefined();
    const r = concedeMatch(session, gameId, P1);
    expect(r.ok).toBe(true);
    expect(session.pregame).toBeUndefined();
    expect(session.match?.concededBy).toBe(P1);
  });
});
