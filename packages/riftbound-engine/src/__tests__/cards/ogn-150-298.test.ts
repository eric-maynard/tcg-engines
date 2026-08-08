/**
 * Kraken Hunter — ogn-150-298 · Unit · Body · 3 energy + [body][body] · 5 Might
 *
 *   [Accelerate] (You may pay [1][body] as an additional cost to have me enter ready.)
 *   [Assault] (+1 [Might] while I'm an attacker.)
 *   As you play me, you may spend any number of buffs as an additional cost.
 *   Reduce my cost by [body] for each buff you spend.
 *
 * Rules: 805 (Accelerate = optional additional cost [1][C] → enter ready), 807 (Assault X,
 * bare = 1, only while attacker), spending a buff = removing a buff marker from a friendly unit.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-150-298";

describe("Kraken Hunter (ogn-150-298)", () => {
  test("costs 3 energy + 2 body and enters the base exhausted as a 5-Might unit", async () => {
    const game = await scenario().resources(P1, { energy: 3, power: { body: 2 } }).hand(P1, CARD, "kh").build();
    await game.p1.play("kh");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    expect(game.zoneOf("kh")).toBe("base");
    expect(game.state("kh").might).toBe(5);
    expect(game.state("kh").isExhausted).toBe(true);
  });

  test("unaffordable with only 1 body (and no buffs to spend) or with only 2 energy", async () => {
    const lowPower = await scenario().resources(P1, { energy: 5, power: { body: 1 } }).hand(P1, CARD, "kh").build();
    expect(lowPower.p1.can("play", "kh")).toBe(false);
    const lowEnergy = await scenario().resources(P1, { energy: 2, power: { body: 3 } }).hand(P1, CARD, "kh").build();
    expect(lowEnergy.p1.can("play", "kh")).toBe(false);
  });

  test("Accelerate: paying an extra [1][body] (4 energy + 3 body total) makes it enter ready", async () => {
    const game = await scenario().resources(P1, { energy: 4, power: { body: 3 } }).hand(P1, CARD, "kh").build();
    await game.p1.play("kh", { accelerate: true });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    expect(game.state("kh").isReady).toBe(true);
    // Only the base cost available → the accelerated variant is not offered.
    const poor = await scenario().resources(P1, { energy: 3, power: { body: 2 } }).hand(P1, CARD, "kh").build();
    const t = await poor.p1.try((p) => p.play("kh", { accelerate: true }));
    expect(!t.ok && t.error.code).toBe("ILLEGAL_ARGS");
  });

  test("Assault: attacking as 5+1 it kills a 6-Might defender; at rest it is 5 Might", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "kh")
      .unit(P2, "bf1", { might: 6 }, "wall")
      .build();
    expect(game.state("kh").keywords).toContain("Assault");
    expect(game.state("kh").might).toBe(5);
    await game.p1.move("kh", "bf1");
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash");
  });

  test("Assault does not apply while defending: a 5-Might attacker trades with it", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "kh")
      .unit(P2, "base", { might: 5 }, "atk")
      .build();
    await game.p2.move("atk", "bf1");
    await game.settle();
    expect(game.zoneOf("kh")).toBe("trash");
    expect(game.zoneOf("atk")).toBe("trash");
  });

  test("spending one friendly buff reduces the cost by [body] — playable with 3 energy + 1 body", async () => {
    // With a buffed friendly unit on board, P1 may spend that buff as an additional cost,
    // reducing the power cost to a single [body]; the ally loses its buff.
    const game = await scenario()
      .resources(P1, { energy: 3, power: { body: 1 } })
      .unit(P1, "base", { might: 2 }, "ally", { buffed: true })
      .hand(P1, CARD, "kh")
      .build();
    expect(game.p1.can("play", "kh")).toBe(true);
    await game.p1.play("kh");
    await game.settle({ policy: "first" });
    expect(game.zoneOf("kh")).toBe("base");
    expect(game.state("ally").isBuffed).toBe(false);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
  });

  test("spending two buffs pays the whole power cost — playable with 3 energy and no body power", async () => {
    // Two buffs spent → cost is 3 energy + 0 power; both allies lose their buffs.
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .unit(P1, "base", { might: 2 }, "a", { buffed: true })
      .unit(P1, "base", { might: 2 }, "b", { buffed: true })
      .hand(P1, CARD, "kh")
      .build();
    expect(game.p1.can("play", "kh")).toBe(true);
    await game.p1.play("kh");
    await game.settle({ policy: "first" });
    expect(game.zoneOf("kh")).toBe("base");
    expect(game.state("a").isBuffed).toBe(false);
    expect(game.state("b").isBuffed).toBe(false);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
  });

  // DESIGN (DESIGN.md §Paying costs): the spend-buffs alternative is enumerated from the cost model even
  // when the POWER pool is empty — the offered variant names the buffs to spend and charges no [body].
  test("DESIGN (cost alternative enumerated with an empty power pool): with 3 energy, no body power and two buffed allies the ONLY offered play variant spends both buffs; playing it charges 3 energy and no power", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .unit(P1, "base", { might: 2 }, "a", { buffed: true })
      .unit(P1, "base", { might: 2 }, "b", { buffed: true })
      .hand(P1, CARD, "kh")
      .build();
    const opt = game.p1.option("play", "kh");
    expect(opt).toBeDefined();
    expect(opt!.variants).toHaveLength(1);
    expect(opt!.variants[0]?.params).toMatchObject({ paidAdditionalCost: true, spentBuffIds: ["a", "b"] });
    await game.p1.play("kh");
    await game.settle({ policy: "first" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    // One buff only covers one [body]: with a single buffed ally and no body power nothing is offered.
    const one = await scenario().resources(P1, { energy: 3 }).unit(P1, "base", { might: 2 }, "a", { buffed: true }).hand(P1, CARD, "kh").build();
    expect(one.p1.option("play", "kh")).toBeUndefined();
  });
});
