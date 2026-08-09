/**
 * Blade of the Ruined King — sfd-178-221 · Gear — Equipment · Order · 3 energy + [order] · +4 Might
 *
 *   [Equip] — [order], Kill a friendly unit (Pay the cost: Attach this to a unit you control.)
 *
 * Rules: 818.1.c.3 (an Equip cost may mix resource and NON-resource parts — here [order] AND killing a
 * friendly unit; both must be paid to activate), 818.1.b.1 + 356/358.1 (the unit to attach to is a target
 * chosen before costs are paid and re-checked afterwards — sacrificing the very unit you target undoes
 * the activation, so a SECOND friendly unit is required), 377.3 (activated ability → chain → attach on
 * resolution), 359.2.d (playing the gear just puts it in base ready; no Quick-Draw), 821.1.c (Weaponmaster
 * reduces the Equip cost by [rainbow] only — the kill is not a resource and is still owed; 821.1.c.5 if
 * it can't be paid nothing attaches), 186.1 (a killed token ceases to exist), 355.10.c (the kill is a
 * cost, not a target: it cannot be responded to and is never refunded).
 *
 * Head-judge notes — trickiest situations for THIS card:
 *  1. The sacrifice is MANDATORY: after a resolved Equip exactly one other friendly unit is in the trash.
 *  2. Only one friendly unit on board → Equip is impossible (it would have to be both fodder and holder).
 *  3. Enemy units can be neither the holder nor the fodder.
 *  4. Weaponmaster (Veteran Poro) with no other unit to kill must NOT get the Blade for free.
 *  5. If the holder-to-be dies in response to the Equip item, the Blade stays loose in base — but the
 *     [order] and the fodder are gone for good (costs are paid on activation).
 *  6. Plain clauses: play cost 3 + [order] (short on either → illegal), +4 only while attached.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-178-221";
const VETERAN_PORO = "sfd-099-221"; // 2-cost 2-Might [Weaponmaster]
const CULL = {
  abilities: [{ effect: { target: { type: "unit" }, type: "kill" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "order",
  energyCost: 1,
  name: "Test Cull",
  timing: "reaction",
};

const equipVariants = (game: Game) =>
  game.p1.legal().filter((o) => o.moveId === "equipCard").flatMap((o) => o.variants.map((v) => v.params));

/** Activate the Blade's Equip onto `unit`, naming `fodder` as the sacrifice however the engine asks for it. Leaves the item on the chain. */
async function equipKilling(game: Game, unit: string, fodder: string): Promise<void> {
  const viaCosts = await game.p1.try((p) => p.choose("equipCard:-", { params: { equipmentId: "botrk", unitId: unit }, sacrifice: fodder }));
  if (!viaCosts.ok) {
    await game.p1.do("equipCard", { equipmentId: "botrk", unitId: unit });
  }
  for (let i = 0; i < 3; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      await game.p1.pick(fodder);
    }
  }
}

function loose(order = 1) {
  return scenario()
    .resources(P1, { energy: 0, power: { order } })
    .unit(P1, "base", { might: 2, name: "Heir" }, "heir")
    .unit(P1, "base", { might: 1, name: "Fodder" }, "fodder")
    .unit(P2, "base", { might: 3, name: "Foe" }, "foe")
    .gear(P1, CARD, "botrk");
}

describe("Blade of the Ruined King (sfd-178-221)", () => {
  test("registry payload: 3-energy + [order] Order Equipment, +4, one Equip keyword whose cost is [order] AND kill a friendly unit", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "equipment", domain: "order", energyCost: 3, mightBonus: 4, name: "Blade of the Ruined King", powerCost: ["order"] });
    expect(def?.abilities).toEqual([
      { cost: { kill: { controller: "friendly", type: "unit" }, power: ["order"] }, keyword: "Equip", type: "keyword" },
    ]);
  });

  test("play cost: 3 energy + 1 order; enters the base ready and unattached (no Quick-Draw, nothing dies); short on energy or on order ⇒ not playable", async () => {
    const game = await scenario().resources(P1, { energy: 3, power: { order: 1 } }).unit(P1, "base", { might: 1 }, "fodder").hand(P1, CARD, "botrk").build();
    await game.p1.play("botrk");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.settle();
    expect(game.state("botrk")).toMatchObject({ attachedTo: undefined, isReady: true, zone: "base" });
    expect(game.zoneOf("fodder")).toBe("base");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect((await scenario().resources(P1, { energy: 2, power: { order: 2 } }).hand(P1, CARD, "botrk").build()).p1.can("play", "botrk")).toBe(false);
    expect((await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "botrk").build()).p1.can("play", "botrk")).toBe(false);
    expect((await scenario().resources(P1, { energy: 3, power: { fury: 1 } }).hand(P1, CARD, "botrk").build()).p1.can("play", "botrk")).toBe(false);
  });

  test("no Reaction: unplayable from hand on the opponent's turn", async () => {
    const game = await scenario().active(P2).resources(P1, { energy: 3, power: { order: 1 } }).unit(P1, "base", { might: 1 }, "u").hand(P1, CARD, "botrk").build();
    expect(game.p1.can("play", "botrk")).toBe(false);
  });

  test("[Equip] resource half: needs an [order] power — with none (or only calm) no equip is offered; enemy units are never holders", async () => {
    expect(equipVariants(await loose(0).build())).toEqual([]);
    expect(equipVariants(await loose(0).resources(P1, { energy: 5, power: { calm: 2 } }).build())).toEqual([]);
    const game = await loose(1).build();
    expect(equipVariants(game).every((p) => p.unitId !== "foe")).toBe(true);
    expect((await game.p1.try((p) => p.do("equipCard", { equipmentId: "botrk", unitId: "foe" }))).ok).toBe(false);
  });

  test("[Equip] onto the Heir: pays the [order], the ability waits on the chain (P2 gets priority), and on resolution the Heir wears it as a 6", async () => {
    const game = await loose(1).build();
    await equipKilling(game, "heir", "fodder");
    expect(game.p1.power("order")).toBe(0);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "botrk", controller: P1 })]);
    expect(game.state("heir").might).toBe(2);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.passPriority();
    expect(game.state("botrk").attachedTo).toBe("heir");
    expect(game.state("heir")).toMatchObject({ attachments: ["botrk"], might: 6 });
  });

  test("[Equip] non-resource half (818.1.c.3) — 'Kill a friendly unit' is paid: after the Equip resolves the Fodder is in the trash", async () => {
    // Expected: activating Equip kills a friendly unit (Fodder) as a cost; Heir ends at 6, Fodder in trash.
    // Actual: equipCard charges only [order]; no unit is ever killed or even asked for.
    const game = await loose(1).build();
    await equipKilling(game, "heir", "fodder");
    await game.settle();
    expect(game.state("botrk").attachedTo).toBe("heir");
    expect(game.state("heir").might).toBe(6);
    expect(game.zoneOf("fodder")).toBe("trash");
    expect(game.p1.units("base").sort()).toEqual(["heir"]);
  });

  test("with a SINGLE friendly unit the Equip is impossible (it cannot be both the sacrifice and the holder, 358.1) — no equip option at all", async () => {
    // Expected: no equipCard variant; forcing it is rejected; the lone unit stays a bare 2.
    // Actual: the variant {botrk → heir} is offered and resolves into a free +4.
    const game = await scenario().resources(P1, { power: { order: 1 } }).unit(P1, "base", { might: 2, name: "Heir" }, "heir").gear(P1, CARD, "botrk").build();
    expect(equipVariants(game)).toEqual([]);
    const r = await game.p1.try((p) => p.do("equipCard", { equipmentId: "botrk", unitId: "heir" }));
    expect(r.ok).toBe(false);
    await game.settle();
    expect(game.state("heir")).toMatchObject({ attachments: [], might: 2 });
  });

  test("a token is fine fodder — killing a Recruit token to Equip makes it cease to exist (186.1) while the Heir gets +4", async () => {
    // Expected: the token is the sacrifice and is 'gone' afterwards. Actual: nothing is killed.
    const game = await scenario()
      .resources(P1, { power: { order: 1 } })
      .unit(P1, "base", { might: 2, name: "Heir" }, "heir")
      .unit(P1, "base", { isToken: true, might: 1, name: "Recruit" }, "recruit")
      .gear(P1, CARD, "botrk")
      .build();
    await equipKilling(game, "heir", "recruit");
    await game.settle();
    expect(game.state("heir").might).toBe(6);
    expect(game.zoneOf("recruit")).toBe("gone");
  });

  test("responding to the Equip item: P2 kills the Heir with a Reaction → the attach fizzles, the Blade stays loose in base, the [order] is not refunded", async () => {
    const game = await loose(1).resources(P2, { energy: 1 }).hand(P2, CULL, "cull").build();
    await equipKilling(game, "heir", "fodder");
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    await game.p2.cast("cull", { targets: "heir" });
    await game.settle();
    expect(game.zoneOf("heir")).toBe("trash");
    expect(game.state("botrk")).toMatchObject({ attachedTo: undefined, zone: "base" });
    expect(game.p1.power("order")).toBe(0);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("Weaponmaster partner (Veteran Poro) with a spare unit: the [order] is waived ([rainbow] less) and the Blade lands on the Poro (2 + 4 = 6)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .unit(P1, "base", { might: 1, name: "Fodder" }, "fodder")
      .gear(P1, CARD, "botrk")
      .hand(P1, VETERAN_PORO, "poro")
      .script(P1, ["fodder"])
      .build();
    await game.p1.play("poro");
    expect(game.decision()).toMatchObject({ allowDecline: true, kind: "pick", seat: P1 });
    await game.p1.pick("botrk");
    await game.settle();
    expect(game.state("botrk").attachedTo).toBe("poro");
    expect(game.state("poro").might).toBe(6);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
  });

  test.failing("BUG: Weaponmaster still owes the KILL (821.1.c: only [rainbow] is discounted) — with the Fodder available it dies; the Poro wears the Blade", async () => {
    // Expected: Poro 6 with the Blade AND Fodder in the trash. Actual: Fodder survives — the kill is never paid.
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .unit(P1, "base", { might: 1, name: "Fodder" }, "fodder")
      .gear(P1, CARD, "botrk")
      .hand(P1, VETERAN_PORO, "poro")
      .script(P1, ["fodder"])
      .build();
    await game.p1.play("poro");
    await game.p1.pick("botrk");
    await game.settle();
    expect(game.state("botrk").attachedTo).toBe("poro");
    expect(game.zoneOf("fodder")).toBe("trash");
  });

  test.failing("BUG: Weaponmaster with NO other friendly unit cannot pay the kill (821.1.c.5) — the Blade is not offered / stays unattached and the Poro is a plain 2", async () => {
    // Expected: no eligible Equipment (or choosing it attaches nothing). Actual: Blade attaches for free → Poro 6.
    const game = await scenario().resources(P1, { energy: 2, power: { order: 1 } }).gear(P1, CARD, "botrk").hand(P1, VETERAN_PORO, "poro").build();
    await game.p1.play("poro");
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      expect(d.options.map((o) => o.card)).not.toContain("botrk");
      await game.p1.decline();
    }
    await game.settle();
    expect(game.state("botrk").attachedTo).toBeUndefined();
    expect(game.state("poro")).toMatchObject({ attachments: [], might: 2 });
  });

  test("+4 only while attached: a pre-attached Blade makes a 1-Might Holder a 5 (Mighty); the loose copy in base buffs nobody", async () => {
    const game = await scenario()
      .unit(P1, "base", { might: 1, name: "Holder" }, "holder", { equippedWith: ["worn"] })
      .gear(P1, CARD, "worn", { attachedTo: "holder" })
      .unit(P1, "base", { might: 1, name: "Bare" }, "bare")
      .gear(P1, CARD, "spare")
      .build();
    expect(game.state("holder")).toMatchObject({ attachments: ["worn"], might: 5 });
    expect(game.state("bare").might).toBe(1);
    expect(game.state("spare").attachedTo).toBeUndefined();
  });
});
