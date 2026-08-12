/**
 * Ruling 501bc9bb5554b307 — Voracious Gromp (UNL-100 → unl-100-219) · "[Hunt 3] (When I conquer or
 *   hold, gain 3 XP.)" standing in for Kai'Sa's conquer triggers.
 *
 * Q: If I hold a battlefield, move the unit away and then re-take it with a conquer-trigger unit, do I
 *    still get the conquer triggers even though I score no point?
 * A: No. Conquering is part of SCORING, and you can only score a battlefield once per turn — having
 *    already scored it (by holding) there is no conquer, hence no conquer triggers. The converse holds
 *    too: a first conquer of a battlefield at 7 points runs the whole scoring process (drawing a card in
 *    place of the point), so its conquer triggers DO fire.
 * Rules: 464 (one score per battlefield per turn), 469.1 (conquering = establishing control while
 *        scoring), 466.5.d (Establish Control results in a Conquer only if not yet scored this turn),
 *        471 (a would-be Final Point from a conquer draws a card unless every battlefield was scored).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const GROMP = "unl-100-219";

/** Turn 2 is P2's; P1 holds bf1 with a vanilla Holder and keeps the Gromp ready in base. */
const heldBoard = () =>
  scenario()
    .turn(2)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
    .unit(P1, "base", GROMP, "gromp");

describe("Ruling 501bc9bb5554b307 — no score, no conquer, no conquer triggers", () => {
  test("re-taking a battlefield already scored by holding this turn gives no point AND no [Hunt] XP", async () => {
    const game = await heldBoard().build();
    await game.advanceTurn();
    expect(game.p1.points()).toBe(1); // the hold
    expect(game.p1.xp()).toBe(0); // the Gromp was in base, so it did not hold
    await game.p1.move("holder", "base");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    await game.p1.move("gromp", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1); // control is re-established…
    expect(game.p1.points()).toBe(1); // …but nothing is scored
    expect(game.p1.xp()).toBe(0); // …so "when I conquer" never fires
    expect(game.violations()).toEqual([]);
  });

  test("control: the SAME move onto a battlefield not yet scored this turn is a real conquer — +1 point and 3 XP", async () => {
    const game = await scenario()
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf2", { might: 1, name: "Sentry" }, "sentry")
      .unit(P1, "base", GROMP, "gromp")
      .build();
    await game.p1.move("gromp", "bf2");
    await game.settle();
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.xp()).toBe(3);
  });

  test("at 7 points with a Victory Score of 8 the first conquer of the turn still runs the whole scoring process: a card is drawn instead of the point, and the conquer triggers fire", async () => {
    const game = await scenario()
      .victoryScore(8)
      .points(P1, 7)
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf1", { might: 1, name: "Sentry" }, "sentry")
      .unit(P2, "bf2", { might: 4, name: "Wall" }, "wall")
      .unit(P1, "base", GROMP, "gromp")
      .build();
    const handBefore = game.p1.hand().length;
    await game.p1.move("gromp", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(7); // bf2 was not scored this turn → no Final Point
    expect(game.p1.hand()).toHaveLength(handBefore + 1); // the draw replacement
    expect(game.p1.xp()).toBe(3); // the conquer happened, so [Hunt 3] paid out
    expect(game.isOver()).toBe(false);
  });
});
