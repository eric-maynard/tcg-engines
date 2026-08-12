/**
 * Ruling 3f59fe4e25370ad2 — (no specific card) agreeing to register a match result as a draw
 *
 * Q: Can two players agree to register a match result as a draw?
 * A: Yes — as a tournament-floor agreement (legal as long as nobody looks at standings and nothing is
 *    offered in return), exactly like Magic. That is a MATCH-REPORTING act, not a game action: nothing
 *    inside the game produces it, and the engine models no "offer/agree draw" move. The engine facts it
 *    rests on are asserted here: the only player-initiated ending is a concession, which always names a
 *    winner, and a drawn GAME is a match-record concept (486.5.a) rather than something a player may play.
 * Rules: 486.5 / 486.5.a (a match is a series of games; a drawn game does not consume its battlefields),
 *        471 (the in-game victory conditions), 470 (conceding).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

function board() {
  return scenario()
    .unit(P1, "base", { might: 3, name: "Mine" }, "mine")
    .unit(P2, "base", { might: 3, name: "Theirs" }, "theirs");
}

describe("Ruling 3f59fe4e25370ad2 — an agreed draw is a tournament-report act, not a game action", () => {
  test("no player may 'offer' or 'agree' a draw in-game: the action menu has concede and nothing draw-like", async () => {
    const game = await board().build();
    const verbs = game.p1.legal().map((o) => `${o.verb}:${o.moveId}`);
    expect(verbs.some((v) => v.startsWith("concede"))).toBe(true);
    expect(verbs.filter((v) => /draw|tie/i.test(v))).toEqual([]);
    expect(game.p2.legal()).toEqual([]); // and the non-turn player has no such option either
  });

  test("the one player-initiated ending the engine has is a concession, and it always names a winner", async () => {
    const game = await board().build();
    await game.p1.concede();
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P2);
  });

  test("a live game is simply not over: no draw state can be reached from inside it", async () => {
    const game = await board().build();
    expect(game.isOver()).toBe(false);
    expect(game.winner()).toBeUndefined();
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.isOver()).toBe(false);
    expect(game.winner()).toBeUndefined();
    expect(game.violations()).toEqual([]);
  });
});
