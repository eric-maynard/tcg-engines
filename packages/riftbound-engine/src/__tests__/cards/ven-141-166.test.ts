/**
 * Butcher of the Sands — ven-141-166 · Legend · Fury/Body
 *
 *   [Reaction][>] [rainbow][rainbow], [Exhaust]: [Add] [2]. Spend this Energy only to play units or
 *   activated abilities of units.
 *
 * Rules: 429.2 (an activated ability that Adds resolves the moment it is finalized — no chain item, no
 * priority passes), 135.2.e.5.a ([rainbow] as a COST = one power of ANY domain; two pips = two power,
 * domains may be mixed), 813 + 316.5.b (Reaction: usable in Closed states / showdowns on either turn,
 * but not in the opponent's Neutral Open state), 429.4-style earmark (cf. Lux, Crownguard ogs-014-024:
 * "Use only to play spells"): the added [2] may pay ONLY for playing a unit or for an activated ability
 * whose source is a unit — never a spell, a gear play, or a gear's ability; ordinary energy is unaffected.
 *
 * Head-judge notes — trickiest situations for THIS card:
 *  1. Earmark vs. mixed pools: 1 real + 2 earmarked = a 3-cost UNIT is fine; a 1-cost spell is fine (real
 *     energy); a 2-cost spell is NOT (it would need an earmarked point).
 *  2. "activated abilities of UNITS": Renekton, Brute's "[1]: +1 Might" qualifies; The Syren's (a gear)
 *     "[1], [Exhaust]: …" does not; playing Doran's Shield (a gear) does not.
 *  3. Cost shape: exactly two power of any domains (fury+body, calm+calm, rainbow×2 all pay; one power
 *     does not) plus the exhaust → once per turn; nothing is added if it can't be activated.
 *  4. Reaction timing: legal with priority inside a chain on P2's turn and with Focus in a showdown;
 *     illegal in P2's quiet main phase.
 *  5. Energy empties at end of turn (160): the [2] does not survive to the next turn.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-141-166";
const RENEKTON = "ven-177-166"; // Unit · Body · 5 · 4 Might · "[1]: Give me +1 [Might] this turn."
const THE_SYREN = "ogn-184-298"; // Gear · "[1], [Exhaust]: Move a friendly unit at a battlefield to its base."
const DORANS_SHIELD = "sfd-033-221"; // Gear (Equipment) · 1 energy
const UNIT2 = { cardType: "unit", domain: "fury", energyCost: 2, might: 2, name: "Two Drop" };
const UNIT3 = { cardType: "unit", domain: "fury", energyCost: 3, might: 3, name: "Three Drop" };
const spell = (energyCost: number) => ({
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost,
  name: `Bolt ${energyCost}`,
  timing: "action",
});

function legend(power: Record<string, number> = { fury: 2 }, energy = 0) {
  return scenario().resources(P1, { energy, power }).legend(P1, CARD, "butcher").unit(P2, "base", { might: 5, name: "Dummy" }, "dummy");
}

describe("Butcher of the Sands (ven-141-166)", () => {
  test("registry payload: ONE Reaction activated ability — cost {2×[rainbow], exhaust}, effect add-resource energy 2", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "legend", domain: ["fury", "body"], name: "Butcher of the Sands" });
    expect(def?.abilities).toHaveLength(1);
    expect(def?.abilities?.[0]).toMatchObject({
      cost: { exhaust: true, power: ["rainbow", "rainbow"] },
      effect: { energy: 2, type: "add-resource" },
      timing: "reaction",
      type: "activated",
    });
  });

  test("registry payload — the Add carries the printed spending restriction ('only to play units or activated abilities of units')", async () => {
    // Expected: effect.restriction present (cf. ogs-014-024 → restriction: "spell"). Actual: no restriction at all.
    const a = (await loadDefaultCardPool()).get(CARD)?.abilities?.[0] as { effect?: { restriction?: unknown } };
    expect(a.effect?.restriction).toBeDefined();
    expect(JSON.stringify(a.effect?.restriction)).toContain("unit");
  });

  test("[rainbow][rainbow], [Exhaust]: [Add] [2] — spends two fury, exhausts the legend, +2 energy at once, nothing on the chain (429.2), still my open main phase", async () => {
    const game = await legend({ fury: 2 }).build();
    expect(game.state("butcher").isReady).toBe(true);
    await game.p1.activate("butcher");
    expect(game.p1.resources()).toEqual({ energy: 2, power: { fury: 0 } });
    expect(game.state("butcher").isExhausted).toBe(true);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.can("activate", "butcher")).toBe(false); // exhausted → once per turn
    expect(game.violations()).toEqual([]);
  });

  test("cost is two power of ANY domains (135.2.e.5.a): fury+body, calm+calm and rainbow+rainbow all pay exactly 2; a single power (plus any energy) does not", async () => {
    for (const power of [{ body: 1, fury: 1 }, { calm: 2 }, { rainbow: 2 }, { calm: 1, mind: 2 }]) {
      const game = await legend(power).build();
      expect(game.p1.can("activate", "butcher")).toBe(true);
      await game.p1.activate("butcher");
      expect(game.p1.energy()).toBe(2);
      expect(game.p1.power()).toBe(Object.values(power).reduce((a, b) => a + b, 0) - 2);
    }
    const one = await legend({ fury: 1 }, 9).build();
    expect(one.p1.can("activate", "butcher")).toBe(false);
    expect((await one.p1.try((p) => p.activate("butcher"))).ok).toBe(false);
    expect(one.p1.resources()).toEqual({ energy: 9, power: { fury: 1 } });
    expect(one.state("butcher").isReady).toBe(true);
    const exhausted = await scenario().resources(P1, { power: { fury: 3 } }).card("butcher", { def: CARD, meta: { exhausted: true }, owner: P1, zone: "legendZone" }).build();
    expect(exhausted.p1.can("activate", "butcher")).toBe(false);
  });

  test("the earmarked [2] PLAYS A UNIT: a 2-drop from an otherwise empty pool", async () => {
    const game = await legend().hand(P1, UNIT2, "two").build();
    expect(game.p1.can("play", "two")).toBe(false);
    await game.p1.activate("butcher");
    expect(game.p1.can("play", "two")).toBe(true);
    await game.p1.play("two");
    await game.settle();
    expect(game.zoneOf("two")).toBe("base");
    expect(game.p1.energy()).toBe(0);
  });

  test("the earmarked [2] pays an ACTIVATED ABILITY OF A UNIT: Renekton, Brute's '[1]: +1 Might' twice", async () => {
    const game = await legend().unit(P1, "base", RENEKTON, "renek").build();
    expect(game.p1.can("activate", "renek")).toBe(false);
    await game.p1.activate("butcher");
    expect(game.p1.can("activate", "renek")).toBe(true);
    await game.p1.activate("renek");
    await game.settle();
    await game.p1.activate("renek");
    await game.settle();
    expect(game.p1.energy()).toBe(0);
    expect(game.state("renek").might).toBe(6);
  });

  test("mixed pool: 1 ordinary + 2 earmarked energy plays a 3-cost unit", async () => {
    const game = await legend({ fury: 2 }, 1).hand(P1, UNIT3, "three").build();
    await game.p1.activate("butcher");
    expect(game.p1.energy()).toBe(3);
    expect(game.p1.can("play", "three")).toBe(true);
    await game.p1.play("three");
    expect(game.p1.energy()).toBe(0);
  });

  test("'Spend this Energy only to play units…' — the earmarked [2] cannot cast a SPELL (a 1-cost bolt stays uncastable; with 1 real energy a 1-cost bolt is fine but a 2-cost bolt is not)", async () => {
    // Expected: earmark blocks spells entirely; real energy still works. Actual: no earmark — every spell is castable.
    const game = await legend().hand(P1, spell(1), "bolt1").build();
    await game.p1.activate("butcher");
    expect(game.p1.energy()).toBe(2);
    expect(game.p1.can("cast", "bolt1")).toBe(false);
    const mixed = await legend({ fury: 2 }, 1).hand(P1, spell(1), "cheap").hand(P1, spell(2), "pricey").build();
    await mixed.p1.activate("butcher");
    expect(mixed.p1.energy()).toBe(3);
    expect(mixed.p1.can("cast", "cheap")).toBe(true);
    expect(mixed.p1.can("cast", "pricey")).toBe(false);
  });

  test("'…or activated abilities of units' — the earmarked [2] can neither PLAY a gear (Doran's Shield, 1) nor pay a GEAR's ability (The Syren's [1], [Exhaust])", async () => {
    // Expected: both stay illegal after the Add. Actual: both become legal.
    const game = await legend()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Sailor" }, "sailor")
      .gear(P1, THE_SYREN, "syren")
      .hand(P1, DORANS_SHIELD, "shield")
      .build();
    expect(game.p1.can("play", "shield")).toBe(false);
    expect(game.p1.can("activate", "syren")).toBe(false);
    await game.p1.activate("butcher");
    expect(game.p1.energy()).toBe(2);
    expect(game.p1.can("play", "shield")).toBe(false);
    expect(game.p1.can("activate", "syren")).toBe(false);
  });

  test("[Reaction] timing: NOT in the opponent's Neutral Open main phase; YES with priority in response to their spell (the chain is untouched); the Add is instant", async () => {
    const game = await legend()
      .active(P2)
      .resources(P2, { energy: 2 })
      .unit(P1, "base", { might: 3, name: "Mine" }, "mine")
      .hand(P2, spell(2), "bolt")
      .build();
    expect(game.p1.can("activate", "butcher")).toBe(false); // 316.5.b
    await game.p2.cast("bolt", { targets: "mine" });
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("activate", "butcher")).toBe(true);
    await game.p1.activate("butcher");
    expect(game.p1.energy()).toBe(2);
    expect(game.chain().map((i) => i.cardId)).toEqual(["bolt"]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 }); // 429.2.a: priority did not move
  });

  test("[Reaction] timing: usable with Focus in a showdown on the opponent's turn (as the defender)", async () => {
    const game = await legend()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Def" }, "def")
      .unit(P2, "base", { might: 3, name: "Atk" }, "atk")
      .build();
    await game.p2.move("atk", "bf1");
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("activate", "butcher")).toBe(true);
    await game.p1.activate("butcher");
    expect(game.p1.energy()).toBe(2);
    expect(game.state("butcher").isExhausted).toBe(true);
  });

  test("the [2] is ordinary pool energy for duration purposes: unspent, it is gone at end of turn; the legend readies in my next Awaken and can Add again", async () => {
    const game = await legend({ fury: 4 }).build();
    await game.p1.activate("butcher");
    expect(game.p1.energy()).toBe(2);
    await game.advanceTurn();
    expect(game.p1.energy()).toBe(0);
    expect(game.state("butcher").isExhausted).toBe(true);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("butcher").isReady).toBe(true);
    expect(game.p1.energy()).toBe(0);
    await game.p1.do("addResources", { power: { body: 2 } });
    await game.p1.activate("butcher");
    expect(game.p1.energy()).toBe(2);
  });
});
