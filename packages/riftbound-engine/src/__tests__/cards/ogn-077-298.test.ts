/**
 * Zhonya's Hourglass — ogn-077-298 · Gear · Calm · 2 energy
 *
 *   [Hidden] (Hide now for [rainbow] to react with later for [energy_0].)
 *   If a friendly unit would die, kill this instead. Heal that unit, exhaust it,
 *   and recall it. (Send it to base. This isn't a move.)
 *
 * Rules 811 (Hidden), 370.1.a.1 (the replaced death never happened), 438 (replacement).
 * Engine note: a [rainbow] pip is paid from `power.rainbow`.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-077-298";

/** Inline 1-energy action spell: deal 3 to a unit. */
const BOLT = {
  abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt",
  timing: "action",
};

function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .gear(P1, CARD, "zh")
    .unit(P1, "bf1", { might: 2 }, "ally")
    .unit(P2, "base", { might: 2 }, "foe")
    .hand(P1, BOLT, "bolt1")
    .hand(P1, BOLT, "bolt2");
}

describe("Zhonya's Hourglass (ogn-077-298)", () => {
  test("plays as a gear to base for 2 energy; 1 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "zh").build();
    await game.p1.play("zh");
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("zh")).toBe("base");
    expect(game.p1.gear()).toContain("zh");
    const poor = await scenario().resources(P1, { energy: 1 }).hand(P1, CARD, "zh").build();
    expect(poor.p1.can("play", "zh")).toBe(false);
  });

  test("[Hidden]: may be hidden face down at a battlefield you control for one power of any domain", async () => {
    const game = await scenario()
      .resources(P1, { energy: 0, power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .hand(P1, CARD, "zh")
      .build();
    expect(game.p1.can("hide", "zh")).toBe(true);
    const r = await game.p1.try((p) => p.hide("zh", "bf2"));
    expect(r.ok).toBe(false); // not a battlefield you control
    await game.p1.hide("zh", "bf1");
    expect(game.zoneOf("zh")).toBe("facedown-bf1");
    expect(game.state("zh").isHidden).toBe(true);
    expect(game.p1.resources().power.rainbow ?? 0).toBe(0);
    // Not playable from facedown on the turn it was hidden (rule 811.1.b "beginning on the next turn").
    expect(game.p1.can("reveal", "zh")).toBe(false);
  });

  test("hidden Hourglass can be played from face down on a later turn for 0 energy", async () => {
    const game = await scenario()
      .turn(3)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2 }, "ally")
      .facedown(P1, "bf1", CARD, "zh")
      .build();
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.can("reveal", "zh")).toBe(true);
    await game.p1.reveal("zh");
    await game.settle();
    expect(game.state("zh").isHidden).toBe(false);
    expect(["base", "battlefield-bf1"]).toContain(game.zoneOf("zh"));
    expect(game.p1.energy()).toBe(0);
  });

  // Expected: Hourglass → trash; ally healed (0 damage), exhausted, in base. Actual: the die
  // replacement swallows the death but runs none of its effects — Hourglass stays in base and
  // the unit is left on the battlefield carrying lethal damage.
  test("lethal damage to a friendly unit should kill the Hourglass instead and heal, exhaust and recall that unit (rules 438, 370.1.a.1)", async () => {
    const game = await board().build();
    await game.p1.cast("bolt1", { targets: "ally" }); // 3 damage to a 2-Might unit = lethal
    await game.settle();
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.zoneOf("ally")).toBe("base");
    expect(game.state("ally").damage).toBe(0);
    expect(game.state("ally").isExhausted).toBe(true);
    expect(game.p1.units("bf1")).toEqual([]);
  });

  // Expected: first save consumes (kills) the Hourglass, second bolt kills the unit. Actual: see above.
  test("the Hourglass is consumed by its first save, so a second lethal hit kills the unit", async () => {
    const game = await board().build();
    await game.p1.cast("bolt1", { targets: "ally" });
    await game.settle();
    expect(game.zoneOf("zh")).toBe("trash");
    await game.p1.cast("bolt2", { targets: "ally" });
    await game.settle();
    expect(game.zoneOf("ally")).toBe("trash");
  });

  // rule 319.6 / 319.8 + 518: revealing the gear at a battlefield completes a
  // play, so the following Cleanup recalls the loose gear to base immediately —
  // not only once some later move happens to run state maintenance.
  test("a gear revealed from Hidden is recalled to base by the Cleanup that follows the reveal", async () => {
    const game = await scenario()
      .turn(3)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2 }, "ally")
      .facedown(P1, "bf1", CARD, "zh")
      .build();
    await game.p1.reveal("zh");
    await game.settle();
    expect(game.zoneOf("zh")).toBe("base");
  });

  test("enemy units are not protected: an enemy unit taking lethal damage just dies and the Hourglass stays", async () => {
    const game = await board().build();
    await game.p1.cast("bolt1", { targets: "foe" });
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.zoneOf("zh")).toBe("base");
  });

  // Combat death is a death like any other — Hourglass dies, attacker recalled exhausted
  // at full health, defender holds.
  test("a friendly unit dying in combat should be saved by the Hourglass (killed instead; unit healed, exhausted, recalled)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .gear(P1, CARD, "zh")
      .unit(P1, "base", { might: 2 }, "ally")
      .unit(P2, "bf1", { might: 5 }, "wall")
      .build();
    await game.p1.move("ally", "bf1");
    await game.settle();
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.zoneOf("ally")).toBe("base");
    expect(game.state("ally").isExhausted).toBe(true);
    expect(game.state("ally").damage).toBe(0);
    expect(game.zoneOf("wall")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });
});
