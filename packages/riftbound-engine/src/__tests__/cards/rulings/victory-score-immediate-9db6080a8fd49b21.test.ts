/**
 * Ruling 9db6080a8fd49b21 — (no specific card) can both players be on 8 points at once?
 *   Plain inline units, plus an inline "[Action] Each player gains 1 point" spell for the simultaneous case.
 *
 * Q: What happens if both players have 8 points at the same time?
 * A (ruling): it cannot happen — the game ends the moment a player reaches the Victory Score, so the second
 *    player never gets there.
 * A (Core Rules, which the engine follows): the ordinary case matches — a lone player reaching 8 wins at
 *    that Cleanup and the opponent never scores again. But 194.2 makes winning "points ≥ Victory Score AND
 *    more than any other player", checked in a Cleanup, so an effect that scores both players at once
 *    genuinely leaves them 8–8 with no winner and play continues until someone is strictly ahead.
 * Rules: 194.2 / 194.2.a / 194.2.b (the win check), 323.1 / 472 (it is a Cleanup task, not a continuous
 *        check), 471.1.b (the Final Point restriction), 485.3 (Victory Score 8 in a duel).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const EACH_PLAYER_GAINS_1 = {
  abilities: [{ effect: { amount: 1, player: "each", type: "score" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Shared Glory",
  rulesText: "[Action] Each player gains 1 point.",
  timing: "action",
} as const;

const OPPONENT_GAINS_1 = {
  abilities: [{ effect: { amount: 1, player: "opponent", type: "score" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Largesse",
  rulesText: "[Action] Each opponent gains 1 point.",
  timing: "action",
} as const;

describe("Ruling 9db6080a8fd49b21 — reaching the Victory Score first ends the game before the opponent can catch up", () => {
  test("both on 7: P1 conquers the empty battlefield, hits 8 and the game is over — P2 is frozen on 7 with no further scoring", async () => {
    const game = await scenario()
      .victoryScore(8)
      .points(P1, 7)
      .points(P2, 7)
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
      .unit(P2, "base", { might: 2, name: "Sentry" }, "sentry")
      .build();
    await game.p1.move("scout", "bf1");
    await game.settle();
    expect(game.p1.points()).toBe(8);
    expect(game.p2.points()).toBe(7);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    expect(game.p2.legal()).toEqual([]); // nothing left to do; the game is finished
  });

  test("the win check does not care whose turn it is — a point handed to the OPPONENT at 7–7 ends the game for them", async () => {
    const game = await scenario()
      .victoryScore(8)
      .points(P1, 7)
      .points(P2, 7)
      .hand(P1, OPPONENT_GAINS_1, "largesse")
      .build();
    await game.p1.cast("largesse");
    await game.settle();
    expect(game.p2.points()).toBe(8);
    expect(game.p1.points()).toBe(7);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P2);
  });

  // RULING-CONFLICT: riftjudge 9db6080a8fd49b21 says two players can never both reach the Victory Score,
  // because the game ends the instant the first one does. CR 194.2 says a win needs points ≥ Victory Score
  // AND strictly more than any other player, and 323.1 / 472 make that a CLEANUP check rather than a
  // continuous one — so a single effect that scores both players does leave 8–8 with nobody winning.
  // The engine follows the CR (green siblings: core-rules/victory-and-final-point.test.ts § "a tie at or
  // above the Victory Score has no winner until someone is strictly ahead at a Cleanup").
  test("simultaneous scoring at 7–7 really does reach 8–8, and nobody wins — play goes on until someone is strictly ahead", async () => {
    const game = await scenario()
      .victoryScore(8)
      .points(P1, 7)
      .points(P2, 7)
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
      .hand(P1, EACH_PLAYER_GAINS_1, "glory")
      .build();
    await game.p1.cast("glory");
    await game.settle();
    expect(game.p1.points()).toBe(8);
    expect(game.p2.points()).toBe(8);
    expect(game.isOver()).toBe(false);
    expect(game.winner()).toBeUndefined();
    expect(game.violations()).toEqual([]);
  });
});
