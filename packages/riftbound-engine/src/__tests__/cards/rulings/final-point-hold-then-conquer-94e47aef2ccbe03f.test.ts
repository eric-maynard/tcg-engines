/**
 * Ruling 94e47aef2ccbe03f — (no specific card) taking the Final Point without a "double conquer".
 *   Plain inline units on a two-battlefield duel board with Victory Score 8.
 *
 * Q: One battlefield away from winning — do I have to conquer BOTH battlefields in one turn, or does a
 *    Hold count?
 * A: A Hold counts as scoring that battlefield. The Final Point only requires that you score EVERY
 *    battlefield during that turn, by Hold or Conquer in any mix. Hold one at the start of the turn and
 *    conquer the other later the same turn and the game is yours; conquer one while the other was never
 *    scored this turn and the point is denied. Moving onto an uncontrolled battlefield is a Conquer.
 * Rules: 471.1.b (the Final Point restriction — score every battlefield this turn), 469 / 469.2 (scoring
 *        is Conquer or Hold, at most once per battlefield per turn), 315.2.b (the Scoring Step Holds),
 *        348.2.a.1 (walking onto an uncontrolled battlefield conquers it), 194.2 / 485.3 (Victory Score 8).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

/** End of P2's turn. P1 sits on 6, holds bf1 with a Holder, and has a Runner at home for the empty bf2. */
function board() {
  return scenario()
    .turn(2)
    .active(P2)
    .victoryScore(8)
    .points(P1, 6)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
    .unit(P1, "base", { might: 3, name: "Runner" }, "runner")
    .unit(P2, "base", { might: 3, name: "Foe" }, "foe");
}

/** P2 ends the turn → P1's Beginning Phase Holds bf1 for the 7th point. */
async function afterTheHold(): Promise<Game> {
  const game = await board().build();
  await game.p2.endTurn();
  await game.settle();
  return game;
}

describe("Ruling 94e47aef2ccbe03f — Hold counts as scoring, so hold one + conquer the other wins the Final Point", () => {
  test("the Hold at the Scoring Step scores bf1 and takes P1 to 7 — one point from the Victory Score, game still on", async () => {
    const game = await afterTheHold();
    expect(game.p1.points()).toBe(7);
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["bf1"]);
    expect(game.isOver()).toBe(false);
    expect(game.phase()).toBe("main");
  });

  test("conquering the uncontrolled bf2 in the SAME turn scores the second battlefield → 8 and the game ends", async () => {
    const game = await afterTheHold();
    await game.p1.move("runner", "bf2");
    await game.settle();
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["bf1", "bf2"]);
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });

  test("the other half of the ruling: conquer alone is not enough while a battlefield went unscored this turn — the Final Point is denied", async () => {
    const game = await scenario()
      .turn(2)
      .active(P1)
      .victoryScore(8)
      .points(P1, 7)
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: null })
      .unit(P2, "bf1", { might: 9, name: "Keeper" }, "keeper") // P1 can never take bf1 this turn
      .unit(P1, "base", { might: 3, name: "Runner" }, "runner")
      .build();
    await game.p1.move("runner", "bf2");
    await game.settle();
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1); // the conquer happened …
    expect(game.p1.points()).toBe(7); // … but the point is withheld (471.1.b)
    expect(game.isOver()).toBe(false);
    expect(game.winner()).toBeUndefined();
  });

  test("conquering BOTH in one turn also satisfies it — the requirement is 'every battlefield scored', not 'both conquered'", async () => {
    const game = await scenario()
      .turn(2)
      .active(P1)
      .victoryScore(8)
      .points(P1, 6)
      .battlefield("bf1", { controller: null })
      .battlefield("bf2", { controller: null })
      .unit(P1, "base", { might: 3, name: "A" }, "a")
      .unit(P1, "base", { might: 3, name: "B" }, "b")
      .build();
    await game.p1.move("a", "bf1");
    await game.settle();
    expect(game.p1.points()).toBe(7);
    await game.p1.move("b", "bf2");
    await game.settle();
    expect(game.p1.points()).toBe(8);
    expect(game.winner()).toBe(P1);
    expect(game.violations()).toEqual([]);
  });
});
