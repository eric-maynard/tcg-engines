/**
 * Ravenborn Tome — ogn-032-298 · Gear · Fury · 3 energy
 *
 *   [Exhaust]: The next spell you play this turn deals 1 Bonus Damage.
 *   (Each instance of damage the spell deals is increased by 1.)
 *
 * Rule 391: a delayed passive that adds 1 Bonus Damage (rules 712–715) to just
 * the next spell its controller plays this turn.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-032-298";
const HEXTECH_RAY = "ogn-009-298"; // [Action] Deal 3 to a unit at a battlefield. (1 energy + 1 fury)
const BOLT = {
  abilities: [{ effect: { amount: 2, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Reaction Bolt",
  timing: "reaction",
};

function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { fury: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 12 }, "foe")
    .gear(P1, CARD, "tome")
    .hand(P1, HEXTECH_RAY, "ray1")
    .hand(P1, HEXTECH_RAY, "ray2");
}

describe("Ravenborn Tome (ogn-032-298)", () => {
  test("cost: 3 energy to play; enters the base ready; unaffordable with 2 energy", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "tome").build();
    await game.p1.play("tome");
    expect(game.p1.energy()).toBe(0);
    expect(game.zoneOf("tome")).toBe("base");
    expect(game.state("tome").isReady).toBe(true);
    const poor = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "tome").build();
    expect(poor.p1.can("play", "tome")).toBe(false);
  });

  test("[Exhaust] cost: activating exhausts the Tome, costs no resources, and it cannot be activated again while exhausted", async () => {
    const game = await board().build();
    expect(game.p1.can("activate", "tome")).toBe(true);
    await game.p1.activate("tome");
    expect(game.state("tome").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 2, power: { fury: 2 } });
    await game.settle();
    expect(game.p1.can("activate", "tome")).toBe(false);
    const exhausted = await board().gear(P1, CARD, "tired", { exhausted: true }).build();
    expect(exhausted.p1.can("activate", "tired")).toBe(false);
  });

  test("the next spell you play this turn deals 1 Bonus Damage (Hextech Ray deals 4 instead of 3)", async () => {
    // Expected: after the Tome resolves, Hextech Ray's "Deal 3" is increased to 4 (rule 715.1).
    // Actual: the replacement is registered but never applied — the unit takes 3.
    const game = await board().build();
    await game.p1.activate("tome");
    await game.settle();
    await game.p1.cast("ray1", { targets: "foe" });
    await game.settle();
    expect(game.state("foe").damage).toBe(4);
  });

  test("only the NEXT spell is boosted — a second spell this turn deals its printed damage", async () => {
    const game = await board().build();
    await game.p1.activate("tome");
    await game.settle();
    await game.p1.cast("ray1", { targets: "foe" });
    await game.settle();
    const afterFirst = game.state("foe").damage;
    await game.p1.cast("ray2", { targets: "foe" });
    await game.settle();
    expect(game.state("foe").damage - afterFirst).toBe(3);
  });

  test("'this turn': an unused bonus expires — a spell played on your next turn deals its printed damage", async () => {
    const game = await board().build();
    await game.p1.activate("tome");
    await game.settle();
    await game.advanceToTurnOf(P2);
    await game.advanceToTurnOf(P1);
    expect(game.state("tome").isReady).toBe(true); // readied during Awaken
    await game.p1.tapRune(); // pools emptied at end of turn: rebuild 1 energy + 1 fury from runes
    await game.p1.recycleRune();
    await game.p1.cast("ray1", { targets: "foe" });
    await game.settle();
    expect(game.state("foe").damage).toBe(3);
  });

  test("only spells YOU play: an opponent's reaction played the same turn deals its printed damage", async () => {
    const game = await board().resources(P2, { energy: 1 }).hand(P2, BOLT, "bolt").build();
    await game.p1.activate("tome");
    await game.settle();
    await game.p1.cast("ray1", { targets: "foe" });
    await game.p1.passPriority();
    await game.p2.cast("bolt", { targets: "foe" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Bolt (top of chain) resolves first
    expect(game.zoneOf("bolt")).toBe("trash");
    expect(game.state("foe").damage).toBe(2);
  });
});
