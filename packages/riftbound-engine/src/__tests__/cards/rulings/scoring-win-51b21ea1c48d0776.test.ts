/**
 * Ruling 51b21ea1c48d0776 — (no specific card) winning on a conquer after a hold.
 *
 * Q: If holding a battlefield at the start of my turn gives me my 7th point, can I then capture another
 *    battlefield the same turn for my 8th and win?
 * A: Yes. The "score every battlefield this turn" requirement applies only to the FINAL point when it
 *    comes from a conquer — and a hold counts as scoring that battlefield on your turn. Hold one, conquer
 *    the other, and every battlefield has been scored this turn, so the conquer scores and wins.
 * Rules: 471 (the Final Point from a conquer needs all battlefields scored this turn — otherwise draw a
 *        card instead), 464 (holding scores the battlefield), 467 (win check: points ≥ Victory Score).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

/** Victory Score 8, P1 on 6. bf1 is P1's (held by a Holder); bf2 is P2's, guarded by a 1-Might Sentry. */
const board = () =>
  scenario()
    .turn(2)
    .active(P2)
    .victoryScore(8)
    .points(P1, 6)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
    .unit(P2, "bf2", { might: 1, name: "Sentry" }, "sentry")
    .unit(P1, "base", { might: 4, name: "Raider" }, "raider");

describe("Ruling 51b21ea1c48d0776 — hold for the 7th point, conquer for the 8th, win", () => {
  test("the hold at the start of P1's turn takes them to 7 without ending the game", async () => {
    const game = await board().build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(7);
    expect(game.isOver()).toBe(false);
  });

  test("conquering the OTHER battlefield the same turn scores the 8th point and wins — both battlefields were scored this turn", async () => {
    const game = await board().build();
    await game.advanceTurn();
    await game.p1.move("raider", "bf2");
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("control — with a THIRD battlefield left unscored this turn the same conquer draws a card instead: still 7, game on", async () => {
    const game = await board()
      .battlefield("bf3", { controller: P2 })
      .unit(P2, "bf3", { might: 6, name: "Wall" }, "wall")
      .build();
    await game.advanceTurn();
    const handBefore = game.p1.hand().length;
    await game.p1.move("raider", "bf2");
    await game.settle();
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(7);
    expect(game.p1.hand()).toHaveLength(handBefore + 1);
    expect(game.isOver()).toBe(false);
  });
});
