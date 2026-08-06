/**
 * Pirate's Haven — ogn-143-298 · Gear · Body · 3 energy
 *
 *   When you ready a friendly unit, give it +1 [Might] this turn.
 *
 * Rule 415: readying happens via effects (415.3.b) and during your Awaken Phase (415.3.a);
 * a unit that is already ready cannot be readied again (415.1.b/c) so nothing triggers.
 *
 * Units are exhausted through the engine (a standard move to an empty battlefield) rather
 * than seeded exhausted, so the ready effect is observed end-to-end.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const HAVEN = "ogn-143-298";
const WALLOP = "ogn-146-298"; // 2-energy Body action: "Ready a unit."

function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .gear(P1, HAVEN, "haven")
    .unit(P1, "base", { might: 2, name: "Mover" }, "mover")
    .unit(P1, "base", { might: 2, name: "Fresh" }, "fresh")
    .hand(P1, WALLOP, "wallop");
}

describe("Pirate's Haven (ogn-143-298)", () => {
  test("costs 3 energy to play to base; not playable with 2", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, HAVEN, "haven").build();
    await game.p1.play("haven");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("haven")).toBe("base");
    const poor = await scenario().resources(P1, { energy: 2 }).hand(P1, HAVEN, "haven").build();
    expect(poor.p1.can("play", "haven")).toBe(false);
  });

  test("readying an exhausted friendly unit gives THAT UNIT +1 Might this turn only", async () => {
    // Expected: the readied unit goes 2 → 3 Might until end of turn. Actual: the trigger fires but
    // its modify-might targets the gear itself ("self"), so the unit stays at 2.
    const game = await board().build();
    await game.p1.move("mover", "bf1"); // exhausts it
    expect(game.state("mover").isExhausted).toBe(true);
    await game.p1.cast("wallop", { targets: "mover" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Wallop resolves → ready → Haven triggers
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "haven", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.state("mover").isReady).toBe(true);
    expect(game.state("mover").might).toBe(3);
    expect(game.state("fresh").might).toBe(2); // only the readied unit
    await game.advanceTurn();
    expect(game.state("mover").might).toBe(2); // "this turn"
  });

  test("an already-ready unit is not 'readied' (rule 415.1.c): no trigger, no bonus", async () => {
    const game = await board().build();
    await game.p1.cast("wallop", { targets: "fresh" });
    await game.settle();
    expect(game.state("fresh").might).toBe(2);
    expect(game.state("fresh").mightModifier).toBe(0);
  });

  test("readying an ENEMY unit gives nothing (friendly only)", async () => {
    const game = await scenario()
      .turn(1)
      .active(P2)
      .battlefield("bf1", { controller: P2 })
      .gear(P1, HAVEN, "haven")
      .unit(P2, "base", { might: 2, name: "Foe" }, "foe")
      .hand(P1, WALLOP, "wallop")
      .build();
    await game.p2.move("foe", "bf1"); // P2 exhausts their unit
    await game.advanceTurn(); // → P1's turn; only P1's objects ready in Awaken
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("foe").isExhausted).toBe(true);
    await game.p1.do("addResources", { energy: 2 });
    await game.p1.cast("wallop", { targets: "foe" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Wallop resolves
    expect(game.chain()).toEqual([]); // no Haven trigger
    expect(game.state("foe").isReady).toBe(true);
    expect(game.state("foe").might).toBe(2);
  });

  test("'you ready': the opponent readying their own unit does not trigger your Haven", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 2 })
      .battlefield("bf1", { controller: P2 })
      .gear(P1, HAVEN, "haven")
      .unit(P2, "base", { might: 2 }, "theirs")
      .hand(P2, WALLOP, "wallop")
      .build();
    await game.p2.move("theirs", "bf1");
    await game.p2.cast("wallop", { targets: "theirs" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Wallop resolves
    expect(game.chain()).toEqual([]); // no Haven trigger
    expect(game.state("theirs").isReady).toBe(true);
    expect(game.state("theirs").might).toBe(2);
  });

  test("Awaken Phase readying (rule 415.3.a) is 'you ready' — exhausted friendly units should get +1 Might on your new turn", async () => {
    // Expected: the exhausted unit readied by P1's Awaken step triggers Haven → 3 Might during
    // P1's turn; the already-ready one is not readied (415.1.c) → stays 2. Actual: the Awaken
    // readyAll does not fire "ready" triggers, so both stay at 2.
    const game = await scenario()
      .turn(2)
      .active(P2)
      .gear(P1, HAVEN, "haven")
      .unit(P1, "base", { might: 2 }, "tired", { exhausted: true })
      .unit(P1, "base", { might: 2 }, "fresh")
      .build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("tired").isReady).toBe(true);
    expect(game.state("tired").might).toBe(3);
    expect(game.state("fresh").might).toBe(2);
  });
});
