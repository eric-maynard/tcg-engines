/**
 * The Syren — ogn-184-298 · Gear · Chaos · 2 energy
 *
 *   [1], [Exhaust]: Move a friendly unit at a battlefield to its base.
 *
 * Rules: 377 (activated ability — everything before ":" is the cost: 1 energy + exhaust this),
 * the effect is a Move of a friendly unit from a battlefield to its owner's base (not a Recall
 * keyworded action; the unit keeps its ready/exhausted state and damage).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-184-298";

function board(energy = 1) {
  return scenario()
    .resources(P1, { energy })
    .battlefield("bf1", { controller: P1 })
    .gear(P1, CARD, "syren")
    .unit(P1, "bf1", { might: 3, name: "Away" }, "away")
    .unit(P1, "base", { might: 2, name: "Home" }, "home")
    .unit(P2, "bf1", { might: 2, name: "Foe" }, "foe");
}

describe("The Syren (ogn-184-298)", () => {
  test("cost: 2 energy to play, no power; enters the base as gear; unaffordable with 1", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "syren").build();
    await game.p1.play("syren");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("syren")).toBe("base");
    expect(game.state("syren").cardType).toBe("gear");
    const poor = await scenario().resources(P1, { energy: 1 }).hand(P1, CARD, "syren").build();
    expect(poor.p1.can("play", "syren")).toBe(false);
  });

  test("[1], [Exhaust]: pays 1 energy, exhausts The Syren, and moves the friendly battlefield unit to base", async () => {
    const game = await board().build();
    expect(game.state("syren").isReady).toBe(true);
    await game.p1.activate("syren", 0, { targets: "away" });
    expect(game.p1.energy()).toBe(0);
    expect(game.state("syren").isExhausted).toBe(true);
    await game.settle();
    expect(game.locationOf("away")).toBe("base");
    expect(game.zoneOf("away")).toBe("base");
    expect(game.state("away").damage).toBe(0);
    expect(game.locationOf("foe")).toBe("bf1");
  });

  test("cost must be payable: not activatable with 0 energy, nor while The Syren is exhausted", async () => {
    const broke = await board(0).build();
    expect(broke.p1.can("activate", "syren")).toBe(false);
    const game = await board(2).build();
    await game.p1.activate("syren", 0, { targets: "away" });
    await game.settle();
    expect(game.p1.energy()).toBe(1);
    expect(game.p1.can("activate", "syren")).toBe(false); // exhausted now
  });

  test("only a FRIENDLY unit AT A BATTLEFIELD is a legal choice — base units and enemy units are not offered", async () => {
    // rule 355.8: the only legal target is "away" (friendly, at bf1); "home" (in base) and "foe" (enemy) are excluded.
    const game = await board().build();
    const targets = game.p1.option("activate", "syren")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toEqual([["away"]]);
  });

  test("an enemy unit at a battlefield is never a legal choice", async () => {
    const game = await board().build();
    const targets = (game.p1.option("activate", "syren")?.fields.find((f) => f.arg === "targets")?.options ?? []) as string[][];
    expect(targets.flat()).not.toContain("foe");
    expect(targets.flat()).toContain("away");
    const t = await game.p1.try((p) => p.activate("syren", 0, { targets: "foe" }));
    expect(t.ok).toBe(false);
  });
});
