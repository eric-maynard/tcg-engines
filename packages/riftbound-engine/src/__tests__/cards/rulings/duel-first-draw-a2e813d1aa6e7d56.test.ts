/**
 * Ruling a2e813d1aa6e7d56 — (no specific card) does the player going first skip their first draw in 1v1?
 *
 * Q: In 1v1 Riftbound, does the player going first skip their draw on the first turn?
 * A: No. Every player draws in the Draw Phase of every turn, including the first player's first turn.
 *    The "first player skips their first Draw Phase" clause is a MULTIPLAYER rule only. (1v1's own
 *    first-turn adjustment is the extra rune for the player going second.)
 * Rules: 485.7 / 486.7 (Duel & Match first-turn process — extra rune only, no skipped draw),
 *    487.7 / 488.7 / 489.7 (FFA3 / FFA4 / 2v2: the first player DOES skip their first Draw Phase),
 *    315.4.b (Draw Phase: draw 1).
 *
 * Scope note: `scenario()` builds a mid-game position and never runs the pregame Setup that stamps
 * `skipFirstDrawFor` (`moves/setup.ts`, gated on `GAME_MODES[mode].firstPlayerSkipsDraw`). The engine's
 * statement of this rule is that mode table, asserted directly below; the harness facets then show
 * every turn's Draw Phase drawing exactly one card in a two-seat game.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";
import { GAME_MODES } from "../../../modes/game-modes";

describe("Ruling a2e813d1aa6e7d56 — 1v1 has no skipped first draw", () => {
  test("the two 1v1 modes do NOT make the first player skip their first Draw Phase", () => {
    expect(GAME_MODES.duel.firstPlayerSkipsDraw).toBe(false);
    expect(GAME_MODES.match.firstPlayerSkipsDraw).toBe(false);
    expect(GAME_MODES.duel.playerCount).toBe(2);
  });

  test("every MULTIPLAYER mode does — that is the rule the question is about", () => {
    expect(GAME_MODES.ffa3.firstPlayerSkipsDraw).toBe(true);
    expect(GAME_MODES.ffa4.firstPlayerSkipsDraw).toBe(true);
    expect(GAME_MODES.magmaChamber.firstPlayerSkipsDraw).toBe(true);
  });

  test("in a two-seat game each seat draws exactly 1 on each of its turns", async () => {
    const game = await scenario({ players: 2 }).turn(1).active(P1).build();
    expect(game.seats()).toEqual([P1, P2]);
    expect(game.p1.hand()).toEqual([]);
    expect(game.p2.hand()).toEqual([]);
    await game.advanceTurn(); // → P2's first turn
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p2.hand().length).toBe(1);
    expect(game.p1.hand().length).toBe(0); // drawing is the turn player's phase
    await game.advanceTurn(); // → P1's next turn
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.hand().length).toBe(1);
  });

  test("and the draws keep coming one per turn — nothing is banked or skipped later", async () => {
    const game = await scenario({ players: 2 }).turn(1).active(P1).build();
    await game.advanceTurn(); // P2
    await game.advanceTurn(); // P1
    await game.advanceTurn(); // P2
    expect(game.p2.hand().length).toBe(2);
    expect(game.p1.hand().length).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});
