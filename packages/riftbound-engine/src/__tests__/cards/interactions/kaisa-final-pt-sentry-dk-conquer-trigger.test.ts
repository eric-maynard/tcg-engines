/**
 * Interaction: Kai'Sa, Survivor (ogn-039-298) · Unit · Fury · 4 · 4 Might · "[Accelerate] … When I conquer, draw 1."      — P1's
 *   × Watchful Sentry (ogn-096-298) · Unit · Mind · 2 · 1 Might · "[Deathknell] — Draw 1."                              — P2's
 *   at the Final Point: Victory Score 8, P1 on 7 having HELD battlefield A this turn, attacking battlefield B held by the Sentry.
 *
 * Rules: 465 (combat damage), 466.1 (Combat Cleanup: 323.1 win check, 323.4 pending items noted, 323.5 lethal damage kills),
 * 466.2 (chain items from combat damage / the Combat Cleanup RESOLVE before the Resolution Step), 466.3 (Resolution Step: sole
 * remaining side wins → control established), 469.1 (Conquer), 471.1.b.1 (1 point from Victory: gain the Final Point only if
 * every battlefield was Scored this turn — otherwise draw a card instead), 471.2.a (Conquer abilities trigger), 319.3 / 323.1
 * (points ≥ Victory Score and more than any opponent → that player wins), 196 (the game ends), 650 / 651.1 (a player may concede at
 * any time; the one remaining player Wins).
 *
 * Question: (a) full sequence with no responses — does P2 draw off the Sentry's Deathknell before P1 wins? Does Kai'Sa's conquer
 * draw ever resolve? Final score? (b) 'No' side — same board but P1 did NOT score A this turn: what happens at the conquer?
 * (c) in (a), after the Combat Cleanup killed the Sentry and its Deathknell is on the chain but unresolved, P2 concedes — winner,
 * P1's points, does P2 draw, does control of B change, does Kai'Sa's trigger fire?
 *
 * Expected: (a) Kai'Sa 4 into Sentry, Sentry 1 into Kai'Sa; Combat Cleanup: P1 on 7 → no win yet; Sentry dies, its Deathknell is
 * a pending item; 466.2 → it RESOLVES: P2 draws 1 (the game is not over yet). 466.3: only P1 remains at B → Conquer; 471.1.b.1:
 * P1 has now scored every battlefield this turn → Final Point → 8; Kai'Sa's "When I conquer" becomes a pending item; Cleanup
 * 323.1: 8 ≥ 8 and more than P2 → P1 WINS, the game ends — Kai'Sa's draw never resolves (P1's hand unchanged), no further
 * decisions, single winner P1 on exactly 8. (b) not every battlefield scored → P1 DRAWS instead and stays on 7; the game goes on:
 * Kai'Sa's conquer trigger then resolves normally (P1 draws another), P2 already drew off the Sentry. (c) P2 may concede with the
 * Deathknell pending; P1 wins by concession at once: P1 still 7 (466.3 never ran — no conquer, B unchanged / still contested in
 * the snapshot), Sentry in P2's trash but its Deathknell does NOT resolve (P2 draws 0), Kai'Sa's trigger never exists, the chain
 * is left undrained, no decisions surfaced.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const KAISA_SURVIVOR = "ogn-039-298";
const WATCHFUL_SENTRY = "ogn-096-298";

/**
 * (a)/(c) board — built on P2's turn 1 so that P1 REALLY holds A: Victory Score 8; P1 on 6 with a Recruit token standing on bfA
 * and Kai'Sa in base; P2 on 3 with Watchful Sentry alone on bfB. `advanceTurn()` → P1's turn 2: Beginning Phase Hold scores A
 * (6 → 7, scoredThisTurn = [bfA]), P1 draws 1 (hand 1), Kai'Sa is awake. Decks are auto-filled.
 */
function heldBoard() {
  return scenario()
    .turn(1)
    .active(P2)
    .victoryScore(8)
    .points(P1, 6)
    .points(P2, 3)
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: P2 })
    .unit(P1, "bfA", { isToken: true, might: 1, name: "Recruit", tags: ["Recruit"] }, "token-recruit")
    .unit(P1, "base", KAISA_SURVIVOR, "kaisa")
    .unit(P2, "bfB", WATCHFUL_SENTRY, "sentry");
}

/** (b) board — P1's turn 2 directly: already on 7 but has NOT scored A this turn (it merely controls it). */
function notHeldBoard() {
  return scenario()
    .victoryScore(8)
    .points(P1, 7)
    .points(P2, 3)
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: P2 })
    .unit(P1, "bfA", { isToken: true, might: 1, name: "Recruit", tags: ["Recruit"] }, "token-recruit")
    .unit(P1, "base", KAISA_SURVIVOR, "kaisa")
    .unit(P2, "bfB", WATCHFUL_SENTRY, "sentry");
}

/** P1 on 7 having held A this turn, open main phase. */
async function afterHold(): Promise<Game> {
  const game = await heldBoard().build();
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.p1.points()).toBe(7);
  expect(game.gameState.scoredThisTurn?.[P1]).toEqual(["bfA"]);
  return game;
}

/**
 * Kai'Sa attacks B; both pass Focus → combat damage + Combat Cleanup run: the Sentry is dead and its Deathknell is the lone chain
 * item, P2 (its controller) holding priority — i.e. 466.2's window, BEFORE the Resolution Step.
 */
async function deathknellPending(game: Game): Promise<void> {
  await game.p1.move("kaisa", "bfB");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.passFocus();
  await game.p2.passFocus();
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sentry", controller: P2, triggered: true })]);
}

const bfB = (game: Game) => ({ contested: game.gameState.battlefields?.bfB?.contested, controller: game.gameState.battlefields?.bfB?.controller });

describe("premise", () => {
  test("P1 really HOLDS A at the start of its turn: 6 → 7, scoredThisTurn = [bfA]; Kai'Sa (4) ready in base, Sentry (1) alone on B held by P2; Victory Score 8", async () => {
    const game = await afterHold();
    expect(game.gameState.victoryScore).toBe(8);
    expect(game.state("kaisa")).toMatchObject({ isExhausted: false, location: "base", might: 4 });
    expect(game.state("sentry")).toMatchObject({ keywords: ["Deathknell"], location: "bfB", might: 1 });
    expect(bfB(game)).toEqual({ contested: false, controller: P2 });
    expect(game.p2.points()).toBe(3);
    expect(game.p1.legal().some((o) => o.verb === "move")).toBe(true);
  });
});

describe("(a) held A, conquer B with Kai'Sa over Watchful Sentry — the Final Point", () => {
  test("combat + Combat Cleanup (466.1): Sentry takes 4 and dies to P2's trash, Kai'Sa survives (healed at 3c); P1 is still on 7 (323.1: no win yet); B not yet conquered (still contested, P2's); the Sentry's Deathknell is on the chain with P2 holding priority", async () => {
    const game = await afterHold();
    await deathknellPending(game);
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.p2.trash()).toContain("sentry");
    expect(game.state("kaisa")).toMatchObject({ damage: 0, location: "bfB" });
    expect(game.p1.points()).toBe(7);
    expect(game.isOver()).toBe(false);
    expect(bfB(game)).toEqual({ contested: true, controller: P2 });
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  });

  test("466.2: the Deathknell RESOLVES before the Resolution Step — P2 draws 1 while P1 is still on 7 and the game is live", async () => {
    const game = await afterHold();
    const p2Hand = game.p2.hand().length;
    await deathknellPending(game);
    await game.p2.passPriority();
    expect(game.p1.points()).toBe(7); // P1 about to pass: still 7, Sentry item still there
    expect(game.chain().map((c) => c.cardId)).toEqual(["sentry"]);
    await game.p1.passPriority(); // → Deathknell resolves, then 466.3 runs
    expect(game.p2.hand()).toHaveLength(p2Hand + 1);
  });

  test("466.3 → 469.1 → 471.1.b.1: P1 alone at B conquers it; having scored EVERY battlefield this turn P1 gains the Final Point → 8 → 323.1 P1 WINS (196: game over, single winner)", async () => {
    const game = await afterHold();
    await deathknellPending(game);
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(bfB(game)).toEqual({ contested: false, controller: P1 });
    expect([...(game.gameState.scoredThisTurn?.[P1] ?? [])].sort()).toEqual(["bfA", "bfB"]);
    expect(game.p1.points()).toBe(8);
    expect(game.p2.points()).toBe(3);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    expect(game.gameState.status).not.toBe("active");
  });

  test("Kai'Sa's 'When I conquer, draw 1' was triggered (471.2.a) but NEVER resolves: it is left on the chain, P1's hand size is unchanged from before the attack, no decision / priority is surfaced to anyone, settle reports game-over", async () => {
    const game = await afterHold();
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length;
    await deathknellPending(game);
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "kaisa", controller: P1, triggered: true })]);
    expect(game.p1.hand()).toHaveLength(p1Hand); // Kai'Sa's draw never happened (and the Final Point is a point, not a draw)
    expect(game.p2.hand()).toHaveLength(p2Hand + 1); // the Sentry's draw did
    expect(game.decision()).toBeNull();
    const r = await game.settle();
    expect(r.reason).toBe("game-over");
    expect(game.p1.points()).toBe(8); // exactly 8 — nothing scored past the win
    expect(game.violations()).toEqual([]);
  });

  test("same outcome hands-off: move in and settle() → P1 wins 8–3, P2 drew exactly 1, P1 drew 0", async () => {
    const game = await afterHold();
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length;
    await game.p1.move("kaisa", "bfB");
    const r = await game.settle();
    expect(r.reason).toBe("game-over");
    expect({ p1: game.p1.points(), p2: game.p2.points(), winner: game.winner() }).toEqual({ p1: 8, p2: 3, winner: P1 });
    expect(game.p1.hand()).toHaveLength(p1Hand);
    expect(game.p2.hand()).toHaveLength(p2Hand + 1);
  });
});

describe("(b) 'No' side — P1 on 7 but did NOT score A this turn", () => {
  test("premise: P1 controls A but scoredThisTurn is empty", async () => {
    const game = await notHeldBoard().build();
    expect(game.p1.points()).toBe(7);
    expect(game.gameState.battlefields?.bfA?.controller).toBe(P1);
    expect(game.gameState.scoredThisTurn?.[P1] ?? []).toEqual([]);
  });

  test("the Sentry's Deathknell still resolves first (P2 draws 1); at the conquer 471.1.b.1 gives P1 a CARD instead of the point: B is P1's, P1 stays on 7, hand +1, game NOT over — and Kai'Sa's conquer trigger is now on the chain", async () => {
    const game = await notHeldBoard().build();
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length;
    await deathknellPending(game);
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.p2.hand()).toHaveLength(p2Hand + 1);
    expect(bfB(game)).toEqual({ contested: false, controller: P1 });
    expect(game.gameState.scoredThisTurn?.[P1]).toEqual(["bfB"]);
    expect(game.p1.points()).toBe(7);
    expect(game.p1.hand()).toHaveLength(p1Hand + 1); // the "instead" draw
    expect(game.isOver()).toBe(false);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "kaisa", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("…and Kai'Sa's 'When I conquer, draw 1' then resolves normally: P1 ends on hand +2 (instead-draw + Kai'Sa), 7 points, back in P1's open main phase; P2 drew exactly 1", async () => {
    const game = await notHeldBoard().build();
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length;
    await game.p1.move("kaisa", "bfB");
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toHaveLength(p1Hand + 2);
    expect(game.p2.hand()).toHaveLength(p2Hand + 1);
    expect(game.p1.points()).toBe(7);
    expect(game.isOver()).toBe(false);
    expect(game.winner()).toBeUndefined();
    expect(game.state("kaisa")).toMatchObject({ damage: 0, location: "bfB" });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});

describe("(c) P2 concedes with the Sentry's Deathknell pending (650 / 651.1)", () => {
  test("conceding is legal for P2 in that window, and P1 wins immediately by concession", async () => {
    const game = await afterHold();
    await deathknellPending(game);
    expect(game.p2.can("concede")).toBe(true);
    await game.p2.concede();
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });

  test("terminal snapshot: P1 still on 7 (466.3 never ran — no conquer), B unchanged: still P2's and still contested, scoredThisTurn still just [bfA]", async () => {
    const game = await afterHold();
    await deathknellPending(game);
    await game.p2.concede();
    expect(game.p1.points()).toBe(7);
    expect(game.p2.points()).toBe(3);
    expect(bfB(game)).toEqual({ contested: true, controller: P2 });
    expect(game.gameState.scoredThisTurn?.[P1]).toEqual(["bfA"]);
    expect(game.state("kaisa").location).toBe("bfB");
  });

  test("the Sentry is in P2's trash (it died before the concession) but its Deathknell does NOT resolve: P2 draws 0, the item is left undrained on the chain; Kai'Sa's conquer trigger never exists; no decision is surfaced and settle reports game-over", async () => {
    const game = await afterHold();
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length;
    await deathknellPending(game);
    await game.p2.concede();
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.p2.trash()).toContain("sentry");
    expect(game.p2.hand()).toHaveLength(p2Hand);
    expect(game.p1.hand()).toHaveLength(p1Hand);
    expect(game.chain().map((c) => c.cardId)).toEqual(["sentry"]);
    expect(game.chain().some((c) => c.cardId === "kaisa")).toBe(false);
    expect(game.decision()).toBeNull();
    const r = await game.settle();
    expect(r.reason).toBe("game-over");
    expect(game.p2.hand()).toHaveLength(p2Hand); // still nothing drawn after settling
    expect(game.chain().map((c) => c.cardId)).toEqual(["sentry"]);
    expect(game.violations()).toEqual([]);
  });
});
