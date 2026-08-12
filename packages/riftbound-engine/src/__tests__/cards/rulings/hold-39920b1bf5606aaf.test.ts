/**
 * Ruling 39920b1bf5606aaf — (winning off the Holding check; no specific card)
 *   Vanilla stand-ins: P1 on 6 points holding bf1 and bf2 with a unit at each.
 *
 * Q: I hold two battlefields and I'm on 6 points — do I win at the start of my turn?
 * A: Yes. Holding both battlefields scores 2 points in the Beginning Phase, taking you to 8, and the game
 *    ends the moment the winning total is reached — there is no waiting for a later turn.
 * Rules: 469.2 (Hold: the turn player scores each battlefield they control at the start of their turn),
 *        472 / 323.1 (a player at or above the Victory Score wins as soon as the next Cleanup checks).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

/** P2's turn about to end. P1 sits on `points` and holds bf1 + bf2 with a unit at each. */
function board(points: number) {
  return scenario()
    .turn(4)
    .active(P2)
    .points(P1, points)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Holder A" }, "holderA")
    .unit(P1, "bf2", { might: 3, name: "Holder B" }, "holderB");
}

describe("Ruling 39920b1bf5606aaf — holding two battlefields at 6 points scores 2 at the start of the turn and wins the game at 8", () => {
  test("the Beginning-Phase Holding check awards one point per held battlefield: 6 + 2 = 8, and P1 wins immediately", async () => {
    const game = await board(6).build();
    expect(game.p1.points()).toBe(6);
    await game.p2.endTurn();
    await game.settle();
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });

  test("the win lands on the Holding check itself — the game is over before P1's main phase, without waiting for a further turn", async () => {
    const game = await board(6).build();
    await game.p2.endTurn();
    await game.settle();
    expect(game.isOver()).toBe(true);
    expect(game.phase()).not.toBe("main");
    expect(game.p1.can("endTurn")).toBe(false);
  });

  test("control facet — at 5 points the same two Holds only take P1 to 7: the game continues into P1's main phase", async () => {
    const game = await board(5).build();
    await game.p2.endTurn();
    await game.settle();
    expect(game.p1.points()).toBe(7);
    expect(game.isOver()).toBe(false);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.violations()).toEqual([]);
  });
});
