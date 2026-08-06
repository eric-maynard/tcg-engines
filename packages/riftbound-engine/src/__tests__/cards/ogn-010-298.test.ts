/**
 * Legion Rearguard — ogn-010-298 · Unit · Fury · 2 energy · 2 might
 *
 *   [Accelerate] (You may pay [1][fury] as an additional cost to have me enter ready.)
 *
 * Rule 143.4 — units enter exhausted; 805.1.a — Accelerate is an optional
 * additional cost [1][C]; 805.1.a.1 — the power must match the unit's domain;
 * 356.1.b.3 uses this very card as the example (base cost 2 energy, 0 power).
 */

import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../harness";

const CARD = "ogn-010-298";

describe("Legion Rearguard (ogn-010-298)", () => {
  test("costs 2 energy; without Accelerate it enters the base exhausted as a 2-might unit", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "lr").build();
    expect(game.p1.can("play", "lr")).toBe(true);
    await game.p1.play("lr", { to: "base" });
    await game.settle();
    expect(game.zoneOf("lr")).toBe("base");
    expect(game.p1.energy()).toBe(0);
    expect(game.state("lr").might).toBe(2);
    expect(game.state("lr").isExhausted).toBe(true);
    expect(game.state("lr").keywords).toContain("Accelerate");
  });

  test("Accelerate: paying an extra [1][fury] makes it enter ready (3 energy + 1 fury total)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { fury: 1 } })
      .hand(P1, CARD, "lr")
      .build();
    await game.p1.play("lr", { accelerate: true, to: "base" });
    await game.settle();
    expect(game.zoneOf("lr")).toBe("base");
    expect(game.state("lr").isReady).toBe(true);
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power("fury")).toBe(0);
  });

  test("Accelerate is optional: declining leaves the extra [1][fury] unspent and the unit exhausted", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { fury: 1 } })
      .hand(P1, CARD, "lr")
      .build();
    await game.p1.play("lr", { accelerate: false, to: "base" });
    await game.settle();
    expect(game.state("lr").isExhausted).toBe(true);
    expect(game.p1.energy()).toBe(1);
    expect(game.p1.power("fury")).toBe(1);
  });

  test("Accelerate needs the extra energy too: with exactly 2 energy + 1 fury the accelerated play is not offered", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { fury: 1 } })
      .hand(P1, CARD, "lr")
      .build();
    const r = await game.p1.try((p) => p.play("lr", { accelerate: true, to: "base" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("lr")).toBe("hand");
    // The plain play is still fine.
    await game.p1.play("lr", { accelerate: false, to: "base" });
    await game.settle();
    expect(game.state("lr").isExhausted).toBe(true);
  });

  test("Accelerate power must be [fury] (805.1.a.1): a [calm] power cannot pay it", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { calm: 1 } })
      .hand(P1, CARD, "lr")
      .build();
    const r = await game.p1.try((p) => p.play("lr", { accelerate: true, to: "base" }));
    if (r.ok) {
      // If the engine silently ignored the request, the unit must NOT be ready and calm power untouched.
      await game.settle();
      expect(game.state("lr").isExhausted).toBe(true);
      expect(game.p1.power("calm")).toBe(1);
    } else {
      expect(r.ok).toBe(false);
    }
  });

  test("not playable with only 1 energy", async () => {
    const game = await scenario().resources(P1, { energy: 1, power: { fury: 1 } }).hand(P1, CARD, "lr").build();
    expect(game.p1.can("play", "lr")).toBe(false);
    const r = await game.p1.try((p) => p.play("lr", { to: "base" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("lr")).toBe("hand");
  });
});
