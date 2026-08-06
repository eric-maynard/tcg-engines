/**
 * Magma Wurm — ogn-011-298 · Unit · Fury · 8 energy + 1 fury · 8 Might
 *
 *   Other friendly units enter ready.
 *
 * Rule 143.4: units enter the board exhausted by default. Magma Wurm's static
 * is a replacement (rule 369.3) on how OTHER friendly units enter.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-011-298";
const SKULKER = "ogn-175-298"; // vanilla 3-might unit

describe("Magma Wurm (ogn-011-298)", () => {
  test("with Magma Wurm on board, another friendly unit played from hand enters ready (rules 143.4 / 369.3)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5 })
      .unit(P1, "base", CARD, "wurm")
      .hand(P1, SKULKER, "ally")
      .build();
    await game.p1.play("ally");
    await game.settle();
    expect(game.zoneOf("ally")).toBe("base");
    expect(game.state("ally").isReady).toBe(true);
  });

  test("'Other': Magma Wurm itself enters exhausted (rule 143.4)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 8, power: { fury: 1 } })
      .hand(P1, CARD, "wurm")
      .build();
    await game.p1.play("wurm");
    await game.settle();
    expect(game.zoneOf("wurm")).toBe("base");
    expect(game.state("wurm").isExhausted).toBe(true);
  });

  test("'friendly': enemy units still enter exhausted", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 5 })
      .unit(P1, "base", CARD, "wurm")
      .hand(P2, SKULKER, "foe")
      .build();
    await game.p2.play("foe");
    await game.settle();
    expect(game.zoneOf("foe")).toBe("base");
    expect(game.state("foe").isExhausted).toBe(true);
  });

  test("without Magma Wurm the same unit enters exhausted (control)", async () => {
    const game = await scenario().resources(P1, { energy: 5 }).hand(P1, SKULKER, "ally").build();
    await game.p1.play("ally");
    await game.settle();
    expect(game.state("ally").isExhausted).toBe(true);
  });

  test("cost: 8 energy + 1 fury is deducted; unaffordable without the fury or with 7 energy", async () => {
    const game = await scenario()
      .resources(P1, { energy: 9, power: { fury: 1 } })
      .hand(P1, CARD, "wurm")
      .build();
    await game.p1.play("wurm");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 0 } });
    expect(game.state("wurm").might).toBe(8);

    const noPower = await scenario().resources(P1, { energy: 8 }).hand(P1, CARD, "wurm").build();
    expect(noPower.p1.can("play", "wurm")).toBe(false);
    const lowEnergy = await scenario().resources(P1, { energy: 7, power: { fury: 1 } }).hand(P1, CARD, "wurm").build();
    expect(lowEnergy.p1.can("play", "wurm")).toBe(false);
  });
});
