/**
 * Ruling 4385eb1341da3b98 — Magma Wurm (OGN-011 → ogn-011-298) · [8][fury] · 8 Might
 *   "Other friendly units enter ready."
 *
 * Q: Does Magma Wurm see itself — does it enter ready off its own ability?
 * A: No, because the text says "OTHER friendly units". The timing would otherwise allow it: a card's text
 *    becomes active before the unit enters the board, so a self-referencing "enter" passive can see its own
 *    arrival. The word "other" is what excludes the Wurm, so it enters exhausted like any other unit — while
 *    a SECOND Magma Wurm played afterwards does enter ready off the first one.
 * Rules: 143.4 (permanents enter exhausted unless an effect says otherwise), 365 (passive abilities apply
 *        continuously while on the board), 359.1.a ("other" excludes the source object).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const MAGMA_WURM = "ogn-011-298";

describe("Ruling 4385eb1341da3b98 — Magma Wurm does not see itself ('other')", () => {
  test("ruling: the Wurm enters EXHAUSTED off its own 'Other friendly units enter ready'", async () => {
    const game = await scenario().resources(P1, { energy: 8, power: { fury: 1 } }).hand(P1, MAGMA_WURM, "wurm").build();
    await game.p1.play("wurm");
    await game.settle();
    expect(game.zoneOf("wurm")).toBe("base");
    expect(game.state("wurm").isExhausted).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  test("the ability is live the moment it is on the board though — a SECOND Magma Wurm played after it enters ready", async () => {
    const game = await scenario()
      .resources(P1, { energy: 16, power: { fury: 2 } })
      .hand(P1, MAGMA_WURM, "wurm1")
      .hand(P1, MAGMA_WURM, "wurm2")
      .build();
    await game.p1.play("wurm1");
    await game.settle();
    expect(game.state("wurm1").isExhausted).toBe(true);
    await game.p1.play("wurm2");
    await game.settle();
    expect(game.state("wurm2").isReady).toBe(true); // "other" — wurm1 grants it to wurm2
    expect(game.state("wurm1").isExhausted).toBe(true); // and wurm1 is still not readied retroactively
  });

  test("an ordinary friendly unit played after the Wurm enters ready; the same unit with no Wurm out enters exhausted", async () => {
    const LATE = { cardType: "unit", energyCost: 1, might: 1, name: "Latecomer" } as const;
    const withWurm = await scenario()
      .resources(P1, { energy: 9, power: { fury: 1 } })
      .hand(P1, MAGMA_WURM, "wurm")
      .hand(P1, LATE, "late")
      .build();
    await withWurm.p1.play("wurm");
    await withWurm.settle();
    await withWurm.p1.play("late");
    await withWurm.settle();
    expect(withWurm.state("late").isReady).toBe(true);

    const alone = await scenario().resources(P1, { energy: 1 }).hand(P1, LATE, "late").build();
    await alone.p1.play("late");
    await alone.settle();
    expect(alone.state("late").isExhausted).toBe(true);
  });
});
