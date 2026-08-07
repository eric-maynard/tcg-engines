/**
 * Pendulum Blade — ven-011-166 · Gear (Equipment) · Fury · 3 energy · Might bonus +1
 *
 *   [Equip] [fury] ([fury]: Attach this to a unit you control.)
 *
 * Head-judge checklist (the tricky spots this file covers):
 *  1. Two separate costs: [3] PLAYS the gear (enters the base ready and unattached, 149.1);
 *     [fury] is the Equip activation. Playing it never attaches it; calm power cannot pay [fury].
 *  2. Equip targets only "a unit you control" (818.1.c.2): enemy units are never offered; a friendly
 *     unit at a battlefield is legal and the Blade relocates there (434.4 — not a Move).
 *  3. +1 Might applies only while attached (137.3.a). When the wearer dies the Blade detaches, stays on
 *     the board (719.5) and is recalled to base (457.1), unattached and re-equippable.
 *  4. Timing (381): an activated ability — only on your turn in an open state; not on the opponent's
 *     turn, not while a showdown is open.
 *  5. While attached its rules text is inactive (718.2): Equip cannot be re-activated to hop to another
 *     unit. Weaponmaster (Sentinel Adept) is the exception and pays [fury] − [rainbow] = nothing.
 *  6. Equip is an activated ability and uses the chain (377.3, 818.1.c.1) — the opponent must get a
 *     response window before the attach. The engine attaches instantly → BUG.
 *  7. It counts as one Equipment for "for each Equipment attached to me" (Riven, Shattered).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, peekDefaultCardPool, scenario } from "../../harness";

const CARD = "ven-011-166";
const SENTINEL_ADEPT = "sfd-008-221"; // Fury unit, 3: [Weaponmaster]
const RIVEN = "ven-041-166"; // When I attack, deal 2 to an enemy unit here for each Equipment attached to me.

async function equip(game: Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>, unitId: string) {
  await game.p1.choose("equipCard:-", { params: { equipmentId: "pb", unitId } });
  await game.settle();
}

describe("Pendulum Blade (ven-011-166)", () => {
  test("registry payload: a fury gear costing 3 with an Equip keyword ability costing [fury] and a +1 Might bonus", async () => {
    await scenario().build();
    const def = peekDefaultCardPool()?.get(CARD);
    expect(def).toMatchObject({ cardType: "gear", domain: "fury", energyCost: 3, mightBonus: 1, name: "Pendulum Blade" });
    expect(def?.abilities).toEqual([{ cost: { power: ["fury"] }, keyword: "Equip", type: "keyword" }]);
  });

  test("play cost: 3 energy, no power; enters the base READY and unattached; nothing is attached by playing it; 2 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).unit(P1, "base", { might: 2 }, "ally").hand(P1, CARD, "pb").build();
    await game.p1.play("pb");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("pb")).toBe("base");
    expect(game.state("pb")).toMatchObject({ attachedTo: undefined, isReady: true, keywords: ["Equip"] });
    expect(game.state("ally").might).toBe(2);
    expect(game.p1.can("equipCard")).toBe(false); // no [fury] to pay the Equip
    const poor = await scenario().resources(P1, { energy: 2, power: { fury: 3 } }).hand(P1, CARD, "pb").build();
    expect(poor.p1.can("play", "pb")).toBe(false);
  });

  test("Equip [fury]: pays exactly one fury power (no energy), attaches to the chosen friendly unit, +1 Might", async () => {
    const game = await scenario().resources(P1, { energy: 2, power: { fury: 2 } }).unit(P1, "base", { might: 2 }, "ally").gear(P1, CARD, "pb").build();
    await equip(game, "ally");
    expect(game.p1.resources()).toEqual({ energy: 2, power: { fury: 1 } });
    expect(game.state("pb").attachedTo).toBe("ally");
    expect(game.state("ally")).toMatchObject({ attachments: ["pb"], baseMight: 2, might: 3 });
    expect(game.violations()).toEqual([]);
  });

  test("cost domain matters: calm power or plain energy cannot pay [fury] → Equip is not offered", async () => {
    const calm = await scenario().resources(P1, { energy: 5, power: { calm: 2 } }).unit(P1, "base", { might: 2 }, "ally").gear(P1, CARD, "pb").build();
    expect(calm.p1.can("equipCard")).toBe(false);
    const fury = await scenario().resources(P1, { power: { fury: 1 } }).unit(P1, "base", { might: 2 }, "ally").gear(P1, CARD, "pb").build();
    expect(fury.p1.can("equipCard")).toBe(true);
  });

  test("'a unit you control': enemy units are never legal targets; with no friendly unit on board there is nothing to Equip", async () => {
    const game = await scenario()
      .resources(P1, { power: { fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "base", { might: 2 }, "home")
      .unit(P1, "bf1", { might: 3 }, "afield")
      .unit(P2, "base", { might: 2 }, "enemy")
      .gear(P1, CARD, "pb")
      .build();
    const units = game.p1.option("equipCard")?.fields.find((f) => f.name === "unitId")?.options;
    expect([...(units ?? [])].toSorted()).toEqual(["afield", "home"]);
    const r = await game.p1.try((p) => p.choose("equipCard:-", { params: { equipmentId: "pb", unitId: "enemy" } }));
    expect(r.ok).toBe(false);
    const lonely = await scenario().resources(P1, { power: { fury: 1 } }).unit(P2, "base", { might: 2 }, "enemy").gear(P1, CARD, "pb").build();
    expect(lonely.p1.can("equipCard")).toBe(false);
  });

  test("equipping a unit at a battlefield relocates the Blade there (434.4) — that relocation is not a Move and starts no showdown", async () => {
    const game = await scenario()
      .resources(P1, { power: { fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Afield" }, "afield")
      .gear(P1, CARD, "pb")
      .build();
    await equip(game, "afield");
    expect(game.zoneOf("pb")).toBe("battlefield-bf1");
    expect(game.state("afield").might).toBe(4);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("the Blade rides along on moves and its +1 counts in combat: a 3+1 wearer kills a 3-Might defender, survives and conquers", async () => {
    const game = await scenario()
      .resources(P1, { power: { fury: 1 } })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "base", { might: 3, name: "Wearer" }, "wearer")
      .unit(P2, "bf2", { might: 3, name: "Defender" }, "def")
      .gear(P1, CARD, "pb")
      .build();
    await equip(game, "wearer");
    expect(game.state("wearer").might).toBe(4);
    await game.p1.move("wearer", "bf2");
    expect(game.zoneOf("pb")).toBe("battlefield-bf2");
    await game.settle();
    expect(game.zoneOf("def")).toBe("trash"); // took 4 ≥ 3
    expect(game.locationOf("wearer")).toBe("bf2"); // took 3 < 4
    expect(game.state("pb").attachedTo).toBe("wearer");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("wearer dies in combat: the Blade detaches, stays on the board and is recalled to base unattached; it can be equipped again for another [fury]", async () => {
    const game = await scenario()
      .resources(P1, { power: { fury: 2 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 1, name: "Doomed" }, "doomed")
      .unit(P1, "base", { might: 2, name: "Heir" }, "heir")
      .unit(P2, "bf1", { might: 5, name: "Wall" }, "wall")
      .gear(P1, CARD, "pb")
      .build();
    await equip(game, "doomed");
    expect(game.state("doomed").might).toBe(2);
    await game.p1.move("doomed", "bf1");
    await game.settle();
    expect(game.zoneOf("doomed")).toBe("trash");
    expect(game.zoneOf("pb")).toBe("base");
    expect(game.state("pb").attachedTo).toBeUndefined();
    expect(game.zoneOf("wall")).toBe("battlefield-bf1"); // took 1+1 = 2 < 5 (healed at combat cleanup, 143.3.b.2)
    await equip(game, "heir");
    expect(game.state("heir").might).toBe(3);
    expect(game.p1.resources().power).toEqual({ fury: 0 });
  });

  test("while attached, Equip is inactive (718.2): it cannot be re-activated to hop onto another unit", async () => {
    const game = await scenario()
      .resources(P1, { power: { fury: 3 } })
      .unit(P1, "base", { might: 2 }, "first")
      .unit(P1, "base", { might: 2 }, "second")
      .gear(P1, CARD, "pb")
      .build();
    await equip(game, "first");
    expect(game.p1.can("equipCard")).toBe(false);
    const r = await game.p1.try((p) => p.choose("equipCard:-", { params: { equipmentId: "pb", unitId: "second" } }));
    expect(r.ok).toBe(false);
    expect(game.state("pb").attachedTo).toBe("first");
    expect(game.state("second").might).toBe(2);
  });

  test("timing (381): Equip cannot be activated on the opponent's turn", async () => {
    const oppTurn = await scenario().active(P2).resources(P1, { power: { fury: 1 } }).unit(P1, "base", { might: 2 }, "ally").gear(P1, CARD, "pb").build();
    expect(oppTurn.p1.can("equipCard")).toBe(false);
    expect(oppTurn.p1.legal().map((o) => o.moveId)).not.toContain("equipCard");
  });

  test("timing (151.2) — a gear's activated ability may not be used during a Showdown, even with Focus on your own turn", async () => {
    const game = await scenario()
      .resources(P1, { power: { fury: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 3 }, "attacker")
      .unit(P1, "base", { might: 2 }, "ally")
      .unit(P2, "bf1", { might: 3 }, "def")
      .gear(P1, CARD, "pb")
      .build();
    expect(game.p1.can("equipCard")).toBe(true);
    await game.p1.move("attacker", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("equipCard")).toBe(false);
  });

  test("Weaponmaster (Sentinel Adept): on play it may take the Blade for [fury] − [rainbow] = free, becoming 4 Might", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).gear(P1, CARD, "pb").hand(P1, SENTINEL_ADEPT, "adept").build();
    await game.p1.play("adept");
    expect(game.decision()).toMatchObject({ allowDecline: true, kind: "pick", seat: P1 });
    expect((game.decision() as { options: { card?: string }[] }).options.map((o) => o.card)).toEqual(["pb"]);
    await game.p1.pick("pb");
    await game.settle();
    expect(game.state("pb").attachedTo).toBe("adept");
    expect(game.state("adept").might).toBe(4);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
  });

  test("it is an Equipment for counting effects: Riven, Shattered wearing it deals 2 on attack (2 + 4 combat kills a 6-Might defender)", async () => {
    const game = await scenario()
      .resources(P1, { power: { fury: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", RIVEN, "riven")
      .unit(P2, "bf1", { might: 6, name: "Ogre" }, "ogre")
      .gear(P1, CARD, "pb")
      .build();
    await equip(game, "riven");
    expect(game.state("riven").might).toBe(4);
    await game.p1.move("riven", "bf1");
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("ogre");
      await game.settle();
    }
    expect(game.zoneOf("ogre")).toBe("trash"); // 2 (trigger, one Equipment) + 4 (combat) = 6
    expect(game.zoneOf("riven")).toBe("trash"); // took 6 ≥ 4
    expect(game.zoneOf("pb")).toBe("base"); // recalled, unattached
  });

  test("Equip is an activated ability and uses the chain (377.3 / 818.1.c.1) — the opponent gets priority before the attach happens", async () => {
    // Expected: activating Equip pays [fury], puts a P1 ability item on the chain; the Blade is not yet
    // attached and P2 may respond; after both pass it attaches. Actual: equipCard attaches immediately, no chain.
    const game = await scenario().resources(P1, { power: { fury: 1 } }).unit(P1, "base", { might: 2 }, "ally").gear(P1, CARD, "pb").build();
    await game.p1.choose("equipCard:-", { params: { equipmentId: "pb", unitId: "ally" } });
    expect(game.p1.resources().power).toEqual({ fury: 0 });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "pb", controller: P1 })]);
    expect(game.state("pb").attachedTo).toBeUndefined();
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    await game.settle();
    expect(game.state("pb").attachedTo).toBe("ally");
    expect(game.state("ally").might).toBe(3);
  });
});
