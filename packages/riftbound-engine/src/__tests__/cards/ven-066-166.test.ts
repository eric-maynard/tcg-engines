/**
 * Temporal Breach — ven-066-166 · Spell · Mind · 2 energy + [mind]
 *
 *   [Hidden] (Hide now for [rainbow] to react with later for [energy_0].)
 *   Banish a unit, then its owner plays it to the same location, ignoring its cost.
 *
 * Head-judge notes — the tricky spots this file covers:
 *   1. "a unit": ANY unit — friendly or enemy, base or battlefield. The replayed card is a NEW object:
 *      damage, buffs, stuns and "this turn" grants are gone, and as a played unit it enters EXHAUSTED
 *      (359.2.c) even if it was ready — a combat trick AND a reset button.
 *   2. "its OWNER plays it": controller ≠ owner (a stolen unit) → it comes back under its owner's
 *      control at the same location. "ignoring its cost": the owner pays nothing even when broke.
 *      Because the owner PLAYS it, its "When you play me" abilities trigger again — for the owner (411.4).
 *   3. A played unit resolves immediately (337.2): once Temporal Breach resolves the unit is already
 *      back on the board — there is no priority window with the unit sitting in banishment.
 *   4. Tokens: a banished token ceases to exist (186.1) — nothing comes back.
 *   5. Hidden (811): hide for [rainbow] only at a battlefield you control; not playable the turn it is
 *      hidden; from the next turn it has [Reaction] and plays for 0 — e.g. in the opponent's showdown at
 *      that battlefield — and its target must be a unit AT THAT BATTLEFIELD (811.1.d.2).
 *   6. From hand it is standard speed: 2 energy + a MIND power, own turn, open state only.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "ven-066-166";
const CLOUD_DRAKE = "ven-048-166"; // 6-cost Mind unit, 5 Might: "When you play me, draw 1."
const ITERATIVE_DESIGN = "ven-051-166"; // Play a 3 [Might] Mech unit token.
const CLEAVE = "ogn-004-298"; // [Action] Give a unit [Assault 3] this turn.

function withTarget() {
  return scenario()
    .resources(P1, { energy: 2, power: { mind: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { energyCost: 7, might: 4, name: "Veteran" }, "vet", { buffed: true, damage: 3, exhausted: false, stunned: true })
    .unit(P2, "base", { might: 2, name: "Homebody" }, "home")
    .unit(P1, "base", { might: 1, name: "Mine" }, "mine")
    .hand(P1, CARD, "breach");
}

function hidden() {
  return scenario()
    .resources(P1, { power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
    .unit(P2, "bf2", { might: 5, name: "Faraway" }, "far")
    .unit(P2, "base", { might: 5, name: "Raider" }, "raider")
    .hand(P1, CARD, "breach");
}

describe("Temporal Breach (ven-066-166)", () => {
  test("parsed abilities: Hidden keyword + spell sequence [banish a unit → play it (pending value) to the same location, ignoring cost]", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "spell", domain: "mind", energyCost: 2, powerCost: ["mind"] });
    const abilities = def?.abilities as Record<string, unknown>[];
    expect(abilities).toHaveLength(2);
    expect(abilities[0]).toMatchObject({ keyword: "Hidden", type: "keyword" });
    expect(abilities[1]).toMatchObject({
      effect: {
        effects: [
          { target: { type: "unit" }, type: "banish" },
          { ignoreCost: true, target: { type: "pending-value" }, toLocation: "same", type: "play" },
        ],
        type: "sequence",
      },
      type: "spell",
    });
  });

  test("from hand: costs 2 energy + [mind]; any unit (either side, base or battlefield) is a legal target; unaffordable with calm instead of mind or with 1 energy", async () => {
    const game = await withTarget().build();
    const targets = game.p1.option("cast", "breach")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toEqual(expect.arrayContaining([["vet"], ["home"], ["mine"]]));
    expect(targets).toHaveLength(3);
    await game.p1.cast("breach", { targets: "vet" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.zoneOf("breach")).toBe("chain");
    const calm = await scenario().resources(P1, { energy: 5, power: { calm: 1 } }).unit(P2, "base", { might: 2 }, "u").hand(P1, CARD, "breach").build();
    expect(calm.p1.can("cast", "breach")).toBe(false);
    const low = await scenario().resources(P1, { energy: 1, power: { mind: 2 } }).unit(P2, "base", { might: 2 }, "u").hand(P1, CARD, "breach").build();
    expect(low.p1.can("cast", "breach")).toBe(false);
  });

  test("reset: a damaged, buffed, stunned, READY enemy unit comes back to the SAME battlefield as a fresh object — no damage/buff/stun, EXHAUSTED (359.2.c), still owned+controlled by P2 who paid nothing", async () => {
    const game = await withTarget().build();
    expect(game.state("vet")).toMatchObject({ damage: 3, isBuffed: true, isReady: true, isStunned: true, might: 5 });
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} }); // cannot afford its 7 — irrelevant
    await game.p1.cast("breach", { targets: "vet" });
    await game.settle();
    expect(game.zoneOf("vet")).toBe("battlefield-bf1");
    expect(game.state("vet")).toMatchObject({ controller: P2, damage: 0, isBuffed: false, isExhausted: true, isStunned: false, might: 4, owner: P2 });
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
    expect(game.zoneOf("breach")).toBe("trash"); // cast from hand → trash (Flow-less, not banished)
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p2.banishment()).toEqual([]);
  });

  test("'this turn' grants do not survive the round trip: Cleave's Assault 3 on my unit is gone after I Breach it (new object)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { mind: 1 } })
      .unit(P1, "base", { might: 3, name: "Mine" }, "mine")
      .hand(P1, CLEAVE, "cleave")
      .hand(P1, CARD, "breach")
      .build();
    await game.p1.cast("cleave", { targets: "mine" });
    await game.settle();
    expect(game.state("mine").grantedKeywords).toHaveLength(1);
    await game.p1.cast("breach", { targets: "mine" });
    await game.settle();
    expect(game.zoneOf("mine")).toBe("base");
    expect(game.state("mine").grantedKeywords).toEqual([]);
    expect(game.state("mine")).toMatchObject({ controller: P1, isExhausted: true, owner: P1 });
  });

  test("controller ≠ owner: a unit P1 stole from P2 is replayed by its OWNER — it returns to the same battlefield under P2's control", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { mind: 1 } })
      .battlefield("bf1", { controller: P1 })
      .card("stolen", { controller: P1, def: { cardType: "unit", might: 3, name: "Turncoat" }, owner: P2, zone: "battlefield-bf1" })
      .hand(P1, CARD, "breach")
      .build();
    expect(game.p1.units("bf1")).toEqual(["stolen"]);
    await game.p1.cast("breach", { targets: "stolen" });
    await game.settle();
    expect(game.zoneOf("stolen")).toBe("battlefield-bf1");
    expect(game.state("stolen")).toMatchObject({ controller: P2, owner: P2 });
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.p2.units("bf1")).toEqual(["stolen"]);
  });

  test("tokens cease to exist when banished (186.1): Breaching a Mech token removes it for good — nothing is replayed", async () => {
    const game = await scenario().resources(P1, { energy: 6, power: { mind: 1 } }).hand(P1, ITERATIVE_DESIGN, "design").hand(P1, CARD, "breach").build();
    await game.p1.cast("design");
    await game.settle();
    const tok = game.p1.base().find((c) => c.startsWith("token-mech-"));
    expect(tok).toBeDefined();
    await game.p1.cast("breach", { targets: tok! });
    await game.settle();
    expect(game.has(tok!)).toBe(false);
    expect(game.p1.base().filter((c) => c.startsWith("token-"))).toEqual([]);
    expect(game.p1.banishment().filter((c) => c.startsWith("token-"))).toEqual([]);
    expect(game.decision()?.kind).toBe("action");
  });

  test("a played unit resolves immediately (337.2) — once Temporal Breach resolves the unit is already back on the board and the chain is EMPTY (no priority window with it in banishment)", async () => {
    // Expected: after both players pass on the spell, vet is at bf1 and chain() is []. Actual: the engine parks a
    // P2-controlled "Veteran" chain item and leaves vet in banishment until both players pass again.
    const game = await withTarget().build();
    await game.p1.cast("breach", { targets: "vet" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // spell resolves here
    expect(game.zoneOf("breach")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("vet")).toBe("battlefield-bf1");
  });

  test("'its owner PLAYS it' re-fires play triggers — Breaching my own Cloud Drake ('When you play me, draw 1') draws me a card", async () => {
    // Expected (411.4): after everything settles P1's hand grew by 1 (Breach left the hand, Drake's trigger drew 1 → net 0
    // vs. the pre-cast hand of 1 → 1). Actual: Drake comes back but no card is drawn (hand 0).
    const game = await scenario().resources(P1, { energy: 2, power: { mind: 1 } }).unit(P1, "base", CLOUD_DRAKE, "drake").hand(P1, CARD, "breach").build();
    expect(game.p1.hand()).toEqual(["breach"]);
    const deck = game.p1.deck().length;
    await game.p1.cast("breach", { targets: "drake" });
    await game.settle();
    expect(game.zoneOf("drake")).toBe("base");
    expect(game.state("drake").isExhausted).toBe(true);
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.p1.deck()).toHaveLength(deck - 1);
  });

  test("Breaching an ENEMY Cloud Drake makes ITS OWNER (P2) draw — the play, and its trigger, belong to the owner", async () => {
    // Expected: P2 hand +1, P1 hand unchanged (minus the Breach). Actual: nobody draws.
    const game = await scenario().resources(P1, { energy: 2, power: { mind: 1 } }).unit(P2, "base", CLOUD_DRAKE, "drake").hand(P1, CARD, "breach").build();
    const p2Hand = game.p2.hand().length;
    await game.p1.cast("breach", { targets: "drake" });
    await game.settle();
    expect(game.zoneOf("drake")).toBe("base");
    expect(game.state("drake").controller).toBe(P2);
    expect(game.p2.hand()).toHaveLength(p2Hand + 1);
    expect(game.p1.hand()).toEqual([]);
  });

  test("timing from hand: standard speed — not on the opponent's turn, and not in response while a chain is open", async () => {
    const opp = await withTarget().active(P2).build();
    expect(opp.p1.can("cast", "breach")).toBe(false);
    const chain = await withTarget().resources(P1, { energy: 4, power: { mind: 2 } }).hand(P1, CARD, "breach2").build();
    await chain.p1.cast("breach", { targets: "vet" });
    expect(chain.p1.can("cast", "breach2")).toBe(false); // no [Reaction] from hand
    await chain.p1.passPriority();
    expect(chain.p2.legal().map((o) => o.verb)).not.toContain("cast");
  });

  test("Hidden: hide for [rainbow] at a battlefield you CONTROL (bf2 is not offered); it is facedown, and cannot be played the same turn", async () => {
    const game = await hidden().build();
    expect(game.p1.option("hide", "breach")?.fields.find((f) => f.arg === "to")?.options).toEqual(["bf1"]);
    await game.p1.hide("breach", "bf1");
    expect(game.p1.resources().power).toEqual({ rainbow: 0 });
    expect(game.zoneOf("breach")).toBe("facedown-bf1");
    expect(game.state("breach").isHidden).toBe(true);
    expect(game.p1.can("reveal", "breach")).toBe(false);
    // No controlled battlefield / no rainbow → cannot hide at all.
    const noBf = await scenario().resources(P1, { power: { rainbow: 1 } }).battlefield("bf1", { controller: P2 }).hand(P1, CARD, "breach").build();
    expect(noBf.p1.can("hide", "breach")).toBe(false);
    const noPower = await scenario().resources(P1, { energy: 5 }).battlefield("bf1", { controller: P1 }).hand(P1, CARD, "breach").build();
    expect(noPower.p1.can("hide", "breach")).toBe(false);
  });

  test("Hidden → Reaction on a later turn: during P2's attack INTO bf1, P1 reveals it for 0; targets are restricted to units AT bf1 (holder, the raider) — the faraway unit is not offered (811.1.d.2)", async () => {
    const game = await hidden().build();
    await game.p1.hide("breach", "bf1");
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.can("reveal", "breach")).toBe(false); // neutral open state on P2's turn: no priority for P1
    await game.p2.move("raider", "bf1"); // combat showdown at bf1, P2 (attacker) has Focus
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("reveal", "breach")).toBe(true);
    const energy = game.p1.energy();
    await game.p1.reveal("breach");
    expect(game.p1.energy()).toBe(energy); // played for [0]
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "breach", controller: P1 })]);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(new Set(d?.kind === "pick" ? d.options.map((o) => o.card) : [])).toEqual(new Set(["holder", "raider"]));
    await game.p1.pick("raider");
    await game.settle();
    // The raider was banished mid-attack and replayed by P2 at bf1: it is back there, exhausted, P2's.
    expect(game.zoneOf("raider")).toBe("battlefield-bf1");
    expect(game.state("raider")).toMatchObject({ controller: P2, isExhausted: true, owner: P2 });
    expect(game.zoneOf("breach")).toBe("trash");
  });

  test("Hidden on my own later turn: reveal for 0 with the lone unit at bf1 auto-targeted; my 2 energy + mind stay untouched", async () => {
    const game = await hidden().resources(P1, { energy: 2, power: { mind: 1, rainbow: 1 } }).build();
    await game.p1.hide("breach", "bf1");
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    const before = game.p1.resources();
    await game.p1.reveal("breach");
    expect(game.p1.resources()).toEqual(before);
    await game.settle(); // holder is the only unit at bf1 → forced pick
    expect(game.zoneOf("holder")).toBe("battlefield-bf1");
    expect(game.state("holder")).toMatchObject({ controller: P1, isExhausted: true });
    expect(game.zoneOf("far")).toBe("battlefield-bf2"); // never touched
    expect(game.zoneOf("breach")).toBe("trash");
  });
});
