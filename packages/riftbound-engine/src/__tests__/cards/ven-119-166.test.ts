/**
 * Keeper of Law — ven-119-166 · Unit · Order · 5 energy + [order] · 5 Might
 *
 *   I cost [2][order] less if you control a battlefield with exactly two units there.
 *
 * Rules: 356.4 (discounts apply while determining Total Cost — the condition is read as the card is
 * played), 356.4.b/356.6 ("[2][order] less" removes 2 from the energy component AND one order pip
 * from the power component, neither below 0 → 3 energy + no power), 190.4 (you control a battlefield
 * while you have units there / after conquering it), 143.4 (units enter exhausted), a unit may be
 * played to your base or to a battlefield you control.
 *
 * Head-judge checklist for THIS card:
 *  1. "exactly two": one unit there → full price; two → 3 energy flat; three → full price again.
 *  2. "there" = at THAT battlefield: two units in your base plus an empty controlled battlefield is
 *     not the condition; two ENEMY units at a battlefield THEY control is not either.
 *  3. Any one qualifying battlefield suffices (bf1 with 1 unit, bf2 with 2 → discount).
 *  4. Both components drop: with the condition met it is playable on 3 energy and NO order power; with
 *     5 energy + order available only 3 energy are spent and the pip is kept.
 *  5. Playing Keeper TO the two-unit battlefield still gets the discount (cost is fixed before she
 *     arrives as the third unit).
 *  6. Baseline: 5+[order], 5 Might, enters exhausted; 4 energy or a missing pip → not playable.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "ven-119-166";

/** P1 controls bf1 with `n` vanilla units there. */
function withUnitsAtBf1(n: number, energy: number, order: number) {
  const b = scenario().resources(P1, { energy, power: { order } }).battlefield("bf1", { controller: P1 }).hand(P1, CARD, "kl");
  for (let i = 0; i < n; i++) {
    b.unit(P1, "bf1", { might: 1, name: `Recruit ${i + 1}` }, `r${i + 1}`);
  }
  return b;
}

describe("Keeper of Law (ven-119-166)", () => {
  test("registry payload should be a structured conditional self cost-reduction of 2 energy + 1 order (parser left raw ':rb_' glyph text)", async () => {
    // Expected: static { condition: <control a battlefield with exactly two units>, effect: cost-reduction self, energy 2 + power [order] }.
    // Actual: effect.reduction is the raw string ":rb_energy_2::rb_rune_order:" and the condition is an unparsed `scope` sentence.
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "order", energyCost: 5, might: 5, name: "Keeper of Law", powerCost: ["order"] });
    expect(def?.abilities).toHaveLength(1);
    const ability = def?.abilities?.[0] as Record<string, unknown>;
    expect(ability).toMatchObject({ effect: { target: "self", type: "cost-reduction" }, type: "static" });
    expect(JSON.stringify(ability)).not.toContain(":rb_");
    expect(ability.condition).toBeDefined();
  });

  test("baseline: costs 5 energy + 1 order, enters the base exhausted as a 5-Might unit", async () => {
    const game = await scenario().resources(P1, { energy: 5, power: { order: 1 } }).hand(P1, CARD, "kl").build();
    await game.p1.play("kl");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.settle();
    expect(game.state("kl")).toMatchObject({ baseMight: 5, isExhausted: true, might: 5, zone: "base" });
    expect(game.violations()).toEqual([]);
  });

  test("baseline negative: 4 energy + order, or 5 energy with a non-order pip → not playable", async () => {
    expect((await scenario().resources(P1, { energy: 4, power: { order: 1 } }).hand(P1, CARD, "kl").build()).p1.can("play", "kl")).toBe(false);
    expect((await scenario().resources(P1, { energy: 5, power: { fury: 1 } }).hand(P1, CARD, "kl").build()).p1.can("play", "kl")).toBe(false);
    expect((await scenario().resources(P1, { energy: 9 }).hand(P1, CARD, "kl").build()).p1.can("play", "kl")).toBe(false);
  });

  test("with exactly two units at a battlefield you control she costs 3 energy and NO order power (356.4)", async () => {
    // Expected: playable on 3 energy / 0 order, leaving 0/0. Actual: the discount is never applied — not playable.
    const game = await withUnitsAtBf1(2, 3, 0).build();
    expect(game.p1.can("play", "kl")).toBe(true);
    await game.p1.play("kl", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.settle();
    expect(game.zoneOf("kl")).toBe("base");
  });

  test("with the condition met and full resources available only 3 energy are spent and the order pip is kept", async () => {
    // Expected: 5/1 → 2/1. Actual: 0/0 (full price charged).
    const game = await withUnitsAtBf1(2, 5, 1).build();
    await game.p1.play("kl", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { order: 1 } });
  });

  test("playing her TO the two-unit battlefield still costs 3 — the cost is locked before she becomes the third unit there", async () => {
    // Expected: 3/0 is enough and she lands at bf1 (three units there afterwards). Actual: not playable at 3/0.
    const game = await withUnitsAtBf1(2, 3, 0).build();
    await game.p1.play("kl", { to: "bf1" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.settle();
    expect(game.p1.units("bf1").sort()).toEqual(["kl", "r1", "r2"]);
  });

  test("any ONE qualifying battlefield suffices — bf1 with one unit, bf2 with exactly two → discounted to 3", async () => {
    // Expected: playable at 3/0. Actual: not playable (no discount).
    const game = await withUnitsAtBf1(1, 3, 0)
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "bf2", { might: 2 }, "x1")
      .unit(P1, "bf2", { might: 2 }, "x2")
      .build();
    expect(game.p1.can("play", "kl")).toBe(true);
    await game.p1.play("kl", { to: "base" });
    expect(game.p1.energy()).toBe(0);
  });

  test("'exactly two' negative space: ONE unit there, or THREE units there → full 5+[order] (3 energy alone is not enough; 5+order is fully consumed)", async () => {
    for (const n of [1, 3]) {
      const cheap = await withUnitsAtBf1(n, 3, 0).build();
      expect(cheap.p1.can("play", "kl")).toBe(false);
      const full = await withUnitsAtBf1(n, 5, 1).build();
      await full.p1.play("kl", { to: "base" });
      expect(full.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    }
  });

  test("'there' negative space: two units in your BASE with an empty controlled battlefield, or two ENEMY units at a battlefield THEY control → no discount", async () => {
    const inBase = await scenario()
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "base", { might: 1 }, "a")
      .unit(P1, "base", { might: 1 }, "b")
      .hand(P1, CARD, "kl")
      .build();
    expect(inBase.p1.can("play", "kl")).toBe(false);
    const theirs = await scenario()
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 1 }, "e1")
      .unit(P2, "bf1", { might: 1 }, "e2")
      .hand(P1, CARD, "kl")
      .build();
    expect(theirs.p1.can("play", "kl")).toBe(false);
    const r = await theirs.p1.try((p) => p.play("kl"));
    expect(r.ok).toBe(false);
    expect(theirs.zoneOf("kl")).toBe("hand");
    expect(theirs.p1.energy()).toBe(3);
  });

  test("timing: a unit without [Action]/[Reaction] cannot be played on the opponent's turn even at full price", async () => {
    const game = await withUnitsAtBf1(2, 5, 1).active(P2).build();
    expect(game.p1.can("play", "kl")).toBe(false);
  });
});
