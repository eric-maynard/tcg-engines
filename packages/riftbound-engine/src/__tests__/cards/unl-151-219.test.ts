/**
 * Bandle Soldier — unl-151-219 · Unit · Order · 4 energy · 5 might
 *
 *   [Level 3][>] I enter ready. (While you have 3+ XP, get the effect.)
 *
 * Rules: 143.4 (units enter exhausted unless an effect says otherwise),
 * 728 ([Level N] gates the ability on the controller's XP).
 */

import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../harness";

const CARD = "unl-151-219";

function board(xp: number) {
  return scenario()
    .resources(P1, { energy: 4, power: { order: 1 } })
    .xp(P1, xp)
    .hand(P1, CARD, "soldier");
}

describe("Bandle Soldier (unl-151-219)", () => {
  test("with 3+ XP the [Level 3] clause applies and it enters ready", async () => {
    const game = await board(3).build();
    await game.p1.play("soldier");
    await game.settle();
    expect(game.zoneOf("soldier")).toBe("base");
    expect(game.state("soldier").isReady).toBe(true);
  });

  test("below 3 XP the [Level 3] gate fails and it enters exhausted", async () => {
    const game = await board(0).build();
    await game.p1.play("soldier");
    await game.settle();
    expect(game.zoneOf("soldier")).toBe("base");
    expect(game.state("soldier").isExhausted).toBe(true);
  });
});
