/**
 * Crimson Pigeons — unl-154-219 · Unit · Order · 3 energy · 3 Might
 *
 *   I have +2 [Might] while I'm attacking with another unit.
 *
 * Head-judge checklist (trickiest situations for this card):
 *  1. It is a CONDITIONAL passive (364.3.a): at rest — in base, or parked at a battlefield outside
 *     combat — the Pigeons are a plain 3. The bonus exists only while they hold the Attacker
 *     designation AND at least one other attacking unit is with them.
 *  2. Attacking ALONE gives nothing: into a 3-Might defender it is a trade, not a clean kill. A
 *     friendly unit somewhere else (base / another battlefield) is not "attacking with" it.
 *  3. DEFENDING with another unit gives nothing either ("attacking", not "in combat").
 *  4. Continuous: if the partner is removed mid-showdown (killed by the defender's spell before
 *     damage), the Pigeons drop back to 3 before blows are exchanged; when the combat ends the
 *     Attacker designation is gone and so is the bonus.
 *  5. Two Pigeons attacking together are each other's "another unit" → 5 + 5.
 *  6. Cost 3, enters exhausted like any unit; printed Might 3 is what everything else reads at rest.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { P1, P2, peekDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-154-219";
/** Defender's showdown-speed removal: deal 2 to a unit. */
const BOLT = {
  abilities: [{ effect: { amount: 2, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt",
  timing: "action",
} as const;

/** P1's Pigeons (+ optional 1-might Sparrow) in base facing P2's `wall`-Might defender at bf1. */
function raid(wall: number, withSparrow = true) {
  const b = scenario().battlefield("bf1", { controller: P2 }).unit(P1, "base", CARD, "pig").unit(P2, "bf1", { might: wall, name: "Wall" }, "wall");
  return withSparrow ? b.unit(P1, "base", { might: 1, name: "Sparrow" }, "sparrow") : b;
}

describe("Crimson Pigeons (unl-154-219)", () => {
  test("registry payload — a 3-cost 3-Might unit whose only ability is a static self +2 Might gated on a REAL 'attacking with another unit' condition (not an always-true placeholder)", async () => {
    // Expected: condition encodes attacker-role + another friendly attacker (e.g. and[attacking, not while-alone]).
    // Actual: condition = { type: "custom", text: "while I'm attacking with another unit" }, which the
    // static evaluator treats as always true.
    await raid(3).build();
    const def = peekDefaultCardPool()?.get(CARD);
    expect(def).toMatchObject({ cardType: "unit", energyCost: 3, might: 3, name: "Crimson Pigeons" });
    expect(def?.powerCost ?? []).toEqual([]);
    const abilities = (def?.abilities ?? []) as { type: string; effect?: unknown; condition?: { type: string } }[];
    expect(abilities).toHaveLength(1);
    expect(abilities[0]).toMatchObject({ effect: { amount: 2, target: "self", type: "modify-might" }, type: "static" });
    expect(abilities[0]?.condition).toBeDefined();
    expect(abilities[0]?.condition?.type).not.toBe("custom");
    expect(JSON.stringify(abilities[0]?.condition)).toMatch(/attack/i);
  });

  test("cost: 3 energy, no power; enters the base exhausted with printed Might 3; 2 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "pig").build();
    await game.p1.play("pig");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("pig")).toBe("base");
    expect(game.state("pig")).toMatchObject({ baseMight: 3, isExhausted: true });
    expect((await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "pig").build()).p1.can("play", "pig")).toBe(false);
  });

  test("at rest (in base, nobody attacking) the Pigeons are a plain 3 Might", async () => {
    // Expected 3; actual 5 — the unparsed condition defaults to true so the +2 is always on.
    const game = await raid(3).build();
    expect(game.state("pig").combatRole).toBeNull();
    expect(game.state("pig").might).toBe(3);
    expect(game.state("pig").staticMightBonus).toBe(0);
  });

  test("attacking WITH another unit: Pigeons (3+2) + Sparrow (1) = 6 into a 5-Might Wall — the Wall dies and bf1 is conquered; during the showdown the Pigeons read 5", async () => {
    const game = await raid(5).build();
    await game.p1.move(["pig", "sparrow"], "bf1");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    expect(game.state("pig").combatRole).toBe("attacker");
    expect(game.state("sparrow").combatRole).toBe("attacker");
    expect(game.state("pig").might).toBe(5);
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("attacking ALONE gives no bonus — a lone Pigeons (3) into a 3-Might Wall is a trade: both die, nobody conquers", async () => {
    // Expected: 3 vs 3, both to trash, bf1 left without P1 control. Actual: Pigeons swing for 5, kill the Wall and survive.
    const game = await raid(3, false).build();
    await game.p1.move("pig", "bf1");
    expect(game.state("pig").combatRole).toBe("attacker");
    expect(game.state("pig").might).toBe(3);
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.zoneOf("pig")).toBe("trash");
    expect(game.p1.points()).toBe(0);
  });

  test("'with another unit' means another ATTACKER here — a friendly Sparrow left behind in base does not count (Pigeons attack at 3 and trade with a 3 Wall)", async () => {
    const game = await raid(3).build();
    await game.p1.move("pig", "bf1"); // Sparrow stays home
    expect(game.locationOf("sparrow")).toBe("base");
    expect(game.state("pig").might).toBe(3);
    await game.settle();
    expect(game.zoneOf("pig")).toBe("trash");
    expect(game.zoneOf("wall")).toBe("trash");
  });

  test("DEFENDING with another unit gives nothing — attacked at bf1 alongside the Sparrow, the Pigeons read 3 during the showdown", async () => {
    // Expected: defender Pigeons = 3. Actual: 5.
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "pig")
      .unit(P1, "bf1", { might: 1, name: "Sparrow" }, "sparrow")
      .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    expect(game.state("pig").combatRole).toBe("defender");
    expect(game.state("pig").might).toBe(3);
  });

  test("two Pigeons attacking together are each other's 'another unit': 5 + 5 = 10 kills a 9-Might Wall", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "pig")
      .unit(P1, "base", CARD, "pig2")
      .unit(P2, "bf1", { might: 9, name: "Wall" }, "wall")
      .build();
    await game.p1.move(["pig", "pig2"], "bf1");
    expect(game.state("pig").might).toBe(5);
    expect(game.state("pig2").might).toBe(5);
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("the bonus ends with the combat — after conquering alongside the Sparrow, the Pigeons parked at bf1 (no Attacker designation) are back to 3", async () => {
    // Expected: 5 during the attack, 3 afterwards. Actual: 5 forever.
    const game = await raid(2).build(); // a 2-Might Wall can't kill the Pigeons whichever way it assigns

    await game.p1.move(["pig", "sparrow"], "bf1");
    expect(game.state("pig").might).toBe(5);
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.locationOf("pig")).toBe("bf1");
    expect(game.state("pig").combatRole).toBeNull();
    expect(game.state("pig").might).toBe(3);
    await game.advanceTurn();
    expect(game.state("pig").might).toBe(3);
  });

  test("continuous re-evaluation — the defender Bolts the Sparrow dead mid-showdown, so the now-alone Pigeons swing for 3 and merely trade with a 3-Might Wall", async () => {
    // Expected: Sparrow dies to the Bolt; Pigeons (3) and Wall (3) kill each other; no conquer.
    // Actual: Pigeons still count 5, kill the Wall and survive to conquer.
    const game = await raid(3).resources(P2, { energy: 1 }).hand(P2, BOLT, "bolt").build();
    await game.p1.move(["pig", "sparrow"], "bf1");
    expect(game.state("pig").might).toBe(5); // partner present: bonus on
    await game.p1.passFocus();
    expect(game.actingSeat()).toBe(P2);
    await game.p2.cast("bolt", { targets: "sparrow" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Bolt resolves: Sparrow (1) takes 2 and dies
    expect(game.zoneOf("sparrow")).toBe("trash");
    expect(game.state("pig").might).toBe(3); // alone now
    await game.settle(); // both pass focus → combat damage
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.zoneOf("pig")).toBe("trash");
    expect(game.p1.points()).toBe(0);
  });

  test("negative space: the static is SELF-only — the Sparrow attacking alongside gets no Might from the Pigeons", async () => {
    const game = await raid(5).build();
    await game.p1.move(["pig", "sparrow"], "bf1");
    expect(game.state("sparrow").might).toBe(1);
    expect(game.state("sparrow").staticMightBonus).toBe(0);
    expect(game.state("wall").might).toBe(5);
  });
});
