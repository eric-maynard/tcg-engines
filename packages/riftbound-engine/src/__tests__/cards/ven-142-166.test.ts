/**
 * Dominus — ven-142-166 · Spell · Fury/Body · 4 energy · [Action]
 *
 *   [Action] (Play on your turn or in showdowns.)
 *   This turn, double a unit's Might and give it "[rainbow][rainbow]: Ready me."
 *
 * Rules: 432 (Double: +X where X = the unit's CURRENT Might when the action is performed, as a "this
 * turn" modification — 432.1.a: temporary bonuses like Assault/Shield that apply right now are doubled
 * in, and the flat +X outlives them), 477.3.c (a negative Might doubles by +0), 806 (Action: the SPELL may
 * be played in showdowns on any turn; 806.1.d an ability only has Action if written "[Action][>]"),
 * 377/381/310.1.a (the granted "[rainbow][rainbow]: Ready me" is a plain activated ability: uses the
 * chain, paid and activated by the unit's CONTROLLER, only on their turn in a Neutral Open state),
 * [rainbow] = one power of any domain, 317.2.c (both halves expire with the turn).
 *
 * Head-judge notes — trickiest situations for THIS card:
 *  1. One target, two riders: the doubled unit is the same unit that receives the Ready ability; the
 *     ability is hosted on the UNIT (activate it there, Dominus is just the source text) and readies
 *     "me" = that unit.
 *  2. 432.1.a snapshot: cast mid-combat on an attacking Chemtech Enforcer (2, Assault 2 → 4 now) gives
 *     +4 → 8 in that fight and 6 afterwards; a buffed 3 (= 4) becomes 8; two Dominus = ×4 (3 → 6 → 12).
 *  3. The tempo line: a unit played THIS turn (enters exhausted) is doubled, pays 2 power → Ready → and
 *     attacks the same turn. 1 power is not enough; energy never pays [rainbow]; the ability uses the chain.
 *  4. Controller ≠ caster: cast on an ENEMY unit doubles it for them, and only ITS controller could
 *     ever activate the Ready ability — the caster cannot.
 *  5. Timing split: the spell is [Action] (own turn / any showdown incl. defending on P2's turn; never
 *     P2's Neutral Open), but the GRANTED ability is not — not activatable inside a showdown.
 *  6. Expiry: after the turn passes the unit is back to printed Might and the ability is gone even
 *     with power available on P1's next turn.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-142-166";
const CHEMTECH_ENFORCER = "ogn-003-298"; // 2 Might, [Assault 2]

function board(res: { energy?: number; power?: Record<string, number> } = { energy: 4, power: { fury: 1, body: 1 } }) {
  return scenario()
    .resources(P1, res)
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", { might: 3, name: "Trooper" }, "ally")
    .unit(P2, "bf1", { might: 5, name: "Warden" }, "foe")
    .hand(P1, CARD, "dom");
}

async function castOn(game: Game, target: string): Promise<void> {
  await game.p1.cast("dom", { targets: target });
  await game.settle();
}

/** Activate the granted Ready ability hosted on `unit` (whatever index/source the engine exposes it under). */
async function activateReady(game: Game, seat: "p1" | "p2", unit: string): Promise<void> {
  const opt = game[seat].legal().find((o) => o.verb === "activate" && o.card === unit);
  expect(opt).toBeDefined();
  await game[seat].choose(opt!.key, { source: "dom" });
}

describe("Dominus (ven-142-166)", () => {
  test("registry payload: Fury/Body Action spell, 4 energy, no power; abilities = [spell sequence[double-might (turn), grant-ability #1 (turn)] on one unit, activated {power [rainbow, rainbow]} → ready self]", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "spell", energyCost: 4, name: "Dominus", timing: "action" });
    expect([def?.domain].flat().sort()).toEqual(["body", "fury"]);
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toHaveLength(2);
    expect(def?.abilities?.[0]).toMatchObject({
      effect: { effects: [{ duration: "turn", type: "double-might" }, { abilityIndex: 1, duration: "turn", type: "grant-ability" }], target: { type: "unit" }, type: "sequence" },
      timing: "action",
      type: "spell",
    });
    expect(def?.abilities?.[1]).toMatchObject({ cost: { power: ["rainbow", "rainbow"] }, effect: { target: "self", type: "ready" }, type: "activated" });
  });

  test("costs exactly 4 energy (power untouched); ONE target asked; a 3 becomes a 6 (base 3, +3 modifier) only on resolution; Dominus → trash", async () => {
    const game = await board().build();
    expect(game.p1.option("cast", "dom")?.fields.filter((f) => f.arg === "targets")).toHaveLength(1);
    await game.p1.cast("dom", { targets: "ally" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 1, fury: 1 } });
    expect(game.state("ally").might).toBe(3);
    await game.settle();
    expect(game.state("ally")).toMatchObject({ baseMight: 3, might: 6, mightModifier: 3 });
    expect(game.state("foe").might).toBe(5);
    expect(game.zoneOf("dom")).toBe("trash");
    expect((await board({ energy: 3, power: { fury: 3, body: 3 } }).build()).p1.can("cast", "dom")).toBe(false);
    expect((await scenario().resources(P1, { energy: 9 }).hand(P1, CARD, "dom").build()).p1.can("cast", "dom")).toBe(false); // no unit → no target
  });

  test("432.1.a doubles the CURRENT Might: a buffed 3 (= 4) becomes 8; a second Dominus on a 6 makes 12 (×4 overall)", async () => {
    const buffed = await board().unit(P1, "base", { might: 3, name: "Buffed" }, "buffedAlly", { buffed: true }).build();
    expect(buffed.state("buffedAlly").might).toBe(4);
    await castOn(buffed, "buffedAlly");
    expect(buffed.state("buffedAlly").might).toBe(8);

    const twice = await board({ energy: 8 }).hand(P1, CARD, "dom2").build();
    await castOn(twice, "ally");
    await twice.p1.cast("dom2", { targets: "ally" });
    await twice.settle();
    expect(twice.state("ally")).toMatchObject({ might: 12, mightModifier: 9 });
  });

  test("477.3.c: a unit at negative/zero effective Might gains +0 — its modifier is not driven further down", async () => {
    const game = await board().unit(P1, "base", { might: 1, name: "Shrunk" }, "shrunk", { mightModifier: -3 }).build();
    expect(game.state("shrunk").might).toBeLessThanOrEqual(0);
    await castOn(game, "shrunk");
    expect(game.state("shrunk").mightModifier).toBe(-3);
    expect(game.state("shrunk").might).toBeLessThanOrEqual(0);
  });

  test("the granted '[rainbow][rainbow]: Ready me' lives on the UNIT: exhausted 6 → pay 2 power of any domains (fury+body) → on the chain → resolves → ready; energy is not touched", async () => {
    const game = await board({ energy: 9, power: { fury: 1, body: 1 } }).unit(P1, "base", { might: 3, name: "Tired" }, "tired", { exhausted: true }).build();
    expect(game.p1.legal().some((o) => o.verb === "activate" && o.card === "tired")).toBe(false); // nothing before Dominus
    await castOn(game, "tired");
    expect(game.state("tired")).toMatchObject({ isExhausted: true, might: 6 });
    await activateReady(game, "p1", "tired");
    expect(game.p1.resources()).toEqual({ energy: 5, power: { body: 0, fury: 0 } });
    expect(game.chain()).toHaveLength(1);
    expect(game.state("tired").isExhausted).toBe(true); // uses the chain (377.3)
    await game.settle();
    expect(game.state("tired").isReady).toBe(true);
    expect(game.p1.legal().some((o) => o.verb === "activate" && o.card === "dom")).toBe(false); // never on the spell itself
    expect(game.violations()).toEqual([]);
  });

  test("cost gate on the granted ability: 1 power (plus any amount of energy) cannot activate it; a rainbow/wild power pair can", async () => {
    const poor = await board({ energy: 20, power: { fury: 1 } }).unit(P1, "base", { might: 3 }, "tired", { exhausted: true }).build();
    await castOn(poor, "tired");
    expect(poor.p1.legal().some((o) => o.verb === "activate" && o.card === "tired")).toBe(false);
    const wild = await board({ energy: 4, power: { rainbow: 2 } }).unit(P1, "base", { might: 3 }, "tired", { exhausted: true }).build();
    await castOn(wild, "tired");
    await activateReady(wild, "p1", "tired");
    await wild.settle();
    expect(wild.state("tired").isReady).toBe(true);
    expect(wild.p1.power()).toBe(0);
  });

  test("the tempo line: a unit PLAYED this turn (enters exhausted) gets Dominus, pays 2 power to Ready, and attacks the same turn — 3→6 kills the 5-Might Warden and conquers", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6, power: { fury: 1, body: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Warden" }, "foe")
      .hand(P1, { energyCost: 2, might: 3, name: "Fresh Trooper" }, "fresh")
      .hand(P1, CARD, "dom")
      .build();
    await game.p1.play("fresh");
    await game.settle();
    expect(game.state("fresh")).toMatchObject({ isExhausted: true, zone: "base" });
    expect(game.p1.can("move", undefined)).toBe(false); // nothing ready to move
    await castOn(game, "fresh");
    expect(game.state("fresh")).toMatchObject({ isExhausted: true, might: 6 });
    await activateReady(game, "p1", "fresh");
    await game.settle();
    expect(game.state("fresh").isReady).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0, fury: 0 } });
    await game.p1.move("fresh", "bf1");
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.locationOf("fresh")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("controller ≠ caster: cast on the ENEMY exhausted unit doubles it (5 → 10) for P2; P1 — even with 2 power — is never offered its Ready ability", async () => {
    const game = await board({ energy: 4, power: { fury: 1, body: 1 } }).unit(P2, "base", { might: 5, name: "Theirs" }, "theirs", { exhausted: true }).build();
    await castOn(game, "theirs");
    expect(game.state("theirs")).toMatchObject({ controller: P2, isExhausted: true, might: 10 });
    expect(game.p1.legal().some((o) => o.verb === "activate" && o.card === "theirs")).toBe(false);
    expect(game.p1.resources().power).toEqual({ body: 1, fury: 1 }); // nothing was spent
  });

  test("[Action] timing for the SPELL + 432.1.a snapshot: cast while P1 holds Focus in a combat showdown on the attacking Chemtech Enforcer (2 + Assault 2 = 4 now) → +4 → 8 in this fight, 6 afterwards", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4 })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CHEMTECH_ENFORCER, "enf")
      .unit(P2, "bf1", { might: 7, name: "Wall" }, "wall")
      .hand(P1, CARD, "dom")
      .build();
    await game.p1.move("enf", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.state("enf").might).toBe(4);
    expect(game.p1.can("cast", "dom")).toBe(true);
    await game.p1.cast("dom", { targets: "enf" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("enf")).toMatchObject({ might: 8, mightModifier: 4 });
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash"); // 8 ≥ 7
    expect(game.locationOf("enf")).toBe("bf1"); // 7 < 8
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.state("enf").might).toBe(6); // Assault gone, the +4 stays for the turn
  });

  test("[Action] timing: as the DEFENDER on P2's turn P1 may cast it once Focus passes (3 → 6 beats the 4-Might raider); but in P2's Neutral Open main phase it is not castable", async () => {
    const neutral = await board().active(P2).build();
    expect(neutral.p1.can("cast", "dom")).toBe(false);

    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 4 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
      .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
      .hand(P1, CARD, "dom")
      .build();
    await game.p2.move("raider", "bf1");
    expect(game.p1.can("cast", "dom")).toBe(false); // attacker has Focus first
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "dom")).toBe(true);
    await game.p1.cast("dom", { targets: "holder" });
    await game.settle();
    expect(game.state("holder").might).toBe(6);
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.locationOf("holder")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("the granted Ready ability is modelled with timing:'action' and offered during a showdown, but its text has no [Action][>] (806.1.d / 310.1.a / 381) — inside a showdown (P1 holding Focus, 2 power) it must NOT be activatable; back in Neutral Open after combat it is", async () => {
    // Expected: "[rainbow][rainbow]: Ready me." is a plain activated ability → controller's turn, Neutral Open only.
    // Actual: `activateAbility:striker#1` is in P1's showdown menu.
    const game = await scenario()
      .resources(P1, { energy: 4, power: { fury: 1, body: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 4, name: "Striker" }, "striker")
      .unit(P2, "bf1", { might: 5, name: "Wall" }, "wall")
      .hand(P1, CARD, "dom")
      .build();
    await game.p1.move("striker", "bf1"); // exhausts it; showdown, P1 has Focus
    await game.p1.cast("dom", { targets: "striker" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Dominus resolves; Focus goes to P2
    expect(game.state("striker")).toMatchObject({ isExhausted: true, might: 8 });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    await game.p2.passFocus(); // back to P1, still Showdown Open
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.legal().some((o) => o.verb === "activate" && o.card === "striker")).toBe(false);
    await game.settle(); // P1 passes too → combat: 8 kills 5, striker conquers
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.legal().some((o) => o.verb === "activate" && o.card === "striker")).toBe(true);
  });

  test("'this turn' on both halves: after the turn passes the unit is a plain 3 again and — back on P1's turn with 2 power in pool — the Ready ability is gone", async () => {
    const game = await board().build();
    await castOn(game, "ally");
    expect(game.state("ally").might).toBe(6);
    await game.advanceTurn();
    expect(game.state("ally")).toMatchObject({ might: 3, mightModifier: 0 });
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    await game.p1.do("addResources", { power: { fury: 1, body: 1 } });
    await game.p1.move("ally", "bf2"); // exhaust it (bf2 is empty: it just conquers)
    await game.settle();
    expect(game.state("ally").isExhausted).toBe(true);
    expect(game.p1.legal().some((o) => o.verb === "activate" && o.card === "ally")).toBe(false);
    expect((game.state("ally").meta as { grantedAbilities?: unknown[] }).grantedAbilities ?? []).toEqual([]);
  });
});
