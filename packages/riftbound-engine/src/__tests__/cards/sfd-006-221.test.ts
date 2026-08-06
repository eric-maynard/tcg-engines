/**
 * Eager Drakehound — sfd-006-221 · Unit · Fury · 3 energy + 1 [fury] · 3 might
 *
 *   I enter ready.
 *
 * Rule 143.4 — units normally enter the board exhausted; 143.4.a — this can be
 * altered by "similar game effects" such as this static text.
 */

import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../harness";

const CARD = "sfd-006-221";

describe("Eager Drakehound (sfd-006-221)", () => {
  test("cost: 3 energy + 1 fury; is a 3-Might unit in base afterwards", async () => {
    const game = await scenario().resources(P1, { energy: 3, power: { fury: 1 } }).hand(P1, CARD, "hound").build();
    expect(game.p1.can("play", "hound")).toBe(true);
    await game.p1.play("hound", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.settle();
    expect(game.zoneOf("hound")).toBe("base");
    expect(game.state("hound").might).toBe(3);
  });

  test("unaffordable: 3 energy without the [fury] power, or 2 energy + fury, is not a legal play", async () => {
    const noPower = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "hound").build();
    expect(noPower.p1.can("play", "hound")).toBe(false);
    const wrongPower = await scenario().resources(P1, { energy: 3, power: { calm: 1 } }).hand(P1, CARD, "hound").build();
    expect(wrongPower.p1.can("play", "hound")).toBe(false);
    const noEnergy = await scenario().resources(P1, { energy: 2, power: { fury: 1 } }).hand(P1, CARD, "hound").build();
    expect(noEnergy.p1.can("play", "hound")).toBe(false);
    const r = await noEnergy.p1.try((p) => p.play("hound", { to: "base" }));
    expect(r.ok).toBe(false);
    expect(noEnergy.zoneOf("hound")).toBe("hand");
  });

  test("I enter ready: played to base it is ready, not exhausted (overrides rule 143.4)", async () => {
    const game = await scenario().resources(P1, { energy: 3, power: { fury: 1 } }).hand(P1, CARD, "hound").build();
    await game.p1.play("hound", { to: "base" });
    await game.settle();
    expect(game.zoneOf("hound")).toBe("base");
    expect(game.state("hound").isReady).toBe(true);
    expect(game.state("hound").isExhausted).toBe(false);
  });

  test("I enter ready: also ready when played to a battlefield you control, and can move right away", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: null })
      .hand(P1, CARD, "hound")
      .build();
    await game.p1.play("hound", { to: "bf1" });
    await game.settle();
    expect(game.locationOf("hound")).toBe("bf1");
    expect(game.state("hound").isReady).toBe(true);
    // A ready unit may take a standard move back to base the same turn.
    await game.p1.move("hound", "base");
    expect(game.locationOf("hound")).toBe("base");
    expect(game.state("hound").isExhausted).toBe(true);
  });

  test("a vanilla unit played the same way still enters exhausted (control)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .hand(P1, { might: 2, energyCost: 2, name: "Plain", domain: "fury" }, "plain")
      .build();
    await game.p1.play("plain", { to: "base" });
    await game.settle();
    expect(game.state("plain").isExhausted).toBe(true);
  });
});
