/**
 * Ruling 2b752b5a2c3264d5 — Siphon Power (OGN-266 → ogn-266-298, Reaction, 2 + 1 power)
 *   "Choose a battlefield. Give friendly units there +1 [Might] this turn and enemy units there -1 [Might] this turn, to a
 *    minimum of 1 [Might]."   (same pattern: Grand Strategem ogn-233, Discipline ogn-058, Stupefy ogn-095)
 *
 * Q: Does the +1/-1 apply to units that move to the chosen battlefield AFTER the spell resolves?
 * A: No. "Give" is a one-shot at resolution: only units there at that moment get +1/-1 (and keep it for the turn even
 *    if they leave); the battlefield gains no aura, so later arrivals are unaffected.
 * Rules: 359 (effects are applied on resolution to the objects they identify then), 702 ("give … this turn" is a
 *        modification on the unit, not on the location).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SIPHON_POWER = "ogn-266-298";

/**
 * P1's turn. P1 controls bf1 with Ally (3) on it and has Latecomer (3, ready) in base; P2 controls bf2 with Foe (3).
 * P1: Siphon Power with exactly 2 + [mind].
 */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { mind: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 3, name: "Ally" }, "ally")
    .unit(P1, "base", { might: 3, name: "Latecomer" }, "late")
    .unit(P2, "bf2", { might: 3, name: "Foe" }, "foe")
    .hand(P1, SIPHON_POWER, "siphon");
}

describe("Ruling 2b752b5a2c3264d5 — Siphon Power is a one-shot 'give': later arrivals get nothing, leavers keep it", () => {
  test("friendly side: Siphon on bf1 gives Ally +1 (4); Latecomer then moves to bf1 and stays 3; Ally moved back to base KEEPS its +1 for the turn", async () => {
    const game = await board().build();
    await game.p1.cast("siphon", { targets: "bf1" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    await game.settle();
    expect(game.zoneOf("siphon")).toBe("trash");
    expect(game.state("ally")).toMatchObject({ might: 4, mightModifier: 1 });
    expect(game.state("late")).toMatchObject({ might: 3, mightModifier: 0 });
    expect(game.state("foe")).toMatchObject({ might: 3, mightModifier: 0 }); // not at the chosen battlefield
    // A unit arriving afterwards is not affected …
    await game.p1.move("late", "bf1");
    await game.settle();
    expect(game.locationOf("late")).toBe("bf1");
    expect(game.state("late")).toMatchObject({ might: 3, mightModifier: 0 });
    // … and the unit that received it keeps it after leaving.
    await game.p1.move("ally", "base");
    await game.settle();
    expect(game.locationOf("ally")).toBe("base");
    expect(game.state("ally")).toMatchObject({ might: 4, mightModifier: 1 });
    expect(game.violations()).toEqual([]);
  });

  test("enemy side: Siphon on bf2 gives the enemy Foe -1 (2); P1's Latecomer attacking into bf2 afterwards is still 3 (no +1 for arriving there), Foe still 2", async () => {
    const game = await board().build();
    await game.p1.cast("siphon", { targets: "bf2" });
    await game.settle();
    expect(game.state("foe")).toMatchObject({ might: 2, mightModifier: -1 });
    expect(game.state("ally")).toMatchObject({ might: 3, mightModifier: 0 });
    await game.p1.move("late", "bf2"); // opens a combat showdown at bf2
    expect(game.locationOf("late")).toBe("bf2");
    expect(game.state("late")).toMatchObject({ might: 3, mightModifier: 0 });
    expect(game.state("foe")).toMatchObject({ might: 2, mightModifier: -1 });
  });

  test("'this turn': the modifiers are gone once the turn ends", async () => {
    const game = await board().build();
    await game.p1.cast("siphon", { targets: "bf1" });
    await game.settle();
    expect(game.state("ally").might).toBe(4);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("ally")).toMatchObject({ might: 3, mightModifier: 0 });
  });
});
