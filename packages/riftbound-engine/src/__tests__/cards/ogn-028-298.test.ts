/**
 * Draven, Showboat — ogn-028-298 · Champion Unit · Fury · 5 energy + 1 [fury] · 3 Might
 *
 *   My Might is increased by your points.
 *
 * Rules: 364 (passive/static abilities apply continuously while on the board),
 * 315.2.b.2 / 467 (holding a battlefield at the start of your turn scores 1).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-028-298";

describe("Draven, Showboat (ogn-028-298)", () => {
  test("costs 5 energy + 1 fury power; not playable without the fury power", async () => {
    const game = await scenario().resources(P1, { energy: 5, power: { fury: 1 } }).hand(P1, CARD, "draven").build();
    await game.p1.play("draven");
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.zoneOf("draven")).toBe("base");
    const noPower = await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "draven").build();
    expect(noPower.p1.can("play", "draven")).toBe(false);
    const noEnergy = await scenario().resources(P1, { energy: 4, power: { fury: 1 } }).hand(P1, CARD, "draven").build();
    expect(noEnergy.p1.can("play", "draven")).toBe(false);
  });

  /** Statics are (re)applied on engine actions, so the unit is always played from hand. */
  function withPoints(own: number, opp: number) {
    return scenario().points(P1, own).points(P2, opp).resources(P1, { energy: 5, power: { fury: 1 } }).hand(P1, CARD, "draven");
  }

  test("with 0 points, Might is the printed 3", async () => {
    const game = await withPoints(0, 0).build();
    await game.p1.play("draven");
    await game.settle();
    expect(game.state("draven").baseMight).toBe(3);
    expect(game.state("draven").might).toBe(3);
  });

  test("Might = 3 + YOUR points (4 points → 7); the opponent's points are ignored", async () => {
    const game = await withPoints(4, 6).build();
    await game.p1.play("draven");
    await game.settle();
    expect(game.state("draven").might).toBe(7);
    const onlyOpp = await withPoints(0, 6).build();
    await onlyOpp.p1.play("draven");
    await onlyOpp.settle();
    expect(onlyOpp.state("draven").might).toBe(3);
  });

  test.failing("BUG: tracks the score continuously — scoring a hold point later raises Might again (rule 364 passive)", async () => {
    // Expected: Draven played with 2 points is 5 Might; after P1 holds bf1 next turn (3 points) he is
    // 6 Might. Actual: the static bonus is computed when Draven enters/first ticks (+2) and is never
    // re-evaluated when the score changes, so he stays at 5.
    const game = await withPoints(2, 0).battlefield("bf1", { controller: P1 }).build();
    await game.p1.play("draven", { to: "bf1" });
    await game.settle();
    expect(game.state("draven").might).toBe(5);
    await game.advanceTurn(); // → P2
    await game.advanceTurn(); // → P1: holds bf1 in the Beginning Phase, 2 → 3 points
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(3);
    expect(game.state("draven").might).toBe(6);
  });
});
