/**
 * Vanguard Attendant — ogs-016-024 · Unit · Order · 6 energy + [order] · 5 Might
 *
 *   I enter ready.
 *
 * Rule 359.2.c: a unit normally enters the board exhausted; this passive
 * replaces that for itself.
 */

import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../harness";

const CARD = "ogs-016-024";
const SKULKER = "ogn-175-298"; // vanilla 3-might unit (control)

describe("Vanguard Attendant (ogs-016-024)", () => {
  test("enters the base READY when played from hand", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6, power: { order: 1 } })
      .hand(P1, CARD, "va")
      .build();
    await game.p1.play("va");
    await game.settle();
    expect(game.zoneOf("va")).toBe("base");
    expect(game.state("va").isReady).toBe(true);
    expect(game.state("va").isExhausted).toBe(false);
    expect(game.state("va").might).toBe(5);
  });

  test("enters ready at a battlefield you control too", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6, power: { order: 1 } })
      .battlefield("bf1", { controller: P1 })
      .hand(P1, CARD, "va")
      .build();
    await game.p1.play("va", { to: "bf1" });
    await game.settle();
    expect(game.locationOf("va")).toBe("bf1");
    expect(game.state("va").isReady).toBe(true);
  });

  test("control: a vanilla unit played the same way enters exhausted (rule 359.2.c)", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, SKULKER, "sk").build();
    await game.p1.play("sk");
    await game.settle();
    expect(game.state("sk").isExhausted).toBe(true);
  });

  test("cost: 6 energy + 1 order deducted; unaffordable with 5 energy or without order power", async () => {
    const game = await scenario()
      .resources(P1, { energy: 7, power: { order: 1 } })
      .hand(P1, CARD, "va")
      .build();
    expect(game.p1.can("play", "va")).toBe(true);
    await game.p1.play("va");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { order: 0 } });

    const lowEnergy = await scenario().resources(P1, { energy: 5, power: { order: 1 } }).hand(P1, CARD, "va").build();
    expect(lowEnergy.p1.can("play", "va")).toBe(false);
    const noPower = await scenario().resources(P1, { energy: 6 }).hand(P1, CARD, "va").build();
    expect(noPower.p1.can("play", "va")).toBe(false);
  });
});
