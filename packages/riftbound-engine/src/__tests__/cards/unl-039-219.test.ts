/**
 * Soul Sword — unl-039-219 · Gear — Equipment · Calm · 1 energy · Might bonus +1
 *
 *   [Equip] [calm] ([calm]: Attach this to a unit you control.)
 *
 * Head-judge checklist (the tricky spots for THIS card):
 *  1. Two separate payments: PLAYING it costs 1 energy (it lands in base, READY — 149.1/149.2 — and
 *     unattached, doing nothing yet); EQUIPPING is the activated [Equip] ability costing exactly one
 *     CALM power (no energy). No calm ⇒ no Equip offered; an added [rainbow]/Any power pays it
 *     (135.2.e.5.b); a fury power does not.
 *  2. [Equip] is a gear activated ability ⇒ default speed (151.2/381): own turn, Neutral Open only —
 *     not in a showdown, not with a chain pending, not on the opponent's turn. It uses the chain
 *     (377.3): cost paid on activation, opponent gets priority, the attach happens on resolution.
 *  3. Target = "a unit you control" (818.1.b.1): enemy units are never paired; a friendly unit AT A
 *     BATTLEFIELD is fine and the sword's location becomes that battlefield (434.4).
 *  4. While attached: +1 Might (718.4) that is real in combat; the sword travels with the unit
 *     (719.3.a); its own [Equip] text is Inactive (718.2/721.2) so it is not offered again; a unit may
 *     carry two Equipment (818.3.b) for +2.
 *  5. When the equipped unit dies the sword is NOT trashed: it detaches where the unit was (719.5,
 *     435.4.b) and, being loose gear at a battlefield, is recalled to base at the next cleanup (149.3)
 *     — ready to be re-equipped for another [calm].
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-039-219";

const equipPairs = (game: Game) =>
  game.p1
    .legal()
    .filter((o) => o.moveId === "equipCard")
    .flatMap((o) => o.variants.map((v) => `${String(v.params.equipmentId)}→${String(v.params.unitId)}`))
    .sort();

/** Sword already in P1's base (played earlier), a 2-Might ally in base, a 2-Might ally on P1's bf1, enemies around. */
function board(power: Record<string, number> = { calm: 1 }) {
  return scenario()
    .resources(P1, { energy: 0, power })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", { might: 2, name: "Home Ally" }, "home")
    .unit(P1, "bf1", { might: 2, name: "Field Ally" }, "field")
    .unit(P2, "bf2", { might: 2, name: "Foe" }, "foe")
    .unit(P2, "base", { might: 1, name: "Home Foe" }, "homeFoe")
    .gear(P1, CARD, "sword");
}

async function equip(game: Game, unitId: string, equipmentId = "sword"): Promise<void> {
  await game.p1.choose("equipCard", { params: { equipmentId, unitId } });
}

describe("Soul Sword (unl-039-219)", () => {
  test("registry payload: 1-cost Calm equipment, +1 bonus, a single [Equip] keyword ability costing exactly [calm]", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "equipment", domain: "calm", energyCost: 1, mightBonus: 1, name: "Soul Sword" });
    expect(def?.powerCost).toBeUndefined();
    // Effect Text (gallery `effect`, rule 136 / 150.2 / 718.3): "[Level 3][>] I have an additional +1 [Might]. (While you have 3+ XP, get the effect.)" —
    // conferred on the equipped unit while attached, hence the `effectText: true` entries.
    expect(def?.abilities).toEqual([
      { cost: { power: ["calm"] }, keyword: "Equip", type: "keyword" },
      { condition: { threshold: 3, type: "while-level" }, effect: { amount: 1, target: "self", type: "modify-might" }, effectText: true, type: "static" },
    ] as never);
  });

  test("playing it: 1 energy (no power), only to base (149.2), lands READY and unattached; the ally is unchanged", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { calm: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2 }, "field")
      .hand(P1, CARD, "sword")
      .build();
    const to = game.p1.option("playGear", "sword")?.fields.find((f) => f.arg === "to")?.options ?? ["base"];
    expect(to).toEqual(["base"]);
    await game.p1.play("sword");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 1 } });
    await game.settle();
    expect(game.zoneOf("sword")).toBe("base");
    expect(game.state("sword")).toMatchObject({ attachedTo: undefined, isReady: true });
    expect(game.state("field").might).toBe(2);
    expect((await scenario().resources(P1, { energy: 0, power: { calm: 3 } }).hand(P1, CARD, "sword").build()).p1.can("play", "sword")).toBe(false);
  });

  test("[Equip]: pays exactly one calm (energy untouched), puts an ability on the chain P2 may respond to, and attaches on resolution for +1", async () => {
    const game = await board({ calm: 2 }).resources(P1, { energy: 3, power: { calm: 2 } }).build();
    await equip(game, "home");
    expect(game.p1.resources()).toEqual({ energy: 3, power: { calm: 1 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sword", controller: P1, triggered: false })]);
    expect(game.state("sword").attachedTo).toBeUndefined(); // not yet
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.passPriority();
    expect(game.state("sword").attachedTo).toBe("home");
    expect(game.state("home").attachments).toEqual(["sword"]);
    expect(game.state("home")).toMatchObject({ baseMight: 2, might: 3 });
    expect(game.violations()).toEqual([]);
  });

  test("Equip cost edge: no calm ⇒ not offered (energy cannot substitute); an Any/[rainbow] power pays it; a fury power does not", async () => {
    expect(equipPairs(await board({}).resources(P1, { energy: 5, power: {} }).build())).toEqual([]);
    expect(equipPairs(await board({ fury: 2 }).build())).toEqual([]);
    const any = await board({ rainbow: 1 }).build();
    expect(equipPairs(any)).toEqual(["sword→field", "sword→home"]);
    await equip(any, "home");
    await any.settle();
    expect(any.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(any.state("home").might).toBe(3);
  });

  test("target = a unit YOU CONTROL: only home/field are paired, never the enemy units; forcing an enemy pairing is rejected", async () => {
    const game = await board().build();
    expect(equipPairs(game)).toEqual(["sword→field", "sword→home"]);
    expect((await game.p1.try(() => equip(game, "foe"))).ok).toBe(false);
    expect((await game.p1.try(() => equip(game, "homeFoe"))).ok).toBe(false);
    expect(game.p1.power("calm")).toBe(1);
  });

  test("equipping a unit AT A BATTLEFIELD: the sword's location becomes that battlefield (434.4) and the bonus applies there", async () => {
    const game = await board().build();
    await equip(game, "field");
    await game.settle();
    expect(game.state("sword").attachedTo).toBe("field");
    expect(game.locationOf("sword")).toBe("bf1");
    expect(game.state("field").might).toBe(3);
  });

  test("default speed only (151.2): no Equip during a showdown, while a chain is pending, or on the opponent's turn", async () => {
    const showdown = await board().unit(P1, "base", { might: 3, name: "Raider" }, "raider").build();
    await showdown.p1.move("raider", "bf2");
    expect(equipPairs(showdown)).toEqual([]);

    const bolt = { abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }], cardType: "spell", energyCost: 0, name: "Free Ping", timing: "action" };
    const chain = await board().hand(P1, bolt, "ping").build();
    await chain.p1.cast("ping", { targets: "foe" });
    expect(chain.chain()).toHaveLength(1);
    expect(equipPairs(chain)).toEqual([]);
    expect((await chain.p1.try(() => equip(chain, "home"))).ok).toBe(false);
    await chain.settle();
    expect(equipPairs(chain)).toEqual(["sword→field", "sword→home"]);

    const opp = await board().active(P2).build();
    expect(equipPairs(opp)).toEqual([]);
    expect((await opp.p1.try(() => equip(opp, "home"))).ok).toBe(false);
  });

  test("the +1 is real Might in combat, and the sword travels with its unit (719.3.a): 2+1 attacking a 2 kills it, survives and conquers with the sword now at bf2", async () => {
    const game = await board().build();
    await equip(game, "home");
    await game.settle();
    // home is ready (placed by the scenario) — march it into bf2.
    await game.p1.move("home", "bf2");
    expect(game.locationOf("sword")).toBe("bf2");
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.zoneOf("home")).toBe("battlefield-bf2");
    expect(game.state("home").damage).toBe(0);
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.state("sword").attachedTo).toBe("home");
    expect(game.locationOf("sword")).toBe("bf2");
  });

  test("control: WITHOUT the sword the same 2-vs-2 attack is a trade and nothing is conquered", async () => {
    const game = await board().build();
    await game.p1.move("home", "bf2");
    await game.settle();
    expect(game.zoneOf("home")).toBe("trash");
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.p1.points()).toBe(0);
  });

  test("equipped unit dies (3 into a 4): the unit is trashed but the sword is NOT — it detaches (719.5) and is recalled to P1's base unattached (149.3), re-equippable next turn", async () => {
    const game = await board().unit(P2, "bf2", { might: 4, name: "Wall" }, "wall").build();
    await equip(game, "home");
    await game.settle();
    await game.p1.move("home", "bf2");
    await game.settle();
    expect(game.zoneOf("home")).toBe("trash");
    expect(game.zoneOf("sword")).toBe("base");
    expect(game.state("sword")).toMatchObject({ attachedTo: undefined, owner: P1 });
    expect(game.p1.trash()).not.toContain("sword");
    // Next P1 turn, with a fresh calm, it can go on the surviving field ally.
    await game.advanceToTurnOf(P2);
    await game.advanceToTurnOf(P1);
    await game.p1.do("addResources", { power: { calm: 1 } });
    expect(equipPairs(game)).toEqual(["sword→field"]);
    await equip(game, "field");
    await game.settle();
    expect(game.state("field").might).toBe(3);
  });

  test("while attached its own [Equip] is Inactive (718.2): the attached sword is no longer offered; a SECOND sword may go on the same unit for +2 total (818.3.b)", async () => {
    const game = await board({ calm: 2 }).gear(P1, CARD, "sword2").build();
    await equip(game, "home");
    await game.settle();
    expect(equipPairs(game)).toEqual(["sword2→field", "sword2→home"]); // "sword" itself is gone from the menu
    await equip(game, "home", "sword2");
    await game.settle();
    expect(game.state("home").attachments.sort()).toEqual(["sword", "sword2"]);
    expect(game.state("home").might).toBe(4);
    expect(game.p1.power("calm")).toBe(0);
  });
});
