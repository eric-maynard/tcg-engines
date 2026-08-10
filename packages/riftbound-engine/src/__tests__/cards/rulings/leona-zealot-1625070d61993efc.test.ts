/**
 * Ruling 1625070d61993efc — Leona, Zealot (OGN-079 → ogn-079-298)
 *   "If an opponent's score is within 3 points of the Victory Score, I enter ready. …"
 *   × Aspirant's Climb (OGN-276 → ogn-276-298) Battlefield: "Increase the points needed to win the game by 1."
 *
 * Q: Does Leona enter ready when the opponent is at 5 or more points?
 * A: Yes — with the default Victory Score of 8 she enters ready at opponent ≥ 5 (8 − 5 = 3, "within 3").
 *    With Aspirant's Climb in play the score is 9, so the threshold shifts to opponent ≥ 6.
 * Rules: 340.2 (units enter exhausted), 323.1 (Victory Score), 365.1 (battlefield passives).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";
import { effectiveVictoryScore } from "../../../operations/points";

const LEONA = "ogn-079-298";
const ASPIRANTS_CLIMB = "ogn-276-298";

function board(opponentPoints: number, withClimb: boolean) {
  const s = scenario()
    .victoryScore(8)
    .points(P2, opponentPoints)
    .resources(P1, { energy: 6, power: { calm: 1 } })
    .hand(P1, LEONA, "leona");
  return withClimb
    ? s.battlefield("bf1", { controller: null, def: ASPIRANTS_CLIMB, inert: false })
    : s.battlefield("bf1", { controller: null });
}

async function playLeona(opponentPoints: number, withClimb: boolean) {
  const game = await board(opponentPoints, withClimb).build();
  expect(effectiveVictoryScore(game.gameState, P2)).toBe(withClimb ? 9 : 8);
  await game.p1.play("leona", { to: "base" });
  await game.settle();
  expect(game.zoneOf("leona")).toBe("base");
  return game;
}

describe("Ruling 1625070d61993efc — Leona, Zealot enters ready at opponent ≥ 5 (Victory Score 8) / ≥ 6 (Aspirant's Climb → 9)", () => {
  test("no Climb, opponent at 5: 8 − 5 = 3 → 'within 3' → Leona enters READY", async () => {
    const game = await playLeona(5, false);
    expect(game.state("leona").isReady).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  test("no Climb, opponent at 7: also within 3 → ready", async () => {
    const game = await playLeona(7, false);
    expect(game.state("leona").isReady).toBe(true);
  });

  test("no Climb, opponent at 4: 8 − 4 = 4 → NOT within 3 → Leona enters exhausted as usual", async () => {
    const game = await playLeona(4, false);
    expect(game.state("leona").isExhausted).toBe(true);
  });

  // Expected: the Climb's passive raises the Victory Score to 9, so 5 is 4 short → Leona enters exhausted.
  // Actual: the "score-within" evaluator reads the base victoryScore (8) and ignores the Climb → she enters ready.
  test("ruling 1625070d61993efc — with Aspirant's Climb (score 9), opponent at 5 is NOT within 3 → exhausted; engine ignores the Climb for 'within N of the Victory Score'", async () => {
    const game = await playLeona(5, true);
    expect(game.state("leona").isExhausted).toBe(true);
  });

  test("with Aspirant's Climb (score 9), opponent at 6: 9 − 6 = 3 → within 3 → ready", async () => {
    const game = await playLeona(6, true);
    expect(game.state("leona").isReady).toBe(true);
    expect(game.violations()).toEqual([]);
  });
});
