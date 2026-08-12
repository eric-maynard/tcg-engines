/**
 * Ruling 31302e22e9ef2b51 — (no specific card) the turn cycle and a missed draw.
 *
 * Q: What exactly is a round/turn cycle, and if a player forgets to draw at the start of their turn, may
 *    they draw it on their next turn?
 * A: The turn in which the mistake was made is part of the cycle; once your turn comes round again a full
 *    cycle has passed and the missed draw cannot be taken retroactively. (The remedy itself is tournament
 *    policy — a judge call, not a game rule. What the RULES give you is one draw belonging to each
 *    Beginning Phase, taken by the game itself, with no player action that can add a make-up draw.)
 * Rules: 305 / 310 (turn structure; a turn cycle is one turn for each player), 312 (Beginning Phase:
 *        channel, then draw 1), 381 (a player may only take actions the rules offer).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

describe("Ruling 31302e22e9ef2b51 — each Beginning Phase draws exactly one, and nothing lets you claim a past one", () => {
  test("the draw is performed by the game at the start of the turn — one card, plus two channelled runes", async () => {
    const game = await scenario().turn(2).active(P2).build();
    const handBefore = game.p1.hand().length;
    const runesBefore = game.p1.runes().length;
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.hand()).toHaveLength(handBefore + 1);
    expect(game.p1.runes()).toHaveLength(runesBefore + 2);
  });

  test("no move exists for drawing: a player cannot take a draw out of turn, missed or not", async () => {
    const game = await scenario().turn(2).active(P2).build();
    await game.advanceTurn();
    expect(game.p1.legal().some((o) => o.moveId === "drawCard")).toBe(false);
    expect(game.p2.legal().some((o) => o.moveId === "drawCard")).toBe(false);
    expect(game.p1.legal().map((o) => o.moveId)).toEqual(
      expect.arrayContaining(["concede", "endTurn"]), // the open main phase menu holds no draw
    );
  });

  test("a full turn cycle later the count is exactly one per turn — the second turn draws one, not two", async () => {
    const game = await scenario().turn(2).active(P2).build();
    const handBefore = game.p1.hand().length;
    await game.advanceTurn(); // P1's first turn
    expect(game.p1.hand()).toHaveLength(handBefore + 1);
    await game.advanceTurn(); // back to P2
    expect(game.turnPlayer()).toBe(P2);
    await game.advanceTurn(); // P1 again — one full turn cycle has passed
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.hand()).toHaveLength(handBefore + 2);
    expect(game.violations()).toEqual([]);
  });
});
