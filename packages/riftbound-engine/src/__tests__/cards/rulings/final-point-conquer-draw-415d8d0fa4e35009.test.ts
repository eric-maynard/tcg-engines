/**
 * Ruling 415d8d0fa4e35009 — (no specific card) the Final Point rule on a Conquer
 *
 * Q: I am at 7 points (Victory Score 8). I conquer one battlefield but my opponent controls the other —
 *    do I get to draw a card?
 * A: Yes. To take the FINAL point through a Conquer you must have Scored every battlefield in play that
 *    turn. Having scored only one, the point gain is replaced by a card draw and you stay at 7. Holding
 *    is different — the final point by Hold wins immediately, with no such requirement.
 * Rules: 471.1.b / 448.1.b.2 (Final Point through a Conquer requires every battlefield scored this turn,
 *        otherwise draw a card instead), 470 (Hold scoring), 194 (Victory Score).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

describe("Ruling 415d8d0fa4e35009 — a Conquer for the final point draws instead when a battlefield went unscored", () => {
  test("at 7 of 8, conquering ONE of two battlefields draws a card instead of winning; the score stays 7 and the game goes on", async () => {
    const game = await scenario()
      .victoryScore(8)
      .points(P1, 7)
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Runt" }, "runt")
      .unit(P2, "bf2", { might: 5, name: "Wall" }, "wall")
      .unit(P1, "base", { might: 6, name: "Brute" }, "brute")
      .build();
    const handBefore = game.p1.hand().length;
    await game.p1.move("brute", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.gameState.battlefields.bf2?.controller).toBe(P2); // the other one is still theirs
    expect(game.p1.points()).toBe(7); // the 8th point was REPLACED
    expect(game.p1.hand().length).toBe(handBefore + 1); // …by a card draw
    expect(game.isOver()).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("the same conquer at 6 of 8 is an ordinary point: 7, no draw", async () => {
    const game = await scenario()
      .victoryScore(8)
      .points(P1, 6)
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Runt" }, "runt")
      .unit(P2, "bf2", { might: 5, name: "Wall" }, "wall")
      .unit(P1, "base", { might: 6, name: "Brute" }, "brute")
      .build();
    const handBefore = game.p1.hand().length;
    await game.p1.move("brute", "bf1");
    await game.settle();
    expect(game.p1.points()).toBe(7);
    expect(game.p1.hand().length).toBe(handBefore);
    expect(game.isOver()).toBe(false);
  });

  test("contrast — HOLDING the final point wins at once: no 'score every battlefield' requirement", async () => {
    const game = await scenario()
      .active(P2)
      .victoryScore(8)
      .points(P1, 7)
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
      .unit(P2, "bf2", { might: 3, name: "Wall" }, "wall")
      .build();
    await game.p2.endTurn();
    await game.settle();
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });

  test("conquering EVERY battlefield in the same turn does take the final point — the requirement is met", async () => {
    const game = await scenario()
      .victoryScore(8)
      .points(P1, 6)
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Runt" }, "runt")
      .unit(P2, "bf2", { might: 2, name: "Whelp" }, "whelp")
      .unit(P1, "base", { might: 6, name: "Brute" }, "brute")
      .unit(P1, "base", { might: 6, name: "Ogre" }, "ogre")
      .build();
    await game.p1.move("brute", "bf1");
    await game.settle();
    expect(game.p1.points()).toBe(7);
    await game.p1.move("ogre", "bf2");
    await game.settle();
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });
});
