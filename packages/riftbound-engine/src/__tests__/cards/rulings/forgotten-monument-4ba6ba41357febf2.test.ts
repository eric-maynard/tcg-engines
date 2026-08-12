/**
 * Ruling 4ba6ba41357febf2 — Forgotten Monument (SFD-209 → sfd-209-221) · Battlefield
 *   "Players can't score here until their third turn."
 *
 * Q: Can I score the Monument as soon as it is my third turn, or must I wait until my fourth?
 * A: As soon as the condition is met on your third turn. The card does not say "at the end of your third
 *    turn" — the moment you are taking your third turn the restriction is lifted, so conquering it in that
 *    turn's main phase scores at once.
 * Rules: 471.2 (scoring happens when the Conquer/Hold occurs), 366 (a continuous restriction applies only
 *        while its condition holds), 471.2.c (conquer/hold triggers fire only when the battlefield is Scored).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FORGOTTEN_MONUMENT = "sfd-209-221";

const turnsTaken = (game: Game, seat: string) => game.gameState.players[seat]?.turnsTaken;

/** `turn` with P1 active. The Monument is live, empty and uncontrolled; P1 has a Runner in base. */
function board(turn: number) {
  return scenario()
    .turn(turn)
    .victoryScore(20)
    .battlefield("monument", { controller: null, def: FORGOTTEN_MONUMENT, inert: false, owner: P2 })
    .unit(P1, "base", { might: 3, name: "Runner" }, "runner");
}

describe("Ruling 4ba6ba41357febf2 — Forgotten Monument scores the moment the third turn's condition is met", () => {
  test("premise: turn 6 with P1 active is P1's THIRD turn", async () => {
    const game = await board(6).build();
    expect(turnsTaken(game, P1)).toBe(3);
  });

  test("ruling: walking onto the Monument on that third turn scores 1 IMMEDIATELY — during the main phase, not at end of turn", async () => {
    const game = await board(6).build();
    await game.p1.move("runner", "monument");
    await game.settle();
    expect(game.gameState.battlefields.monument?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["monument"]);
    expect(game.phase()).toBe("main"); // still the same turn — nothing was deferred
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — on P1's SECOND turn the same walk-in takes control but scores nothing", async () => {
    const game = await board(4).build();
    expect(turnsTaken(game, P1)).toBe(2);
    await game.p1.move("runner", "monument");
    await game.settle();
    expect(game.gameState.battlefields.monument?.controller).toBe(P1);
    expect(game.p1.points()).toBe(0);
  });

  test("…and on the FIRST turn likewise nothing", async () => {
    const game = await board(2).build();
    expect(turnsTaken(game, P1)).toBe(1);
    await game.p1.move("runner", "monument");
    await game.settle();
    expect(game.gameState.battlefields.monument?.controller).toBe(P1);
    expect(game.p1.points()).toBe(0);
  });

  test("holding it into the third turn also scores at once, in that turn's Beginning Phase", async () => {
    const game = await scenario()
      .turn(5)
      .active(P2)
      .victoryScore(20)
      .battlefield("monument", { controller: P1, def: FORGOTTEN_MONUMENT, inert: false, owner: P1 })
      .unit(P1, "monument", { might: 3, name: "Sitter" }, "sitter")
      .build();
    expect(turnsTaken(game, P1)).toBe(2);
    expect(game.p1.points()).toBe(0);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(turnsTaken(game, P1)).toBe(3);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});
