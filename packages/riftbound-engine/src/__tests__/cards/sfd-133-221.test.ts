/**
 * Boots of Swiftness — sfd-133-221 · Gear — Equipment · Chaos · 3 energy (no power) · Might Bonus +2
 *
 *   [Equip] [chaos] ([chaos]: Attach this to a unit you control.)
 *
 * Rules: 818 (Equip = "[chaos]: Attach this to a unit you control" — an activated ability whose
 * choice is a target, 818.1.b.1), 381 / 151.2 (activated abilities of gear: your turn, Open State,
 * not in a showdown; it uses the chain), 359.2.d (a non-unit gear enters your base READY), 337.2 (a
 * played gear resolves immediately — no chain item), 718.2 / 718.4 (while attached: printed text
 * inactive, +2 to the wearer only), 719.3 (worn gear is wherever the wearer is), 719.5 + 149.3
 * (wearer leaves the board → detach in place, loose gear at a battlefield is recalled to base),
 * 150.4 / 718.5.b (an attached Equipment is still a gear and can be chosen — e.g. killed), 821
 * (Weaponmaster pays the Equip cost minus [A] "even if it's already attached"), 108.2 (control).
 *
 * Head-judge notes — the tricky spots for THIS card:
 *  1. NO Quick-Draw: playing the Boots must not attach anything nor ask for a unit — they land loose
 *     and ready; wearing them is a second, separately-priced action ([chaos]) that P2 may respond to.
 *     Full price to get +2 on a unit the turn you draw them: 3 energy + 1 chaos.
 *  2. Not a Reaction either: unplayable on the opponent's turn, with a chain open, or in a showdown;
 *     the same three windows also close the [Equip] ability.
 *  3. The +2 is real Might: a 2-Might wearer trades 4 into a 4; two Equipment stack (+2 +3).
 *  4. Leaving play: Brittle Steel can kill the WORN Boots (wearer drops to printed Might, stays);
 *     Retreat on the wearer sends the unit to hand but the Boots stay on the board, loose and ready.
 *  5. Partner — Master Bingwen (Weaponmaster, Chaos): [chaos] − [rainbow] = free, and he may strip the
 *     Boots off a friendly Squire as he enters (Squire 4 → 2, Bingwen 6 → 8).
 *  6. Control, not ownership, decides who may wear them (a stolen unit qualifies).
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-133-221";
const BINGWEN = "sfd-127-221"; // Unit · Chaos · 6 · 6 Might · [Weaponmaster]
const STERAKS_GAGE = "sfd-056-221"; // Equipment · Calm · +3 · [Equip] [calm]
const BRITTLE_STEEL = "ven-003-166"; // Spell · Fury · 2 + [fury]: Kill a gear.
const RETREAT = "ogn-104-298"; // Spell · Calm · [Reaction] 1: Return a friendly unit to its owner's hand. Its owner channels 1 rune exhausted.
const PING = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "chaos",
  energyCost: 1,
  name: "Ping",
  rulesText: "[Action] Deal 1 to a unit.",
  timing: "action",
} as const;

type Legalish = { p1: { legal(): readonly { moveId: string }[] } };
const equipOffered = (game: Legalish) => game.p1.legal().some((o) => o.moveId === "equipCard");

/** P1's turn: loose Boots in base, a 2-Might Squire, one chaos power. */
function looseBoots(extra: { energy?: number; chaos?: number } = {}) {
  return scenario()
    .resources(P1, { energy: extra.energy ?? 0, power: { chaos: extra.chaos ?? 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 2, name: "Squire" }, "squire")
    .unit(P2, "bf1", { might: 4, name: "Wall" }, "wall")
    .gear(P1, CARD, "boots");
}

describe("Boots of Swiftness (sfd-133-221)", () => {
  test("registry payload: Chaos Equipment, 3 energy, NO power cost, +2 Might Bonus, exactly one ability — the Equip keyword costing one [chaos] (no Quick-Draw)", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "equipment", domain: "chaos", energyCost: 3, mightBonus: 2, name: "Boots of Swiftness" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toEqual([{ cost: { power: ["chaos"] }, keyword: "Equip", type: "keyword" }]);
    expect(def?.keywords ?? []).not.toContain("Quick-Draw");
  });

  test("playing them: exactly 3 energy (chaos untouched), no chain item, NO attach prompt — they enter the base loose and READY (359.2.d) and the Squire is still 2", async () => {
    const game = await scenario().resources(P1, { energy: 3, power: { chaos: 1 } }).unit(P1, "base", { might: 2 }, "squire").hand(P1, CARD, "boots").build();
    await game.p1.play("boots");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 1 } });
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 }); // nothing asked
    expect(game.zoneOf("boots")).toBe("base");
    expect(game.state("boots")).toMatchObject({ isReady: true, zone: "base" });
    expect(game.state("boots").attachedTo).toBeUndefined();
    expect(game.state("squire").might).toBe(2);
    expect(equipOffered(game)).toBe(true); // …but the [Equip] is now available for the chaos
    const poor = await scenario().resources(P1, { energy: 2, power: { chaos: 3 } }).unit(P1, "base", { might: 2 }, "squire").hand(P1, CARD, "boots").build();
    expect(poor.p1.can("play", "boots")).toBe(false);
  });

  test("play then Equip in one turn: 3 energy + 1 chaos in total; the Equip is a chain item P2 sees before the +2 lands", async () => {
    const game = await scenario().resources(P1, { energy: 3, power: { chaos: 1 } }).unit(P1, "base", { might: 2 }, "squire").hand(P1, CARD, "boots").build();
    await game.p1.play("boots");
    await game.p1.do("equipCard", { equipmentId: "boots", unitId: "squire" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "boots", controller: P1, triggered: false, type: "ability" })]);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.state("squire").might).toBe(2); // not yet
    await game.p2.passPriority();
    expect(game.state("boots").attachedTo).toBe("squire");
    expect(game.state("squire")).toMatchObject({ attachments: ["boots"], baseMight: 2, might: 4 });
    expect(equipOffered(game)).toBe(false); // worn: printed [Equip] inactive (718.2)
    expect(game.violations()).toEqual([]);
  });

  test("[Equip] needs the [chaos]: energy alone or off-domain power never offers it; the target list is only units I control (the enemy Wall is absent)", async () => {
    expect(equipOffered(await looseBoots({ chaos: 0, energy: 5 }).build())).toBe(false);
    expect(equipOffered(await looseBoots({ chaos: 0 }).resources(P1, { power: { calm: 2 } }).build())).toBe(false);
    const game = await looseBoots().build();
    expect(game.p1.option("equipCard")?.fields.find((f) => f.name === "unitId")?.options).toEqual(["squire"]);
    const bad = await game.p1.try((p) => p.do("equipCard", { equipmentId: "boots", unitId: "wall" }));
    expect(bad.ok).toBe(false);
    expect(game.p1.power("chaos")).toBe(1);
  });

  test("timing — not a Reaction: the Boots cannot be PLAYED on the opponent's turn (even holding priority on their chain) nor in a showdown with Focus", async () => {
    const onChain = await scenario()
      .active(P2)
      .resources(P1, { energy: 3, power: { chaos: 1 } })
      .resources(P2, { energy: 1 })
      .unit(P1, "base", { might: 2 }, "squire")
      .hand(P1, CARD, "boots")
      .hand(P2, PING, "ping")
      .build();
    expect(onChain.p1.can("play", "boots")).toBe(false);
    await onChain.p2.cast("ping", { targets: "squire" });
    await onChain.p2.passPriority();
    expect(onChain.actingSeat()).toBe(P1);
    expect(onChain.p1.can("play", "boots")).toBe(false);

    const showdown = await scenario()
      .active(P2)
      .resources(P1, { energy: 3, power: { chaos: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2 }, "squire")
      .unit(P2, "base", { might: 3 }, "raider")
      .hand(P1, CARD, "boots")
      .build();
    await showdown.p2.move("raider", "bf1");
    await showdown.p2.passFocus();
    expect(showdown.actingSeat()).toBe(P1);
    expect(showdown.p1.can("play", "boots")).toBe(false);
  });

  test("timing — the [Equip] ability is standard speed (381 / 151.2): closed on the opponent's turn, while a chain is open, and during my own showdown", async () => {
    expect(equipOffered(await looseBoots().active(P2).build())).toBe(false);
    const closed = await looseBoots({ energy: 1 }).hand(P1, PING, "ping").build();
    await closed.p1.cast("ping", { targets: "wall" });
    expect(closed.chain()).toHaveLength(1);
    expect(equipOffered(closed)).toBe(false);
    await closed.settle();
    expect(equipOffered(closed)).toBe(true); // back to Neutral Open
    const showdown = await looseBoots().build();
    await showdown.p1.move("squire", "bf1");
    expect(showdown.decision()).toMatchObject({ context: "showdown", seat: P1 });
    expect(equipOffered(showdown)).toBe(false);
  });

  test("the +2 fights: a booted 2-Might Squire (4) attacking a 4-Might Wall trades — both die, and the Boots detach and come home loose (719.5 / 149.3), not to the trash", async () => {
    const game = await looseBoots().build();
    await game.p1.do("equipCard", { equipmentId: "boots", unitId: "squire" });
    await game.settle();
    expect(game.state("squire").might).toBe(4);
    await game.p1.move("squire", "bf1");
    expect(game.zoneOf("boots")).toBe("battlefield-bf1"); // travels with its wearer (719.3)
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.zoneOf("squire")).toBe("trash");
    expect(game.zoneOf("boots")).toBe("base");
    expect(game.state("boots").attachedTo).toBeUndefined();
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P1); // no attacker survived to conquer
    expect(game.p1.points()).toBe(0);
  });

  test("two Equipment stack: Boots (+2) and Sterak's Gage (+3) on one Squire = 7, enough to kill a 6-Might Wall and conquer with both still worn", async () => {
    const game = await scenario()
      .resources(P1, { power: { calm: 1, chaos: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 2, name: "Squire" }, "squire")
      .unit(P2, "bf1", { might: 6, name: "Wall" }, "wall")
      .gear(P1, CARD, "boots")
      .gear(P1, STERAKS_GAGE, "gage")
      .build();
    await game.p1.do("equipCard", { equipmentId: "boots", unitId: "squire" });
    await game.settle();
    await game.p1.do("equipCard", { equipmentId: "gage", unitId: "squire" });
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0, chaos: 0 } });
    expect(game.state("squire")).toMatchObject({ might: 7 });
    expect([...game.state("squire").attachments].sort()).toEqual(["boots", "gage"]);
    await game.p1.move("squire", "bf1");
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.zoneOf("squire")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.state("boots").attachedTo).toBe("squire");
    expect(game.zoneOf("boots")).toBe("battlefield-bf1");
  });

  test("an attached Equipment is still a gear (150.4 / 718.5.b): the opponent's Brittle Steel kills the WORN Boots — Squire drops 4 → 2 and stays put", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 2, power: { fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Squire" }, "squire", { equippedWith: ["boots"] })
      .gear(P1, CARD, "boots", { attachedTo: "squire" })
      .hand(P2, BRITTLE_STEEL, "steel")
      .build();
    expect(game.state("squire").might).toBe(4);
    expect(game.p2.option("cast", "steel")?.fields.find((f) => f.arg === "targets")?.options).toEqual([["boots"]]);
    await game.p2.cast("steel", { targets: "boots" });
    await game.settle();
    expect(game.zoneOf("boots")).toBe("trash");
    expect(game.state("squire")).toMatchObject({ attachments: [], might: 2 });
    expect(game.zoneOf("squire")).toBe("battlefield-bf1");
  });

  test("Retreat on the wearer: the Squire returns to hand, the Boots stay on MY board — loose, ready, re-equippable — and are not dragged into the hand (719.5)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { chaos: 1 } })
      .unit(P1, "base", { might: 2, name: "Squire" }, "squire", { equippedWith: ["boots"] })
      .unit(P1, "base", { might: 1, name: "Page" }, "page")
      .gear(P1, CARD, "boots", { attachedTo: "squire" })
      .hand(P1, RETREAT, "retreat")
      .build();
    await game.p1.cast("retreat", { targets: "squire" });
    await game.settle();
    expect(game.zoneOf("squire")).toBe("hand");
    expect(game.zoneOf("boots")).toBe("base");
    expect(game.state("boots")).toMatchObject({ isReady: true });
    expect(game.state("boots").attachedTo).toBeUndefined();
    expect(game.p1.hand()).not.toContain("boots");
    expect(equipOffered(game)).toBe(true); // printed [Equip] is active again (435.1.c)
    await game.p1.do("equipCard", { equipmentId: "boots", unitId: "page" });
    await game.settle();
    expect(game.state("page").might).toBe(3);
  });

  test("partner — Master Bingwen's Weaponmaster: [chaos] − [rainbow] = free, 'even if it's already attached' — the Boots leave the Squire (4 → 2) for Bingwen (6 → 8) at no cost", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6 })
      .unit(P1, "base", { might: 2, name: "Squire" }, "squire", { equippedWith: ["boots"] })
      .gear(P1, CARD, "boots", { attachedTo: "squire" })
      .hand(P1, BINGWEN, "bw")
      .build();
    expect(game.state("squire").might).toBe(4);
    await game.p1.play("bw");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.decision()).toMatchObject({ allowDecline: true, kind: "pick", seat: P1, semantics: "equip" });
    await game.p1.pick("boots");
    await game.settle();
    expect(game.state("boots").attachedTo).toBe("bw");
    expect(game.state("bw")).toMatchObject({ isExhausted: true, might: 8 });
    expect(game.state("squire")).toMatchObject({ attachments: [], might: 2 });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} }); // no chaos was ever needed
  });

  test("'a unit you CONTROL' (108.2 / 718.5.e) — the [Equip] target list includes a unit P1 controls but P2 owns", async () => {
    const game = await scenario()
      .resources(P1, { power: { chaos: 1 } })
      .card("stolen", { controller: P1, def: { cardType: "unit", might: 2, name: "Turncoat" }, owner: P2, zone: "base" })
      .unit(P1, "base", { might: 1, name: "Mine" }, "mine")
      .gear(P1, CARD, "boots")
      .build();
    expect(game.p1.units()).toEqual(expect.arrayContaining(["stolen", "mine"]));
    expect([...(game.p1.option("equipCard")?.fields.find((f) => f.name === "unitId")?.options ?? [])].sort()).toEqual(["mine", "stolen"]);
    await game.p1.do("equipCard", { equipmentId: "boots", unitId: "stolen" });
    await game.settle();
    expect(game.state("boots").attachedTo).toBe("stolen");
    expect(game.state("stolen").might).toBe(4);
  });
});
