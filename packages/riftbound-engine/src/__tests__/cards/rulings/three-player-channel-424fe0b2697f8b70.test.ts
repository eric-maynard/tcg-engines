/**
 * Ruling 424fe0b2697f8b70 — (no specific card) how many runes does player 2 channel in a 3-player game?
 *
 * Q: In a 3-player (FFA3 / Skirmish) game, how many runes does player 2 channel?
 * A: Two — the standard Channel Phase amount. The "extra rune" bonus goes only to the player going LAST
 *    (player 3), not to the middle player. Player 2 channels on their own first Channel Phase like any
 *    normal turn and also draws a card on their first turn; only player 1 skips that draw.
 * Rules: 315.3.b / 430.4.a (Channel Phase: channel 2 runes), 487.7 (multiplayer: only the last player in
 *        turn order gets the extra first-Channel rune; the first player skips their first Draw Phase).
 *
 * Scope note: `scenario()` builds a mid-game position and does not run the pregame Setup that mints the
 * first-Channel-Phase grant (`secondPlayerExtraRune` / `extraRunePlayerId` / `skipFirstDrawFor`, set in
 * `moves/setup.ts`), so what is asserted here is the middle player's own numbers — exactly what the
 * ruling was asked about.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, P3, scenario } from "../../../harness";

describe("Ruling 424fe0b2697f8b70 — player 2 of three channels the standard 2 runes", () => {
  test("on player 2's first turn they channel exactly 2 runes — not 3", async () => {
    const game = await scenario({ players: 3 }).turn(1).active(P1).build();
    expect(game.seats()).toEqual([P1, P2, P3]);
    expect(game.p2.runes().length).toBe(0);
    await game.advanceTurn(); // → player 2's first turn
    expect(game.turnPlayer()).toBe(P2);
    expect(game.turnNumber()).toBe(2);
    expect(game.p2.runes().length).toBe(2);
  });

  test("player 2 also draws a card on that first turn", async () => {
    const game = await scenario({ players: 3 }).turn(1).active(P1).build();
    expect(game.p2.hand().length).toBe(0);
    await game.advanceTurn();
    expect(game.p2.hand().length).toBe(1);
  });

  test("the other seats are untouched while player 2 takes their turn — channelling is the turn player's phase", async () => {
    const game = await scenario({ players: 3 }).turn(1).active(P1).build();
    await game.advanceTurn();
    expect(game.p1.runes().length).toBe(0);
    expect(game.seat(P3).runes().length).toBe(0);
    expect(game.seat(P3).hand().length).toBe(0);
  });

  test("no bonus is banked for later either: player 2's second turn channels 2 again (4 in total)", async () => {
    const game = await scenario({ players: 3 }).turn(1).active(P1).build();
    await game.advanceTurn(); // P2
    await game.advanceTurn(); // P3
    await game.advanceTurn(); // P1
    await game.advanceTurn(); // P2 again
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p2.runes().length).toBe(4);
    expect(game.violations()).toEqual([]);
  });
});
