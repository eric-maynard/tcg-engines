/**
 * Ruling 964e1289fa8fcbc5 — (no specific card) winning on the opponent's turn by conquering both battlefields.
 *   Plain inline units; the opponent walks their units off two contested battlefields, one after the other.
 *
 * Q: If I conquer both battlefields during my opponent's turn and reach the Victory Score, do I win
 *    immediately, or must I control both at the same moment?
 * A: Immediately. Scoring is per battlefield, not a snapshot of the board: score both battlefields in the
 *    same turn — even the opponent's turn — and the Final Point is yours the moment the second one lands.
 *    Simultaneous control is never required.
 * Rules: 471.1.b (the Final Point needs every battlefield SCORED this turn), 469 / 469.2 (score once per
 *        battlefield per turn, by Conquer or Hold), 190.4.c / 323.6 (control lapses where you have no
 *        units), 348.2.a / 348.2.a.1 (the remaining player establishes control → a Conquer), 194.2 (a
 *        player at the Victory Score wins at that Cleanup).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

/** P2's turn. P2 controls both battlefields, but P1 has a unit standing on each of them. P1 is on 6. */
function board() {
  return scenario()
    .turn(2)
    .active(P2)
    .victoryScore(8)
    .points(P1, 6)
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Foe1" }, "foe1")
    .unit(P2, "bf2", { might: 3, name: "Foe2" }, "foe2")
    .unit(P1, "bf1", { might: 3, name: "A" }, "a")
    .unit(P1, "bf2", { might: 3, name: "B" }, "b");
}

async function open(): Promise<Game> {
  const game = await board().build();
  expect(game.turnPlayer()).toBe(P2);
  expect(game.p1.points()).toBe(6);
  return game;
}

describe("Ruling 964e1289fa8fcbc5 — scoring both battlefields on the opponent's turn wins there and then", () => {
  test("the opponent vacating bf1 hands it to P1 — a Conquer on the opponent's turn, worth the 7th point", async () => {
    const game = await open();
    await game.p2.move("foe1", "base");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["bf1"]);
    expect(game.p1.points()).toBe(7);
    expect(game.turnPlayer()).toBe(P2); // still their turn
    expect(game.isOver()).toBe(false);
  });

  test("when they vacate bf2 as well, the second Conquer takes P1 to 8 and the game is over immediately — no simultaneous control needed", async () => {
    const game = await open();
    await game.p2.move("foe1", "base");
    await game.p2.move("foe2", "base");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["bf1", "bf2"]);
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });

  test("the nuance: a battlefield already scored this turn cannot be scored a second time, even after control wobbles", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .victoryScore(20) // keep the game alive so the second event can be observed
      .points(P1, 0)
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Foe1" }, "foe1")
      .unit(P2, "base", { might: 1, name: "Foe3" }, "foe3")
      .unit(P1, "bf1", { might: 5, name: "A" }, "a")
      .build();
    await game.p2.move("foe1", "base");
    expect(game.p1.points()).toBe(1);
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["bf1"]);
    // P2 throws a body back at bf1; it dies and P1 re-establishes control — but bf1 is spent for P1 this turn
    await game.p2.move("foe3", "bf1");
    await game.settle();
    expect(game.zoneOf("foe3")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["bf1"]);
    expect(game.violations()).toEqual([]);
  });
});
