/**
 * Flurry of Blades — ogn-133-298 · Spell · Body · 1 energy
 *
 *   [Reaction] (Play any time, even before spells and abilities resolve.)
 *   Deal 1 to all units at battlefields.
 *
 * "All units at battlefields": every unit (friendly and enemy) at every
 * battlefield; units in bases are untouched. Nothing is targeted/chosen.
 * Where the engine (wrongly) asks for a battlefield we feed it "bf2" via
 * `answers` so the remaining clauses can still be exercised.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-133-298";
const CLEAVE = "ogn-004-298"; // [Action] 1-energy spell for the opponent to open a chain with

function board() {
  return scenario()
    .resources(P1, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 3, name: "MineAtBf1" }, "mineBf1")
    .unit(P2, "bf2", { might: 3, name: "FoeAtBf2" }, "foeBf2")
    .unit(P2, "bf2", { might: 1, name: "WeakAtBf2" }, "weakBf2")
    .unit(P1, "base", { might: 2, name: "MineAtBase" }, "mineBase")
    .unit(P2, "base", { might: 1, name: "FoeAtBase" }, "foeBase")
    .hand(P1, CARD, "flurry");
}

describe("Flurry of Blades (ogn-133-298)", () => {
  test.failing("BUG: deals 1 to EVERY unit at EVERY battlefield (both sides) with no target choice", async () => {
    // Expected: no `targets` field; after resolution mineBf1 and foeBf2 have 1 damage, weakBf2 dies.
    // Actual: the engine asks the caster to pick ONE battlefield and only damages units there.
    const game = await board().build();
    expect(game.p1.option("cast", "flurry")?.fields.find((f) => f.arg === "targets")).toBeUndefined();
    await game.p1.cast("flurry");
    await game.settle();
    expect(game.zoneOf("flurry")).toBe("trash");
    expect(game.state("mineBf1").damage).toBe(1);
    expect(game.state("foeBf2").damage).toBe(1);
    expect(game.zoneOf("weakBf2")).toBe("trash");
  });

  test("units at the affected battlefield each take 1 (friend or foe); 1-might units die; base units are untouched", async () => {
    const game = await board().unit(P1, "bf2", { might: 2, name: "MineAtBf2" }, "mineBf2").build();
    await game.p1.cast("flurry", { answers: ["bf2"] });
    await game.settle();
    expect(game.zoneOf("flurry")).toBe("trash");
    expect(game.state("foeBf2").damage).toBe(1);
    expect(game.state("mineBf2").damage).toBe(1);
    expect(game.zoneOf("weakBf2")).toBe("trash");
    expect(game.state("mineBase").damage).toBe(0);
    expect(game.state("foeBase").damage).toBe(0);
    expect(game.zoneOf("foeBase")).toBe("base");
  });

  test("[Reaction]: on the opponent's turn P1 may respond to their spell; Flurry resolves first (LIFO)", async () => {
    const game = await board().active(P2).resources(P2, { energy: 1 }).hand(P2, CLEAVE, "cleave").build();
    await game.p2.cast("cleave", { targets: "foeBf2" });
    await game.p2.passPriority();
    expect(game.p1.can("cast", "flurry")).toBe(true);
    await game.p1.cast("flurry", { answers: ["bf2"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["cleave", "flurry"]);
    expect(game.p1.energy()).toBe(0);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("flurry")).toBe("trash");
    expect(game.zoneOf("weakBf2")).toBe("trash");
    expect(game.state("foeBf2").damage).toBe(1);
    expect(game.chain().map((c) => c.cardId)).toEqual(["cleave"]);
  });

  test("[Reaction] is not permission to act in the opponent's Neutral Open state (rule 316.5.b)", async () => {
    // Expected: on P2's turn with no chain/showdown, only P2 may play spells → Flurry not legal for P1.
    // Actual: the engine offers P1 `cast Flurry of Blades` in P2's open main phase.
    const game = await board().active(P2).build();
    expect(game.chain()).toHaveLength(0);
    expect(game.p1.can("cast", "flurry")).toBe(false);
  });

  test("cost: 1 energy deducted; not castable with 0 energy", async () => {
    const game = await board().resources(P1, { energy: 2 }).build();
    await game.p1.cast("flurry", { answers: ["bf2"] });
    expect(game.p1.resources()).toEqual({ energy: 1, power: {} });
    expect(game.zoneOf("flurry")).toBe("chain");
    const poor = await board().resources(P1, { energy: 0 }).build();
    expect(poor.p1.can("cast", "flurry")).toBe(false);
  });
});
