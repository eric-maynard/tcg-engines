/**
 * Doran's Ring — sfd-124-221 · Gear — Equipment · Chaos · 1 energy · Might bonus +1
 *
 *   [Equip] [chaos] ([chaos]: Attach this to a unit you control.)
 *
 * Rules: 150 (Equipment is Gear: played to base like any gear, 143.1.a.1), 818 (Equip is an
 * ACTIVATED ability "[chaos]: Attach this to a unit you control" — its choice is a target, it uses
 * the chain, 818.1.b.1 / 377.3), 151.2 + 381 (gear abilities: your Main Phase, Open state, no
 * showdown), 718.4 / 434.1.d (while attached the +1 Might bonus modulates the holder), 719.3.a
 * (attached cards travel with the holder), 719.5 + 435.4 + 457.1 (holder leaves the board ⇒ the
 * Equipment detaches where it was and is recalled to base at the next cleanup — it survives),
 * 819 (NO Quick-Draw here: playing it never attaches it), 816 (NO Temporary: it never self-kills).
 *
 * Head-judge corner cases covered here:
 *   1. Negative space vs its flashier cousins: exactly one friendly unit on board and the Ring still
 *      lands LOOSE in base (no Quick-Draw auto-attach); an unattached Ring survives its controller's
 *      Beginning Phase (no Temporary).
 *   2. The Equip pip is a CHAOS power specifically — fury/rainbow-less pools cannot pay it; energy is
 *      never charged for Equip.
 *   3. Attach target must be a unit YOU control (an enemy unit is never enumerated), and may be at a
 *      battlefield — the Ring relocates there (434.4).
 *   4. Payoff arithmetic: 2-Might holder reads 3 and survives exactly 2 damage; dies to 3.
 *   5. Holder dies ⇒ Ring stays on the board unattached, bonus gone, and can be re-equipped later.
 *   6. Detonate (kill a gear) on the attached Ring: holder drops back to printed Might immediately.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";
import { getGlobalCardRegistry } from "../../operations/card-lookup";

const CARD = "sfd-124-221";
const DETONATE = "sfd-005-221"; // 1 + [fury]: Kill a gear. Its controller draws 2.
const BOLT = (n: number) => ({
  abilities: [{ effect: { amount: n, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: `Bolt ${n}`,
  timing: "action",
});

/** Ring already in play (loose in base), Ally (2) in base, Out (2) at bf1, enemy Foe (2) at bf1's neighbour. */
function board(power: Record<string, number> = { chaos: 1 }) {
  return scenario()
    .resources(P1, { energy: 3, power })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
    .unit(P1, "bf1", { might: 2, name: "Out" }, "out")
    .unit(P2, "bf2", { might: 2, name: "Foe" }, "foe")
    .gear(P1, CARD, "ring");
}

const equipVariants = (game: { p1: { legal(): readonly { moveId: string; variants: readonly { params: Readonly<Record<string, unknown>> }[] }[] } }) =>
  game.p1.legal().filter((o) => o.moveId === "equipCard").flatMap((o) => o.variants.map((v) => v.params));

describe("Doran's Ring (sfd-124-221)", () => {
  test("registry payload: an Equipment costing 1 energy with +1 Might bonus and exactly ONE ability — keyword Equip costing [chaos] (no Quick-Draw, no Temporary)", async () => {
    const game = await scenario().hand(P1, CARD, "ring").build();
    expect(game.state("ring")).toMatchObject({ cardType: "equipment", energyCost: 1, name: "Doran's Ring" });
    expect(game.state("ring").powerCost).toEqual([]);
    expect(getGlobalCardRegistry().get("ring")?.mightBonus).toBe(1);
    // Effect Text (gallery `effect`, rule 136 / 150.2 / 718.3): "When I conquer, discard 1, then draw 1." —
    // the equipped unit's conquer trigger while attached (`effectText: true`).
    expect(getGlobalCardRegistry().getAbilities("ring")).toEqual([
      { cost: { power: ["chaos"] }, keyword: "Equip", type: "keyword" },
      { effect: { amount: 1, then: { amount: 1, type: "draw" }, type: "discard" }, effectText: true, trigger: { event: "conquer", on: "self" }, type: "triggered" },
    ] as never);
    expect(game.state("ring").keywords).not.toContain("Quick-Draw");
    expect(game.state("ring").keywords).not.toContain("Temporary");
  });

  test("play cost: 1 energy (no power) puts it into base UNATTACHED — even with exactly one friendly unit there is no Quick-Draw auto-attach; 0 energy ⇒ not playable", async () => {
    const game = await scenario().resources(P1, { energy: 1, power: { chaos: 1 } }).unit(P1, "base", { might: 2 }, "ally").hand(P1, CARD, "ring").build();
    await game.p1.play("ring");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 1 } });
    await game.settle();
    expect(game.zoneOf("ring")).toBe("base");
    expect(game.state("ring").attachedTo).toBeUndefined();
    expect(game.state("ally")).toMatchObject({ attachments: [], might: 2 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 }); // nobody is asked anything
    const broke = await scenario().resources(P1, { energy: 0, power: { chaos: 2 } }).unit(P1, "base", { might: 2 }, "ally").hand(P1, CARD, "ring").build();
    expect(broke.p1.can("play", "ring")).toBe(false);
  });

  test("[Equip][chaos]: pays exactly 1 chaos (no energy), goes on the chain as an ability, and on resolution attaches — holder +1 Might", async () => {
    const game = await board().build();
    await game.p1.do("equipCard", { equipmentId: "ring", unitId: "ally" });
    expect(game.p1.resources()).toEqual({ energy: 3, power: { chaos: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ring", controller: P1, triggered: false })]);
    expect(game.state("ring").attachedTo).toBeUndefined(); // not before it resolves
    await game.settle();
    expect(game.state("ring").attachedTo).toBe("ally");
    expect(game.state("ally")).toMatchObject({ attachments: ["ring"], baseMight: 2, might: 3 });
  });

  test("the Equip pip is CHAOS: with only fury (or no power at all) the ability is not offered and a forced attempt is rejected", async () => {
    for (const power of [{ fury: 2 }, {}]) {
      const game = await board(power).build();
      expect(equipVariants(game)).toEqual([]);
      const r = await game.p1.try((p) => p.do("equipCard", { equipmentId: "ring", unitId: "ally" }));
      expect(r.ok).toBe(false);
      expect(game.state("ring").attachedTo).toBeUndefined();
    }
  });

  test("'a unit you control': both friendly units (base AND battlefield) are legal holders, the enemy Foe never is; equipping Out moves the Ring to bf1 (434.4)", async () => {
    const game = await board().build();
    const pairs = equipVariants(game).map((p) => `${String(p.equipmentId)}→${String(p.unitId)}`).sort();
    expect(pairs).toEqual(["ring→ally", "ring→out"]);
    expect((await game.p1.try((p) => p.do("equipCard", { equipmentId: "ring", unitId: "foe" }))).ok).toBe(false);
    await game.p1.do("equipCard", { equipmentId: "ring", unitId: "out" });
    await game.settle();
    expect(game.state("ring").attachedTo).toBe("out");
    expect(game.zoneOf("ring")).toBe("battlefield-bf1");
    expect(game.state("out").might).toBe(3);
  });

  test("attached Ring travels with its holder (719.3.a): Ally walks to bf1 and the Ring is at bf1 too, still attached", async () => {
    const game = await board().build();
    await game.p1.do("equipCard", { equipmentId: "ring", unitId: "ally" });
    await game.settle();
    await game.p1.move("ally", "bf1");
    await game.settle();
    expect(game.zoneOf("ally")).toBe("battlefield-bf1");
    expect(game.zoneOf("ring")).toBe("battlefield-bf1");
    expect(game.state("ring").attachedTo).toBe("ally");
    expect(game.state("ally").might).toBe(3);
  });

  test("payoff: the equipped 2-Might Ally survives exactly 2 damage (2 < 3) but dies to 3", async () => {
    const two = await board().hand(P1, BOLT(2), "b").build();
    await two.p1.do("equipCard", { equipmentId: "ring", unitId: "ally" });
    await two.settle();
    await two.p1.cast("b", { targets: "ally" });
    await two.settle();
    expect(two.zoneOf("ally")).toBe("base");
    expect(two.state("ally").damage).toBe(2);

    const three = await board().hand(P1, BOLT(3), "b").build();
    await three.p1.do("equipCard", { equipmentId: "ring", unitId: "ally" });
    await three.settle();
    await three.p1.cast("b", { targets: "ally" });
    await three.settle();
    expect(three.zoneOf("ally")).toBe("trash");
  });

  test("holder dies ⇒ the Ring detaches and stays on the board (recalled to base at cleanup, 457.1), unattached, and can be equipped again for another [chaos]", async () => {
    const game = await board({ chaos: 2 }).hand(P1, BOLT(3), "b").build();
    await game.p1.do("equipCard", { equipmentId: "ring", unitId: "out" });
    await game.settle();
    expect(game.zoneOf("ring")).toBe("battlefield-bf1");
    await game.p1.cast("b", { targets: "out" });
    await game.settle();
    expect(game.zoneOf("out")).toBe("trash");
    expect(game.zoneOf("ring")).toBe("base");
    expect(game.state("ring").attachedTo).toBeUndefined();
    await game.p1.do("equipCard", { equipmentId: "ring", unitId: "ally" });
    await game.settle();
    expect(game.p1.power("chaos")).toBe(0);
    expect(game.state("ally")).toMatchObject({ attachments: ["ring"], might: 3 });
  });

  test("timing (151.2 / 381): Equip is not offered on the opponent's turn, while a chain is pending, or during a showdown", async () => {
    expect(equipVariants(await board().active(P2).build())).toEqual([]);
    const chained = await board().hand(P1, BOLT(1), "b").build();
    await chained.p1.cast("b", { targets: "foe" });
    expect(equipVariants(chained)).toEqual([]);
    await chained.settle();
    expect(equipVariants(chained).length).toBeGreaterThan(0);
    await chained.p1.move("ally", "bf2"); // showdown at bf2
    expect(chained.decision()).toMatchObject({ context: "showdown" });
    expect(equipVariants(chained)).toEqual([]);
  });

  test("no [Temporary]: a loose Ring in base survives its controller's Beginning Phase (contrast Spinning Axe)", async () => {
    const game = await scenario().turn(2).active(P2).unit(P1, "base", { might: 2 }, "ally").gear(P1, CARD, "ring").build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.zoneOf("ring")).toBe("base");
  });

  test("counter-play: Detonate kills the ATTACHED Ring — it goes to trash, the holder drops to printed Might at once, and P1 (its controller) draws 2", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1, power: { fury: 1 } })
      .unit(P1, "base", { might: 2, name: "Ally" }, "ally", { equippedWith: ["ring"] })
      .card("ring", { def: CARD, meta: { attachedTo: "ally" }, owner: P1, zone: "base" })
      .hand(P2, DETONATE, "det")
      .build();
    expect(game.state("ally").might).toBe(3);
    const handBefore = game.p1.hand().length;
    await game.p2.cast("det", { targets: "ring" });
    await game.settle();
    expect(game.zoneOf("ring")).toBe("trash");
    expect(game.state("ally")).toMatchObject({ attachments: [], might: 2 });
    expect(game.p1.hand().length - handBefore).toBe(2);
    expect(game.violations()).toEqual([]);
  });
});
