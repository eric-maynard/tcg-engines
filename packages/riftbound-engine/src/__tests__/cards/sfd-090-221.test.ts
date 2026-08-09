/**
 * The Zero Drive — sfd-090-221 · Gear (Equipment) · Mind · 3 energy · Might bonus +2
 *
 *   [Equip] [1][mind] ([1][mind]: Attach this to a unit you control.)
 *   [3][mind], Banish this: Play all units banished with this, ignoring their costs. (Use only if
 *   unattached.)
 *   Effect text (quoted by rule 395): "[Deathknell][>] Banish me." — appended to the equipped unit.
 *
 * Rules: 818 ([Equip]: activated, pay cost, attach on resolution), 151.2 (gear abilities: your Main
 * Phase, Open State, no showdown), 434.1.d / 718.4 (+2 while attached), 150.2 / 718.3 / 724 (an
 * Equipment's Effect Text is appended to the Top-Most unit while attached), 808 (Deathknell: when I
 * die, get the effect), 394–397 (Linked Abilities: "units banished WITH THIS" = only units banished
 * by this card's own linked abilities — rule 397's example is literally The Zero Drive), 202–203 /
 * 356 ("Banish this" is a COST: paid while activating, before anyone can respond), 377.2.b ("Use
 * only if unattached" is an activation condition), 419.3 + 359.2.c (units played by an effect follow
 * the normal play steps → they enter exhausted), 457.1 (holder dies → Equipment recalled to base).
 *
 * Head-judge notes — the tricky situations for THIS card:
 *  1. The loop: equip → holder dies → Deathknell banishes the holder "with this" → drive recalls to
 *     base → [3][mind], Banish this → the holder is PLAYED back (exhausted, cost ignored).
 *  2. Rule 397: a unit sitting in banishment for any other reason is NOT played by the activation.
 *  3. "Banish this" is a cost: the drive is in banishment the moment the ability is activated and it
 *     stays there — it must not bounce back to base with the units it releases.
 *  4. "Use only if unattached": while worn, the second ability is not available even with [3][mind].
 *  5. Cost split: [1][mind] to equip vs [3][mind] to release — energy alone or mind alone pays neither.
 *  6. With nothing banished the activation is still legal (no choice is involved) and just banishes
 *     the drive.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-090-221";
const SARGE = "ogn-219-298"; // Vanguard Sergeant — vanilla Order 4-cost 4/4

const activationOffered = (game: { p1: { legal(): readonly { key: string }[] } }) =>
  game.p1.legal().some((o) => o.key.startsWith("activateAbility:zd"));
const equipOffered = (game: { p1: { legal(): readonly { moveId: string }[] } }) => game.p1.legal().some((o) => o.moveId === "equipCard");

/** Drive unattached in base, already "linked" to two banished units (as if their Deathknells had resolved), plus an unrelated exile. */
function loaded(energy = 3, mind = 1) {
  return scenario()
    .resources(P1, { energy, power: { mind } })
    .battlefield("bf1", { controller: P1 })
    .card("zd", { def: CARD, meta: { exiledByThis: ["s1", "s2"] }, owner: P1, zone: "base" })
    .banishment(P1, SARGE, "s1")
    .banishment(P1, { cardType: "unit", energyCost: 2, might: 3, name: "Linked Two" }, "s2")
    .banishment(P1, { cardType: "unit", energyCost: 1, might: 1, name: "Stranger" }, "other");
}

describe("The Zero Drive (sfd-090-221)", () => {
  test("registry payload should carry [Equip 1+mind], an activated ability COSTING [3][mind]+banish-self whose effect PLAYS the linked units (only if unattached), and the Deathknell effect text — the parse models 'Banish this' as the effect and drops the play", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "equipment", domain: "mind", energyCost: 3, mightBonus: 2, name: "The Zero Drive" });
    const abilities = (def?.abilities ?? []) as { type: string; keyword?: string; cost?: Record<string, unknown>; effect?: unknown }[];
    expect(abilities).toContainEqual({ cost: { energy: 1, power: ["mind"] }, keyword: "Equip", type: "keyword" });
    const activated = abilities.find((a) => a.type === "activated");
    expect(activated?.cost).toMatchObject({ energy: 3, power: ["mind"] });
    expect(JSON.stringify(activated?.cost)).toContain("banish");
    expect(JSON.stringify(activated?.effect)).toContain('"type":"play"');
    expect(JSON.stringify(abilities)).toMatch(/[Dd]eathknell|"die"/);
  });

  test("play cost: 3 energy puts the drive into base ready and unattached; 2 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 3, power: { mind: 1 } }).unit(P1, "base", { might: 2 }, "pilot").hand(P1, CARD, "zd").build();
    await game.p1.play("zd");
    await game.settle();
    expect(game.zoneOf("zd")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 1 } });
    expect(game.state("zd")).toMatchObject({ attachedTo: undefined, isReady: true });
    expect(game.state("pilot").might).toBe(2);
    const short = await scenario().resources(P1, { energy: 2, power: { mind: 3 } }).hand(P1, CARD, "zd").build();
    expect(short.p1.can("play", "zd")).toBe(false);
  });

  test("[Equip] [1][mind]: pays 1 energy + 1 mind, resolves off the chain, +2 Might (2 → 4); without the mind pip (or the energy) it is not offered", async () => {
    const game = await scenario().resources(P1, { energy: 1, power: { mind: 1 } }).unit(P1, "base", { might: 2 }, "pilot").gear(P1, CARD, "zd").build();
    expect(equipOffered(game)).toBe(true);
    await game.p1.do("equipCard", { equipmentId: "zd", unitId: "pilot" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.chain()).toHaveLength(1);
    await game.settle();
    expect(game.state("zd").attachedTo).toBe("pilot");
    expect(game.state("pilot")).toMatchObject({ baseMight: 2, might: 4 });

    const noMind = await scenario().resources(P1, { energy: 5, power: { fury: 2 } }).unit(P1, "base", { might: 2 }, "pilot").gear(P1, CARD, "zd").build();
    expect(equipOffered(noMind)).toBe(false);
    const noEnergy = await scenario().resources(P1, { energy: 0, power: { mind: 2 } }).unit(P1, "base", { might: 2 }, "pilot").gear(P1, CARD, "zd").build();
    expect(equipOffered(noEnergy)).toBe(false);
  });

  test("holder dies in combat → the drive detaches and is recalled to P1's base, unattached (457.1)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { mind: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 2, name: "Pilot" }, "pilot")
      .unit(P2, "bf1", { might: 6, name: "Titan" }, "titan")
      .gear(P1, CARD, "zd")
      .build();
    await game.p1.do("equipCard", { equipmentId: "zd", unitId: "pilot" });
    await game.settle();
    await game.p1.move("pilot", "bf1"); // 4 into 6 → pilot dies
    await game.settle();
    expect(game.locationOf("pilot")).toBeUndefined();
    expect(game.zoneOf("zd")).toBe("base");
    expect(game.state("zd").attachedTo).toBeUndefined();
  });

  test("effect text '[Deathknell] Banish me' — the equipped unit that dies must end in BANISHMENT, linked to the drive (395/808); the engine sends it to trash", async () => {
    // Expected: pilot → banishment and the drive remembers it ("banished with this"). Actual: trash.
    const game = await scenario()
      .resources(P1, { energy: 1, power: { mind: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", SARGE, "pilot")
      .unit(P2, "bf1", { might: 9, name: "Titan" }, "titan")
      .gear(P1, CARD, "zd")
      .build();
    await game.p1.do("equipCard", { equipmentId: "zd", unitId: "pilot" });
    await game.settle();
    await game.advanceTurn();
    await game.advanceTurn(); // pilot (played by scenario ready, but be safe) is ready on P1's turn
    await game.p1.move("pilot", "bf1"); // 6 into 9 → dies
    await game.settle({ policy: "first" });
    expect(game.zoneOf("pilot")).toBe("banishment");
    expect(game.zoneOf("zd")).toBe("base");
  });

  test("[3][mind] activation: pays 3 energy + 1 mind up front and uses the chain; on resolution the units banished WITH THIS come back onto P1's board, an unrelated exile does not (397)", async () => {
    const game = await loaded().build();
    expect(activationOffered(game)).toBe(true);
    await game.p1.activate("zd");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "zd", controller: P1, triggered: false })]);
    expect(game.zoneOf("s1")).toBe("banishment"); // nothing released before resolution
    await game.settle({ policy: "first" });
    expect(game.chain()).toEqual([]);
    expect(["base", "battlefield-bf1"]).toContain(game.zoneOf("s1"));
    expect(["base", "battlefield-bf1"]).toContain(game.zoneOf("s2"));
    expect(game.state("s1")).toMatchObject({ controller: P1, might: 4 });
    expect(game.zoneOf("other")).toBe("banishment");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } }); // "ignoring their costs": nothing more was paid
  });

  test("'Banish this' is a COST — the drive must be in banishment as soon as the ability is activated and stay there after resolution; the engine banishes it only on resolution and then bounces it back to base", async () => {
    const game = await loaded().build();
    await game.p1.activate("zd");
    expect(game.zoneOf("zd")).toBe("banishment"); // 202–203 / 356: costs are paid during activation
    await game.settle({ policy: "first" });
    expect(game.zoneOf("zd")).toBe("banishment");
    expect(game.p1.gear()).not.toContain("zd");
  });

  test("the released units are PLAYED (419.3 → 359.2.c): they enter exhausted", async () => {
    const game = await loaded().build();
    await game.p1.activate("zd");
    await game.settle({ policy: "first" });
    expect(game.locationOf("s1")).toBeDefined();
    expect(game.state("s1").isExhausted).toBe(true);
    expect(game.state("s2").isExhausted).toBe(true);
  });

  test("activation cost negative space: 2 energy + mind → not offered; 3 energy without mind → not offered", async () => {
    expect(activationOffered(await loaded(2, 1).build())).toBe(false);
    expect(activationOffered(await loaded(3, 0).resources(P1, { power: { order: 3 } }).build())).toBe(false);
  });

  test("with nothing banished the activation is still legal (no choice involved): resources are spent and no unit appears", async () => {
    const game = await scenario().resources(P1, { energy: 3, power: { mind: 1 } }).gear(P1, CARD, "zd").build();
    expect(activationOffered(game)).toBe(true);
    await game.p1.activate("zd");
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.p1.units()).toEqual([]);
    expect(game.zoneOf("zd")).not.toBe("hand");
  });

  test("'(Use only if unattached.)' — while the drive is attached the [3][mind] ability must not be offered (377.2.b); the engine offers it", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { mind: 1 } })
      .unit(P1, "base", { might: 2, name: "Pilot" }, "pilot", { equippedWith: ["zd"] })
      .card("zd", { def: CARD, meta: { attachedTo: "pilot" }, owner: P1, zone: "base" })
      .build();
    expect(game.state("pilot").might).toBe(4); // sanity: it is attached
    expect(activationOffered(game)).toBe(false);
  });

  test("timing (151.2): neither [Equip] nor the release ability is offered on the opponent's turn or during a showdown", async () => {
    const opp = await loaded().active(P2).unit(P1, "base", { might: 2 }, "pilot").build();
    expect(activationOffered(opp)).toBe(false);
    expect(equipOffered(opp)).toBe(false);

    const sd = await loaded(4, 2)
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf2", { might: 5 }, "def")
      .unit(P1, "base", { might: 2 }, "scout")
      .build();
    expect(activationOffered(sd)).toBe(true);
    await sd.p1.move("scout", "bf2");
    expect(sd.actingSeat()).toBe(P1); // attacker holds Focus in the showdown
    expect(activationOffered(sd)).toBe(false);
    expect(equipOffered(sd)).toBe(false);
  });
});
