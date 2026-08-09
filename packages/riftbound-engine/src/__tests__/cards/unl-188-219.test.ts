/**
 * Hextech Gauntlets — unl-188-219 · Gear (Equipment) · Fury/Order · 3 energy · Might bonus +3
 *
 *   [Equip] [3][rainbow]. This ability's Energy cost is reduced by the Might of the unit you choose.
 *   (Pay the cost: Attach this to a unit you control.)
 *
 * Rules: 818.1.c.4 (text altering the Equip cost is applied when paying for the ability), 818.1.b.1 (the
 * unit is the ability's target — chosen, then the cost is computed from ITS Might), 710 (current Might:
 * base + buffs + attached bonuses…), 356.4 (a reduction cannot take a cost below 0 — no refund),
 * [rainbow] = one power of ANY domain, 821 (Weaponmaster: Equip for [rainbow] less, cost alterations
 * included — 206.1 example), 137.3 (+3 only while attached).
 *
 * Head-judge checklist — trickiest situations for THIS card:
 *  1. The reduction is on the EQUIP ability only: playing the Gauntlets from hand is a flat 3 energy, no
 *     power, regardless of what units I have.
 *  2. Sliding scale: 1-Might wearer → [2][R]; 2 → [1][R]; 3 → [0][R]; 7 → still [0][R] (never negative,
 *     the power pip is never waived).
 *  3. "Might" is CURRENT Might: a buffed 1-Might unit (2) pays [1]; damage does not lower Might.
 *  4. Affordability is per target: with 1 energy only units of Might ≥ 2 are legal choices; with no
 *     power at all nothing is (any domain pays the [rainbow]).
 *  5. Weaponmaster (Armed Assailant, 6 Might): [3][R] − 6 Might − [R] = completely free → 9 Might.
 *  6. Enemy units are never "a unit you control".
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-188-219";
const ARMED_ASSAILANT = "sfd-002-221"; // 6 energy + [fury], 6 Might, [Weaponmaster]

/** P1: 5 energy + 1 fury; units of Might 1 / 2 / 3 / 7 in base, an enemy 2 in P2's base; Gauntlets unattached in base. */
function board(energy = 5, power: Record<string, number> = { fury: 1 }) {
  return scenario()
    .resources(P1, { energy, power })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 1, name: "Tinkerer" }, "m1")
    .unit(P1, "base", { might: 2, name: "Bruiser" }, "m2")
    .unit(P1, "base", { might: 3, name: "Enforcer" }, "m3")
    .unit(P1, "base", { might: 7, name: "Colossus" }, "m7")
    .unit(P2, "base", { might: 2, name: "Their Bruiser" }, "foe")
    .gear(P1, CARD, "hg");
}

const equipTargets = (game: Game) =>
  game.p1
    .legal()
    .filter((o) => o.moveId === "equipCard")
    .flatMap((o) => o.variants)
    .filter((v) => v.params.equipmentId === "hg")
    .map((v) => v.params.unitId as string)
    .sort();

async function equip(game: Game, unit: string): Promise<void> {
  await game.p1.choose("equipCard", { params: { equipmentId: "hg", unitId: unit } });
  await game.settle();
  expect(game.state("hg").attachedTo).toBe(unit);
}

describe("Hextech Gauntlets (unl-188-219)", () => {
  test("registry payload: Fury/Order Equipment, 3 to play, +3 bonus, [Equip] base cost [3][rainbow] with the target-Might reduction marker", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({
      cardType: "equipment",
      domain: ["fury", "order"],
      energyCost: 3,
      interactiveCostReduction: "target-might",
      mightBonus: 3,
      name: "Hextech Gauntlets",
    });
    // Effect Text (gallery `effect`, rule 136 / 150.2 / 718.3): "When I conquer, if you assigned 3 or more excess damage, draw 1." —
    // conferred on the equipped unit while attached, hence the `effectText: true` entries.
    expect(def?.abilities).toEqual([
      { cost: { energy: 3, power: ["rainbow"] }, keyword: "Equip", type: "keyword" },
      { condition: { amount: 3, type: "excess-damage-assigned" }, effect: { amount: 1, type: "draw" }, effectText: true, trigger: { event: "conquer", on: "self" }, type: "triggered" },
    ] as never);
  });

  test("playing it from hand is a flat 3 energy and no power — the Might reduction belongs to the Equip ability, not the card", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).unit(P1, "base", { might: 7 }, "m7").hand(P1, CARD, "hg").build();
    expect(game.p1.can("play", "hg")).toBe(true);
    await game.p1.play("hg");
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.zoneOf("hg")).toBe("base");
    expect(game.state("hg").attachedTo).toBeUndefined();
    const short = await scenario().resources(P1, { energy: 2, power: { fury: 3 } }).unit(P1, "base", { might: 7 }, "m7").hand(P1, CARD, "hg").build();
    expect(short.p1.can("play", "hg")).toBe(false);
  });

  test("Equip onto a 1-Might unit: [3] − 1 = 2 energy + one power → +3 (Might 4)", async () => {
    const game = await board().build();
    await equip(game, "m1");
    expect(game.p1.resources()).toEqual({ energy: 3, power: { fury: 0 } });
    expect(game.state("m1")).toMatchObject({ attachments: ["hg"], baseMight: 1, might: 4 });
  });

  test("Equip onto a 2-Might unit costs 1 energy; onto a 3-Might unit costs 0 energy — the [rainbow] pip is always paid", async () => {
    const two = await board().build();
    await equip(two, "m2");
    expect(two.p1.resources()).toEqual({ energy: 4, power: { fury: 0 } });
    expect(two.state("m2").might).toBe(5);
    const three = await board().build();
    await equip(three, "m3");
    expect(three.p1.resources()).toEqual({ energy: 5, power: { fury: 0 } });
    expect(three.state("m3").might).toBe(6);
  });

  test("no refund below zero: a 7-Might wearer still costs exactly [0] + one power (energy untouched, not increased)", async () => {
    const game = await board(0).build();
    expect(equipTargets(game)).toContain("m7");
    await equip(game, "m7");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.state("m7").might).toBe(10);
  });

  test("affordability is per chosen unit: with 1 energy the 1-Might Tinkerer (needs 2) is NOT a legal choice, the others are; the enemy never is", async () => {
    const game = await board(1).build();
    expect(equipTargets(game)).toEqual(["m2", "m3", "m7"]);
    const r = await game.p1.try((p) => p.choose("equipCard", { params: { equipmentId: "hg", unitId: "m1" } }));
    expect(r.ok).toBe(false);
    const foe = await game.p1.try((p) => p.choose("equipCard", { params: { equipmentId: "hg", unitId: "foe" } }));
    expect(foe.ok).toBe(false);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } });
  });

  test("the power pip is mandatory: with 9 energy but no power of any domain nothing can wear the Gauntlets", async () => {
    const game = await board(9, {}).build();
    expect(equipTargets(game)).toEqual([]);
    // …while any single power (order here) unlocks every unit.
    const order = await board(9, { order: 1 }).build();
    expect(equipTargets(order)).toEqual(["m1", "m2", "m3", "m7"]);
  });

  test("CURRENT Might counts: a buffed 1-Might unit (2) pays [1]; a damaged 3-Might unit still pays [0]", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5, power: { fury: 1 } })
      .unit(P1, "base", { might: 1, name: "Buffed Tinkerer" }, "buffed", { buffed: true })
      .gear(P1, CARD, "hg")
      .build();
    expect(game.state("buffed").might).toBe(2);
    await equip(game, "buffed");
    expect(game.p1.energy()).toBe(4);
    expect(game.state("buffed").might).toBe(5);
    const hurt = await scenario()
      .resources(P1, { energy: 0, power: { fury: 1 } })
      .unit(P1, "base", { might: 3, name: "Wounded Enforcer" }, "wounded", { damage: 2 })
      .gear(P1, CARD, "hg")
      .build();
    expect(hurt.state("wounded").might).toBe(3);
    await equip(hurt, "wounded");
    expect(hurt.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  });

  test("the Equip is a chain item: cost is paid up front, the +3 arrives only on resolution", async () => {
    const game = await board().build();
    await game.p1.choose("equipCard", { params: { equipmentId: "hg", unitId: "m2" } });
    expect(game.p1.resources()).toEqual({ energy: 4, power: { fury: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "hg", controller: P1 })]);
    expect(game.state("m2").might).toBe(2);
    await game.settle();
    expect(game.state("m2").might).toBe(5);
    expect(game.violations()).toEqual([]);
  });

  test("partner — Weaponmaster (Armed Assailant, 6 Might): [3][rainbow] − 6 − [rainbow] = free; it wears the Gauntlets as a 9 with the pool untouched", async () => {
    const game = await scenario().resources(P1, { energy: 6, power: { fury: 1, order: 1 } }).gear(P1, CARD, "hg").hand(P1, ARMED_ASSAILANT, "aa").build();
    await game.p1.play("aa");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0, order: 1 } }); // the unit itself: 6 + [fury]
    expect(game.decision()).toMatchObject({ allowDecline: true, kind: "pick", seat: P1 });
    await game.p1.pick("hg");
    await game.settle();
    expect(game.state("hg").attachedTo).toBe("aa");
    expect(game.state("aa").might).toBe(9);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0, order: 1 } }); // nothing more was paid
  });
});
