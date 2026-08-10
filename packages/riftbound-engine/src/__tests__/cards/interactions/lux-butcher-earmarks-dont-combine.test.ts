/**
 * Interaction: Lux, Crownguard (ogs-014-024) · Champion Unit · Order · 4 · 2 Might
 *     "[Exhaust]: [Reaction] — [Add] [2]. Use only to play spells."
 *   × Butcher of the Sands (ven-141-166) · Legend · Fury/Body
 *     "[Reaction][>] [rainbow][rainbow], [Exhaust]: [Add] [2]. Spend this Energy only to play units or
 *      activated abilities of units."
 *   (+ inline pip-less standard-timing hand: 2/3/4-cost spells, 2/3-cost units, a 2-cost gear.)
 *
 * Rules: 429.2 / 429.3 (Reaction [Add] abilities finalize and resolve at once — no chain item, no
 * priority), 444.1 (paying = removing a resource from your pool; an earmarked resource may only be
 * removed to pay the kind of cost its printed restriction names), 166.2 (resources must be in the pool
 * to be spent), 167 / 317.2.d (all unspent pool content — earmarked or not — is lost at end of turn).
 *
 * Question: P1's Neutral Open turn. Pool = 0 energy + two fury. P1 activates Butcher (pays both power →
 * [2] unit-only) and Lux ([2] spell-only). energy() reads 4.
 *   (a) Which plays are enumerated? Can the two earmarks be pooled for the 4-cost spell / a 3-cost card?
 *       Is the gear playable?
 *   (b) After the 2-cost spell, is the 2-cost unit still enumerated (and vice-versa)?
 *   (c) With 1 extra ordinary energy (pool 5): 3-spell ✔, 3-unit ✔, 4-spell ✘, gear ✘; after the 3-cost
 *       spell only 2 unit-only remain → 2-unit ✔, 3-unit ✘, gear ✘.
 * Expected: the two [2]s never sum toward one card; gear is never payable from either; each play debits
 * only its own bucket (plus ordinary energy, never the other earmark); everything empties at end of turn.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const LUX = "ogs-014-024";
const BUTCHER = "ven-141-166";

const spell = (energyCost: number) =>
  ({
    abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
    cardType: "spell",
    domain: "fury",
    energyCost,
    name: `Bolt ${energyCost}`,
    rulesText: "Deal 1 to a unit.",
    timing: "action",
  }) as const;
const unit = (energyCost: number) => ({ cardType: "unit", domain: "fury", energyCost, might: energyCost, name: `Drop ${energyCost}` }) as const;
const GEAR2 = { cardType: "gear", domain: "fury", energyCost: 2, name: "Trinket" } as const;

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** P1: ready Lux + ready Butcher, 0|1 ordinary energy + fury×2, the six-card hand. P2: a 5-Might dummy (spell target). */
function board(ordinaryEnergy = 0) {
  return scenario()
    .resources(P1, { energy: ordinaryEnergy, power: { fury: 2 } })
    .legend(P1, BUTCHER, "butcher")
    .unit(P1, "base", LUX, "lux")
    .unit(P2, "base", { might: 5, name: "Dummy" }, "dummy")
    .hand(P1, spell(2), "spell2")
    .hand(P1, spell(3), "spell3")
    .hand(P1, spell(4), "spell4")
    .hand(P1, unit(2), "unit2")
    .hand(P1, unit(3), "unit3")
    .hand(P1, GEAR2, "gear2");
}

/** Both Adds used: Butcher first (pays fury×2), then Lux. */
async function bothAdds(game: Game): Promise<void> {
  await game.p1.activate("butcher");
  await game.p1.activate("lux");
}

function buckets(game: Game): { spell: number; unit: number } {
  const r = game.gameState.restrictedEnergy?.[P1] ?? {};
  return { spell: r.spell ?? 0, unit: r.unit ?? 0 };
}

/** Which of the six hand cards are currently enumerated as playable for P1. */
function playable(game: Game): Record<string, boolean> {
  return {
    gear2: game.p1.can("play", "gear2"),
    spell2: game.p1.can("cast", "spell2"),
    spell3: game.p1.can("cast", "spell3"),
    spell4: game.p1.can("cast", "spell4"),
    unit2: game.p1.can("play", "unit2"),
    unit3: game.p1.can("play", "unit3"),
  };
}

describe("Lux spell-only [2] × Butcher unit-only [2] — earmarks never combine", () => {
  // ── premise ───────────────────────────────────────────────────────────────────────────────────

  test("premise: with an empty energy pool nothing in the hand is playable; both Reaction Adds are listed in P1's Neutral Open state", async () => {
    const game = await board().build();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(Object.values(playable(game))).toEqual([false, false, false, false, false, false]);
    expect(game.p1.can("activate", "butcher")).toBe(true);
    expect(game.p1.can("activate", "lux")).toBe(true);
  });

  test("both activations resolve immediately with no chain item (429.2): Butcher eats both fury and exhausts, Lux exhausts; energy() reads 4 = 2 unit-only + 2 spell-only", async () => {
    const game = await board().build();
    await game.p1.activate("butcher");
    expect(game.chain()).toEqual([]);
    expect(game.p1.power()).toBe(0);
    expect(game.state("butcher").isExhausted).toBe(true);
    expect(game.p1.energy()).toBe(2);
    expect(buckets(game)).toEqual({ spell: 0, unit: 2 });
    await game.p1.activate("lux");
    expect(game.chain()).toEqual([]);
    expect(game.state("lux").isExhausted).toBe(true);
    expect(game.p1.energy()).toBe(4);
    expect(buckets(game)).toEqual({ spell: 2, unit: 2 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // ── (a) enumeration with 0 ordinary energy ────────────────────────────────────────────────────

  test("(a) exactly the 2-cost spell and the 2-cost unit are enumerated; 3-spell / 3-unit / 4-spell are NOT (the two [2]s cannot be pooled) and the gear is NOT (neither earmark pays for gear) — 444.1", async () => {
    const game = await board().build();
    await bothAdds(game);
    expect(playable(game)).toEqual({ gear2: false, spell2: true, spell3: false, spell4: false, unit2: true, unit3: false });
    const keys = game.p1.legal().map((o) => o.key);
    expect(keys).toContain("playUnit:unit2");
    expect(keys).not.toContain("playUnit:unit3");
    expect(keys.some((k) => k.endsWith(":gear2"))).toBe(false);
  });

  test("(a) forcing the 4-cost spell, the 3-cost unit or the gear is rejected and leaves the pool untouched", async () => {
    const game = await board().build();
    await bothAdds(game);
    await expect(game.p1.cast("spell4", { targets: "dummy" })).rejects.toThrow();
    await expect(game.p1.cast("spell3", { targets: "dummy" })).rejects.toThrow();
    await expect(game.p1.play("unit3")).rejects.toThrow();
    await expect(game.p1.play("gear2")).rejects.toThrow();
    expect(game.p1.energy()).toBe(4);
    expect(buckets(game)).toEqual({ spell: 2, unit: 2 });
    expect(game.p1.hand()).toHaveLength(6);
  });

  // ── (b) independence of the two buckets ───────────────────────────────────────────────────────

  test("(b) casting the 2-cost spell debits ONLY the spell-only [2] (energy 4→2, spell 2→0, unit still 2) and the 2-cost unit remains enumerated; playing it empties the pool", async () => {
    const game = await board().build();
    await bothAdds(game);
    await game.p1.cast("spell2", { targets: "dummy" });
    expect(game.p1.energy()).toBe(2);
    expect(buckets(game)).toEqual({ spell: 0, unit: 2 });
    await game.settle();
    expect(game.zoneOf("spell2")).toBe("trash");
    expect(game.state("dummy").damage).toBe(1);
    expect(game.p1.can("play", "unit2")).toBe(true);
    expect(game.p1.can("cast", "spell3")).toBe(false);
    await game.p1.play("unit2");
    expect(game.p1.energy()).toBe(0);
    expect(buckets(game)).toEqual({ spell: 0, unit: 0 });
    await game.settle();
    expect(game.zoneOf("unit2")).toBe("base");
  });

  test("(b) reversed order — unit first (debits only the unit-only [2]), the 2-cost spell stays enumerated; same end state: both played, pool empty", async () => {
    const game = await board().build();
    await bothAdds(game);
    await game.p1.play("unit2");
    expect(game.p1.energy()).toBe(2);
    expect(buckets(game)).toEqual({ spell: 2, unit: 0 });
    await game.settle();
    expect(game.zoneOf("unit2")).toBe("base");
    expect(game.p1.can("cast", "spell2")).toBe(true);
    expect(game.p1.can("play", "unit3")).toBe(false);
    expect(game.p1.can("play", "gear2")).toBe(false);
    await game.p1.cast("spell2", { targets: "dummy" });
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("spell2")).toBe("trash");
    expect(game.p1.resources().energy).toBe(0);
    expect(buckets(game)).toEqual({ spell: 0, unit: 0 });
  });

  // ── (c) with 1 ordinary energy ────────────────────────────────────────────────────────────────

  test("(c) pool 5 = 1 ordinary + 2 spell-only + 2 unit-only: 3-spell ✔, 3-unit ✔, 4-spell ✘ (max spell-eligible is 3), gear ✘ (only 1 gear-eligible)", async () => {
    const game = await board(1).build();
    await bothAdds(game);
    expect(game.p1.energy()).toBe(5);
    expect(buckets(game)).toEqual({ spell: 2, unit: 2 });
    expect(playable(game)).toEqual({ gear2: false, spell2: true, spell3: true, spell4: false, unit2: true, unit3: true });
    await expect(game.p1.cast("spell4", { targets: "dummy" })).rejects.toThrow();
    await expect(game.p1.play("gear2")).rejects.toThrow();
    expect(game.p1.energy()).toBe(5);
  });

  test("(c) casting the 3-cost spell consumes the spell earmark + the single ordinary energy (never the unit earmark): energy()==2, all unit-only → 2-unit ✔, 3-unit ✘, gear ✘, no spell castable", async () => {
    const game = await board(1).build();
    await bothAdds(game);
    await game.p1.cast("spell3", { targets: "dummy" });
    expect(game.p1.energy()).toBe(2);
    expect(buckets(game)).toEqual({ spell: 0, unit: 2 });
    await game.settle();
    expect(game.zoneOf("spell3")).toBe("trash");
    expect(playable(game)).toEqual({ gear2: false, spell2: false, spell3: false, spell4: false, unit2: true, unit3: false });
    await expect(game.p1.play("unit3")).rejects.toThrow();
    await game.p1.play("unit2");
    expect(game.p1.energy()).toBe(0);
  });

  test("(c) mirror: playing the 3-cost unit first consumes unit earmark + ordinary → 2 spell-only left: 2-spell ✔, 3-spell ✘, 2-unit ✘, gear ✘", async () => {
    const game = await board(1).build();
    await bothAdds(game);
    await game.p1.play("unit3");
    expect(game.p1.energy()).toBe(2);
    expect(buckets(game)).toEqual({ spell: 2, unit: 0 });
    await game.settle();
    expect(game.zoneOf("unit3")).toBe("base");
    expect(playable(game)).toEqual({ gear2: false, spell2: true, spell3: false, spell4: false, unit2: false, unit3: false });
  });

  // ── end of turn ───────────────────────────────────────────────────────────────────────────────

  test("unspent earmarked energy is lost at end of turn like any pool content (167 / 317.2.d): both buckets and energy() read 0 on P2's turn", async () => {
    const game = await board().build();
    await bothAdds(game);
    expect(game.p1.energy()).toBe(4);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.energy()).toBe(0);
    expect(buckets(game)).toEqual({ spell: 0, unit: 0 });
  });
});
