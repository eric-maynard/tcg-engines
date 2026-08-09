/**
 * Brutalizer — sfd-042-221 · Gear (Equipment) · Calm · 2 energy · Might bonus +1
 *
 *   [Equip] [calm] ([calm]: Attach this to a unit you control.)
 *
 * Rules: 149.1 (gear enters ready, to base), 818 (Equip = activated gear ability "[cost]: attach
 * this to a unit you control"; the unit is a TARGET, 818.1.b.1), 151.2 (gear abilities: your Main
 * Phase, Open State, never in a showdown), 434/718 (attached: +Might bonus, printed text Inactive,
 * moves with its unit — 719.3.a), 434.5 (attaching does not ready/exhaust anything), 457.1/149.3
 * (when the unit dies at a battlefield the Equipment stays on the board, detached, and is recalled
 * to base at the next Cleanup), 821 (Weaponmaster pays Equip reduced by [rainbow]).
 *
 * Head-judge notes — trickiest situations for THIS card:
 *  1. Equip is power-only: 0 energy but one calm power suffices; energy alone (any amount) does not.
 *  2. Only units YOU CONTROL are legal recipients — enemy units and non-units are never offered.
 *  3. Once attached its [Equip] text is Inactive (718.2): you cannot pay [calm] again to hop it
 *     to another unit.
 *  4. The +1 travels with the unit into combat and matters for exactly-lethal math; when the
 *     wearer dies at a battlefield the Brutalizer is NOT trashed — it detaches and is recalled.
 *  5. Timing: [Equip] is illegal during a showdown / with a chain open / on the opponent's turn.
 *  6. Partner: a Weaponmaster unit (Sentinel Adept) equips it on play for [calm]−[rainbow] = free.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-042-221";
const SENTINEL_ADEPT = "sfd-008-221"; // Unit · Fury · 3 energy · 3 might · [Weaponmaster]
const DISINTEGRATE = "ogn-005-298"; // [Action] 4 energy: deal 3 damage to a unit at a battlefield

function onBoard(power: Record<string, number> = { calm: 1 }, energy = 0) {
  return scenario()
    .resources(P1, { energy, power })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 2, name: "Squire" }, "squire")
    .unit(P1, "base", { might: 3, name: "Knight" }, "knight")
    .unit(P2, "bf1", { might: 3, name: "Guard" }, "guard")
    .gear(P1, CARD, "brut");
}

function equipTargets(game: { p1: { option(v: string): { fields: readonly { name: string; options?: readonly unknown[] }[] } | undefined } }): unknown[] {
  return [...(game.p1.option("equipCard")?.fields.find((f) => f.name === "unitId")?.options ?? [])];
}

describe("Brutalizer (sfd-042-221)", () => {
  test("registry payload: a 2-cost calm Equipment with +1 Might bonus and exactly one Equip keyword costing [calm]", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "equipment", domain: "calm", energyCost: 2, mightBonus: 1, name: "Brutalizer" });
    expect(def?.abilities).toEqual([{ cost: { power: ["calm"] }, keyword: "Equip", type: "keyword" }]);
  });

  test("playing it: costs 2 energy (no power), lands in base READY and unattached; 1 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "brut").build();
    await game.p1.play("brut");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("brut")).toBe("base");
    expect(game.state("brut").isExhausted).toBe(false);
    expect(game.state("brut").attachedTo).toBeUndefined();
    const poor = await scenario().resources(P1, { energy: 1, power: { calm: 3 } }).hand(P1, CARD, "brut").build();
    expect(poor.p1.can("play", "brut")).toBe(false);
  });

  test("[Equip][calm]: pays exactly one calm power, attaches to the chosen friendly unit, +1 Might; nothing gets exhausted (434.5)", async () => {
    const game = await onBoard({ calm: 2 }, 3).build();
    await game.p1.choose("equipCard", { params: { equipmentId: "brut", unitId: "squire" } });
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 3, power: { calm: 1 } });
    expect(game.state("brut").attachedTo).toBe("squire");
    expect(game.state("squire").attachments).toEqual(["brut"]);
    expect(game.state("squire").might).toBe(3);
    expect(game.state("knight").might).toBe(3);
    expect(game.state("brut").isExhausted).toBe(false);
    expect(game.state("squire").isExhausted).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("cost negative space: energy alone (even 5) cannot pay [calm]; a fury power cannot either", async () => {
    const noPower = await onBoard({}, 5).build();
    expect(noPower.p1.can("equipCard")).toBe(false);
    const wrongDomain = await onBoard({ fury: 1 }, 5).build();
    expect(wrongDomain.p1.can("equipCard")).toBe(false);
  });

  test("targets: only units you control are offered — never the enemy Guard, never the gear itself", async () => {
    const game = await onBoard().build();
    expect(equipTargets(game).sort()).toEqual(["knight", "squire"]);
    const r = await game.p1.try((p) => p.choose("equipCard", { params: { equipmentId: "brut", unitId: "guard" } }));
    expect(r.ok).toBe(false);
    expect(game.state("brut").attachedTo).toBeUndefined();
    expect(game.p1.power("calm")).toBe(1);
  });

  test("once attached its [Equip] is Inactive (718.2): with calm to spare it cannot be re-equipped onto another unit", async () => {
    const game = await onBoard({ calm: 2 }).build();
    await game.p1.choose("equipCard", { params: { equipmentId: "brut", unitId: "squire" } });
    await game.settle();
    expect(game.p1.can("equipCard")).toBe(false);
    const r = await game.p1.try((p) => p.choose("equipCard", { params: { equipmentId: "brut", unitId: "knight" } }));
    expect(r.ok).toBe(false);
    expect(game.state("brut").attachedTo).toBe("squire");
    expect(game.p1.power("calm")).toBe(1);
  });

  test("timing (151.2): not during a showdown, not while a chain is open, not on the opponent's turn", async () => {
    const showdown = await onBoard().build();
    await showdown.p1.move("knight", "bf1");
    expect(showdown.p1.can("equipCard")).toBe(false);

    const chainOpen = await onBoard({ calm: 1 }, 4).hand(P1, DISINTEGRATE, "dis").build();
    await chainOpen.p1.cast("dis", { targets: "guard" });
    expect(chainOpen.chain()).toHaveLength(1);
    expect(chainOpen.p1.can("equipCard")).toBe(false);
    await chainOpen.settle();
    expect(chainOpen.p1.can("equipCard")).toBe(true);

    const oppTurn = await onBoard().active(P2).build();
    expect(oppTurn.p1.can("equipCard")).toBe(false);
  });

  test("the +1 goes to war: an equipped 3+1 Knight attacking a 3-might Guard kills it, survives and conquers; the Brutalizer rides along (719.3.a)", async () => {
    const game = await onBoard().build();
    await game.p1.choose("equipCard", { params: { equipmentId: "brut", unitId: "knight" } });
    await game.settle();
    expect(game.state("knight").might).toBe(4);
    await game.p1.move("knight", "bf1");
    expect(game.locationOf("brut")).toBe("bf1");
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.zoneOf("knight")).toBe("battlefield-bf1");
    expect(game.state("knight").damage).toBe(0); // healed in the combat cleanup
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.state("brut").attachedTo).toBe("knight");
    expect(game.locationOf("brut")).toBe("bf1");
  });

  test("negative space: WITHOUT the Brutalizer the same 3-vs-3 attack is a mutual kill and nobody conquers", async () => {
    const game = await onBoard().build();
    await game.p1.move("knight", "bf1");
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.zoneOf("knight")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P1);
    expect(game.p1.points()).toBe(0);
  });

  test("wearer dies at a battlefield: the Equipment is NOT trashed — it detaches, stays P1's, and is recalled to base (457.1 / 149.3)", async () => {
    // Squire 2+1 = 3 attacks the 3-might Guard: both die.
    const game = await onBoard().build();
    await game.p1.choose("equipCard", { params: { equipmentId: "brut", unitId: "squire" } });
    await game.settle();
    await game.p1.move("squire", "bf1");
    await game.settle();
    expect(game.zoneOf("squire")).toBe("trash");
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.zoneOf("brut")).toBe("base");
    expect(game.state("brut").attachedTo).toBeUndefined();
    expect(game.state("brut").owner).toBe(P1);
    // Detached → its printed [Equip] is active again: with a fresh calm it can go on the Knight.
    await game.p1.do("addResources", { power: { calm: 1 } });
    expect(equipTargets(game)).toEqual(["knight"]);
  });

  test("partner — Sentinel Adept (Weaponmaster): on play, equips the Brutalizer for [calm] − [rainbow] = nothing; 3 + 1 = 4", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).gear(P1, CARD, "brut").hand(P1, SENTINEL_ADEPT, "adept").build();
    await game.p1.play("adept", { answers: ["brut"] });
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.state("brut").attachedTo).toBe("adept");
    expect(game.state("adept").might).toBe(4);
  });
});
