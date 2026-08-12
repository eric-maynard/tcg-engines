/**
 * Ruling 522ea75d7a176108 — (no specific card) can holding both battlefields win on the opponent's turn?
 *
 * Q: Can I win by holding both battlefields on my opponent's turn?
 * A: No. Holding scores in the Scoring Step of YOUR OWN Beginning Phase; nothing is scored for holding while
 *    it is someone else's turn. (Conquering, by contrast, scores whenever it happens.)
 * Rules: 315.2.b.2 ("The Turn Player Holds all Battlefields they Control" — the Scoring Step of the
 *        Beginning Phase), 467 (Scoring), 469.1 (Conquer scores on gaining control), 471 (victory check).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

/** P1's turn. P2 controls BOTH battlefields (with units, so control is durable) and is 2 points from winning. */
function board() {
  return scenario()
    .victoryScore(4)
    .points(P2, 2)
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "Holder A" }, "holderA")
    .unit(P2, "bf2", { might: 4, name: "Holder B" }, "holderB")
    .unit(P1, "base", { might: 1, name: "Scout" }, "scout")
    .runes(P1, "fury", 2);
}

describe("Ruling 522ea75d7a176108 — Holding scores only in your own Beginning Phase", () => {
  test("during the OPPONENT's whole turn the holder scores nothing and the game does not end", async () => {
    const game = await board().build();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p2.points()).toBe(2);
    await game.p1.tapRunes(1); // P1 does things; Cleanups run all through their turn
    expect(game.p2.points()).toBe(2);
    expect(game.isOver()).toBe(false);
    // The score only moves once the turn has actually passed to them (their Beginning Phase's Scoring Step).
    await game.p1.endTurn();
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p2.points()).toBe(4);
  });

  test("on the holder's OWN turn the two Holds score at once — and that is when the game is won", async () => {
    const game = await board().build();
    await game.advanceTurn(); // → P2's Beginning Phase: Scoring Step
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p2.points()).toBe(4);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P2);
  });

  test("the turn player scores their OWN holds only: P1 holding a third battlefield scores on P1's turn, P2's two do not", async () => {
    const game = await board()
      .battlefield("bf3", { controller: P1 })
      .unit(P1, "bf3", { might: 4, name: "Mine" }, "mine")
      .active(P2)
      .build();
    expect(game.turnPlayer()).toBe(P2);
    await game.advanceTurn(); // → P1's Beginning Phase
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(1); // bf3 only
    expect(game.p2.points()).toBe(2); // unchanged on someone else's turn
    expect(game.violations()).toEqual([]);
  });
});
