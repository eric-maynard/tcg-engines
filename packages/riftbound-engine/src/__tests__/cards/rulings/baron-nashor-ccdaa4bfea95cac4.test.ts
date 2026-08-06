/**
 * Ruling ccdaa4bfea95cac4 — Baron Nashor (UNL-147 → unl-147-219) / Baron Pit token battlefield (unl-t01)
 *
 * Q: Does the Baron Pit need to be scored to win by conquering?
 * A: Yes. At match point a conquer only yields the Final Point if the player has scored EVERY
 *    battlefield on the board this turn — the Baron Pit included (471.1.b.1); otherwise the would-be
 *    winning conquer draws a card instead. Winning by hold has no such requirement (471.1.a.1).
 *
 * Board: a 1v1 layout (bf1, bf2) plus the Baron Pit token already on the board (Baron's "as you play
 * me" token creation is covered elsewhere), Victory Score 8.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BARON_PIT = "unl-t01";

/**
 * End of P2's turn 1. P1 (on `points`) holds bf1 with a unit and has a runner in base; bf2 is open.
 * With `pit`, the Baron Pit token battlefield is also on the board, uncontrolled and empty.
 */
function board(opts: { points: number; pit: boolean }) {
  let s = scenario()
    .turn(1)
    .active(P2)
    .victoryScore(8)
    .points(P1, opts.points)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null });
  if (opts.pit) {
    s = s.battlefield("pit", { controller: null, def: BARON_PIT, inert: false });
  }
  return s
    .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
    .unit(P1, "base", { might: 3, name: "Runner" }, "runner")
    .unit(P2, "base", { might: 2, name: "Bystander" }, "bystander");
}

/** P2 ends turn → P1 holds bf1 in their Beginning Phase → P1's open main phase. */
async function intoP1Turn(game: Game): Promise<void> {
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.phase()).toBe("main");
  expect(game.gameState.scoredThisTurn[P1]).toEqual(["bf1"]); // held
}

/** Runner walks onto the open bf2; both pass focus → P1 conquers it. */
async function conquerBf2(game: Game): Promise<void> {
  await game.p1.move("runner", "bf2");
  await game.settle();
  expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
}

describe("Ruling ccdaa4bfea95cac4 — the Baron Pit counts as a battlefield for the Final Point", () => {
  test("setup: from 6, holding bf1 at the start of P1's turn scores the 7th point (match point); the Pit is on the board, unscored", async () => {
    const game = await board({ pit: true, points: 6 }).build();
    expect(game.battlefields().sort()).toEqual(["bf1", "bf2", "pit"]);
    await intoP1Turn(game);
    expect(game.p1.points()).toBe(7);
    expect(game.gameState.scoredThisTurn[P1]).not.toContain("pit");
    expect(game.isOver()).toBe(false);
  });

  // Expected (471.1.b.1): P1 is on 7 having scored bf1; conquering bf2 would be the Final Point, but the
  // Baron Pit has not been scored this turn → P1 draws a card instead, stays on 7, game continues.
  // Actual: the showdown-conquer path awards the point unconditionally → 8 points, game over.
  test("ruling ccdaa4bfea95cac4 — at match point, conquering bf2 with the Pit unscored draws a card instead of winning; engine awards the winning point", async () => {
    const game = await board({ pit: true, points: 6 }).build();
    await intoP1Turn(game);
    expect(game.p1.points()).toBe(7);
    const handBefore = game.p1.hand().length;
    const deckBefore = game.p1.deck().length;
    await conquerBf2(game);
    expect(game.p1.points()).toBe(7);
    expect(game.isOver()).toBe(false);
    expect(game.p1.hand()).toHaveLength(handBefore + 1);
    expect(game.p1.deck()).toHaveLength(deckBefore - 1);
    // bf2 was conquered (control gained) but NOT scored — the Pit is what's missing.
    expect(game.gameState.scoredThisTurn[P1]).not.toContain("pit");
  });

  test("contrast: WITHOUT the Pit on the board the same conquer of bf2 completes 'every battlefield' (bf1 held + bf2) → Final Point, P1 wins 8", async () => {
    const game = await board({ pit: false, points: 6 }).build();
    expect(game.battlefields().sort()).toEqual(["bf1", "bf2"]);
    await intoP1Turn(game);
    expect(game.p1.points()).toBe(7);
    const handBefore = game.p1.hand().length;
    await conquerBf2(game);
    expect(game.p1.points()).toBe(8);
    expect(game.p1.hand()).toHaveLength(handBefore); // no draw-instead
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });

  test("hold is unaffected (471.1.a.1): on 7 with the Pit unscored, holding bf1 at the start of the turn still scores the 8th point", async () => {
    const game = await board({ pit: true, points: 7 }).build();
    await game.p2.endTurn();
    await game.settle();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["bf1"]);
    expect(game.gameState.scoredThisTurn[P1]).not.toContain("pit");
    expect(game.p1.points()).toBe(8);
  });

  // Expected: reaching the Victory Score by hold ends the game with P1 the winner.
  // Actual: the Beginning-Phase hold step raises P1 to 8 but never flips the game status — play continues.
  test("ruling ccdaa4bfea95cac4 — the hold win (8th point with the Pit unscored) ends the game; engine leaves status 'playing'", async () => {
    const game = await board({ pit: true, points: 7 }).build();
    await game.p2.endTurn();
    await game.settle();
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });
});
