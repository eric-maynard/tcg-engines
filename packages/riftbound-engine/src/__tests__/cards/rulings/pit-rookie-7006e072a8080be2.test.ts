/**
 * Ruling 7006e072a8080be2 — Pit Rookie (OGN-136 → ogn-136-298) · Unit · Body · [2] · 2 Might
 *     "When you play me, buff another friendly unit."
 *   (the Rookie is simply the unit that was left holding the battlefield)
 *
 * Q: Why did the Pit Rookie player win when they did not control both battlefields?
 * A: Because they HELD. Holding a battlefield — controlling it at the start of your turn — scores with no
 *    "you must have scored the others" clause, so it can be your winning point on its own. The
 *    every-other-battlefield-scored-this-turn restriction only gates the winning point gained by CONQUERING.
 * Rules: 464.1 / 465 (hold vs conquer scoring), 466.1.b.2 (the winning point via Conquer needs every other
 *        battlefield scored this turn — draw 1 instead), 323.1 (win checked at a Cleanup).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const PIT_ROOKIE = "ogn-136-298";

/** Match point: P1 on 7 of 8. P1 holds bf1 with the Rookie; P2 holds bf2 with its own body. It is P2's turn. */
function board() {
  return scenario()
    .active(P2)
    .victoryScore(8)
    .points(P1, 7)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", PIT_ROOKIE, "rookie")
    .unit(P2, "bf2", { might: 2, name: "Their Guard" }, "theirs");
}

describe("Ruling 7006e072a8080be2 — the winning point can be gained by HOLDING one battlefield", () => {
  test("premise: P1 controls only bf1 (P2 has bf2) and is one point short", async () => {
    const game = await board().build();
    expect(game.p1.points()).toBe(7);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.gameState.battlefields.bf2?.controller).toBe(P2);
    expect(game.p1.battlefields({ controlled: true })).toEqual(["bf1"]);
  });

  test("P1's turn begins with the Rookie still there: holding bf1 scores the 8th point and wins the game — controlling both battlefields was never required", async () => {
    const game = await board().build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });

  test("holding is the TURN player's scoring step only: P2 keeps bf2 across the same turn change and gains nothing from it", async () => {
    const game = await board().build();
    expect(game.p2.points()).toBe(0);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.gameState.battlefields.bf2?.controller).toBe(P2);
    expect(game.p2.points()).toBe(0);
  });

  test("contrast — the winning point by CONQUERING is restricted: P1 walks into the open bf3 on its own turn and does NOT reach 8 from it", async () => {
    const game = await scenario()
      .victoryScore(8)
      .points(P1, 7)
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf3", { controller: null })
      .unit(P2, "bf1", { might: 2, name: "Their Guard" }, "theirs")
      .unit(P1, "base", PIT_ROOKIE, "rookie")
      .build();
    await game.p1.move("rookie", "bf3");
    await game.settle();
    expect(game.gameState.battlefields.bf3?.controller).toBe(P1); // the conquest itself happened
    expect(game.p1.points()).toBe(7); // …but the winning point is withheld (466.1.b.2)
    expect(game.isOver()).toBe(false);
    expect(game.violations()).toEqual([]);
  });
});
