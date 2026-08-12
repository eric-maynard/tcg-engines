/**
 * Ruling 4ae5f06c2783ef8a — (the Final Point through Conquering in a multiplayer game; no specific card)
 *   Vanilla stand-ins in a three-player game with three battlefields, all uncontrolled, and P1 one point from
 *   the Victory Score.
 *
 * Q: In multiplayer, do you have to conquer all three battlefields to win at 7 points, or does one more do?
 * A: All of them. Once you are one point from the Victory Score, a Conquer only gives you that last point if
 *    you have scored EVERY battlefield this turn; otherwise you draw a card instead. Points already gained are
 *    never taken away, and each player scores battlefields for themselves.
 * Rules: 471.1.a-b / 471.1.b.1 (the Final Point restriction on Conquering: score every battlefield this turn or
 *        draw 1 instead), 471.1.a.1 (points from non-Conquer sources are exempt), 469.1 (Conquering scores).
 *   (The ruling's 2v2 nuances about teammates not sharing battlefields are not exercised here — this file pins
 *    the conquest-win half, which is what the question asks.)
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

/** A three-player game. P1 is on 7 of 8 with three units in base and three empty, uncontrolled battlefields. */
function board(points: number) {
  return scenario({ players: 3 })
    .victoryScore(8)
    .points(P1, points)
    .battlefield("bfA", { controller: null })
    .battlefield("bfB", { controller: null })
    .battlefield("bfC", { controller: null })
    .unit(P1, "base", { might: 3, name: "First" }, "u1")
    .unit(P1, "base", { might: 3, name: "Second" }, "u2")
    .unit(P1, "base", { might: 3, name: "Third" }, "u3");
}

/** Walk a unit onto an empty battlefield and close the non-combat showdown it stages. */
async function take(game: Game, unit: string, bf: string): Promise<void> {
  await game.p1.move(unit, bf);
  for (let i = 0; i < 8 && game.decision()?.context === "showdown"; i++) {
    await game.acting().passFocus();
  }
  await game.settle();
  expect(game.gameState.battlefields[bf]?.controller).toBe(P1);
}

describe("Ruling 4ae5f06c2783ef8a — at one point from victory, a Conquer only pays out once every battlefield has been scored this turn", () => {
  test("the first Conquer at 7 points gives no point at all: P1 draws a card instead and stays on 7", async () => {
    const game = await board(7).build();
    const hand = game.p1.hand().length;
    await take(game, "u1", "bfA");
    expect(game.p1.points()).toBe(7);
    expect(game.p1.hand()).toHaveLength(hand + 1); // 471.1.b.1 — draw 1 instead
    expect(game.isOver()).toBe(false);
  });

  test("a second Conquer is still not enough — one battlefield is still unscored this turn, so it is another draw", async () => {
    const game = await board(7).build();
    const hand = game.p1.hand().length;
    await take(game, "u1", "bfA");
    await take(game, "u2", "bfB");
    expect(game.p1.points()).toBe(7);
    expect(game.p1.hand()).toHaveLength(hand + 2);
    expect(game.gameState.scoredThisTurn[P1]?.sort()).toEqual(["bfA", "bfB"]);
    expect(game.isOver()).toBe(false);
  });

  test("only the Conquer that completes the set pays: with bfA and bfB already scored this turn, taking bfC gives the Final Point and wins the game at 8", async () => {
    const game = await board(7).build();
    await take(game, "u1", "bfA");
    await take(game, "u2", "bfB");
    await take(game, "u3", "bfC");
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });

  test("the restriction is only about the LAST point: below the threshold each Conquer scores normally", async () => {
    const game = await board(4).build();
    const hand = game.p1.hand().length;
    await take(game, "u1", "bfA");
    expect(game.p1.points()).toBe(5);
    await take(game, "u2", "bfB");
    expect(game.p1.points()).toBe(6);
    expect(game.p1.hand()).toHaveLength(hand); // no draw-instead happened
    expect(game.violations()).toEqual([]);
  });
});
