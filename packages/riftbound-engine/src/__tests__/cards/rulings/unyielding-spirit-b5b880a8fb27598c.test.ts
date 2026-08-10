/**
 * Ruling b5b880a8fb27598c — Unyielding Spirit (OGN-145 → ogn-145-298) · Spell · Body · 1+[body] · Reaction
 *     "Prevent all spell and ability damage this turn."
 *   × Elder Dragon (UNL-118 → unl-118-219) · Unit · 10 Might "Any amount of your damage is enough to kill enemy units. …"
 *   × Flurry of Blades (OGN-133 → ogn-133-298) · Spell · Body · 1 · Reaction "Deal 1 to all units at battlefields."
 *
 * Q: The opponent has used Unyielding Spirit and has an Elder Dragon in base; they then play Flurry of Blades. Does the
 *    Dragon's "any amount kills" still wipe my units?
 * A: No. Unyielding Spirit prevents ALL spell damage this turn, so Flurry's 1s are prevented (treated as not dealt /
 *    0). With no damage dealt, Elder Dragon's lethality passive has nothing to apply to — my units survive.
 * Rules: 437.2.a / 437.4 (prevented damage is not dealt), 142.4.c (Elder Dragon's lethal-damage modifier needs damage).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const UNYIELDING_SPIRIT = "ogn-145-298";
const ELDER_DRAGON = "unl-118-219";
const FLURRY_OF_BLADES = "ogn-133-298";

/**
 * P2's turn (the opponent). P2: Elder Dragon in base, a 2-Might Guard holding bf1, Unyielding Spirit + Flurry in hand,
 * exactly 1+[body] + 1. P1 (me): a 4-Might Veteran and a 1-Might Recruit holding bf2.
 */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 2, power: { body: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "base", ELDER_DRAGON, "dragon")
    .unit(P2, "bf1", { might: 2, name: "Guard" }, "guard")
    .unit(P1, "bf2", { might: 4, name: "Veteran" }, "veteran")
    .unit(P1, "bf2", { might: 1, name: "Recruit" }, "recruit")
    .hand(P2, UNYIELDING_SPIRIT, "spirit")
    .hand(P2, FLURRY_OF_BLADES, "flurry");
}

describe("Ruling b5b880a8fb27598c — Unyielding Spirit blanks Flurry of Blades, so Elder Dragon kills nothing", () => {
  test("Unyielding Spirit resolves first; Flurry of Blades then deals NO damage to anything at a battlefield — my Veteran (4) and even my Recruit (1) survive undamaged despite Elder Dragon; so does their Guard", async () => {
    const game = await board().build();
    await game.p2.cast("spirit");
    await game.settle();
    expect(game.zoneOf("spirit")).toBe("trash");
    expect(game.p2.resources()).toEqual({ energy: 1, power: { body: 0 } });
    await game.p2.cast("flurry");
    expect(game.p2.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("flurry")).toBe("trash"); // it resolved — its damage was simply prevented
    expect(game.zoneOf("veteran")).toBe("battlefield-bf2");
    expect(game.zoneOf("recruit")).toBe("battlefield-bf2");
    expect(game.state("veteran").damage).toBe(0);
    expect(game.state("recruit").damage).toBe(0);
    expect(game.zoneOf("guard")).toBe("battlefield-bf1");
    expect(game.state("guard").damage).toBe(0);
    expect(game.zoneOf("dragon")).toBe("base"); // not at a battlefield; untouched either way
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — without Unyielding Spirit: Flurry's 1 damage IS dealt, and because it is the Dragon controller's damage it is lethal to BOTH my units (even the 4-Might Veteran); their own Guard just takes 1", async () => {
    const game = await board().build();
    await game.p2.cast("flurry");
    await game.settle();
    expect(game.zoneOf("flurry")).toBe("trash");
    expect(game.zoneOf("veteran")).toBe("trash");
    expect(game.zoneOf("recruit")).toBe("trash");
    expect(game.zoneOf("guard")).toBe("battlefield-bf1");
    expect(game.state("guard").damage).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});
