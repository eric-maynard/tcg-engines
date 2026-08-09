/**
 * Hexdrinker — sfd-102-221 · Gear — Equipment · Body · 2 energy (no power) · +1 Might
 *
 *   [Equip] [body] ([body]: Attach this to a unit you control.)
 *
 * Rules: 359.2.d (a gear enters the base ready as soon as it is finalized; playing it attaches nothing —
 * this card has NO Quick-Draw), 818 + 151.2 + 377.3 (Equip = activated ability: pay [body], the ability
 * waits on the chain, the attach happens on resolution; usable only in your own Main Phase in an OPEN
 * state and never during a showdown), 818.1.b.1 (the unit is a target — "a unit you control"), 818.3.b /
 * 434.1.b.1 (a unit may wear several Equipment), 716 (holder leaves the board → detach; a loose Equipment
 * at a battlefield is recalled to base at the next cleanup), 821 (Weaponmaster pays Equip minus [rainbow]).
 *
 * Head-judge notes — trickiest situations for THIS card:
 *  1. It is NOT Long Sword: no Reaction (unplayable on the opponent's turn / inside a chain) and no
 *     attach-on-play — after playing it the +1 applies to nobody until [body] is paid.
 *  2. Equip timing on my own turn: illegal while my own spell is still on the chain (Closed) and while I
 *     hold Focus in a showdown I started; legal again once the state is Neutral Open.
 *  3. Cost separation: play = 2 energy, no power; Equip = [body] only (calm/energy can't pay it).
 *  4. Stacking: Hexdrinker (+1) and Doran's Blade (+2) on one 2-Might unit = 5 → it is now Mighty.
 *  5. Holder dies attacking → Hexdrinker drops at that battlefield and is back in base, unattached, after
 *     the combat cleanup; it can be re-Equipped later.
 *  6. Partner: Veteran Poro's Weaponmaster equips it for [body] − [rainbow] = free.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-102-221";
const DORANS_BLADE = "sfd-095-221"; // Equipment · Body · Equip [body] · +2
const VETERAN_PORO = "sfd-099-221"; // 2-cost 2-Might unit · [Weaponmaster]
const POKE = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "body",
  energyCost: 1,
  name: "Test Poke",
  timing: "action",
};

const equipVariants = (game: Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>) =>
  game.p1.legal().filter((o) => o.moveId === "equipCard").flatMap((o) => o.variants.map((v) => v.params));

function loose(power: Record<string, number> = { body: 1 }) {
  return scenario()
    .resources(P1, { energy: 3, power })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 2, name: "Squire" }, "squire")
    .unit(P1, "base", { might: 4, name: "Knight" }, "knight")
    .unit(P2, "bf1", { might: 3, name: "Foe" }, "foe")
    .gear(P1, CARD, "hex");
}

describe("Hexdrinker (sfd-102-221)", () => {
  test("registry payload: 2-energy Body Equipment with +1 bonus and exactly one ability — Equip costed [body]; no power cost, no Quick-Draw/Reaction", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "equipment", domain: "body", energyCost: 2, mightBonus: 1, name: "Hexdrinker" });
    expect(def?.powerCost ?? []).toEqual([]);
    // Effect Text (gallery `effect`, rule 136 / 150.2 / 718.3): "[Deflect] (Opponents must pay [rainbow] to choose me with a spell or ability.)" —
    // conferred on the equipped unit while attached, hence the `effectText: true` entries.
    expect(def?.abilities).toEqual([
      { cost: { power: ["body"] }, keyword: "Equip", type: "keyword" },
      { effect: { keyword: "Deflect", target: "self", type: "grant-keyword", value: 1 }, effectText: true, type: "static" },
    ] as never);
    const game = await scenario().hand(P1, CARD, "hex").build();
    expect(game.state("hex").keywords).toEqual(["Equip"]);
  });

  test("play cost: 2 energy and nothing else; it enters the base READY and UNATTACHED (no Quick-Draw prompt); 1 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).unit(P1, "base", { might: 2 }, "squire").hand(P1, CARD, "hex").build();
    await game.p1.play("hex");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("hex")).toBe("base");
    expect(game.state("hex")).toMatchObject({ attachedTo: undefined, isReady: true });
    expect(game.state("squire")).toMatchObject({ attachments: [], might: 2 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect((await scenario().resources(P1, { energy: 1, power: { body: 3 } }).hand(P1, CARD, "hex").build()).p1.can("play", "hex")).toBe(false);
  });

  test("no Reaction: not playable from hand on the opponent's turn, neither in their open main phase nor in response to their spell", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 2, power: { body: 1 } })
      .resources(P2, { energy: 1 })
      .unit(P1, "base", { might: 2 }, "squire")
      .hand(P1, CARD, "hex")
      .hand(P2, POKE, "poke")
      .build();
    expect(game.p1.can("play", "hex")).toBe(false);
    await game.p2.cast("poke", { targets: "squire" });
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("play", "hex")).toBe(false);
    expect((await game.p1.try((p) => p.play("hex"))).ok).toBe(false);
  });

  test("[Equip] [body]: only MY units are targets (Squire | Knight, never Foe); pays 1 body and no energy; ability on the chain; +1 on resolution", async () => {
    const game = await loose().build();
    expect(equipVariants(game).map((p) => p.unitId).sort()).toEqual(["knight", "squire"]);
    expect((await game.p1.try((p) => p.do("equipCard", { equipmentId: "hex", unitId: "foe" }))).ok).toBe(false);
    await game.p1.do("equipCard", { equipmentId: "hex", unitId: "squire" });
    expect(game.p1.resources()).toEqual({ energy: 3, power: { body: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "hex", controller: P1, triggered: false })]);
    expect(game.state("squire").might).toBe(2); // nothing attached before resolution
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.passPriority();
    expect(game.state("hex").attachedTo).toBe("squire");
    expect(game.state("squire")).toMatchObject({ attachments: ["hex"], might: 3 });
    expect(game.state("knight").might).toBe(4);
    expect(game.violations()).toEqual([]);
  });

  test("[Equip] cost is [body] specifically: energy alone or a calm power does not enable it", async () => {
    expect(equipVariants(await loose({}).build())).toEqual([]);
    expect(equipVariants(await loose({ calm: 2 }).build())).toEqual([]);
    const r = await (await loose({ calm: 2 }).build()).p1.try((p) => p.do("equipCard", { equipmentId: "hex", unitId: "squire" }));
    expect(r.ok).toBe(false);
  });

  test("151.2 timing on MY turn: no Equip while my own spell is on the chain (Closed), none while I hold Focus in a showdown; offered again once Neutral Open", async () => {
    const game = await loose({ body: 1 }).hand(P1, POKE, "poke").build();
    await game.p1.cast("poke", { targets: "foe" });
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(equipVariants(game)).toEqual([]);
    await game.settle();
    expect(equipVariants(game).length).toBeGreaterThan(0);
    await game.p1.move("knight", "bf1"); // 4 into a damaged 3 → showdown, P1 has Focus
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(equipVariants(game)).toEqual([]);
    expect((await game.p1.try((p) => p.do("equipCard", { equipmentId: "hex", unitId: "squire" }))).ok).toBe(false);
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(equipVariants(game).map((p) => p.unitId).sort()).toEqual(["knight", "squire"]);
  });

  test("stacking (818.3.b): Hexdrinker (+1) then Doran's Blade (+2) on the 2-Might Squire → 5 Might, two attachments, 2 body paid in total", async () => {
    const game = await loose({ body: 2 }).gear(P1, DORANS_BLADE, "blade").build();
    await game.p1.do("equipCard", { equipmentId: "hex", unitId: "squire" });
    await game.settle();
    await game.p1.do("equipCard", { equipmentId: "blade", unitId: "squire" });
    await game.settle();
    expect(game.state("squire").attachments.sort()).toEqual(["blade", "hex"]);
    expect(game.state("squire").might).toBe(5);
    expect(game.p1.power("body")).toBe(0);
    // an attached Equipment is no longer an Equip source
    expect(equipVariants(game)).toEqual([]);
  });

  test("716 — the equipped Squire (2+1) dies attacking a 4: Hexdrinker detaches, is back in P1's base unattached after the cleanup, and can be re-Equipped to the Knight", async () => {
    const game = await scenario()
      .resources(P1, { power: { body: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 4, name: "Wall" }, "wall")
      .unit(P1, "base", { might: 2, name: "Squire" }, "squire", { equippedWith: ["hex"] })
      .gear(P1, CARD, "hex", { attachedTo: "squire" })
      .unit(P1, "base", { might: 4, name: "Knight" }, "knight")
      .build();
    expect(game.state("squire").might).toBe(3);
    await game.p1.move("squire", "bf1");
    await game.settle();
    expect(game.zoneOf("squire")).toBe("trash");
    expect(game.zoneOf("wall")).toBe("battlefield-bf1"); // 3 < 4
    expect(game.zoneOf("hex")).toBe("base");
    expect(game.state("hex").attachedTo).toBeUndefined();
    expect(game.state("hex").owner).toBe(P1);
    expect(equipVariants(game)).toEqual([expect.objectContaining({ equipmentId: "hex", unitId: "knight" })]);
    await game.p1.do("equipCard", { equipmentId: "hex", unitId: "knight" });
    await game.settle();
    expect(game.state("knight")).toMatchObject({ attachments: ["hex"], might: 5 });
  });

  test("partner — Veteran Poro's [Weaponmaster]: Equip [body] minus [rainbow] = free; Hexdrinker moves onto the Poro (3 Might) with the body power untouched", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { body: 1 } })
      .gear(P1, CARD, "hex")
      .hand(P1, VETERAN_PORO, "poro")
      .build();
    await game.p1.play("poro");
    expect(game.decision()).toMatchObject({ allowDecline: true, kind: "pick", seat: P1 });
    await game.p1.pick("hex");
    await game.settle();
    expect(game.state("hex").attachedTo).toBe("poro");
    expect(game.state("poro").might).toBe(3);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 1 } });
  });

  test("the +1 is only while attached: an unattached Hexdrinker in base changes no unit's Might, friendly or enemy", async () => {
    const game = await loose().build();
    expect(game.state("squire").might).toBe(2);
    expect(game.state("knight").might).toBe(4);
    expect(game.state("foe").might).toBe(3);
    expect(game.state("hex")).toMatchObject({ attachedTo: undefined, zone: "base" });
  });
});
