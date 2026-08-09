/**
 * Doran's Shield — sfd-033-221 · Gear (Equipment) · Calm · 1 energy · Might bonus +1
 *
 *   [Equip] [calm] ([calm]: Attach this to a unit you control.)
 *
 * Rules: 818 (Equip is an ACTIVATED ability of the gear: pay [calm], target a unit you control
 * (818.1.b.1 — a target), attach on resolution), 151.2 (activated abilities: your Main Phase, Open
 * State, not in a Showdown), 137.3 / 718.4 (Might bonus applies only while attached), 434.1.f
 * (only an EFFECT attach can move it: its own [Equip] text is Inactive while attached, 718.2 — hence
 * Weaponmaster's "even if it's already attached"), 434.4 / 719.3 (an attached card is wherever its
 * unit is), 719.5 + 457.1 (unit leaves the board → the Equipment detaches, stays on the board and is
 * recalled to base at the next cleanup — it does NOT go to the trash), 143 (gear is played to base).
 *
 * Head-judge checklist — trickiest situations for THIS card:
 *  1. Two different costs: PLAYING the Shield costs 1 energy (no power); EQUIPPING costs [calm] (no
 *     energy). Each must be checked separately (no calm → it can still be played, just not equipped).
 *  2. Equip is a chain item with a target: the opponent may respond; if the target is gone on
 *     resolution the ability does nothing, the Shield stays unattached and the [calm] is still spent.
 *  3. Only "a unit you control" — enemy units are never offered.
 *  4. The +1 decides real combats: a 2-Might defender wearing it trades with a 3-Might attacker.
 *  5. After the wearer dies the Shield is back in base, unattached, ready to be equipped again.
 *  6. Once attached its printed [Equip] is Inactive (718.2): it cannot simply be paid again to hop to
 *     another unit.
 *  7. Timing: never during a showdown or on the opponent's turn.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-033-221";
const GUST = "ogn-169-298"; // [Reaction] 1: return a unit at a battlefield with 3 Might or less to its owner's hand

function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { calm: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", { might: 2, name: "Squire" }, "squire")
    .unit(P1, "bf1", { might: 2, name: "Sentry" }, "sentry")
    .unit(P2, "bf2", { might: 1, name: "Picket" }, "picket")
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
    .gear(P1, CARD, "shield");
}

const equipVariants = (game: Game) =>
  game.p1
    .legal()
    .filter((o) => o.moveId === "equipCard")
    .flatMap((o) => o.variants)
    .filter((v) => v.params.equipmentId === "shield")
    .map((v) => v.params.unitId as string);

async function equip(game: Game, unit: string): Promise<void> {
  await game.p1.choose("equipCard", { params: { equipmentId: "shield", unitId: unit } });
}

describe("Doran's Shield (sfd-033-221)", () => {
  test("registry payload: Calm Equipment, 1 energy, +1 Might bonus, a single [Equip] keyword costing exactly [calm]", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "equipment", domain: "calm", energyCost: 1, mightBonus: 1, name: "Doran's Shield" });
    // Effect Text (gallery `effect`, rule 136 / 150.2 / 718.3): "[Tank] (I must be assigned combat damage first.)" —
    // conferred on the equipped unit while attached, hence the `effectText: true` entries.
    expect(def?.abilities).toEqual([
      { cost: { power: ["calm"] }, keyword: "Equip", type: "keyword" },
      { effect: { keyword: "Tank", target: "self", type: "grant-keyword" }, effectText: true, type: "static" },
    ] as never);
  });

  test("playing it: costs 1 energy and NO power; it lands in base unattached and ready; 0 energy → not playable", async () => {
    const game = await scenario().resources(P1, { energy: 1 }).unit(P1, "base", { might: 2 }, "squire").hand(P1, CARD, "shield").build();
    expect(game.p1.can("play", "shield")).toBe(true);
    await game.p1.play("shield");
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.zoneOf("shield")).toBe("base");
    expect(game.state("shield")).toMatchObject({ attachedTo: undefined, isReady: true, keywords: ["Equip"] });
    expect(game.state("squire").might).toBe(2); // merely owning it grants nothing
    const broke = await scenario().resources(P1, { energy: 0, power: { calm: 3 } }).hand(P1, CARD, "shield").build();
    expect(broke.p1.can("play", "shield")).toBe(false);
  });

  test("[Equip] [calm]: pays exactly one calm (energy untouched), goes on the chain as P1's ability, and on resolution attaches for +1 Might", async () => {
    const game = await board().build();
    await equip(game, "squire");
    expect(game.p1.resources()).toEqual({ energy: 2, power: { calm: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "shield", controller: P1, triggered: false })]);
    expect(game.state("shield").attachedTo).toBeUndefined(); // not yet
    await game.settle();
    expect(game.state("shield").attachedTo).toBe("squire");
    expect(game.state("squire")).toMatchObject({ attachments: ["shield"], baseMight: 2, might: 3 });
    expect(game.violations()).toEqual([]);
  });

  test("no calm power → the Shield cannot be equipped (energy is no substitute)", async () => {
    const game = await board().resources(P1, { energy: 5, power: { calm: 0 } }).build();
    expect(equipVariants(game)).toEqual([]);
    const r = await game.p1.try(() => equip(game, "squire"));
    expect(r.ok).toBe(false);
    expect(game.state("shield").attachedTo).toBeUndefined();
  });

  test("'a unit you control': both of my units (base and battlefield) are offered, the enemy Raider/Picket never are", async () => {
    const game = await board().build();
    expect(equipVariants(game).sort()).toEqual(["sentry", "squire"]);
    const r = await game.p1.try(() => equip(game, "picket"));
    expect(r.ok).toBe(false);
    expect(game.p1.power("calm")).toBe(1);
  });

  test("equipping a unit at a battlefield puts the Shield at that battlefield with it (434.4)", async () => {
    const game = await board().build();
    await equip(game, "sentry");
    await game.settle();
    expect(game.state("shield").attachedTo).toBe("sentry");
    expect(game.locationOf("shield")).toBe("bf1");
    expect(game.state("sentry").might).toBe(3);
  });

  test("the opponent may respond: Gust bounces the target Sentry → Equip resolves onto nothing; Shield stays unattached in base, the calm is still spent", async () => {
    const game = await board().resources(P2, { energy: 1 }).hand(P2, GUST, "gust").build();
    await equip(game, "sentry");
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    await game.p2.cast("gust", { targets: "sentry" });
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("hand");
    expect(game.zoneOf("shield")).toBe("base");
    expect(game.state("shield").attachedTo).toBeUndefined();
    expect(game.p1.resources()).toEqual({ energy: 2, power: { calm: 0 } });
    expect(game.chain()).toHaveLength(0);
  });

  test("the +1 matters in combat: the shielded 2-Might Sentry (3) trades with a 3-Might attacker instead of losing the battlefield", async () => {
    const game = await board().build();
    await equip(game, "sentry");
    await game.settle();
    await game.advanceTurn(); // → P2
    expect(game.state("sentry").might).toBe(3); // the bonus is not a this-turn effect
    const before = game.p2.points(); // (P2 held bf2 at the start of its turn)
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.p2.points()).toBe(before); // no conquer
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P2);
  });

  test("when the wearer dies the Shield detaches, stays on the board and is recalled to base unattached (719.5 / 457.1) — not trashed", async () => {
    const game = await board().build();
    await equip(game, "sentry");
    await game.settle();
    await game.advanceTurn();
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.zoneOf("shield")).toBe("base");
    expect(game.locationOf("shield")).toBe("base");
    expect(game.state("shield")).toMatchObject({ attachedTo: undefined, controller: P1 });
    // …and next turn it can be equipped again to the Squire.
    await game.advanceTurn(); // → P1
    await game.p1.do("addResources", { power: { calm: 1 } });
    expect(equipVariants(game)).toEqual(["squire"]);
  });

  test("once attached, its printed [Equip] is Inactive (718.2): even with calm to spare it is not offered again for another unit", async () => {
    const game = await board().resources(P1, { energy: 0, power: { calm: 2 } }).build();
    await equip(game, "squire");
    await game.settle();
    expect(game.state("squire").might).toBe(3);
    expect(game.p1.power("calm")).toBe(1);
    expect(equipVariants(game)).toEqual([]);
    const r = await game.p1.try(() => equip(game, "sentry"));
    expect(r.ok).toBe(false);
    expect(game.state("shield").attachedTo).toBe("squire");
    expect(game.state("sentry").might).toBe(2);
  });

  test("timing (151.2): [Equip] is not offered during a showdown, nor on the opponent's turn", async () => {
    const showdown = await board().build();
    await showdown.p1.move("squire", "bf2"); // attack → showdown open, P1 has focus
    expect(showdown.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(equipVariants(showdown)).toEqual([]);
    const theirs = await board().active(P2).build();
    expect(equipVariants(theirs)).toEqual([]);
  });
});
