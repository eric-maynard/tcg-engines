/**
 * Ruling e6e8df7afc1aaf34 — Forgotten Monument (SFD-209 → sfd-209-221) · Battlefield
 *   "Players can't score here until their third turn."
 *
 * Q: Is "their third turn" the third turn of the game as a whole, or each player's own third turn?
 * A: Each player's OWN third turn — the restriction is checked against that player's personal turn count.
 *    And you need not wait for that turn to finish: the moment you are taking your third turn the
 *    restriction is lifted, so you may score the Monument right then.
 * Rules: 366 (a continuous restriction applies only while its condition holds), 471.2 (scoring happens at
 *        the Conquer/Hold, not at end of turn), 302 (each player takes their own turns).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FORGOTTEN_MONUMENT = "sfd-209-221";

const turnsTaken = (game: Game, seat: string) => game.gameState.players[seat]?.turnsTaken;

/** Game turn `turn`, `active` to move. The live Monument is empty and uncontrolled; both seats have a Runner in base. */
function board(turn: number, active: string) {
  return scenario()
    .turn(turn)
    .active(active)
    .victoryScore(20)
    .battlefield("monument", { controller: null, def: FORGOTTEN_MONUMENT, inert: false })
    .unit(P1, "base", { might: 3, name: "P1 Runner" }, "runner1")
    .unit(P2, "base", { might: 3, name: "P2 Runner" }, "runner2");
}

describe("Ruling e6e8df7afc1aaf34 — the Monument unlocks on a player's OWN third turn", () => {
  test("premise: the restriction is read off each player's personal turn counter, which climbs one per turn they take", async () => {
    const game = await board(2, P1).build();
    expect(turnsTaken(game, P1)).toBe(1); // P1's first turn
    await game.advanceTurn();
    await game.advanceTurn(); // back round to P1
    expect(turnsTaken(game, P1)).toBe(2);
    await game.advanceTurn();
    await game.advanceTurn(); // back round to P1
    expect(turnsTaken(game, P1)).toBe(3);
  });

  test("ruling: sitting on the Monument through turns 1 and 2 scores NOTHING; the point arrives on P1's third turn", async () => {
    const game = await board(2, P1).build();
    await game.p1.move("runner1", "monument");
    await game.settle();
    expect(game.gameState.battlefields.monument?.controller).toBe(P1);
    expect(game.p1.points()).toBe(0); // first turn — locked

    await game.advanceTurn();
    await game.advanceTurn(); // back round to P1
    expect(turnsTaken(game, P1)).toBe(2);
    expect(game.p1.points()).toBe(0); // second turn — still locked

    await game.advanceTurn();
    await game.advanceTurn(); // back round to P1
    expect(turnsTaken(game, P1)).toBe(3);
    expect(game.p1.points()).toBe(1); // third turn — unlocked, and it pays out at once
    expect(game.violations()).toEqual([]);
  });

  test("…and it pays out DURING that third turn, not at its end — walking in on that turn scores in the main phase", async () => {
    const game = await board(6, P1).build();
    expect(turnsTaken(game, P1)).toBe(3);
    await game.p1.move("runner1", "monument");
    await game.settle();
    expect(game.gameState.battlefields.monument?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.phase()).toBe("main");
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["monument"]);
    expect(game.violations()).toEqual([]);
  });

  test("the counter is per player: P2 unlocks it on P2's OWN third turn, and gets nothing on their second", async () => {
    const early = await board(5, P2).build();
    expect(turnsTaken(early, P2)).toBe(2);
    await early.p2.move("runner2", "monument");
    await early.settle();
    expect(early.gameState.battlefields.monument?.controller).toBe(P2);
    expect(early.p2.points()).toBe(0);

    const late = await board(7, P2).build();
    expect(turnsTaken(late, P2)).toBe(3);
    await late.p2.move("runner2", "monument");
    await late.settle();
    expect(late.gameState.battlefields.monument?.controller).toBe(P2);
    expect(late.p2.points()).toBe(1);
  });

  test("control: on P1's second turn the same walk-in takes the battlefield for 0 points", async () => {
    const game = await board(4, P1).build();
    expect(turnsTaken(game, P1)).toBe(2);
    await game.p1.move("runner1", "monument");
    await game.settle();
    expect(game.gameState.battlefields.monument?.controller).toBe(P1);
    expect(game.p1.points()).toBe(0);
  });

  // The ruling's secondary nuance (riftjudge FAQ #9332) claims the CONQUER itself is forbidden before your third
  // turn, not merely the point. The engine follows the printed text — only SCORING is restricted — so control
  // does change hands on an earlier turn, for 0 points, as the facets above show.
  test.failing("BUG: ruling e6e8df7afc1aaf34 — conquering the Monument before your third turn should be forbidden; the engine lets you take control for 0 points", async () => {
    const game = await board(4, P1).build();
    await game.p1.move("runner1", "monument");
    await game.settle();
    expect(game.gameState.battlefields.monument?.controller).not.toBe(P1);
  });
});
