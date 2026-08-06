/**
 * Blazing Scorcher — ogn-001-298 · Unit · Fury · 5 energy · 5 might
 *
 *   [Accelerate] (You may pay [1][fury] as an additional cost to have me enter ready.)
 *
 * Rule 143.4 — units enter exhausted; 805.1.a — Accelerate is an optional
 * additional cost [1][C]; 805.1.a.1 — the power must match the unit's domain.
 */

import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../harness";

const CARD = "ogn-001-298";

describe("Blazing Scorcher (ogn-001-298)", () => {
  test("costs 5 energy; without Accelerate it enters the base exhausted as a 5-might unit", async () => {
    const game = await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "bs").build();
    expect(game.p1.can("play", "bs")).toBe(true);
    await game.p1.play("bs", { to: "base" });
    await game.settle();
    expect(game.zoneOf("bs")).toBe("base");
    expect(game.p1.energy()).toBe(0);
    expect(game.state("bs").might).toBe(5);
    expect(game.state("bs").isExhausted).toBe(true);
    expect(game.state("bs").keywords).toContain("Accelerate");
  });

  test("Accelerate: paying an extra [1][fury] makes it enter ready (6 energy + 1 fury total)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6, power: { fury: 1 } })
      .hand(P1, CARD, "bs")
      .build();
    await game.p1.play("bs", { accelerate: true, to: "base" });
    await game.settle();
    expect(game.zoneOf("bs")).toBe("base");
    expect(game.state("bs").isReady).toBe(true);
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power("fury")).toBe(0);
  });

  test("Accelerate is optional: with 6 energy + 1 fury available, declining leaves the extra unspent", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6, power: { fury: 1 } })
      .hand(P1, CARD, "bs")
      .build();
    await game.p1.play("bs", { accelerate: false, to: "base" });
    await game.settle();
    expect(game.state("bs").isExhausted).toBe(true);
    expect(game.p1.energy()).toBe(1);
    expect(game.p1.power("fury")).toBe(1);
  });

  test("Accelerate power must be [fury] (805.1.a.1): a [mind] power cannot pay it", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6, power: { mind: 1 } })
      .hand(P1, CARD, "bs")
      .build();
    // Only the non-accelerated variant is offered.
    expect(game.p1.option("play", "bs")?.fields.some((f) => f.arg === "payOptional")).toBe(false);
    const r = await game.p1.try((p) => p.play("bs", { accelerate: true, to: "base" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("bs")).toBe("hand");
    expect(game.p1.power("mind")).toBe(1);
  });

  test("not playable with only 4 energy", async () => {
    const game = await scenario().resources(P1, { energy: 4, power: { fury: 1 } }).hand(P1, CARD, "bs").build();
    expect(game.p1.can("play", "bs")).toBe(false);
    const r = await game.p1.try((p) => p.play("bs", { to: "base" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("bs")).toBe("hand");
  });
});
