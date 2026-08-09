/**
 * B.F. Sword — sfd-161-221 · Gear (Equipment) · Order · 4 energy (no power) · Might bonus +3
 *
 *   [Equip] [order] ([order]: Attach this to a unit you control.)
 *
 * Rules: 359.2.d (a non-unit gear enters the board READY in its controller's base), 818.1
 * ([Equip] is an activated ability: pay the cost, target a unit you control, attach on resolution),
 * 151.2 (gear activated abilities: your Main Phase, Open State, not in a showdown), 434.1.d / 718.4
 * (the Top-Most unit's Might is modulated by the Might Bonus while attached), 718.2 / 721.2 (an
 * attached card's rules text is Inactive — its own [Equip] cannot be re-activated while worn),
 * 719.3.a (attached cards travel with the unit), 457.1 / 719.5 (if the unit leaves the board the
 * Equipment detaches, stays on the board and is recalled to base), 323.5 (lethal damage is checked
 * against effective Might, bonus included).
 *
 * Head-judge notes — the tricky situations for THIS card:
 *  1. Two separate payments: 4 energy to PLAY the sword (it does nothing yet), then [order] power to
 *     EQUIP it. Energy can never pay the Equip pip; order power can never pay the play cost.
 *  2. [Equip] uses the chain (818.1.c.1 / 377.3): after activation the opponent gets priority and the
 *     +3 only exists once the ability resolves — a Reaction kill in that window wastes the power.
 *  3. Survival math: a 2-Might unit wearing the sword (5) survives 4 damage; unequipped it would die.
 *  4. Unit dies in combat → sword goes back to P1's base unattached and can be equipped again next
 *     turn for another [order]; it is NOT trashed with the unit.
 *  5. Negative space: no enemy units as targets, not on the opponent's turn, not mid-showdown, not
 *     while already attached, not with 0 order power (rainbow/other domains do not count as [order]).
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-161-221";
const STAR_CROSSED = "unl-128-219"; // [Reaction] 3 + [chaos]: return a friendly unit and an enemy unit to hand

/** Sword already on the board (in base), one order power to equip, a 2-Might ally and an enemy. */
function onBoard() {
  return scenario()
    .resources(P1, { energy: 0, power: { order: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 2, name: "Squire" }, "squire")
    .unit(P2, "bf1", { might: 4, name: "Brute" }, "brute")
    .gear(P1, CARD, "sword");
}

const equipPairs = (game: { p1: { legal(): readonly { moveId: string; variants: readonly { params: Readonly<Record<string, unknown>> }[] }[] } }) =>
  game.p1
    .legal()
    .filter((o) => o.moveId === "equipCard")
    .flatMap((o) => o.variants.map((v) => `${String(v.params.equipmentId)}->${String(v.params.unitId)}`));

describe("B.F. Sword (sfd-161-221)", () => {
  test("registry payload: Equipment, 4 energy, +3 Might bonus, exactly one [Equip] keyword ability costing [order]", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "equipment", domain: "order", energyCost: 4, mightBonus: 3, name: "B.F. Sword" });
    expect(def?.abilities).toEqual([{ cost: { power: ["order"] }, keyword: "Equip", type: "keyword" }]);
  });

  test("play cost: 4 energy (no power) puts it into base READY and unattached; 3 energy is not enough; power cannot pay it", async () => {
    const game = await scenario().resources(P1, { energy: 5, power: { order: 1 } }).unit(P1, "base", { might: 2 }, "squire").hand(P1, CARD, "sword").build();
    await game.p1.play("sword");
    await game.settle();
    expect(game.zoneOf("sword")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { order: 1 } });
    expect(game.state("sword")).toMatchObject({ attachedTo: undefined, isReady: true });
    expect(game.state("squire").might).toBe(2); // merely playing it grants nothing

    const short = await scenario().resources(P1, { energy: 3, power: { order: 4 } }).hand(P1, CARD, "sword").build();
    expect(short.p1.can("play", "sword")).toBe(false);
  });

  test("[Equip] [order]: pays exactly 1 order power, goes on the chain, and on resolution attaches for +3 Might (2 → 5)", async () => {
    const game = await onBoard().build();
    expect(equipPairs(game)).toEqual(["sword->squire"]); // only the friendly unit is a legal holder
    await game.p1.do("equipCard", { equipmentId: "sword", unitId: "squire" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    // 818.1.c.1 / 377.3 — an activated ability: it is a chain item until everyone passes.
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sword", controller: P1 })]);
    expect(game.state("squire").might).toBe(2);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("sword").attachedTo).toBe("squire");
    expect(game.state("squire").attachments).toEqual(["sword"]);
    expect(game.state("squire")).toMatchObject({ baseMight: 2, might: 5 });
    expect(game.violations()).toEqual([]);
  });

  test("cost negative space: with 0 order power (even with energy, rainbow or another domain) [Equip] is not offered", async () => {
    const game = await onBoard().resources(P1, { energy: 6, power: { order: 0, fury: 2 } }).build();
    expect(equipPairs(game)).toEqual([]);
    const r = await game.p1.try((p) => p.do("equipCard", { equipmentId: "sword", unitId: "squire" }));
    expect(r.ok).toBe(false);
    expect(game.state("sword").attachedTo).toBeUndefined();
  });

  test("targets: 'a unit you control' — an enemy unit is never a legal holder", async () => {
    const game = await onBoard().build();
    const r = await game.p1.try((p) => p.do("equipCard", { equipmentId: "sword", unitId: "brute" }));
    expect(r.ok).toBe(false);
    expect(game.p1.power("order")).toBe(1);
    expect(game.state("brute").might).toBe(4);
  });

  test("timing (151.2): not on the opponent's turn, not during a showdown, and not while it is already attached (718.2)", async () => {
    const opp = await onBoard().active(P2).build();
    expect(equipPairs(opp)).toEqual([]);

    const sd = await onBoard().unit(P1, "base", { might: 1, name: "Scout" }, "scout").build();
    await sd.p1.move("scout", "bf1");
    expect(equipPairs(sd)).toEqual([]);

    const worn = await onBoard().resources(P1, { power: { order: 2 } }).unit(P1, "base", { might: 3, name: "Knight" }, "knight").build();
    await worn.p1.do("equipCard", { equipmentId: "sword", unitId: "squire" });
    await worn.settle();
    expect(worn.p1.power("order")).toBe(1);
    // Still one order power left, but the attached sword's own [Equip] is inactive → nothing offered.
    expect(equipPairs(worn)).toEqual([]);
  });

  test("the bonus is real Might in combat: a sworded 2-Might unit (5) kills a 4-Might defender, survives, and conquers; the sword travels with it (719.3.a)", async () => {
    const game = await onBoard().build();
    await game.p1.do("equipCard", { equipmentId: "sword", unitId: "squire" });
    await game.settle();
    // The squire was placed ready by the scenario; attaching does not exhaust it (434.5).
    expect(game.state("squire").isReady).toBe(true);
    await game.p1.move("squire", "bf1");
    expect(game.locationOf("sword")).toBe("bf1");
    await game.settle();
    expect(game.zoneOf("brute")).toBe("trash");
    expect(game.zoneOf("squire")).toBe("battlefield-bf1");
    expect(game.state("squire").damage).toBe(0); // 4 damage < 5 Might, healed in combat cleanup
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.state("sword").attachedTo).toBe("squire");
    expect(game.locationOf("sword")).toBe("bf1");
  });

  test("near miss: WITHOUT the sword the same 2-Might unit dies to the 4-Might defender and scores nothing", async () => {
    const game = await onBoard().build();
    await game.p1.move("squire", "bf1");
    await game.settle();
    expect(game.zoneOf("squire")).toBe("trash");
    expect(game.zoneOf("brute")).toBe("battlefield-bf1");
    expect(game.p1.points()).toBe(0);
  });

  test("holder dies → the sword detaches, returns to P1's base unattached (457.1 / 719.5), and can be re-equipped to another unit later", async () => {
    const game = await onBoard()
      .resources(P1, { power: { order: 2 } })
      .unit(P2, "bf1", { might: 6, name: "Giant" }, "giant")
      .unit(P1, "base", { might: 3, name: "Knight" }, "knight")
      .build();
    await game.p1.do("equipCard", { equipmentId: "sword", unitId: "squire" });
    await game.settle();
    await game.p1.move("squire", "bf1"); // 5 vs 4+6 → squire dies
    await game.settle();
    expect(game.zoneOf("squire")).toBe("trash");
    expect(game.zoneOf("sword")).toBe("base");
    expect(game.state("sword").attachedTo).toBeUndefined();
    expect(game.state("sword").owner).toBe(P1);
    // Back in base and unattached, its [Equip] is active again: one order power remains.
    expect(equipPairs(game)).toEqual(["sword->knight"]);
    await game.p1.do("equipCard", { equipmentId: "sword", unitId: "knight" });
    await game.settle();
    expect(game.state("knight").might).toBe(6);
    expect(game.p1.power("order")).toBe(0);
  });

  test("chain window: the opponent gets priority after [Equip] is activated; bouncing the target in response (Star-Crossed) wastes the power and attaches nothing", async () => {
    const game = await onBoard()
      .resources(P2, { energy: 3, power: { chaos: 1 } })
      .hand(P2, STAR_CROSSED, "sc")
      .build();
    await game.p1.do("equipCard", { equipmentId: "sword", unitId: "squire" });
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("cast", "sc")).toBe(true);
    await game.p2.cast("sc", { targets: ["brute", "squire"] });
    await game.settle();
    expect(game.zoneOf("squire")).toBe("hand");
    expect(game.chain()).toEqual([]);
    expect(game.state("sword").attachedTo).toBeUndefined();
    expect(game.zoneOf("sword")).toBe("base");
    expect(game.p1.power("order")).toBe(0); // the cost stays paid (818.1.b)
  });
});
