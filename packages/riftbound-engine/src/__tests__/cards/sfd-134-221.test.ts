/**
 * Cull — sfd-134-221 · Gear (Equipment) · Chaos · 1 energy (no power) · Might bonus +1
 *
 *   [Equip] [chaos] ([chaos]: Attach this to a unit you control.)
 *
 * Rules: 818 (Equip is an activated ability: "[cost]: Attach this to a unit you control" — a chain
 * item, target = a unit you control), 137.3 (the +1 applies only while attached), 149.1 (gear enters
 * ready in the base), 135.2.e.5.a (a pooled [rainbow] pays a named-domain pip), 718.2 (rules text of an
 * attached card is inactive → no re-Equip hop), 457.1 (loose gear at a battlefield is recalled),
 * 821 (Weaponmaster: Equip on play for [rainbow] less), 151.2 (gear abilities: your Main Phase, Open
 * State, not in a Showdown).
 *
 * Head-judge checklist (trickiest situations for THIS card):
 *  1. Two different costs: [1] energy PLAYS it (nothing attaches); the Equip is one CHAOS power and no
 *     energy. Fury power cannot pay [chaos]; a pooled [rainbow] can.
 *  2. Cheapest Equipment in the set (1): it is exactly what Rell, Magnetic's "Equipment with Energy cost
 *     no more than [2], ignoring its cost … attach it to me" wants — from hand, mid-attack, before damage.
 *  3. Master Bingwen (the chaos Weaponmaster): [chaos] − [rainbow] = free attach on play, 6 → 7.
 *  4. +1 decides combats: 3+1 into a 3 kills and survives; when the wearer dies Cull drops off, is
 *     recalled to base unattached and can be equipped again for another [chaos].
 *  5. Negative space: enemy units are never Equip targets; while attached it cannot hop; not on the
 *     opponent's turn; not during a showdown; 0 energy cannot play it even with chaos power to spare.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-134-221";
const MASTER_BINGWEN = "sfd-127-221"; // Chaos · 6 · 6 Might · [Weaponmaster]
const RELL = "sfd-024-221"; // Fury · 4 · 4 Might · [Tank] · When I attack, you may play an Equipment (energy ≤ 2) ignoring its cost, attach it to me.

async function equip(game: Game, unitId: string): Promise<void> {
  await game.p1.choose("equipCard:-", { params: { equipmentId: "cull", unitId } });
  await game.settle();
}

describe("Cull (sfd-134-221)", () => {
  test("registry payload: a 1-cost chaos Equipment with +1 Might bonus whose only ability is [Equip] costing [chaos] (no energy)", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ domain: "chaos", energyCost: 1, mightBonus: 1, name: "Cull" });
    expect(["gear", "equipment"]).toContain(def?.cardType as string);
    expect(def?.powerCost ?? []).toEqual([]);
    // Effect Text (gallery `effect`, rule 136 / 150.2 / 718.3): "When I conquer, play a Gold gear token exhausted." —
    // conferred on the equipped unit while attached, hence the `effectText: true` entries.
    expect(def?.abilities).toEqual([
      { cost: { power: ["chaos"] }, keyword: "Equip", type: "keyword" },
      { effect: { ready: false, token: { name: "Gold", type: "gear" }, type: "create-token" }, effectText: true, trigger: { event: "conquer", on: "self" }, type: "triggered" },
    ] as never);
  });

  test("play cost: exactly 1 energy and no power; enters the base READY and unattached, buffing nobody; 0 energy (with chaos to spare) cannot play it", async () => {
    const game = await scenario().resources(P1, { energy: 2, power: { chaos: 1 } }).unit(P1, "base", { might: 2 }, "ally").hand(P1, CARD, "cull").build();
    await game.p1.play("cull");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { chaos: 1 } });
    await game.settle();
    expect(game.zoneOf("cull")).toBe("base");
    expect(game.state("cull")).toMatchObject({ attachedTo: undefined, isReady: true, keywords: ["Equip"] });
    expect(game.state("ally").might).toBe(2);
    const broke = await scenario().resources(P1, { energy: 0, power: { chaos: 3 } }).hand(P1, CARD, "cull").build();
    expect(broke.p1.can("play", "cull")).toBe(false);
  });

  test("Equip [chaos]: one chaos power and NO energy, a chain item the opponent may answer, attaches on resolution for +1 (2 → 3)", async () => {
    const game = await scenario().resources(P1, { energy: 0, power: { chaos: 1 } }).unit(P1, "base", { might: 2 }, "ally").gear(P1, CARD, "cull").build();
    await game.p1.choose("equipCard:-", { params: { equipmentId: "cull", unitId: "ally" } });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "cull", controller: P1 })]);
    expect(game.state("cull").attachedTo).toBeUndefined();
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    await game.settle();
    expect(game.state("cull").attachedTo).toBe("ally");
    expect(game.state("ally")).toMatchObject({ attachments: ["cull"], baseMight: 2, might: 3 });
    expect(game.violations()).toEqual([]);
  });

  test("cost domain: fury power or plain energy cannot pay [chaos]; a pooled [rainbow] can (135.2.e.5.a)", async () => {
    expect((await scenario().resources(P1, { energy: 5, power: { fury: 2 } }).unit(P1, "base", { might: 2 }, "ally").gear(P1, CARD, "cull").build()).p1.can("equipCard")).toBe(false);
    const rainbow = await scenario().resources(P1, { power: { rainbow: 1 } }).unit(P1, "base", { might: 2 }, "ally").gear(P1, CARD, "cull").build();
    expect(rainbow.p1.can("equipCard")).toBe(true);
    await equip(rainbow, "ally");
    expect(rainbow.state("cull").attachedTo).toBe("ally");
    expect(rainbow.p1.power()).toBe(0);
  });

  test("'a unit you control': enemy units are never offered; a friendly unit at a battlefield is, and Cull relocates there without a showdown", async () => {
    const game = await scenario()
      .resources(P1, { power: { chaos: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "base", { might: 2 }, "home")
      .unit(P1, "bf1", { might: 3 }, "afield")
      .unit(P2, "base", { might: 2 }, "enemy")
      .gear(P1, CARD, "cull")
      .build();
    expect([...(game.p1.option("equipCard")?.fields.find((f) => f.name === "unitId")?.options ?? [])].map(String).sort()).toEqual(["afield", "home"]);
    expect((await game.p1.try((p) => p.choose("equipCard:-", { params: { equipmentId: "cull", unitId: "enemy" } }))).ok).toBe(false);
    await equip(game, "afield");
    expect(game.zoneOf("cull")).toBe("battlefield-bf1");
    expect(game.state("afield").might).toBe(4);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("+1 decides the fight: a 3+1 wearer into a 3-Might defender kills it, survives and conquers; Cull rides along still attached", async () => {
    const game = await scenario()
      .resources(P1, { power: { chaos: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 3, name: "Wearer" }, "wearer")
      .unit(P2, "bf1", { might: 3, name: "Guard" }, "guard")
      .gear(P1, CARD, "cull")
      .build();
    await equip(game, "wearer");
    await game.p1.move("wearer", "bf1");
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.locationOf("wearer")).toBe("bf1");
    expect(game.state("cull")).toMatchObject({ attachedTo: "wearer", zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("wearer dies: Cull detaches, is recalled to base unattached (+1 gone), and can be equipped to another unit for another [chaos]", async () => {
    const game = await scenario()
      .resources(P1, { power: { chaos: 2 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 1, name: "Doomed" }, "doomed")
      .unit(P1, "base", { might: 2, name: "Heir" }, "heir")
      .unit(P2, "bf1", { might: 6, name: "Wall" }, "wall")
      .gear(P1, CARD, "cull")
      .build();
    await equip(game, "doomed");
    await game.p1.move("doomed", "bf1");
    await game.settle();
    expect(game.zoneOf("doomed")).toBe("trash");
    expect(game.zoneOf("cull")).toBe("base");
    expect(game.state("cull").attachedTo).toBeUndefined();
    expect(game.state("heir").might).toBe(2);
    await equip(game, "heir");
    expect(game.state("heir").might).toBe(3);
    expect(game.p1.power("chaos")).toBe(0);
  });

  test("while attached its Equip is inactive (718.2): with power to spare it cannot hop to a second unit", async () => {
    const game = await scenario().resources(P1, { power: { chaos: 3 } }).unit(P1, "base", { might: 2 }, "first").unit(P1, "base", { might: 2 }, "second").gear(P1, CARD, "cull").build();
    await equip(game, "first");
    expect(game.p1.can("equipCard")).toBe(false);
    expect((await game.p1.try((p) => p.choose("equipCard:-", { params: { equipmentId: "cull", unitId: "second" } }))).ok).toBe(false);
    expect(game.state("cull").attachedTo).toBe("first");
    expect(game.state("second").might).toBe(2);
  });

  test("timing (151.2): Equip is not offered on the opponent's turn, nor during a showdown on your own turn", async () => {
    expect((await scenario().active(P2).resources(P1, { power: { chaos: 1 } }).unit(P1, "base", { might: 2 }, "ally").gear(P1, CARD, "cull").build()).p1.can("equipCard")).toBe(false);
    const game = await scenario()
      .resources(P1, { power: { chaos: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3 }, "guard")
      .unit(P1, "base", { might: 3 }, "runner")
      .unit(P1, "base", { might: 2 }, "ally")
      .gear(P1, CARD, "cull")
      .build();
    expect(game.p1.can("equipCard")).toBe(true);
    await game.p1.move("runner", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("equipCard")).toBe(false);
  });

  test("Weaponmaster partner — Master Bingwen played for 6 may take Cull for [chaos] − [rainbow] = nothing: attached, 6 → 7, pool empty", async () => {
    const game = await scenario().resources(P1, { energy: 6 }).gear(P1, CARD, "cull").hand(P1, MASTER_BINGWEN, "bw").build();
    await game.p1.play("bw");
    expect(game.decision()).toMatchObject({ allowDecline: true, kind: "pick", seat: P1 });
    expect((game.decision() as { options: { card?: string }[] }).options.map((o) => o.card)).toEqual(["cull"]);
    await game.p1.pick("cull");
    await game.settle();
    expect(game.state("cull").attachedTo).toBe("bw");
    expect(game.state("bw").might).toBe(7);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
  });

  test("Rell, Magnetic partner — on attack Rell may play the 1-cost Cull from HAND ignoring its cost and attach it: 4+1 = 5 kills a 4-Might defender before damage, Rell survives and conquers, nothing spent", async () => {
    const game = await scenario()
      .resources(P1, { energy: 0 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 4, name: "Foe" }, "foe")
      .unit(P1, "base", RELL, "rell")
      .hand(P1, CARD, "cull")
      .build();
    await game.p1.move("rell", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rell", triggered: true })]);
    expect((await game.settle()).reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    for (let i = 0; i < 4; i++) {
      const r = await game.settle();
      const d = game.decision();
      if (r.reason !== "unanswered" || d?.kind !== "pick" || d.seat !== P1) {
        break;
      }
      await game.p1.pick("cull");
    }
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.state("cull").attachedTo).toBe("rell");
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.locationOf("rell")).toBe("bf1"); // took 4 < 5
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });
});
