/**
 * Doran's Blade — sfd-095-221 · Gear (Equipment) · Body · 2 energy · Might bonus +2
 *
 *   [Equip] [body] ([body]: Attach this to a unit you control.)
 *
 * Rules: 149.1 (gear enters ready), 818 (Equip = "[body]: Attach this gear to a unit you control" —
 * a targeted activated ability of the gear), 434.1.d/718.4 (while attached the Might bonus modulates
 * the wearer), 137.3.a (an unattached Equipment's bonus does nothing), 434.4 (attach relocates the
 * gear — not a Move), 719.3.a (rides along), 719.5 + 435.4.b + 457.1 (wearer leaves the board from a
 * battlefield → the Blade detaches there and is recalled to base at the next Cleanup), 435.1.e (a
 * detach ends the +2 immediately), 135.2.e.5.b (pooled [rainbow] pays [body]), gear activated
 * abilities: your turn, open state, not in a showdown; 718.2 (attached → Equip inactive).
 *
 * Head-judge checklist for THIS card:
 *  1. Two costs: [2] plays it (unattached, no bonus to anyone), [body] equips it (no energy).
 *  2. +2 is live combat math: a 2-Might wearer becomes exactly lethal to a 4 and survives a 3;
 *     stacked with a buff it is 2+1+2 = 5.
 *  3. The bonus follows attachment, not proximity: two friendly units in base, only the wearer grows;
 *     detaching (Strike Down's "then detach") drops it back at once and the Blade stays on the board.
 *  4. Wearer bounced to hand from a battlefield (enemy Rebuke): Blade is NOT returned — it detaches,
 *     is recalled to base, and can be re-equipped.
 *  5. Timing/negative space: not on the opponent's turn, not in a showdown, not while attached, not
 *     onto an enemy unit, not with fury power.
 *  6. Partners: Veteran Poro (Body Weaponmaster) takes it free on play → 4; Gearhead doubles the base
 *     bonus → 3+4 = 7; Strike Down reads Might INCLUDING the +2 before detaching.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-095-221";
const VETERAN_PORO = "sfd-099-221"; // Body unit · 2 · 2 Might · [Weaponmaster]
const GEARHEAD = "sfd-068-221"; // Mind unit · 5 · 3 Might · Each Equipment attached to me gives double its base Might bonus.
const STRIKE_DOWN = "sfd-107-221"; // Body spell · 3 + [body] · equipped friendly unit deals its Might to an enemy unit, then detach an Equipment.
const REBUKE = "ogn-172-298"; // Chaos spell · [Action] · 2 + [chaos][chaos] · Return a unit at a battlefield to its owner's hand.
const BODY_RUNE = "ogn-126-298";

async function equip(game: Game, unitId: string): Promise<void> {
  await game.p1.choose("equipCard:-", { params: { equipmentId: "blade", unitId } });
  await game.settle();
}

describe("Doran's Blade (sfd-095-221)", () => {
  test("registry payload: Body equipment, 2 energy, no power to play, +2 Might bonus, exactly one [Equip] keyword ability costed [body]", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "equipment", domain: "body", energyCost: 2, mightBonus: 2, name: "Doran's Blade" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toEqual([{ cost: { power: ["body"] }, keyword: "Equip", type: "keyword" }]);
  });

  test("play: exactly 2 energy, no power; enters base READY and unattached — nobody gains Might from an unattached Blade (137.3.a); 1 energy is short", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).unit(P1, "base", { might: 2 }, "ally").hand(P1, CARD, "blade").build();
    await game.p1.play("blade");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("blade")).toBe("base");
    expect(game.state("blade")).toMatchObject({ attachedTo: undefined, isReady: true, keywords: ["Equip"] });
    expect(game.state("ally").might).toBe(2);
    expect(game.p1.can("equipCard")).toBe(false); // no [body] to Equip with
    expect((await scenario().resources(P1, { energy: 1, power: { body: 2 } }).hand(P1, CARD, "blade").build()).p1.can("play", "blade")).toBe(false);
  });

  test("[Equip] [body]: one body power (no energy) attaches it; ONLY the wearer gets +2 (2 → 4), a bystander stays 2", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { body: 1 } })
      .unit(P1, "base", { might: 2, name: "Wearer" }, "wearer")
      .unit(P1, "base", { might: 2, name: "Bystander" }, "by")
      .gear(P1, CARD, "blade")
      .build();
    await equip(game, "wearer");
    expect(game.p1.resources()).toEqual({ energy: 2, power: { body: 0 } });
    expect(game.state("blade").attachedTo).toBe("wearer");
    expect(game.state("wearer")).toMatchObject({ attachments: ["blade"], baseMight: 2, might: 4 });
    expect(game.state("by").might).toBe(2);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("cost domain + targets: fury power cannot pay [body], pooled [rainbow] can; enemy units are never offered / accepted", async () => {
    const fury = await scenario().resources(P1, { energy: 4, power: { fury: 2 } }).unit(P1, "base", { might: 2 }, "ally").gear(P1, CARD, "blade").build();
    expect(fury.p1.can("equipCard")).toBe(false);
    const game = await scenario()
      .resources(P1, { power: { rainbow: 1 } })
      .unit(P1, "base", { might: 2 }, "ally")
      .unit(P2, "base", { might: 2 }, "enemy")
      .gear(P1, CARD, "blade")
      .build();
    expect(game.p1.option("equipCard")?.fields.find((f) => f.name === "unitId")?.options).toEqual(["ally"]);
    expect((await game.p1.try((p) => p.choose("equipCard:-", { params: { equipmentId: "blade", unitId: "enemy" } }))).ok).toBe(false);
    await equip(game, "ally");
    expect(game.state("ally").might).toBe(4);
    expect(game.p1.power()).toBe(0);
  });

  test("+2 stacks with a buff: a buffed 2-Might wearer is 2 + 1 + 2 = 5", async () => {
    const game = await scenario().resources(P1, { power: { body: 1 } }).unit(P1, "base", { might: 2 }, "ally", { buffed: true }).gear(P1, CARD, "blade").build();
    expect(game.state("ally").might).toBe(3);
    await equip(game, "ally");
    expect(game.state("ally")).toMatchObject({ isBuffed: true, might: 5 });
  });

  test("combat, exactly lethal: a 2+2 wearer kills a 4-Might defender (and dies to it); into a 3-Might defender it kills, survives and conquers with the Blade along", async () => {
    const trade = await scenario()
      .resources(P1, { power: { body: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 2, name: "Squire" }, "squire")
      .unit(P2, "bf1", { might: 4, name: "Four" }, "four")
      .gear(P1, CARD, "blade")
      .build();
    await equip(trade, "squire");
    await trade.p1.move("squire", "bf1");
    expect(trade.zoneOf("blade")).toBe("battlefield-bf1"); // 719.3.a
    await trade.settle();
    expect(trade.zoneOf("four")).toBe("trash"); // took 4 ≥ 4
    expect(trade.zoneOf("squire")).toBe("trash"); // took 4 ≥ 4
    expect(trade.zoneOf("blade")).toBe("base"); // detached + recalled (457.1)
    expect(trade.state("blade").attachedTo).toBeUndefined();
    expect(trade.gameState.battlefields.bf1?.controller).toBeNull(); // nobody left standing (190.4.c) — no conquer
    expect(trade.p1.points()).toBe(0);

    const win = await scenario()
      .resources(P1, { power: { body: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 2, name: "Squire" }, "squire")
      .unit(P2, "bf1", { might: 3, name: "Three" }, "three")
      .gear(P1, CARD, "blade")
      .build();
    await equip(win, "squire");
    await win.p1.move("squire", "bf1");
    await win.settle();
    expect(win.zoneOf("three")).toBe("trash");
    expect(win.locationOf("squire")).toBe("bf1"); // took 3 < 4
    expect(win.state("squire")).toMatchObject({ attachments: ["blade"], might: 4 });
    expect(win.zoneOf("blade")).toBe("battlefield-bf1");
    expect(win.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(win.p1.points()).toBe(1);
  });

  test("negative space without the Blade attached: the same bare 2-Might squire just dies to the 3-Might defender", async () => {
    const game = await scenario()
      .resources(P1, { power: { body: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 2, name: "Squire" }, "squire")
      .unit(P2, "bf1", { might: 3, name: "Three" }, "three")
      .gear(P1, CARD, "blade") // in base, unattached
      .build();
    await game.p1.move("squire", "bf1");
    await game.settle();
    expect(game.zoneOf("squire")).toBe("trash");
    expect(game.zoneOf("three")).toBe("battlefield-bf1");
    expect(game.zoneOf("blade")).toBe("base");
  });

  test("timing: never on the opponent's turn, never with Focus in a showdown, never while already attached (cannot hop units)", async () => {
    const opp = await scenario().active(P2).resources(P1, { power: { body: 1 } }).unit(P1, "base", { might: 2 }, "ally").gear(P1, CARD, "blade").build();
    expect(opp.p1.legal().some((o) => o.moveId === "equipCard")).toBe(false);
    expect((await opp.p1.try((p) => p.do("equipCard", { equipmentId: "blade", unitId: "ally" }))).ok).toBe(false);

    const game = await scenario()
      .resources(P1, { power: { body: 2 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 3 }, "a")
      .unit(P1, "base", { might: 3 }, "b")
      .unit(P2, "bf1", { might: 3 }, "def")
      .gear(P1, CARD, "blade")
      .build();
    await equip(game, "a");
    expect(game.p1.can("equipCard")).toBe(false);
    expect((await game.p1.try((p) => p.choose("equipCard:-", { params: { equipmentId: "blade", unitId: "b" } }))).ok).toBe(false);
    expect(game.state("b").might).toBe(3);

    const sd = await scenario()
      .resources(P1, { power: { body: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 3 }, "a")
      .unit(P1, "base", { might: 3 }, "b")
      .unit(P2, "bf1", { might: 3 }, "def")
      .gear(P1, CARD, "blade")
      .build();
    await sd.p1.move("a", "bf1");
    expect(sd.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(sd.p1.can("equipCard")).toBe(false);
  });

  test("wearer bounced to hand from a battlefield by an enemy Rebuke: the Blade is NOT returned — it detaches (719.5), is recalled to base (457.1) and re-equips", async () => {
    // P2's turn; the Squire at bf1 already wears the Blade (seeded attachment, so the Blade sits at bf1 with it).
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 2, power: { chaos: 2 } })
      .runeDeck(P1, Array.from({ length: 12 }, () => BODY_RUNE))
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Squire" }, "squire", { equippedWith: ["blade"] })
      .card("blade", { def: CARD, meta: { attachedTo: "squire" }, owner: P1, zone: "bf1" })
      .unit(P1, "base", { might: 1, name: "Heir" }, "heir")
      .hand(P2, REBUKE, "rebuke")
      .build();
    expect(game.state("squire")).toMatchObject({ attachments: ["blade"], might: 4 });
    expect(game.zoneOf("blade")).toBe("battlefield-bf1");
    await game.p2.cast("rebuke", { targets: "squire" });
    await game.settle();
    expect(game.zoneOf("squire")).toBe("hand");
    expect(game.zoneOf("blade")).toBe("base");
    expect(game.state("blade")).toMatchObject({ attachedTo: undefined, owner: P1 });
    await game.advanceTurn(); // back to P1 (channels 2 body runes)
    expect(game.turnPlayer()).toBe(P1);
    await game.p1.recycleRune({ domain: "body" }); // +1 body power
    await equip(game, "heir");
    expect(game.state("heir").might).toBe(3);
  });

  test("Weaponmaster (Veteran Poro, Body 2-drop): takes the Blade on play for [body] − [rainbow] = free → a 4-Might Poro for 2 energy", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).gear(P1, CARD, "blade").hand(P1, VETERAN_PORO, "poro").build();
    await game.p1.play("poro");
    expect(game.decision()).toMatchObject({ allowDecline: true, kind: "pick", seat: P1 });
    await game.p1.pick("blade");
    await game.settle();
    expect(game.state("blade").attachedTo).toBe("poro");
    expect(game.state("poro").might).toBe(4);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
  });

  test("Gearhead doubles the BASE bonus: 3 + (2 × 2) = 7", async () => {
    const game = await scenario().resources(P1, { power: { body: 1 } }).unit(P1, "base", GEARHEAD, "gh").gear(P1, CARD, "blade").build();
    await equip(game, "gh");
    expect(game.state("blade").attachedTo).toBe("gh");
    expect(game.state("gh").might).toBe(7);
  });

  test("Strike Down reads Might WITH the +2 (2+2 = 4 kills a 4-Might enemy), THEN detaches: wearer back to 2, Blade unattached in base, still on the board", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { body: 2 } })
      .unit(P1, "base", { might: 2, name: "Squire" }, "squire")
      .unit(P2, "base", { might: 4, name: "Foe" }, "foe")
      .gear(P1, CARD, "blade")
      .hand(P1, STRIKE_DOWN, "sd")
      .build();
    await equip(game, "squire");
    expect(game.state("squire").might).toBe(4);
    await game.p1.cast("sd", { targets: ["squire", "foe"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    await game.settle({ policy: "first" });
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.state("blade").attachedTo).toBeUndefined();
    expect(game.zoneOf("blade")).toBe("base");
    expect(game.state("squire")).toMatchObject({ attachments: [], damage: 0, might: 2 });
  });
});
