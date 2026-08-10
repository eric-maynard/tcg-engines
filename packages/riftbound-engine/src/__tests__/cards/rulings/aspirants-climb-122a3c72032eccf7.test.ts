/**
 * Ruling 122a3c72032eccf7 — Aspirant's Climb (OGN-276 → ogn-276-298) Battlefield "Increase the points needed
 *   to win the game by 1."
 *   × Green Father (UNL-195 → unl-195-219) Legend "When you conquer or hold, you may exhaust me to replace
 *     that battlefield with a Brush battlefield token."  × Brush token (unl-t03).
 *
 * Q: Both players are at 8. I conquer Aspirant's Climb and Green Father turns it into Brush — what happens?
 * A: The conquer at 8 (one short of the raised score of 9) draws 1 instead of scoring (unless every
 *    battlefield was scored this turn) — still 8:8. Replacing the Climb drops the Victory Score back to 8
 *    at once, but a win needs points ≥ score AND more than any opponent; 8:8 is a tie, so nobody wins and
 *    play continues. From here any further point (at/above the score) is a Final Point and wins.
 * Rules: 323.1 / 467 (win check), 466.1.b / 471 (Final Point: conquer draws unless all battlefields scored;
 * hold unrestricted), 365.1 (a battlefield's passive stops when it leaves play), 438 (replace).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";
import { effectiveVictoryScore } from "../../../operations/points";

const ASPIRANTS_CLIMB = "ogn-276-298";
const GREEN_FATHER = "unl-195-219";
const BRUSH = "unl-t03";

/**
 * P1's turn, both players on 8, Victory Score 8 (+1 from the live Aspirant's Climb = 9).
 * bf1 = Aspirant's Climb held by P2's 1-Might Sentry; bf2 = a plain battlefield held by P2's 5-Might Wall.
 * P1: Green Father legend (ready), a 3-Might Raider in base.
 */
function board() {
  return scenario()
    .victoryScore(8)
    .points(P1, 8)
    .points(P2, 8)
    .legend(P1, GREEN_FATHER, "gf")
    .battlefield("bf1", { controller: P2, def: ASPIRANTS_CLIMB, inert: false, owner: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf1", { might: 1, name: "Sentry" }, "sentry")
    .unit(P2, "bf2", { might: 5, name: "Wall" }, "wall")
    .unit(P1, "base", { might: 3, name: "Raider" }, "raider");
}

/** P1 conquers bf1; stops at Green Father's "you may exhaust me" prompt. */
async function conquerClimb(): Promise<Game> {
  const game = await board().build();
  expect(effectiveVictoryScore(game.gameState, P1)).toBe(9);
  expect(effectiveVictoryScore(game.gameState, P2)).toBe(9);
  expect(game.isOver()).toBe(false); // 8 each is not a win under the Climb
  await game.p1.move("raider", "bf1");
  const r = await game.settle();
  expect(game.zoneOf("sentry")).toBe("trash");
  expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  expect(r.reason).toBe("unanswered");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 }); // Green Father: P1 chooses whether to exhaust
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "gf", controller: P1, triggered: true })]);
  return game;
}

describe("Ruling 122a3c72032eccf7 — conquering Aspirant's Climb at 8:8 and Brushing it: draw instead of score, then a tie at the lowered score — no winner", () => {
  test("the conquer at 8 with a score of 9 is a would-be Final Point from ONE of two battlefields → P1 draws 1 instead; both stay on 8", async () => {
    const pre = await board().build();
    const handBefore = pre.p1.hand().length;
    const game = await conquerClimb();
    expect(game.p1.points()).toBe(8);
    expect(game.p2.points()).toBe(8);
    expect(game.p1.hand()).toHaveLength(handBefore + 1);
    expect(game.isOver()).toBe(false);
  });

  test("'yes' to Green Father: the Climb is replaced by a Brush token → the Victory Score drops to 8 immediately for both players", async () => {
    const game = await conquerClimb();
    await game.p1.yes();
    await game.settle();
    expect(game.state("gf").isExhausted).toBe(true);
    const under = game.locationOf("raider") as string;
    expect(game.state(under).name).toBe("Brush");
    expect(game.cardsAt("banishment").length + game.findAll({ defId: BRUSH }).length).toBeGreaterThan(0); // replaced, per 438
    expect(effectiveVictoryScore(game.gameState, P1)).toBe(8);
    expect(effectiveVictoryScore(game.gameState, P2)).toBe(8);
  });

  test("8:8 at a Victory Score of 8 is NOT a win for anyone (≥ score but not MORE than the opponent): the game continues in P1's main phase", async () => {
    const game = await conquerClimb();
    await game.p1.yes();
    const stop = await game.settle();
    expect(game.p1.points()).toBe(8);
    expect(game.p2.points()).toBe(8);
    expect(game.isOver()).toBe(false);
    expect(game.winner()).toBeUndefined();
    expect(stop.reason).toBe("open");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("from there every further point is a Final Point: P1 passes the turn, P2 HOLDS bf2 at the start of theirs → 9 > 8 → P2 wins", async () => {
    const game = await conquerClimb();
    await game.p1.yes();
    await game.settle();
    await game.p1.endTurn();
    await game.settle();
    expect(game.p2.points()).toBe(9);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P2);
  });
});
