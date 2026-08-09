/**
 * Interaction: an APPLIED COST paid in [rainbow] × two different Reaction [Add] sources, one earmarked.
 *   Mageseeker Investigator (unl-163-219) · Unit · Order · 4 · 4 Might
 *     "Opponents must pay [rainbow] for each unit beyond the first to move multiple units to my
 *      battlefield at the same time."
 *   × Gold (sfd-t03) · Gear token
 *     "Kill this, [Exhaust]: [Reaction] — [Add] [rainbow]."
 *   × Fire Below the Mountain (sfd-189-221) · Legend (Ornn)
 *     "[Exhaust]: [Reaction] — [Add] [rainbow]. Use only to play gear or use gear abilities."
 *
 * Question. P1's turn, Neutral Open. P2 controls bf1 with the Investigator. P1: two ready 3-Might
 * units in base, a ready Gold token, Fire Below ready, pool = 2 energy / 0 power.
 *   (a) Is the simultaneous two-unit Standard Move to bf1 enumerated? A single-unit move?
 *   (b) P1 exhausts Fire Below (+1 gear-only rainbow): is the two-unit move enumerated now?
 *   (c) P1 then cracks Gold (+1 free rainbow): enumerated now? On taking the move, which rainbow
 *       leaves the pool and what is left?
 *   (d) Does the order (Gold first, then legend) change which resource pays?
 *
 * Rules: 144.3 / 144.3.c (multi-unit Standard Move = one action, exhaust costs paid together);
 * 204.4 / 204.4.b / 204.4.c (Investigator = the rulebook's applied-cost example: paid as the action
 * is performed, no chain; can't/won't pay → the action cannot be performed); 203 (unpayable cost →
 * no effect); 135.2.e.5.a ([rainbow] is POWER of any domain — energy never pays it); 444.1 (paying
 * = removing from the pool); 429.2 (Add abilities resolve on finalization, never a chain item);
 * 429.3 (Reaction Adds may be used whenever a cost is due — its own example is this Investigator
 * move); 429.4-style earmark ("Use only to play gear or use gear abilities").
 *
 * Expected: (a) single-unit moves ✔ (no tax); the two-unit move owes 1 [rainbow], pool has 0 power
 * → not enumerated / rejected. (b) still NOT enumerated — the only rainbow is gear-earmarked and a
 * Standard Move's applied cost is neither playing gear nor a gear ability. (c) Gold: killed (token
 * ceases to exist), +1 unrestricted rainbow at once, no chain item; pool 2E / 2 rainbow (1 gear-only
 * + 1 free) → the two-unit move IS enumerated; taking it exhausts both movers, debits exactly the
 * FREE rainbow (energy 2 untouched, 1 rainbow left and it is still the gear-earmarked one — it can
 * fund a gear's Reaction ability in the ensuing showdown but not a spell's power pip); combat at
 * bf1 opens with P1 attacking and holding Focus. (d) No — whichever Add came first, the free
 * rainbow pays and the earmarked one remains.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const INVESTIGATOR = "unl-163-219";
const GOLD = "sfd-t03";
const FIRE_BELOW = "sfd-189-221";

/** A [Reaction] spell whose whole cost is one [mind] power pip — a probe for "can this rainbow pay a spell?". */
const PIP_SPELL = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "mind",
  energyCost: 0,
  name: "Pip Bolt",
  powerCost: ["mind"],
  rulesText: "[Reaction] Deal 1 to a unit.",
  timing: "reaction",
};

/** A gear with a [Reaction] ability costing one [calm] power pip — a probe for "can this rainbow pay a GEAR ability?". */
const TRINKET = {
  abilities: [{ cost: { power: ["calm"] }, effect: { amount: 1, type: "draw" }, timing: "reaction", type: "activated" }],
  cardType: "gear",
  domain: "calm",
  energyCost: 0,
  name: "Trinket",
  rulesText: "[calm]: [Reaction] — Draw 1.",
};

/**
 * P1's turn 2, main phase, Neutral Open. P2 controls bf1 with the Investigator. P1: MoverA/MoverB
 * (3 Might, ready) in base, a ready Gold token, the Trinket probe gear, Pip Bolt in hand, legend
 * Fire Below ready, pool 2 energy / 0 power.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", INVESTIGATOR, "msi")
    .unit(P1, "base", { might: 3, name: "MoverA" }, "a")
    .unit(P1, "base", { might: 3, name: "MoverB" }, "b")
    .gear(P1, GOLD, "gold")
    .gear(P1, TRINKET, "trinket")
    .hand(P1, PIP_SPELL, "bolt")
    .legend(P1, FIRE_BELOW, "ornn");
}

/** The unit-sets the engine currently enumerates for P1's Standard Move to `bf` (each sorted). */
function moveSetsOffered(game: Game, bf: string): string[][] {
  const opt = game.p1.option(`standardMove:to:${bf}`);
  return (opt?.variants ?? []).map((v) => [...((v.params.unitIds as string[]) ?? [])].sort());
}

function offersPair(game: Game): boolean {
  return moveSetsOffered(game, "bf1").some((s) => s.length === 2 && s[0] === "a" && s[1] === "b");
}

describe("(a) 2 energy / 0 power: the tax is 1 [rainbow] of POWER — single moves are free, the two-unit move is not available", () => {
  test("single-unit moves to bf1 ARE enumerated ('beyond the first' → one unit owes nothing)", async () => {
    const game = await board().build();
    const sets = moveSetsOffered(game, "bf1");
    expect(sets).toContainEqual(["a"]);
    expect(sets).toContainEqual(["b"]);
  });

  test("the simultaneous two-unit move to bf1 is NOT enumerated and is rejected; nothing moves, pool untouched (203, 204.4.c, 135.2.e.5.a)", async () => {
    const game = await board().build();
    expect(offersPair(game)).toBe(false);
    await expect(game.p1.move(["a", "b"], "bf1")).rejects.toThrow();
    expect(game.locationOf("a")).toBe("base");
    expect(game.locationOf("b")).toBe("base");
    expect(game.state("a").isReady).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 2, power: {} });
  });

  test("a single unit really does move in for free — energy 2 still there, combat showdown opens", async () => {
    const game = await board().build();
    await game.p1.move("a", "bf1");
    expect(game.locationOf("a")).toBe("bf1");
    expect(game.p1.resources()).toEqual({ energy: 2, power: {} });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  });
});

describe("(b) Fire Below's rainbow is gear-only — it cannot fund a Standard Move's applied cost", () => {
  test("exhausting Fire Below is a Reaction Add: legend exhausted, pool reads 2E / 1 rainbow, no chain item, P1 still in its open main phase (429.2)", async () => {
    const game = await board().build();
    await game.p1.activate("ornn");
    expect(game.state("ornn").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 2, power: { rainbow: 1 } });
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    // the earmark is recorded against that rainbow
    expect(game.gameState.restrictedPower?.[P1]).toEqual({ gear: { rainbow: 1 } });
  });

  test("that rainbow is earmarked: it can pay the Trinket's GEAR ability but not Pip Bolt's spell pip", async () => {
    const game = await board().build();
    expect(game.p1.can("activate", "trinket")).toBe(false); // no power at all yet
    await game.p1.activate("ornn");
    expect(game.p1.can("activate", "trinket")).toBe(true);
    expect(game.p1.can("cast", "bolt")).toBe(false);
  });

  // Expected: spendable-for-this-cost power is 0 (the lone rainbow may only play gear / pay gear
  // abilities), so the taxed two-unit move stays illegal and un-enumerated. Actual: the move
  // validator sums the raw power pool (1) without consulting the earmark, offers the move, and
  // executing it spends the gear-only rainbow on the Investigator tax.
  test("with only the gear-earmarked rainbow in the pool the two-unit move must still NOT be enumerated and must be rejected (204.4.c + earmark)", async () => {
    const game = await board().build();
    await game.p1.activate("ornn");
    expect(offersPair(game)).toBe(false);
    const r = await game.p1.try((p) => p.move(["a", "b"], "bf1"));
    expect(r.ok).toBe(false);
    expect(game.locationOf("a")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 2, power: { rainbow: 1 } });
  });
});

describe("(c) legend first, then Gold: the free rainbow pays the tax, the earmarked one stays", () => {
  test("cracking Gold: the token ceases to exist, +1 rainbow immediately, no chain item, priority never leaves P1; pool 2E / 2 rainbow with exactly 1 still gear-earmarked (429.2)", async () => {
    const game = await board().build();
    await game.p1.activate("ornn");
    await game.p1.activate("gold");
    expect(game.zoneOf("gold")).toBe("gone");
    expect(game.p1.gear()).not.toContain("gold");
    expect(game.p1.resources()).toEqual({ energy: 2, power: { rainbow: 2 } });
    expect(game.gameState.restrictedPower?.[P1]).toEqual({ gear: { rainbow: 1 } });
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p2.legal()).toEqual([]); // P2 never gets a window against an Add
  });

  test("now the two-unit move to bf1 IS enumerated (1 free rainbow covers the 1-pip tax)", async () => {
    const game = await board().build();
    await game.p1.activate("ornn");
    await game.p1.activate("gold");
    expect(offersPair(game)).toBe(true);
  });

  test("taking it: both movers exhausted at bf1 (144.3.c), energy 2 untouched, power 2 → 1, and the remaining rainbow is still the gear-earmarked one", async () => {
    const game = await board().build();
    await game.p1.activate("ornn");
    await game.p1.activate("gold");
    await game.p1.move(["a", "b"], "bf1");
    expect(game.locationOf("a")).toBe("bf1");
    expect(game.locationOf("b")).toBe("bf1");
    expect(game.state("a").isExhausted).toBe(true);
    expect(game.state("b").isExhausted).toBe(true);
    expect(game.p1.energy()).toBe(2);
    expect(game.p1.resources().power).toEqual({ rainbow: 1 });
    expect(game.gameState.restrictedPower?.[P1]).toEqual({ gear: { rainbow: 1 } });
    expect(game.chain()).toEqual([]); // the applied cost used no chain (204.4.b)
    expect(game.violations()).toEqual([]);
  });

  test("combat at bf1 begins with P1 attacking and holding Focus; there the leftover rainbow can fund the Trinket's gear Reaction but NOT Pip Bolt's spell pip", async () => {
    const game = await board().build();
    await game.p1.activate("ornn");
    await game.p1.activate("gold");
    await game.p1.move(["a", "b"], "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.state("a").combatRole).toBe("attacker");
    expect(game.state("b").combatRole).toBe("attacker");
    expect(game.state("msi").combatRole).toBe("defender");
    expect(game.p1.can("activate", "trinket")).toBe(true);
    expect(game.p1.can("cast", "bolt")).toBe(false);
    // control: had the leftover rainbow been a FREE one, Pip Bolt would be castable here
    const control = await board().resources(P1, { power: { rainbow: 2 } }).build();
    await control.p1.move(["a", "b"], "bf1");
    expect(control.p1.resources().power).toEqual({ rainbow: 1 });
    expect(control.p1.can("cast", "bolt")).toBe(true);
  });
});

describe("(d) Gold first, then legend — order of the Adds does not change which rainbow pays", () => {
  test("Gold → Fire Below → two-unit move: enumerated, taken, energy 2, 1 rainbow left and it is the gear-earmarked one (Trinket ✔, Pip Bolt ✘)", async () => {
    const game = await board().build();
    await game.p1.activate("gold");
    expect(game.p1.resources()).toEqual({ energy: 2, power: { rainbow: 1 } });
    expect(game.gameState.restrictedPower?.[P1]).toBeUndefined(); // Gold's rainbow is unrestricted
    expect(offersPair(game)).toBe(true); // one free rainbow already covers the tax
    await game.p1.activate("ornn");
    expect(game.p1.resources()).toEqual({ energy: 2, power: { rainbow: 2 } });
    expect(offersPair(game)).toBe(true);
    await game.p1.move(["a", "b"], "bf1");
    expect(game.p1.units("bf1").sort()).toEqual(["a", "b"]);
    expect(game.p1.energy()).toBe(2);
    expect(game.p1.resources().power).toEqual({ rainbow: 1 });
    expect(game.gameState.restrictedPower?.[P1]).toEqual({ gear: { rainbow: 1 } });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("activate", "trinket")).toBe(true);
    expect(game.p1.can("cast", "bolt")).toBe(false);
  });

  test("Gold alone (no legend) is enough: the free rainbow pays the tax and the pool's power is empty afterwards", async () => {
    const game = await board().build();
    await game.p1.activate("gold");
    await game.p1.move(["a", "b"], "bf1");
    expect(game.p1.resources()).toEqual({ energy: 2, power: { rainbow: 0 } });
    expect(game.p1.units("bf1").sort()).toEqual(["a", "b"]);
  });
});
