/**
 * Ruling a4fdfa35444447fd — (2v2 Magma Chamber turn order; no specific card)
 *
 * Q: How is turn order decided in 2v2?
 * A: Turns alternate between the teams, never two teammates in a row: Team 1 Player 1 → Team 2 Player 1 →
 *    Team 1 Player 2 → Team 2 Player 2 → back to the start. (Which player of a team goes first, and the
 *    first-player roll itself, are setup conventions; the extra rune for the last seat and the first player's
 *    skipped draw are mode rules.)
 * Rules: 648 (Magma Chamber: four players in two teams), 642 / 642.7 (mode configuration; first player skips
 *        their first draw), 302 (turn order proceeds seat by seat and wraps).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, P3, P4, scenario } from "../../../harness";
import { GAME_MODES } from "../../../modes/game-modes";

describe("Ruling a4fdfa35444447fd — 2v2 seats alternate between the teams", () => {
  test("the four seats are two teams of two, seated alternately (P1+P3 vs P2+P4)", async () => {
    const game = await scenario({ players: 4 }).build();
    expect(game.seats()).toEqual([P1, P2, P3, P4]);
    const teams = game.gameState.teams ?? {};
    expect(teams[P1]).toBe(teams[P3]);
    expect(teams[P2]).toBe(teams[P4]);
    expect(teams[P1]).not.toBe(teams[P2]);
  });

  test("turns pass in seat order, so the sequence is Team1-A → Team2-A → Team1-B → Team2-B and round again", async () => {
    const game = await scenario({ players: 4 }).active(P1).build();
    const order = [game.turnPlayer()];
    for (let i = 0; i < 4; i++) {
      await game.advanceTurn();
      order.push(game.turnPlayer());
    }
    expect(order).toEqual([P1, P2, P3, P4, P1]);
  });

  test("no two consecutive turns belong to the same team", async () => {
    const game = await scenario({ players: 4 }).active(P1).build();
    const teams = game.gameState.teams ?? {};
    const seen = [game.turnPlayer()];
    for (let i = 0; i < 4; i++) {
      await game.advanceTurn();
      seen.push(game.turnPlayer());
    }
    for (let i = 1; i < seen.length; i++) {
      expect(teams[seen[i]!]).not.toBe(teams[seen[i - 1]!]);
    }
    expect(game.violations()).toEqual([]);
  });

  test("the mode itself is the team mode: four players, team-based, and the first player skips their first draw", () => {
    expect(GAME_MODES.magmaChamber).toMatchObject({
      firstPlayerSkipsDraw: true,
      playerCount: 4,
      teamBased: true,
    });
  });
});
