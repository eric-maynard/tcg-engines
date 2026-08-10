/**
 * Ruling dc2a75f82ecfc7c5 — Elder Dragon (UNL-118 → unl-118-219) · Unit · Body · 12 · 10 Might
 *     "Any amount of your damage is enough to kill enemy units. When you play me, choose up to one enemy unit at each
 *      location. Deal 1 to them."
 *   × Flurry of Blades (OGN-133 → ogn-133-298) · [Reaction] · 1 · "Deal 1 to all units at battlefields."
 *
 * Q: With Elder Dragon on the battlefield, if Flurry of Blades is played, do MY units die?
 * A: No. Elder Dragon only makes YOUR damage lethal to ENEMY units. When you (Elder Dragon's controller) play Flurry, your
 *    units take 1 normally and survive; every enemy unit at a battlefield takes 1 and dies. It never changes how damage
 *    affects your own units (so an opponent's Flurry is just 1 damage all round).
 * Rules: 142.4.c (lethal-damage modifier — Elder Dragon is the CR example), 432 (damage), 359 (spell resolution).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const ELDER_DRAGON = "unl-118-219";
const FLURRY_OF_BLADES = "ogn-133-298";

/**
 * P1 controls Elder Dragon at bf1 alongside a 3-Might Squire; P2 has a 5-Might Brute at bf1's neighbour bf2 and a 4-Might
 * Guard at bf1 (no combat — nobody moves). A P2 Idler sits in base (not "at a battlefield"). Both players hold a Flurry.
 */
function board(active: typeof P1 | typeof P2) {
  return scenario()
    .active(active)
    .resources(P1, { energy: 1 })
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", ELDER_DRAGON, "elder")
    .unit(P1, "bf1", { might: 3, name: "Squire" }, "squire")
    .unit(P2, "bf2", { might: 5, name: "Brute" }, "brute")
    .unit(P2, "bf2", { might: 4, name: "Guard" }, "guard")
    .unit(P2, "base", { might: 2, name: "Idler" }, "idler")
    .hand(P1, FLURRY_OF_BLADES, "flurry1")
    .hand(P2, FLURRY_OF_BLADES, "flurry2");
}

describe("Ruling dc2a75f82ecfc7c5 — Elder Dragon + Flurry of Blades: only ENEMY units die to YOUR 1 damage", () => {
  test("P1 (Elder Dragon's controller) plays Flurry: P1's Elder Dragon and Squire take 1 and SURVIVE; P2's Brute (5) and Guard (4) take 1 and DIE; the Idler in base is untouched", async () => {
    const game = await board(P1).build();
    await game.p1.cast("flurry1");
    await game.settle();
    expect(game.zoneOf("flurry1")).toBe("trash");
    // Your own units: 1 damage, not lethal.
    expect(game.state("elder")).toMatchObject({ damage: 1, zone: "battlefield-bf1" });
    expect(game.state("squire")).toMatchObject({ damage: 1, zone: "battlefield-bf1" });
    // Enemy units at battlefields: any amount of P1's damage kills them.
    expect(game.zoneOf("brute")).toBe("trash");
    expect(game.zoneOf("guard")).toBe("trash");
    // Not at a battlefield: no damage at all.
    expect(game.state("idler")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.p1.units("bf1").sort()).toEqual(["elder", "squire"]);
    expect(game.violations()).toEqual([]);
  });

  test("P2 (the opponent) plays Flurry instead: that is not 'your damage' for Elder Dragon — every unit at a battlefield just takes 1 and nobody dies", async () => {
    const game = await board(P2).build();
    await game.p2.cast("flurry2");
    await game.settle();
    expect(game.zoneOf("flurry2")).toBe("trash");
    expect(game.state("elder")).toMatchObject({ damage: 1, zone: "battlefield-bf1" });
    expect(game.state("squire")).toMatchObject({ damage: 1, zone: "battlefield-bf1" });
    expect(game.state("brute")).toMatchObject({ damage: 1, zone: "battlefield-bf2" });
    expect(game.state("guard")).toMatchObject({ damage: 1, zone: "battlefield-bf2" });
    expect(game.state("idler")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.violations()).toEqual([]);
  });
});
