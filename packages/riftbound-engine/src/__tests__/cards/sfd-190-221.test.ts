/**
 * Forgefire Cape — sfd-190-221 · Gear — Equipment · Calm/Mind · 4 energy + 2 power · Might bonus +3
 *
 *   [Unique] (Your deck can have only 1 card with this name.)
 *   [Equip] [rainbow] ([rainbow]: Attach this to a unit you control.)
 *
 * Head-judge checklist (the tricky spots for THIS card):
 *  1. It is a TWO-domain card, so every printed power pip is a hybrid [C] pip (135.2.e.6.c): the two
 *     pips of the play cost and the single pip of the [Equip] cost are each payable with CALM OR MIND
 *     (any mix), or with an added Any/[rainbow] power (135.2.e.5.b) — but NOT with power of a third
 *     domain, and never with energy. (Card data spells these pips "rainbow"; the engine re-tags them.)
 *  2. Play: exactly 4 energy + 2 such power, to base, READY, unattached (149.1/149.2). 3 energy or a
 *     single power ⇒ unplayable.
 *  3. [Equip]: default speed only (151.2), uses the chain, +3 on resolution — big enough to flip real
 *     fights (2+3 = 5 beats a 4). On Gearhead ("double its base Might bonus") it is +6.
 *  4. [Unique] is a deck-construction constraint with NO gameplay effect (825.4): a second copy that
 *     somehow exists in play works exactly like the first.
 *  5. Bearer dies ⇒ the Cape detaches and is recalled to base (719.5 / 149.3), not trashed.
 *  6. Weaponmaster (Ornn, same Mind domain): "[Equip] … for [rainbow] less" makes the hybrid pip free.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-190-221";
const GEARHEAD = "sfd-068-221"; // Unit · Mind · 3 Might · Each Equipment attached to me gives double its base Might bonus.
const ORNN = "sfd-085-221"; // Ornn, Forge God · Mind · 6 · 4 Might · Weaponmaster, +1 Might per friendly gear

const equipPairs = (game: Game) =>
  game.p1
    .legal()
    .filter((o) => o.moveId === "equipCard")
    .flatMap((o) => o.variants.map((v) => `${String(v.params.equipmentId)}→${String(v.params.unitId)}`))
    .sort();

const equip = (game: Game, unitId: string, equipmentId = "cape") => game.p1.choose("equipCard", { params: { equipmentId, unitId } });

const inHand = (energy: number, power: Record<string, number>) => scenario().resources(P1, { energy, power }).unit(P1, "base", { might: 2 }, "ally").hand(P1, CARD, "cape");
const onBoard = (power: Record<string, number>) => scenario().resources(P1, { energy: 0, power }).unit(P1, "base", { might: 2, name: "Ally" }, "ally").gear(P1, CARD, "cape");

describe("Forgefire Cape (sfd-190-221)", () => {
  test("registry payload: Calm/Mind equipment, 4 energy + 2 pips, +3, keywords [Unique] and [Equip] (one pip)", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "equipment", domain: ["calm", "mind"], energyCost: 4, mightBonus: 3, name: "Forgefire Cape" });
    expect(def?.powerCost).toHaveLength(2);
    // Effect Text (gallery `effect`, rule 136 / 150.2 / 718.3): "When I attack or defend, deal 2 to all
    // enemy units here." — the equipped unit's combat trigger while attached (`effectText: true`).
    expect(def?.abilities).toEqual([
      { keyword: "Unique", type: "keyword" },
      { cost: { power: ["rainbow"] }, keyword: "Equip", type: "keyword" },
      {
        effect: { amount: 2, target: { controller: "enemy", location: "here", quantity: "all", type: "unit" }, type: "damage" },
        effectText: true,
        trigger: { event: "attack-or-defend", on: "self" },
        type: "triggered",
      },
    ] as never);
    const game = await inHand(0, {}).build();
    expect(game.state("cape").keywords).toEqual(["Unique", "Equip"]);
  });

  test("play cost: 4 energy + 2 power paid from calm+mind; lands in base READY and unattached; the ally is untouched", async () => {
    const game = await inHand(5, { calm: 1, mind: 1 }).build();
    await game.p1.play("cape");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { calm: 0, mind: 0 } });
    await game.settle();
    expect(game.zoneOf("cape")).toBe("base");
    expect(game.state("cape")).toMatchObject({ attachedTo: undefined, isReady: true });
    expect(game.state("ally").might).toBe(2);
    expect(game.chain()).toEqual([]);
  });

  test("hybrid pips (135.2.e.6.c): two calm, two mind, or two added Any powers all pay; 3 energy, a single power, or two FURY power do not", async () => {
    for (const power of [{ calm: 2 }, { mind: 2 }, { rainbow: 2 }, { calm: 1, rainbow: 1 }]) {
      const g = await inHand(4, power).build();
      expect(g.p1.can("play", "cape")).toBe(true);
      await g.p1.play("cape");
      expect(g.p1.energy()).toBe(0);
      expect(g.p1.power()).toBe(0);
    }
    expect((await inHand(3, { calm: 1, mind: 1 }).build()).p1.can("play", "cape")).toBe(false);
    expect((await inHand(9, { calm: 1 }).build()).p1.can("play", "cape")).toBe(false);
    expect((await inHand(9, { fury: 2 }).build()).p1.can("play", "cape")).toBe(false);
    expect((await inHand(9, { calm: 1, fury: 1 }).build()).p1.can("play", "cape")).toBe(false);
  });

  test("[Equip] costs ONE hybrid pip: calm pays, mind pays, an Any power pays — energy alone or a fury power does not; it uses the chain and gives +3 on resolution", async () => {
    expect(equipPairs(await onBoard({}).resources(P1, { energy: 9, power: {} }).build())).toEqual([]);
    expect(equipPairs(await onBoard({ fury: 3 }).build())).toEqual([]);
    for (const [domain, power] of [["calm", { calm: 1 }], ["mind", { mind: 1 }], ["rainbow", { rainbow: 1 }]] as const) {
      const g = await onBoard(power).build();
      expect(equipPairs(g)).toEqual(["cape→ally"]);
      await equip(g, "ally");
      expect(g.p1.power(domain)).toBe(0);
      expect(g.chain()).toEqual([expect.objectContaining({ cardId: "cape", controller: P1, triggered: false })]);
      expect(g.state("ally").might).toBe(2); // pending
      await g.p1.passPriority();
      expect(g.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
      await g.p2.passPriority();
      expect(g.state("cape").attachedTo).toBe("ally");
      expect(g.state("ally")).toMatchObject({ baseMight: 2, might: 5 });
    }
  });

  test("+3 is real Might: the caped 2-Might ally attacks a 4-Might defender, kills it, survives and conquers — the Cape rides along to the battlefield (719.3.a)", async () => {
    const game = await onBoard({ mind: 1 }).battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 4, name: "Wall" }, "wall").build();
    await equip(game, "ally");
    await game.settle();
    await game.p1.move("ally", "bf1");
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.zoneOf("ally")).toBe("battlefield-bf1");
    expect(game.state("ally").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.locationOf("cape")).toBe("bf1");
    expect(game.state("cape").attachedTo).toBe("ally");
    expect(game.violations()).toEqual([]);
  });

  test("control: the bare 2-Might ally into the same 4-Might wall just dies", async () => {
    const game = await onBoard({ mind: 1 }).battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 4, name: "Wall" }, "wall").build();
    await game.p1.move("ally", "bf1");
    await game.settle();
    expect(game.zoneOf("ally")).toBe("trash");
    expect(game.zoneOf("wall")).toBe("battlefield-bf1");
    expect(game.zoneOf("cape")).toBe("base");
  });

  test("[Equip] is default speed (151.2): not during a showdown, not on the opponent's turn", async () => {
    const showdown = await onBoard({ calm: 1 }).battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 1 }, "foe").unit(P1, "base", { might: 3 }, "raider").build();
    await showdown.p1.move("raider", "bf1");
    expect(equipPairs(showdown)).toEqual([]);
    expect((await showdown.p1.try(() => equip(showdown, "ally"))).ok).toBe(false);
    const opp = await onBoard({ calm: 1 }).active(P2).build();
    expect(equipPairs(opp)).toEqual([]);
    expect((await opp.p1.try(() => equip(opp, "ally"))).ok).toBe(false);
  });

  test("partner — Gearhead doubles the BASE bonus: 3 + 3×2 = 9; a plain unit beside it would only get +3", async () => {
    const game = await scenario().resources(P1, { power: { mind: 2 } }).unit(P1, "base", GEARHEAD, "gearhead").unit(P1, "base", { might: 3, name: "Plain" }, "plain").gear(P1, CARD, "cape").build();
    expect(game.state("gearhead").might).toBe(3);
    await equip(game, "gearhead");
    await game.settle();
    expect(game.state("cape").attachedTo).toBe("gearhead");
    expect(game.state("gearhead").might).toBe(9);
    expect(game.state("plain").might).toBe(3);
  });

  test("partner — Weaponmaster (Ornn): on play he may Equip the loose Cape for [rainbow] less, i.e. free; Ornn = 4 + 3 (Cape) + 1 (his own per-gear static)", async () => {
    const game = await scenario().resources(P1, { energy: 6, power: { mind: 1 } }).gear(P1, CARD, "cape").hand(P1, ORNN, "ornn").build();
    await game.p1.play("ornn");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 1 } });
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "equip" });
    await game.p1.pick("cape");
    await game.settle();
    expect(game.state("cape").attachedTo).toBe("ornn");
    expect(game.p1.power("mind")).toBe(1); // the single hybrid pip was waived
    expect(game.state("ornn").might).toBe(8);
  });

  test("[Unique] has no gameplay effect (825.4): two Capes in play both equip and both grant +3", async () => {
    const game = await scenario()
      .resources(P1, { power: { calm: 1, mind: 1 } })
      .unit(P1, "base", { might: 1, name: "A" }, "a")
      .unit(P1, "base", { might: 1, name: "B" }, "b")
      .gear(P1, CARD, "cape")
      .gear(P1, CARD, "cape2")
      .build();
    expect(equipPairs(game)).toEqual(["cape2→a", "cape2→b", "cape→a", "cape→b"]);
    await equip(game, "a");
    await game.settle();
    await equip(game, "b", "cape2");
    await game.settle();
    expect(game.state("a").might).toBe(4);
    expect(game.state("b").might).toBe(4);
    expect(game.p1.power()).toBe(0);
  });

  test("bearer dies ⇒ the Cape detaches where it fell and is recalled to base unattached (719.5 / 149.3) — never to the trash", async () => {
    // Effect Text "When I attack or defend, deal 2 to all enemy units here" resolves first (2 to the
    // Giant), then the 5-Might bearer deals 5 more: 7 < 8, so the Giant survives and the bearer dies.
    const game = await onBoard({ calm: 1 }).battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 8, name: "Giant" }, "giant").build();
    await equip(game, "ally");
    await game.settle();
    expect(game.state("ally").might).toBe(5);
    await game.p1.move("ally", "bf1");
    await game.settle();
    expect(game.zoneOf("ally")).toBe("trash");
    expect(game.zoneOf("giant")).toBe("battlefield-bf1");
    expect(game.zoneOf("cape")).toBe("base");
    expect(game.state("cape")).toMatchObject({ attachedTo: undefined, owner: P1 });
    expect(game.p1.trash()).toEqual(["ally"]);
  });

  test("Effect Text — 'When I attack or defend, deal 2 to all enemy units here': the WEARER's attack trigger hits every enemy there before combat (150.2 / 718.3)", async () => {
    const game = await onBoard({ mind: 1 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Picket" }, "picket")
      .unit(P2, "bf1", { might: 9, name: "Wall" }, "wall")
      .build();
    await equip(game, "ally");
    await game.settle();
    await game.p1.move("ally", "bf1");
    // The trigger is the bearer's (source = ally), one chain item, no target choice ("all enemy units here").
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ally", controller: P1, triggered: true })]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("picket")).toBe("trash"); // 2 ≥ 2 before any combat damage
    expect(game.state("wall").damage).toBe(2);
    await game.settle();
    expect(game.zoneOf("wall")).toBe("battlefield-bf1"); // 2 + 5 < 9
    expect(game.zoneOf("ally")).toBe("trash");
    // Unattached, the Cape confers nothing: a bare attacker triggers no such ability.
    const bare = await onBoard({}).battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 2, name: "Picket" }, "picket").build();
    await bare.p1.move("ally", "bf1");
    expect(bare.chain()).toEqual([]);
  });
});
