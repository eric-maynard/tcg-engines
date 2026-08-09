/**
 * Spinning Axe — sfd-186-221 · Gear — Equipment · Fury/Chaos · 2 energy + [rainbow] · Might bonus +3
 *
 *   [Quick-Draw] (This has [Reaction]. When you play it, attach it to a unit you control.)
 *   [Equip] [rainbow] ([rainbow]: Attach this to a unit you control.)
 *   [Temporary] (If this is unattached, kill it at the start of its controller's Beginning Phase,
 *   before scoring.)
 *
 * Rules: 819 (Quick-Draw = inherent [Reaction] + "When you play this, attach it to a unit you control";
 * Reaction 813 = default timing ∪ Action's showdowns ∪ Closed states on ANY turn — but NOT an opponent's
 * Neutral Open state, 316.5.b), 818 (Equip [C] — the data spells the pip "rainbow" but on this two-domain
 * card it is the split Fury/Chaos capsule: payable by fury OR chaos power, or by universal [A] power added
 * to the pool, never by a third domain — 135.2.e.6.c / 135.2.e.5.b; the play cost's pip likewise), 816
 * (Temporary is a TRIGGERED ability: at the start of its CONTROLLER's Beginning Phase, before scoring,
 * kill this — it goes on the chain), 718.2 / 721.2 / 722.2 (while ATTACHED its rules text is Inactive:
 * Temporary does not trigger — the reminder text's "if this is unattached"), 434.1.d (+3 while attached),
 * 719.5 + 457.1 (holder dies ⇒ Axe detaches, is recalled to base loose… and is Temporary again).
 *
 * Head-judge corner cases covered here:
 *   1. Quick-Draw attach: forced with one friendly unit, a pick with two, and with ZERO units the Axe
 *      simply enters base loose (no target, 402.4) — where Temporary will eat it next turn.
 *   2. Reaction speed: in response to the opponent's removal spell on THEIR turn the +3 lands first and
 *      the unit survives; during a combat showdown as the attacker it swings the fight.
 *   3. Reaction is not "any time": in the opponent's Neutral Open state it must not be playable.
 *   4. Temporary: loose Axe dies at the start of ITS CONTROLLER's Beginning Phase (on the chain, before
 *      the Hold point is scored), survives the opponent's; an ATTACHED Axe must survive its own.
 *   5. Full cycle: attach → holder killed → Axe back in base loose → killed at P1's next Beginning Phase.
 *   6. Costs: 2 energy + 1 fury/chaos power to play; Equip is 1 fury/chaos power, no energy; mind pays neither.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";
import { getGlobalCardRegistry } from "../../operations/card-lookup";

const CARD = "sfd-186-221";
const BOLT = (n: number) => ({
  abilities: [{ effect: { amount: n, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: `Bolt ${n}`,
  timing: "action",
});

describe("Spinning Axe (sfd-186-221)", () => {
  test("registry payload: Equipment, 2 energy + [rainbow], +3, keywords exactly [Quick-Draw, Equip[rainbow], Temporary]", async () => {
    const game = await scenario().hand(P1, CARD, "axe").build();
    expect(game.state("axe")).toMatchObject({ cardType: "equipment", energyCost: 2, name: "Spinning Axe" });
    expect(game.state("axe").powerCost).toEqual(["rainbow"]);
    expect(getGlobalCardRegistry().get("axe")?.mightBonus).toBe(3);
    expect(getGlobalCardRegistry().getAbilities("axe")).toEqual([
      { keyword: "Quick-Draw", type: "keyword" },
      { cost: { power: ["rainbow"] }, keyword: "Equip", type: "keyword" },
      { keyword: "Temporary", type: "keyword" },
    ] as never);
    expect(game.state("axe").keywords).toEqual(expect.arrayContaining(["Quick-Draw", "Equip", "Temporary"]));
  });

  test("cost + Quick-Draw with ONE friendly unit: pays 2 energy + 1 power (fury here) and attaches to it at once (+3); short on energy or power ⇒ unplayable", async () => {
    const game = await scenario().resources(P1, { energy: 2, power: { fury: 1 } }).unit(P1, "base", { might: 2, name: "Ally" }, "ally").hand(P1, CARD, "axe").build();
    await game.p1.play("axe");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.settle();
    expect(game.state("axe").attachedTo).toBe("ally");
    expect(game.state("ally")).toMatchObject({ attachments: ["axe"], baseMight: 2, might: 5 });
    expect((await scenario().resources(P1, { energy: 2 }).unit(P1, "base", { might: 2 }, "a").hand(P1, CARD, "axe").build()).p1.can("play", "axe")).toBe(false);
    expect((await scenario().resources(P1, { energy: 1, power: { chaos: 3 } }).unit(P1, "base", { might: 2 }, "a").hand(P1, CARD, "axe").build()).p1.can("play", "axe")).toBe(false);
  });

  test("Quick-Draw with TWO friendly units asks which (enemy units not offered); the chosen battlefield unit gets it and the Axe is at that battlefield", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { chaos: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
      .unit(P1, "bf1", { might: 3, name: "Out" }, "out")
      .unit(P2, "base", { might: 3, name: "Foe" }, "foe")
      .hand(P1, CARD, "axe")
      .build();
    await game.p1.play("axe");
    await game.settle();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card).sort() : []).toEqual(["ally", "out"]);
    await game.p1.pick("out");
    await game.settle();
    expect(game.state("axe").attachedTo).toBe("out");
    expect(game.zoneOf("axe")).toBe("battlefield-bf1");
    expect(game.state("out").might).toBe(6);
    expect(game.state("ally").might).toBe(2);
  });

  test("Quick-Draw with NO friendly unit: still playable — the Axe enters base loose (nothing to attach to)", async () => {
    const game = await scenario().resources(P1, { energy: 2, power: { chaos: 1 } }).unit(P2, "base", { might: 2 }, "foe").hand(P1, CARD, "axe").build();
    expect(game.p1.can("play", "axe")).toBe(true);
    await game.p1.play("axe");
    await game.settle();
    expect(game.zoneOf("axe")).toBe("base");
    expect(game.state("axe").attachedTo).toBeUndefined();
    expect(game.state("foe").attachments).toEqual([]);
  });

  test("[Reaction] on the OPPONENT's turn: in response to their 4-damage spell, P1 plays the Axe onto the 2-Might target — it resolves first (LIFO), Ally is 5 Might when the bolt lands and survives", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 2, power: { chaos: 1 } })
      .resources(P2, { energy: 1 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Ally" }, "ally")
      .hand(P1, CARD, "axe")
      .hand(P2, BOLT(4), "bolt")
      .build();
    await game.p2.cast("bolt", { targets: "ally" });
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("play", "axe")).toBe(true);
    await game.p1.play("axe");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    await game.settle();
    expect(game.zoneOf("bolt")).toBe("trash");
    expect(game.zoneOf("ally")).toBe("battlefield-bf1");
    expect(game.state("ally")).toMatchObject({ damage: 4, might: 5 });
    expect(game.state("axe").attachedTo).toBe("ally");
  });

  test("[Reaction] ⊇ [Action]: playable while P1 holds Focus in a combat showdown — Ally (2→5) then kills the 4-Might defender and conquers", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { fury: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 4, name: "Foe" }, "foe")
      .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
      .hand(P1, CARD, "axe")
      .build();
    await game.p1.move("ally", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", seat: P1 });
    await game.p1.play("axe");
    expect(game.state("ally").might).toBe(5);
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.zoneOf("ally")).toBe("battlefield-bf1");
    expect(game.zoneOf("axe")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("[Reaction] is not 'any time' — in the opponent's NEUTRAL OPEN state (no chain, no showdown) only the turn player may play cards (316.5.b, 813.1.c.1)", async () => {
    // Expected: on P2's turn with nothing happening, P1 has no legal play for the Axe. Actual: playGear:axe is offered.
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 2, power: { chaos: 1 } })
      .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
      .hand(P1, CARD, "axe")
      .build();
    expect(game.chain()).toEqual([]);
    expect(game.p1.can("play", "axe")).toBe(false);
  });

  test("[Equip] on a loose Axe: costs 1 chaos (or fury) power and no energy; goes on the chain; +3 on resolution; with no power (energy only) it is not offered", async () => {
    const game = await scenario().resources(P1, { energy: 0, power: { chaos: 1 } }).unit(P1, "base", { might: 2, name: "Ally" }, "ally").gear(P1, CARD, "axe").build();
    await game.p1.do("equipCard", { equipmentId: "axe", unitId: "ally" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.chain()).toHaveLength(1);
    await game.settle();
    expect(game.state("ally")).toMatchObject({ attachments: ["axe"], might: 5 });
    const none = await scenario().resources(P1, { energy: 5 }).unit(P1, "base", { might: 2 }, "ally").gear(P1, CARD, "axe").build();
    expect(none.p1.legal().some((o) => o.moveId === "equipCard")).toBe(false);
  });

  test("the printed pip is a split Fury/Chaos capsule (135.2.e.6.c): a MIND power pays neither the play cost nor the Equip cost, while universal [A] power in the pool (135.2.e.5.b) pays both", async () => {
    expect((await scenario().resources(P1, { energy: 2, power: { mind: 1 } }).unit(P1, "base", { might: 2 }, "a").hand(P1, CARD, "axe").build()).p1.can("play", "axe")).toBe(false);
    const mindEquip = await scenario().resources(P1, { power: { mind: 2 } }).unit(P1, "base", { might: 2 }, "a").gear(P1, CARD, "axe").build();
    expect(mindEquip.p1.legal().some((o) => o.moveId === "equipCard")).toBe(false);
    expect((await mindEquip.p1.try((p) => p.do("equipCard", { equipmentId: "axe", unitId: "a" }))).ok).toBe(false);
    expect((await scenario().resources(P1, { energy: 2, power: { rainbow: 1 } }).unit(P1, "base", { might: 2 }, "a").hand(P1, CARD, "axe").build()).p1.can("play", "axe")).toBe(true);
    const anyEquip = await scenario().resources(P1, { power: { rainbow: 1 } }).unit(P1, "base", { might: 2 }, "a").gear(P1, CARD, "axe").build();
    await anyEquip.p1.do("equipCard", { equipmentId: "axe", unitId: "a" });
    expect(anyEquip.p1.power()).toBe(0);
  });

  test("[Temporary] on a LOOSE Axe: at the start of P1's Beginning Phase a triggered kill goes on the chain BEFORE the Hold point is scored; it resolves to the trash, then P1 still scores the hold", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
      .gear(P1, CARD, "axe")
      .build();
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "axe", controller: P1, triggered: true })]);
    expect(game.p1.points()).toBe(0); // "before scoring"
    expect(game.zoneOf("axe")).toBe("base"); // a trigger: nothing happens until it resolves
    await game.settle();
    expect(game.zoneOf("axe")).toBe("trash");
    expect(game.p1.points()).toBe(1); // the Hold at bf1 scored afterwards
    expect(game.phase()).toBe("main");
  });

  test("[Temporary] is keyed to ITS CONTROLLER's Beginning Phase: P1's loose Axe survives the start of P2's turn", async () => {
    const game = await scenario().turn(3).active(P1).unit(P1, "base", { might: 2 }, "ally").gear(P1, CARD, "axe").build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.zoneOf("axe")).toBe("base");
    expect(game.chain()).toEqual([]);
  });

  test.failing("BUG: an ATTACHED Axe is not killed by [Temporary] — attached rules text is Inactive (718.2 / 721.2; reminder: 'if this is unattached'), so it stays on its holder through P1's Beginning Phase", async () => {
    // Expected: after P2's turn ends, no Temporary item for the attached Axe; it is still attached, holder still 5 Might.
    // Actual: the Beginning-Phase step queues the kill for every Temporary permanent regardless of attachment → Axe trashed.
    const game = await scenario()
      .turn(2)
      .active(P2)
      .unit(P1, "base", { might: 2, name: "Ally" }, "ally", { equippedWith: ["axe"] })
      .card("axe", { def: CARD, meta: { attachedTo: "ally" }, owner: P1, zone: "base" })
      .build();
    expect(game.state("ally").might).toBe(5);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.zoneOf("axe")).toBe("base");
    expect(game.state("axe").attachedTo).toBe("ally");
    expect(game.state("ally").might).toBe(5);
  });

  test("full cycle: Quick-Draw onto Out at bf1 → Out is killed → the Axe detaches and is recalled to base loose (457.1) → at P1's next Beginning Phase Temporary kills it", async () => {
    const game = await scenario()
      .turn(3)
      .active(P1)
      .resources(P1, { energy: 3, power: { fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 1, name: "Out" }, "out")
      .hand(P1, CARD, "axe")
      .hand(P1, BOLT(4), "bolt")
      .build();
    await game.p1.play("axe");
    await game.settle();
    expect(game.state("out").might).toBe(4);
    expect(game.zoneOf("axe")).toBe("battlefield-bf1");
    await game.p1.cast("bolt", { targets: "out" }); // 4 ≥ 4
    await game.settle();
    expect(game.zoneOf("out")).toBe("trash");
    expect(game.zoneOf("axe")).toBe("base");
    expect(game.state("axe").attachedTo).toBeUndefined();
    await game.advanceTurn(); // → P2
    expect(game.zoneOf("axe")).toBe("base");
    await game.advanceTurn(); // → P1: Temporary
    expect(game.turnPlayer()).toBe(P1);
    expect(game.zoneOf("axe")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
