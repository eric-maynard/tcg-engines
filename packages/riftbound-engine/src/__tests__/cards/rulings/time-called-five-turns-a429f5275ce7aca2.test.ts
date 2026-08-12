/**
 * Ruling a429f5275ce7aca2 — (tournament floor procedure) deciding a match after time is called.
 *
 * Q: How is a match decided once the 5 turns following "time" have been played?
 * A: Step 1 — whoever is ahead on points wins the current GAME (equal points = that game is a draw).
 *    Step 2 — whoever has more games won wins the MATCH; if neither does, the match is a draw. The
 *    end-of-match procedure is 5 TURNS, not 5 minutes, and those turns are untimed.
 *    This is a floor procedure applied to the game state, not something inside the game: the engine has no
 *    clock, no turn cap and no draw state, so what it can testify to is what the procedure reads —
 *    the point totals — and that nothing in the game itself ends on a tie.
 * Rules: 194.2 / 194.2.a / 194.2.b (the only in-game win: points ≥ Victory Score AND more than anyone
 *        else, checked at a Cleanup), 470 (conceding — the one player-initiated ending), 486.5 / 486.5.a
 *        (a match is a series of games; a drawn game is a match-record concept).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

/** Mid-game, nobody near the Victory Score: P1 on 3, P2 on 2, one battlefield each. */
function board() {
  return scenario()
    .victoryScore(8)
    .points(P1, 3)
    .points(P2, 2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 3, name: "Mine" }, "mine")
    .unit(P2, "bf2", { might: 3, name: "Theirs" }, "theirs");
}

/** Play out the five extra turns of the end-of-match procedure. */
async function fiveMoreTurns(game: Game): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await game.advanceTurn();
  }
}

describe("Ruling a429f5275ce7aca2 — after the 5 extra turns the game is decided on points, and a tie is a draw", () => {
  test("the extension is five TURNS and the game does not end on its own when they are over — the engine has no clock or turn cap", async () => {
    const game = await board().build();
    const turn = game.turnNumber();
    await fiveMoreTurns(game);
    expect(game.turnNumber()).toBe(turn + 5);
    expect(game.isOver()).toBe(false); // nothing in the game ends because five turns passed
    expect(game.winner()).toBeUndefined();
  });

  test("what the procedure reads is the point totals — each player Holds their own battlefield each turn, so this five-turn extension ends level at 5–5: a drawn game", async () => {
    const game = await board().build();
    await fiveMoreTurns(game);
    expect(game.p1.points()).toBe(5);
    expect(game.p2.points()).toBe(5);
    expect(game.p1.points()).toBe(game.p2.points()); // step 1 of the procedure finds no one ahead
    expect(game.isOver()).toBe(false);
    expect(game.winner()).toBeUndefined();
  });

  test("equal points is a DRAW for that game, and the engine offers nothing in-game that produces it: no draw move, no draw state", async () => {
    const game = await scenario()
      .victoryScore(8)
      .points(P1, 4)
      .points(P2, 4)
      .unit(P1, "base", { might: 3, name: "Mine" }, "mine")
      .unit(P2, "base", { might: 3, name: "Theirs" }, "theirs")
      .build();
    expect(game.p1.points()).toBe(game.p2.points());
    expect(game.isOver()).toBe(false);
    expect(game.winner()).toBeUndefined();
    const verbs = game.p1.legal().map((o) => `${o.verb}:${o.moveId}`);
    expect(verbs.filter((v) => /draw|tie|timeout/i.test(v))).toEqual([]);
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.isOver()).toBe(false); // a tied score is not an ending inside the game
    expect(game.winner()).toBeUndefined();
  });

  test("the only in-game endings remain the Victory Score and a concession — both name a winner, which is what a decided game reports", async () => {
    const game = await board().build();
    await game.p2.concede();
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    expect(game.violations()).toEqual([]);
  });
});
