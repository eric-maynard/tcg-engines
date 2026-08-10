/**
 * Interaction: Green Father (unl-195-219) — Legend · Ivern
 *     "When you conquer or hold, you may exhaust me to replace that battlefield with a Brush battlefield token."
 *   × Aspirant's Climb (ogn-276-298) — Battlefield: "Increase the points needed to win the game by 1."
 *   × Brush (unl-t03) — Battlefield token: "Bird, Cat, Dog, Poro, and Ivern units here have +1 [Might].
 *      When you score here, you may replace this with the battlefield it replaced."
 *
 * Question: 1v1, P1's legend is Green Father. bfA = Aspirant's Climb (Victory Score 9), bfB = a plain
 * battlefield controlled by P2. Both players at 8. On P1's turn P1 conquers the Climb (P2's lone
 * defender dies) — bfB has NOT been scored by P1 this turn — and exhausts Green Father to Brush it.
 *   (a) Point from the conquer, or a draw?
 *   (b) After the Brush the Victory Score is 8 with BOTH players at 8: does anyone win at that cleanup?
 *       Does the game end / error / continue, and is the check re-run at later cleanups?
 *   (c) P1 ends the turn; P2 holds bfB in its Beginning Phase — result?
 *   (d) Contrast: P2 at 7 — does P1 win at the post-Brush cleanup although the conquer gave no point?
 *
 * Rules:
 *   194.3.a        — card effects may alter the Victory Score (Climb: 9 while it is on the board).
 *   471.1.b / .b.1 — a Conquer at VS−1 without every battlefield scored this turn → draw 1 instead.
 *   471.2.a        — the Conquer still happened → "when you conquer" triggers fire.
 *   438 / 438.7    — Replace: the Climb goes to banishment, the Brush token takes its place and control.
 *   194.2 / 194.2.a / 194.2.b / 323.1 / 472 — win = points ≥ VS AND more than any opponent, checked at
 *                    cleanup; tied players keep playing until one has more points in a cleanup.
 *   469.2 / 471.1.a.1 — Hold scores in the Beginning Phase and is never Final-Point-restricted.
 *   319.6          — a cleanup follows objects entering/leaving the board (later moves re-run the check).
 *
 * Expected: (a) draw 1, stay 8; Green Father triggers; Climb → banishment, Brush controlled by P1.
 *   (b) VS back to 8; 8:8 tie → nobody wins, no game over, P1's open main phase; later cleanups keep
 *   finding a tie (no crash, no turn-player tiebreak, no draw). (c) P2 holds bfB → 9 > 8 → P2 wins.
 *   (d) P2 at 7: no win right after the conquer (VS 9), but at the post-Brush cleanup 8 ≥ 8 and 8 > 7
 *   → P1 wins there and then.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";
import { effectiveVictoryScore } from "../../../operations/points";

const GREEN_FATHER = "unl-195-219";
const ASPIRANTS_CLIMB = "ogn-276-298";

/**
 * P1's turn 2 main phase. Victory Score 8 (+1 while the Climb is in play). P1 8 points, P2 `p2Points`.
 *   bfA = Aspirant's Climb (live), P2 controls it with a lone 1-Might Sentry.
 *   bfB = plain battlefield, P2 controls it with a 5-Might Wall (P1 never scores it this turn).
 *   P1: Green Father (ready), Raider (3) and Runner (1) in base.
 */
function board(opts: { p2Points?: number; bfBUncontrolled?: boolean } = {}) {
  return scenario()
    .victoryScore(8)
    .points(P1, 8)
    .points(P2, opts.p2Points ?? 8)
    .legend(P1, GREEN_FATHER, "gf")
    .battlefield("bfA", { controller: P2, def: ASPIRANTS_CLIMB, inert: false, owner: P2 })
    .battlefield("bfB", { controller: opts.bfBUncontrolled ? null : P2, owner: P2 })
    .unit(P2, "bfA", { might: 1, name: "Sentry" }, "sentry")
    .unit(P2, opts.bfBUncontrolled ? "base" : "bfB", { might: 5, name: "Wall" }, "wall")
    .unit(P1, "base", { might: 3, name: "Raider" }, "raider")
    .unit(P1, "base", { might: 1, name: "Runner" }, "runner");
}

/** Raider conquers the Climb; stops at Green Father's "you may exhaust me" prompt. */
async function conquerClimb(opts?: Parameters<typeof board>[0]): Promise<Game> {
  const game = await board(opts).build();
  await game.p1.move("raider", "bfA");
  const r = await game.settle();
  expect(game.zoneOf("sentry")).toBe("trash");
  expect(game.gameState.battlefields.bfA?.controller).toBe(P1);
  expect(r.reason).toBe("unanswered");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
  expect(game.decision()?.source?.cardId).toBe("gf");
  return game;
}

/** …and P1 says yes: the Climb is Brushed. Returns after settling. */
async function conquerAndBrush(opts?: Parameters<typeof board>[0]): Promise<Game> {
  const game = await conquerClimb(opts);
  await game.p1.yes();
  await game.settle();
  return game;
}

describe("Green Father Brushes a conquered Aspirant's Climb at 8:8 — the score drops to 8 but nobody wins", () => {
  test("setup: with the Climb on the board the Victory Score is 9 for both players; 8:8 is not a finished game", async () => {
    const game = await board().build();
    expect(game.gameState.victoryScore).toBe(8);
    expect(effectiveVictoryScore(game.gameState, P1)).toBe(9);
    expect(effectiveVictoryScore(game.gameState, P2)).toBe(9);
    expect(game.isOver()).toBe(false);
  });

  // ── (a) the conquer ─────────────────────────────────────────────────────────────────────

  test("(a) the conquer at 8 (VS 9) with bfB unscored this turn is a blocked Final Point → P1 DRAWS 1 instead and stays on 8 (471.1.b.1)", async () => {
    const pre = await board().build();
    const handBefore = pre.p1.hand().length;
    const game = await conquerClimb();
    expect(game.p1.points()).toBe(8);
    expect(game.p2.points()).toBe(8);
    expect(game.p1.hand()).toHaveLength(handBefore + 1);
    expect(game.isOver()).toBe(false);
  });

  test("(a) the Conquer still happened (471.2.a): Green Father's trigger is on the chain asking P1 whether to exhaust", async () => {
    const game = await conquerClimb();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "gf", controller: P1, triggered: true })]);
    expect(game.state("gf").isExhausted).toBe(false);
  });

  test("(a) yes → Green Father exhausts; the Climb card goes to banishment and a Brush token stands in its slot, controlled by P1 with the Raider still on it (438)", async () => {
    const game = await conquerAndBrush();
    expect(game.state("gf").isExhausted).toBe(true);
    const slot = game.locationOf("raider") as string;
    expect(game.state(slot)).toMatchObject({ cardType: "battlefield", isToken: true, name: "Brush" });
    expect(game.gameState.battlefields[slot]?.controller).toBe(P1);
    const banished = game.cardsAt("banishment");
    expect(banished).toHaveLength(1);
    expect(game.state(banished[0] as string)).toMatchObject({ cardType: "battlefield", isToken: false, name: "Aspirant's Climb", zone: "banishment" });
    expect(game.battlefields().map((b) => game.state(b).name).sort()).toEqual(["Brush", "bfB"]);
  });

  // ── (b) 8:8 at VS 8 ─────────────────────────────────────────────────────────────────────

  test("(b) with the Climb gone the Victory Score is back to 8 for both players immediately", async () => {
    const game = await conquerAndBrush();
    expect(effectiveVictoryScore(game.gameState, P1)).toBe(8);
    expect(effectiveVictoryScore(game.gameState, P2)).toBe(8);
  });

  test("(b) 8:8 at VS 8: ≥ score but NOT more than the opponent → nobody wins at that cleanup; no game over, no winner, no draw (194.2.a/b, 472)", async () => {
    const game = await conquerAndBrush();
    expect(game.p1.points()).toBe(8);
    expect(game.p2.points()).toBe(8);
    expect(game.isOver()).toBe(false);
    expect(game.winner()).toBeUndefined();
    expect(game.gameState.status).toBe("playing");
  });

  test("(b) the turn simply continues: P1 is in an open main phase (Neutral Open) and may keep acting", async () => {
    const game = await conquerClimb();
    await game.p1.yes();
    const stop = await game.settle();
    expect(stop.reason).toBe("open");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.can("move")).toBe(true);
  });

  test("(b) later cleanups re-run the check and keep finding a tie: P1 moves the Runner onto the Brush (a cleanup, 319.6) — still 8:8, still no winner, still P1's turn", async () => {
    const game = await conquerAndBrush();
    const brush = game.locationOf("raider") as string;
    await game.p1.move("runner", brush);
    const stop = await game.settle();
    expect(game.locationOf("runner")).toBe(brush);
    expect(stop.reason).toBe("open");
    expect(game.isOver()).toBe(false);
    expect(game.winner()).toBeUndefined();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("(b) nor do the end-of-turn / next-turn cleanups pick the turn player: with bfB uncontrolled (nothing for P2 to hold) the tie survives P1's Ending Phase and all of P2's turn — the first to break it is P1 HOLDING the Brush a turn later (9 > 8)", async () => {
    const game = await conquerAndBrush({ bfBUncontrolled: true });
    expect(game.isOver()).toBe(false);
    await game.p1.endTurn();
    const p2Turn = await game.settle();
    expect(p2Turn.reason).toBe("open");
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("main");
    expect(game.isOver()).toBe(false);
    expect([game.p1.points(), game.p2.points()]).toEqual([8, 8]);
    await game.p2.endTurn();
    const p1Turn = await game.settle();
    expect(p1Turn.reason).toBe("game-over");
    expect(game.p1.points()).toBe(9);
    expect(game.winner()).toBe(P1);
  });

  // ── (c) P2 holds bfB ────────────────────────────────────────────────────────────────────

  test("(c) P2's Beginning Phase: P2 HOLDS bfB → 9 (Hold is never Final-Point-restricted, 471.1.a.1); cleanup: 9 ≥ 8 and 9 > 8 → P2 wins", async () => {
    const game = await conquerAndBrush();
    await game.p1.endTurn();
    const stop = await game.settle();
    expect(game.p2.points()).toBe(9);
    expect(game.p1.points()).toBe(8);
    expect(stop.reason).toBe("game-over");
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P2);
  });

  // ── (d) contrast: P2 at 7 ───────────────────────────────────────────────────────────────

  test("(d) P2 at 7: right after the conquer P1 is still 8 (drew a card) under VS 9 → no win yet at that cleanup", async () => {
    const pre = await board({ p2Points: 7 }).build();
    const handBefore = pre.p1.hand().length;
    const game = await conquerClimb({ p2Points: 7 });
    expect(game.p1.points()).toBe(8);
    expect(game.p1.hand()).toHaveLength(handBefore + 1);
    expect(effectiveVictoryScore(game.gameState, P1)).toBe(9);
    expect(game.isOver()).toBe(false);
  });

  test("(d) P2 at 7: declining Green Father keeps the Climb (VS 9) → 8 is not a win; P1's turn continues", async () => {
    const game = await conquerClimb({ p2Points: 7 });
    await game.p1.no();
    const stop = await game.settle();
    expect(game.state("bfA").name).toBe("Aspirant's Climb");
    expect(effectiveVictoryScore(game.gameState, P1)).toBe(9);
    expect(stop.reason).toBe("open");
    expect(game.isOver()).toBe(false);
  });

  test("(d) P2 at 7: Brushing the Climb drops VS to 8 → the post-Brush cleanup finds P1 8 ≥ 8 and 8 > 7 → P1 WINS right there, with no point ever gained from the conquer", async () => {
    const game = await conquerClimb({ p2Points: 7 });
    await game.p1.yes();
    const stop = await game.settle();
    expect(game.p1.points()).toBe(8);
    expect(game.p2.points()).toBe(7);
    expect(effectiveVictoryScore(game.gameState, P1)).toBe(8);
    expect(stop.reason).toBe("game-over");
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });
});
