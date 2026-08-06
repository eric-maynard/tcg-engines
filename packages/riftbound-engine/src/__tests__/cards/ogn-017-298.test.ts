/**
 * Iron Ballista — ogn-017-298 · Gear · Fury · 3 energy
 *
 *   This enters exhausted.
 *   [Exhaust]: Deal 2 to a unit at a battlefield.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const BALLISTA = "ogn-017-298";

function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .gear(P1, BALLISTA, "ib")
    .unit(P2, "bf1", { might: 3 }, "atBf")
    .unit(P1, "bf1", { might: 3 }, "mineAtBf")
    .unit(P2, "base", { might: 3 }, "atBase");
}

describe("Iron Ballista (ogn-017-298)", () => {
  test("costs 3 energy to play and enters exhausted", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, BALLISTA, "ib").build();
    await game.p1.play("ib");
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("ib")).toBe("base");
    expect(game.state("ib").isExhausted).toBe(true);
    const poor = await scenario().resources(P1, { energy: 2 }).hand(P1, BALLISTA, "ib").build();
    expect(poor.p1.can("play", "ib")).toBe(false);
  });

  test("entering exhausted means it cannot be activated the turn it is played", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3 }, "atBf")
      .hand(P1, BALLISTA, "ib")
      .build();
    await game.p1.play("ib");
    await game.settle();
    expect(game.p1.can("activate", "ib")).toBe(false);
  });

  test("[Exhaust]: deals 2 to a unit at a battlefield and exhausts the Ballista", async () => {
    const game = await board().build();
    expect(game.state("ib").isReady).toBe(true);
    await game.p1.activate("ib", 1, { targets: "atBf" });
    expect(game.state("ib").isExhausted).toBe(true);
    await game.settle();
    expect(game.state("atBf").damage).toBe(2);
    expect(game.state("atBase").damage).toBe(0);
  });

  test("2 damage kills a 2-Might unit at a battlefield", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .gear(P1, BALLISTA, "ib")
      .unit(P2, "bf1", { might: 2 }, "small")
      .build();
    await game.p1.activate("ib", 1, { targets: "small" });
    await game.settle();
    expect(game.zoneOf("small")).toBe("trash");
  });

  test("targets only units at a battlefield (either side) — a unit in a base is never offered", async () => {
    const game = await board().build();
    const targets = game.p1.option("activate", "ib")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toHaveLength(2);
    expect(targets).toEqual(expect.arrayContaining([["atBf"], ["mineAtBf"]]));
    const t = await game.p1.try((p) => p.activate("ib", 1, { targets: "atBase" }));
    expect(t.ok).toBe(false);
    // No unit at any battlefield → the ability has no legal target and is not offered.
    const none = await scenario().gear(P1, BALLISTA, "ib").unit(P2, "base", { might: 1 }, "home").build();
    expect(none.p1.can("activate", "ib")).toBe(false);
  });

  test("cannot be activated while exhausted; readies again on your next turn", async () => {
    const game = await board().build();
    await game.p1.activate("ib", 1, { targets: "atBf" });
    await game.settle();
    expect(game.p1.can("activate", "ib")).toBe(false);
    await game.advanceTurn(); // → P2
    await game.advanceTurn(); // → P1 (Awaken readies the gear)
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("ib").isReady).toBe(true);
    expect(game.p1.can("activate", "ib")).toBe(true);
  });
});
