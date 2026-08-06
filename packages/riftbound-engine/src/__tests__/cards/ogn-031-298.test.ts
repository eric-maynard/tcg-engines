/**
 * Raging Firebrand — ogn-031-298 · Unit · Fury · 6 energy + 1 [fury] · 4 might
 *
 *   When you play me, the next spell you play this turn costs [5] less.
 *
 * Rules: 356.4.b ("cost [amount] less" discounts), 356.6 (Energy cost can't be
 * reduced below 0). Probe spells: Final Spark (ogs-022-024, 8 energy, "Deal 8 to
 * a unit") and Consult the Past (ogn-083-298, 4 energy, "Draw 2").
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const FIREBRAND = "ogn-031-298";
const FINAL_SPARK = "ogs-022-024"; // 8 energy
const CONSULT = "ogn-083-298"; // 4 energy

function board(energy = 30) {
  return scenario()
    .resources(P1, { energy, power: { fury: 1 } })
    .unit(P2, "base", { might: 9 }, "foe")
    .hand(P1, FIREBRAND, "fb")
    .hand(P1, FINAL_SPARK, "spark")
    .hand(P1, FINAL_SPARK, "spark2")
    .hand(P1, CONSULT, "consult");
}

describe("Raging Firebrand (ogn-031-298)", () => {
  test("cost: 6 energy + 1 fury deducted; enters the base as a 4-might unit; unaffordable without the fury", async () => {
    const game = await board(6).build();
    await game.p1.play("fb", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.settle();
    expect(game.zoneOf("fb")).toBe("base");
    expect(game.state("fb").might).toBe(4);
    const noFury = await scenario().resources(P1, { energy: 6 }).hand(P1, FIREBRAND, "fb").build();
    expect(noFury.p1.can("play", "fb")).toBe(false);
    const lowEnergy = await scenario().resources(P1, { energy: 5, power: { fury: 1 } }).hand(P1, FIREBRAND, "fb").build();
    expect(lowEnergy.p1.can("play", "fb")).toBe(false);
  });

  test("play trigger — the next spell this turn costs [5] less, and only that one (rule 356.4.b)", async () => {
    // Expected: after Firebrand resolves, Final Spark (8) charges 3; a second Final Spark charges the full 8.
    // Actual: the trigger grants an inert "NextSpellCostReduction" marker; spells are charged full price.
    const game = await board().build();
    await game.p1.play("fb", { to: "base" });
    await game.settle();
    expect(game.p1.energy()).toBe(24);
    await game.p1.cast("spark", { targets: "foe" });
    expect(game.p1.energy()).toBe(21); // 8 − 5
    await game.settle();
    expect(game.state("foe").damage).toBe(8);
    await game.p1.cast("spark2", { targets: "foe" });
    expect(game.p1.energy()).toBe(13); // full 8 for the second spell
  });

  test("the discount cannot take a spell below 0 — a 4-cost spell becomes free (rule 356.6)", async () => {
    // Expected: Consult the Past (4) costs 0 after Firebrand; with 0 energy left it is still castable.
    // Actual: no discount is applied, so with 0 energy the spell is not legal.
    const game = await board(6).build();
    await game.p1.play("fb", { to: "base" });
    await game.settle();
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.can("cast", "consult")).toBe(true);
    const handBefore = game.p1.hand().length;
    await game.p1.cast("consult");
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.p1.hand().length).toBe(handBefore - 1 + 2);
  });

  test("'this turn': on a later turn spells cost their full price again", async () => {
    const game = await board().build();
    await game.p1.play("fb", { to: "base" });
    await game.settle();
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    await game.p1.do("addResources", { energy: 7 }); // pools empty between turns
    expect(game.p1.can("cast", "spark")).toBe(false); // 7 < 8: no lingering discount
    await game.p1.do("addResources", { energy: 1 });
    await game.p1.cast("spark", { targets: "foe" });
    expect(game.p1.energy()).toBe(0);
  });
});
