/**
 * Scorchclaw — unl-016-219 · Unit · Fury · 3 energy · 3 might
 *
 *   [Hunt 2] (When I conquer or hold, gain 2 XP.)
 *   [Level 3][>] I have +1 [Might] and enter ready. (While you have 3+ XP, get the effect.)
 *
 * Rules: 143.4 (units enter exhausted unless an effect says otherwise),
 * 728 ([Level N] gates the whole clause on the controller's XP). Both halves
 * of the gated clause — the Might bonus and the enter-ready — must apply
 * together.
 */

import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../harness";

const CARD = "unl-016-219";

function board(xp: number) {
  return scenario()
    .resources(P1, { energy: 3, power: { fury: 1 } })
    .xp(P1, xp)
    .hand(P1, CARD, "scorchclaw");
}

describe("Scorchclaw (unl-016-219)", () => {
  test("with 3+ XP it gets +1 Might AND enters ready", async () => {
    const game = await board(4).build();
    await game.p1.play("scorchclaw");
    await game.settle();
    expect(game.zoneOf("scorchclaw")).toBe("base");
    expect(game.state("scorchclaw").might).toBe(4);
    expect(game.state("scorchclaw").isReady).toBe(true);
  });

  test("below 3 XP neither half applies: 3 Might and enters exhausted", async () => {
    const game = await board(0).build();
    await game.p1.play("scorchclaw");
    await game.settle();
    expect(game.state("scorchclaw").might).toBe(3);
    expect(game.state("scorchclaw").isExhausted).toBe(true);
  });
});
