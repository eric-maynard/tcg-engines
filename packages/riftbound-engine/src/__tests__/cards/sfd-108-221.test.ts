/**
 * Warmog's Armor — sfd-108-221 · Gear (Equipment) · Body · 1 energy · Might bonus +1
 *
 *   [Equip] [body] ([body]: Attach this to a unit you control.)
 *
 * Rules: 818 Equip (activated, target = a unit YOU control, uses the chain — 818.1.c.1 / 377.3);
 * 149.1 gear enters ready; 137.3.a bonus only while attached; 135.2.e.5.b universal ([rainbow])
 * power in the pool may pay a [body] pip, off-domain power may not; 434.4 attaching to a unit at a
 * battlefield relocates the gear there without a Move; 719.5 / 457.1 wearer leaves → gear detaches
 * and is recalled; 151.2 / 381 timing; 821 Weaponmaster pays Equip − [rainbow] (here: nothing).
 *
 * Head-judge corner cases covered here:
 *   1. The Equip cost is pure power: energy is never touched by it, and energy alone can't pay it;
 *      [fury] can't; stored universal power can.
 *   2. Veteran Poro (Body Weaponmaster): [body] − [rainbow] = free — attaches with an empty pool.
 *   3. Two Equipment on one unit: Warmog's +1 and Skyfall's +2 simply add (2 → 5).
 *   4. The +1 matters on DEFENSE as much as offense: a 3+1 holder survives a 3-Might attacker.
 *   5. Equipping a unit that is already at a battlefield: the Armor jumps there, no showdown opens.
 *   6. Wearer dies → Armor back in base, loose, re-equippable; timing walls (opponent's turn, showdown).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-108-221";
const VETERAN_PORO = "sfd-099-221"; // Body 2-cost 2-Might [Weaponmaster]
const SKYFALL = "sfd-030-221"; // Fury Equipment +2, Equip [1][fury]

type Built = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

async function equip(game: Built, unitId: string, equipmentId = "wm"): Promise<void> {
  await game.p1.choose("equipCard:-", { params: { equipmentId, unitId } });
  await game.settle();
}

function withArmor(power: Record<string, number> = { body: 1 }, energy = 0) {
  return scenario().resources(P1, { energy, power }).unit(P1, "base", { might: 2, name: "Ally" }, "ally").gear(P1, CARD, "wm");
}

describe("Warmog's Armor (sfd-108-221)", () => {
  test("registry payload: Body equipment, 1 energy, +1 Might bonus, one [Equip] keyword ability costing exactly [body] (no energy)", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "equipment", domain: "body", energyCost: 1, mightBonus: 1, name: "Warmog's Armor" });
    // Effect Text (gallery `effect`, rule 136 / 150.2 / 718.3): "When I conquer, buff me. (If I don't have a buff, I get a +1 [Might] buff.)" —
    // conferred on the equipped unit while attached, hence the `effectText: true` entries.
    expect(def?.abilities).toEqual([
      { cost: { power: ["body"] }, keyword: "Equip", type: "keyword" },
      { effect: { target: "self", type: "buff" }, effectText: true, trigger: { event: "conquer", on: "self" }, type: "triggered" },
    ] as never);
  });

  test("play cost is 1 energy, no power: enters the base ready and unattached; with 0 energy (even holding body power) it cannot be played", async () => {
    const game = await scenario().resources(P1, { energy: 1 }).unit(P1, "base", { might: 2 }, "ally").hand(P1, CARD, "wm").build();
    await game.p1.play("wm");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("wm")).toBe("base");
    expect(game.state("wm")).toMatchObject({ attachedTo: undefined, isReady: true });
    expect(game.state("ally").might).toBe(2);
    const poor = await scenario().resources(P1, { energy: 0, power: { body: 3 } }).hand(P1, CARD, "wm").build();
    expect(poor.p1.can("play", "wm")).toBe(false);
  });

  test("Equip [body]: one body power is spent (energy untouched), a chain item the opponent may answer, then +1 Might on the wearer", async () => {
    const game = await withArmor({ body: 2 }, 3).build();
    await game.p1.choose("equipCard:-", { params: { equipmentId: "wm", unitId: "ally" } });
    expect(game.p1.resources()).toEqual({ energy: 3, power: { body: 1 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "wm", controller: P1 })]);
    expect(game.state("ally").might).toBe(2);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    await game.settle();
    expect(game.state("wm").attachedTo).toBe("ally");
    expect(game.state("ally")).toMatchObject({ attachments: ["wm"], baseMight: 2, might: 3 });
    expect(game.violations()).toEqual([]);
  });

  test("cost domain: energy alone ✗, [fury] ✗, [body] ✓, stored universal power ✓ (135.2.e.5.b)", async () => {
    expect((await withArmor({}, 5).build()).p1.can("equipCard")).toBe(false);
    expect((await withArmor({ fury: 2 }, 5).build()).p1.can("equipCard")).toBe(false);
    expect((await withArmor({ body: 1 }).build()).p1.can("equipCard")).toBe(true);
    const any = await withArmor({ rainbow: 1 }).build();
    expect(any.p1.can("equipCard")).toBe(true);
    await equip(any, "ally");
    expect(any.state("ally").might).toBe(3);
    expect(any.p1.power()).toBe(0);
  });

  test("'a unit you control': the enemy unit is not a legal target; a friendly unit AT A BATTLEFIELD is, and the Armor relocates there without opening a showdown (434.4)", async () => {
    const game = await withArmor()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Afield" }, "afield")
      .unit(P2, "base", { might: 2 }, "enemy")
      .build();
    const units = game.p1.option("equipCard")?.fields.find((f) => f.name === "unitId")?.options;
    expect([...(units ?? [])].toSorted()).toEqual(["afield", "ally"]);
    expect((await game.p1.try((p) => p.choose("equipCard:-", { params: { equipmentId: "wm", unitId: "enemy" } }))).ok).toBe(false);
    await equip(game, "afield");
    expect(game.zoneOf("wm")).toBe("battlefield-bf1");
    expect(game.state("afield").might).toBe(4);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("the +1 matters on defense: a 3+1 holder takes a 3-Might attacker's hit and lives; the attacker dies", async () => {
    const game = await scenario()
      .resources(P1, { power: { body: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
      .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
      .gear(P1, CARD, "wm")
      .build();
    await equip(game, "holder");
    expect(game.state("holder").might).toBe(4);
    await game.advanceTurn();
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash"); // took 4 ≥ 3
    expect(game.zoneOf("holder")).toBe("battlefield-bf1"); // took 3 < 4
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.state("wm").attachedTo).toBe("holder");
  });

  test("stacks with other Equipment: Warmog's (+1) and Skyfall of Areion (+2) on the same 2-Might unit → 5, both listed as attachments", async () => {
    const game = await withArmor({ body: 1, fury: 1 }, 1).gear(P1, SKYFALL, "sky").build();
    await equip(game, "ally", "wm");
    await equip(game, "ally", "sky");
    expect(game.state("ally").might).toBe(5);
    expect([...game.state("ally").attachments].toSorted()).toEqual(["sky", "wm"]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0, fury: 0 } });
  });

  test("wearer dies in combat (2+1 into a 5): the Armor detaches, returns to base loose, and can be equipped again for another [body]", async () => {
    const game = await withArmor({ body: 2 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5 }, "wall")
      .unit(P1, "base", { might: 1, name: "Heir" }, "heir")
      .build();
    await equip(game, "ally");
    await game.p1.move("ally", "bf1");
    await game.settle();
    expect(game.zoneOf("ally")).toBe("trash");
    expect(game.zoneOf("wm")).toBe("base");
    expect(game.state("wm").attachedTo).toBeUndefined();
    await equip(game, "heir");
    expect(game.state("heir").might).toBe(2);
    expect(game.p1.power("body")).toBe(0);
  });

  test("Weaponmaster (Veteran Poro): [body] − [rainbow] = nothing owed — with an empty pool after paying 2 for the Poro it still takes the Armor (2 → 3)", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).gear(P1, CARD, "wm").hand(P1, VETERAN_PORO, "poro").build();
    await game.p1.play("poro");
    expect(game.decision()).toMatchObject({ allowDecline: true, kind: "pick", seat: P1 });
    expect((game.decision() as { options: { card?: string }[] }).options.map((o) => o.card)).toEqual(["wm"]);
    await game.p1.pick("wm");
    await game.settle();
    expect(game.state("wm").attachedTo).toBe("poro");
    expect(game.state("poro").might).toBe(3);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
  });

  test("Weaponmaster is a 'may': declining leaves the Armor loose and the Poro at 2", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).gear(P1, CARD, "wm").hand(P1, VETERAN_PORO, "poro").build();
    await game.p1.play("poro");
    await game.p1.decline();
    await game.settle();
    expect(game.state("wm").attachedTo).toBeUndefined();
    expect(game.state("poro").might).toBe(2);
  });

  test("timing (151.2 / 381): no Equip on the opponent's turn or with Focus in a showdown; and none while already attached (718.2)", async () => {
    const opp = await withArmor().active(P2).build();
    expect(opp.p1.legal().map((o) => o.moveId)).not.toContain("equipCard");

    const sd = await withArmor().battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 3 }, "def").unit(P1, "base", { might: 3 }, "atk").build();
    expect(sd.p1.can("equipCard")).toBe(true);
    await sd.p1.move("atk", "bf1");
    expect(sd.decision()).toMatchObject({ context: "showdown", seat: P1 });
    expect(sd.p1.can("equipCard")).toBe(false);

    const worn = await withArmor({ body: 3 }).unit(P1, "base", { might: 2 }, "second").build();
    await equip(worn, "ally");
    expect(worn.p1.can("equipCard")).toBe(false);
    expect((await worn.p1.try((p) => p.choose("equipCard:-", { params: { equipmentId: "wm", unitId: "second" } }))).ok).toBe(false);
  });
});
