/**
 * Trifarian Gloryseeker — ogn-217-298 · Unit · Order · 2 energy · 2 Might
 *
 *   [Legion] — When you play me, buff me. (If I don't have a buff, I get a +1
 *   [Might] buff. Get the effect if you've played another card this turn.)
 *
 * Rules: 812.1.b.1 / 812.1.c (Legion: the dependent ability is active only if a
 * different card was finalized by you earlier this turn), 702–703 (a buff is a
 * +1 Might counter, at most one per unit, and it persists).
 */

import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../harness";

const CARD = "ogn-217-298";
const SKULKER = "ogn-175-298"; // vanilla 3-cost unit — the "another card" played first

describe("Trifarian Gloryseeker (ogn-217-298)", () => {
  test("costs 2 energy and is a 2-Might unit with Legion; unaffordable with 1", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "gs").build();
    await game.p1.play("gs");
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.zoneOf("gs")).toBe("base");
    expect(game.state("gs").might).toBe(2);
    expect(game.state("gs").keywords).toContain("Legion");
    const poor = await scenario().resources(P1, { energy: 1 }).hand(P1, CARD, "gs").build();
    expect(poor.p1.can("play", "gs")).toBe(false);
  });

  test("Legion not met: as the first card you play this turn, it enters unbuffed at 2 Might", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "gs").build();
    await game.p1.play("gs");
    expect(game.chain()).toHaveLength(0);
    await game.settle();
    expect(game.state("gs").isBuffed).toBe(false);
    expect(game.state("gs").might).toBe(2);
  });

  test("Legion met — after playing another card this turn, Gloryseeker enters and buffs itself (2 → 3, rule 812.1.c)", async () => {
    // Expected: Skulker finalized earlier this turn → the play effect is active → Gloryseeker gets a
    // +1 buff (isBuffed, 3 Might) that persists into later turns. Actual: parsed as a bare Legion
    // keyword with no trigger, so nothing happens (stays 2, unbuffed).
    const game = await scenario().resources(P1, { energy: 5 }).hand(P1, SKULKER, "sk").hand(P1, CARD, "gs").build();
    await game.p1.play("sk");
    await game.settle();
    await game.p1.play("gs");
    await game.settle();
    expect(game.p1.energy()).toBe(0);
    expect(game.state("gs").isBuffed).toBe(true);
    expect(game.state("gs").might).toBe(3);
    await game.advanceTurn();
    expect(game.state("gs").might).toBe(3); // buffs are permanent
  });

  test("'played this turn' resets: playing a card last turn does not satisfy Legion this turn", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, SKULKER, "sk").hand(P1, CARD, "gs").build();
    await game.p1.play("sk");
    await game.settle();
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    await game.p1.tapRunes(2);
    await game.p1.play("gs");
    await game.settle();
    expect(game.state("gs").isBuffed).toBe(false);
    expect(game.state("gs").might).toBe(2);
  });
});
