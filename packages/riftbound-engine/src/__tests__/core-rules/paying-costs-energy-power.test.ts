/**
 * Core rules — Resources II: determining and paying Energy / Power costs (card-independent).
 *
 * Rules covered:
 *   350.1        a card is only "Played" when the whole process completes (no on-play triggers on a failed attempt)
 *   354 / 354.1  card moves to the Chain first (Closes the state) → 355 choices (355.1.a optional additional cost)
 *   356          Determine Total Cost: 356.1.b ignore cost = base 0 (356.1.b.3 additional costs still owed);
 *                356.2 additional costs; 356.3 increases BEFORE 356.4 discounts; 356.4.e a discount's minimum
 *                binds only that discount; 356.4.f discounts may zero an additional cost; 356.6 floor at 0
 *   357          Pay: 357.1 combined Energy + Power; 357.1.a Reaction Add abilities usable inside the Pay step
 *   358.2/358.5  legality check "all costs were paid" — otherwise everything is undone (444.2.a)
 *   359.2        permanents leave the chain immediately (359.2.c units enter exhausted); 359.3.c spells linger
 *   163.1/163.2  Energy pays Energy, Power of the matching Domain pays a Domain pip; 163.2.b Universal Power
 *   135.2.e.5    [A] pip accepts any Domain (a) / [A] Power pays any pip (b);
 *   135.2.e.6    [C] on a multi-domain card = either of its Domains (c); on a no-domain card = [A] (b)
 *   444.1        Pay removes exactly the required resources; 166.3/167.1/317.2.d surplus stays until the pool empties
 *   444.2/444.2.b/205  an optional "you may pay" inside a resolving ability only skips the linked effect
 *   444.2.c / 429.3 / 204.4.b.1  Reaction Add abilities may be activated whenever a Pay is demanded
 *   204.4 / 204.4.c  Applied Costs on a Game Action (move) — can't/won't pay → the action is not performed
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { type Game, P1, P2, scenario } from "../../harness";

// ---------------------------------------------------------------------------
// Inline filler definitions
// ---------------------------------------------------------------------------

const DRAW_1_WHEN_PLAYED = [{ effect: { amount: 1, type: "draw" }, trigger: { event: "play-self" }, type: "triggered" }];

/** Filler unit; `powerCost` uses domain names, "rainbow" = an [A]/[C] pip. */
const fillerUnit = (energyCost: number, powerCost: readonly string[] = [], extra: Record<string, unknown> = {}) => ({
  abilities: [],
  cardType: "unit",
  domain: "fury",
  energyCost,
  keywords: [],
  might: 2,
  name: `Recruit ${energyCost}/${powerCost.join("+") || "-"} (test)`,
  powerCost: [...powerCost],
  ...extra,
});

/** Filler "draw 1" action spell. */
const fillerSpell = (energyCost: number, powerCost: readonly string[] = [], extra: Record<string, unknown> = {}) => ({
  abilities: [{ effect: { amount: 1, type: "draw" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "calm",
  energyCost,
  name: `Insight ${energyCost}/${powerCost.join("+") || "-"} (test)`,
  powerCost: [...powerCost],
  timing: "action",
  ...extra,
});

/** Passive cost modifier carried by a legend / unit: "<cardType>s you play cost <amount> less [to a minimum of N]". */
const discountAura = (cardType: "unit" | "spell", amount: number | { energy: number; power: string[] }, minimum?: number) => ({
  effect: { amount, ...(minimum !== undefined ? { minimum } : {}), target: { type: cardType }, type: "cost-reduction" },
  type: "static",
});

const legendWith = (name: string, abilities: unknown[], domain: string | string[] = "fury") => ({
  abilities,
  cardType: "legend",
  domain,
  name,
});

const KILL_REACTION = {
  abilities: [{ effect: { target: { type: "unit" }, type: "kill" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Snuff Out (test reaction)",
  timing: "reaction",
};

const ACCELERATE_UNIT = fillerUnit(2, [], {
  abilities: [{ cost: { energy: 1, power: ["fury"] }, keyword: "Accelerate", type: "keyword" }],
  keywords: ["Accelerate"],
  name: "Rearguard-alike (test)",
});

const decisionOf = (game: Game) => game.decision() as ActionDecision | null;

// ---------------------------------------------------------------------------
// 357 / 358 / 359 / 444 — paying exactly, underpaying, wrong resource
// ---------------------------------------------------------------------------

describe("Paying a card's cost (354–359, 444.1, 358.5)", () => {
  test("exact payment: 2 Energy + [Fury] unit is played to base exhausted, the pool is drained to exactly 0/0, its 'when you play me' trigger fires once, and no priority pass is needed for the permanent itself (357.1, 359.2, 359.2.c)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { fury: 1 } })
      .hand(P1, fillerUnit(2, ["fury"], { abilities: DRAW_1_WHEN_PLAYED }), "U")
      .build();
    const hand = game.p1.hand().length;
    const deck = game.p1.deck().length;
    await game.p1.play("U");
    // The permanent left the chain on finalize — it is already on the board before anyone passes.
    expect(game.zoneOf("U")).toBe("base");
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power("fury")).toBe(0);
    await game.settle();
    expect(game.zoneOf("U")).toBe("base");
    expect(game.state("U").isExhausted).toBe(true);
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power()).toBe(0);
    expect(game.chain()).toHaveLength(0);
    expect(decisionOf(game)?.context).toBe("main");
    expect(decisionOf(game)?.seat).toBe(P1);
    // Trigger fired exactly once: -1 (played) +1 (drew).
    expect(game.p1.hand()).toHaveLength(hand);
    expect(game.p1.deck()).toHaveLength(deck - 1);
    expect(game.violations()).toEqual([]);
  });

  test("underpaying Energy is refused and fully undone: card stays in hand, pool untouched, no chain item, no on-play trigger, opponent never gets priority (358.2, 358.5, 444.2.a, 350.1)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .hand(P1, fillerUnit(3, [], { abilities: DRAW_1_WHEN_PLAYED }), "U")
      .fillDecks({ main: 10, runes: 0 }) // no runes at all → no Add source
      .build();
    const hand = [...game.p1.hand()];
    expect(game.p1.runes()).toHaveLength(0);
    expect(game.p1.can("play", "U")).toBe(false);
    const viaMenu = await game.p1.try((p) => p.play("U"));
    expect(viaMenu.ok).toBe(false);
    const raw = await game.p1.try((p) => p.do("playUnit", { cardId: "U", location: "base", playerId: P1 }));
    expect(raw.ok).toBe(false);
    expect(game.zoneOf("U")).toBe("hand");
    expect(game.p1.hand()).toEqual(hand);
    expect(game.p1.energy()).toBe(2);
    expect(game.chain()).toHaveLength(0);
    expect(decisionOf(game)?.context).toBe("main");
    expect(decisionOf(game)?.seat).toBe(P1);
    expect(game.p2.legal().some((o) => o.verb === "passPriority")).toBe(false);
  });

  test("Energy never pays a Power pip and off-domain Power never pays a Domain pip; with the matching Power it succeeds and only that Power is consumed (163.1, 163.2, 135.2.e.4)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5, power: { fury: 1 } })
      .hand(P1, fillerSpell(1, ["calm"]), "S")
      .fillDecks({ main: 10, runes: 0 })
      .build();
    expect(game.p1.can("cast", "S")).toBe(false);
    expect((await game.p1.try((p) => p.cast("S"))).ok).toBe(false);
    expect(game.zoneOf("S")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 5, power: { fury: 1 } });
    expect(game.chain()).toHaveLength(0);
    // Inject one Calm power → now payable; Fury is not touched.
    await game.p1.do("addResources", { playerId: P1, power: { calm: 1 } });
    expect(game.p1.can("cast", "S")).toBe(true);
    await game.p1.cast("S");
    await game.settle();
    expect(game.zoneOf("S")).toBe("trash");
    expect(game.p1.energy()).toBe(4);
    expect(game.p1.power("fury")).toBe(1);
    expect(game.p1.power("calm")).toBe(0);
  });

  test("surplus is retained, not consumed: paying 2 from a 4-Energy/1-Fury pool leaves exactly 2/1, spendable later this turn; leftovers vanish only when the pool empties at end of turn (444.1, 166.3, 167.1, 317.2.d)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { fury: 1 } })
      .hand(P1, fillerUnit(2), "A")
      .hand(P1, fillerUnit(2), "B")
      .build();
    // No "how much do you want to pay" prompt for a fixed cost.
    expect(game.p1.option("play", "A")?.fields.some((f) => f.kind === "int")).toBe(false);
    await game.p1.play("A");
    expect(game.p1.energy()).toBe(2);
    expect(game.p1.power("fury")).toBe(1);
    await game.settle();
    await game.p1.play("B");
    await game.settle();
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power("fury")).toBe(1);
    expect(game.zoneOf("A")).toBe("base");
    expect(game.zoneOf("B")).toBe("base");
    await game.advanceTurn();
    expect(game.p1.power("fury")).toBe(0);
    expect(game.p1.energy()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 163.2.b / 135.2.e.5–6 — Universal power, [A] pips, [C] pips
// ---------------------------------------------------------------------------

describe("Which Power can pay which pip (163.2, 163.2.b, 135.2.e.5, 135.2.e.6)", () => {
  test("Universal [A] Power in the pool pays an off-identity Domain pip — playability is 'can the cost be paid now', not Domain Identity (163.2.b, 135.2.e.5.b, 358.2)", async () => {
    const build = () =>
      scenario()
        .legend(P1, legendWith("Fury/Chaos identity (test legend)", [], ["fury", "chaos"]))
        .resources(P1, { energy: 1, power: { chaos: 1, fury: 1 } })
        .hand(P1, fillerUnit(1, ["mind"], { domain: "mind", name: "Borrowed Mind unit (test)" }), "M")
        .fillDecks({ main: 10, runes: 0 });
    // Sub-case A: only Fury/Chaos power → refused, nothing changes.
    const a = await build().build();
    expect(a.p1.can("play", "M")).toBe(false);
    expect((await a.p1.try((p) => p.play("M"))).ok).toBe(false);
    expect(a.zoneOf("M")).toBe("hand");
    expect(a.p1.resources()).toEqual({ energy: 1, power: { chaos: 1, fury: 1 } });
    // Sub-case B: + one Universal power → succeeds; the universal power (only) is spent alongside the energy.
    const b = await build().resources(P1, { power: { rainbow: 1 } }).build();
    expect(b.p1.can("play", "M")).toBe(true);
    await b.p1.play("M");
    await b.settle();
    expect(b.zoneOf("M")).toBe("base");
    expect(b.p1.energy()).toBe(0);
    expect(b.p1.power("rainbow")).toBe(0);
    expect(b.p1.power("fury")).toBe(1);
    expect(b.p1.power("chaos")).toBe(1);
    expect(b.p1.power("mind")).toBe(0);
  });

  test("an [A] pip in a cost accepts Power of any Domain or Universal Power, but never Energy (135.2.e.5.a, 163.1)", async () => {
    const A1 = fillerSpell(1, ["rainbow"], { domain: "calm", name: "Any-pip spell (test)" });
    const withOrder = await scenario().resources(P1, { energy: 1, power: { order: 1 } }).hand(P1, A1, "a1").build();
    expect(withOrder.p1.can("cast", "a1")).toBe(true);
    await withOrder.p1.cast("a1");
    await withOrder.settle();
    expect(withOrder.zoneOf("a1")).toBe("trash");
    expect(withOrder.p1.energy()).toBe(0);
    expect(withOrder.p1.power()).toBe(0);

    const withUniversal = await scenario().resources(P1, { energy: 1, power: { rainbow: 1 } }).hand(P1, A1, "a1").build();
    expect(withUniversal.p1.can("cast", "a1")).toBe(true);
    await withUniversal.p1.cast("a1");
    await withUniversal.settle();
    expect(withUniversal.zoneOf("a1")).toBe("trash");
    expect(withUniversal.p1.power()).toBe(0);

    const energyOnly = await scenario().resources(P1, { energy: 2 }).hand(P1, A1, "a1").fillDecks({ main: 10, runes: 0 }).build();
    expect(energyOnly.p1.can("cast", "a1")).toBe(false);
    expect((await energyOnly.p1.try((p) => p.cast("a1"))).ok).toBe(false);
    expect(energyOnly.p1.energy()).toBe(2);
    expect(energyOnly.zoneOf("a1")).toBe("hand");
  });

  test("a [C] pip on a Calm+Chaos card is payable with Calm or Chaos only; a [C] pip on a card with no Domain behaves as [A] (135.2.e.6.b–c)", async () => {
    const D = fillerSpell(1, ["rainbow"], { domain: ["calm", "chaos"], name: "Two-domain [1][C] spell (test)" });
    for (const [power, playable] of [
      [{ chaos: 1 }, true],
      [{ calm: 1 }, true],
      [{ fury: 1 }, false],
    ] as const) {
      const g = await scenario().resources(P1, { energy: 1, power }).hand(P1, D, "d").fillDecks({ main: 10, runes: 0 }).build();
      expect(g.p1.can("cast", "d")).toBe(playable);
      if (playable) {
        await g.p1.cast("d");
        await g.settle();
        expect(g.zoneOf("d")).toBe("trash");
        expect(g.p1.energy()).toBe(0);
        expect(g.p1.power()).toBe(0);
      } else {
        expect((await g.p1.try((p) => p.cast("d"))).ok).toBe(false);
        expect(g.zoneOf("d")).toBe("hand");
        expect(g.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } });
      }
    }
    const noDomain = fillerSpell(1, ["rainbow"], { domain: undefined, name: "Domainless [1][C] spell (test)" });
    const g = await scenario().resources(P1, { energy: 1, power: { fury: 1 } }).hand(P1, noDomain, "nd").build();
    expect(g.state("nd").domains).toEqual([]);
    expect(g.p1.can("cast", "nd")).toBe(true);
    await g.p1.cast("nd");
    await g.settle();
    expect(g.zoneOf("nd")).toBe("trash");
    expect(g.p1.power("fury")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 357.1.a / 429.3 — Reaction Add inside the Pay step
// ---------------------------------------------------------------------------

describe("Add reactions during the Pay step (354.1, 357.1.a, 429.3, 444.2.c, 359.3.c)", () => {
  test("tap, tap, play with an empty pool: both runes exhausted, pool back to 0, the spell is the ONLY chain item (rune Adds never use the chain), and the opponent gets priority only after the spell is finalized", async () => {
    const game = await scenario().runes(P1, "fury", 2).hand(P1, fillerSpell(2), "S").fillDecks({ main: 10, runes: 0 }).build();
    await game.p1.tapRune();
    expect(game.chain()).toHaveLength(0); // Add resolved immediately, no chain
    expect(game.p2.legal().some((o) => o.verb === "passPriority")).toBe(false);
    await game.p1.tapRune();
    expect(game.p1.energy()).toBe(2);
    await game.p1.cast("S");
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.runes({ ready: true })).toHaveLength(0);
    expect(game.chain()).toHaveLength(1);
    expect(game.chain()[0]?.cardId).toBe("S");
    // Now (and only now) a priority window exists; P1 first, then P2.
    expect(decisionOf(game)?.context).toBe("chain");
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(decisionOf(game)?.context).toBe("chain");
    await game.p2.passPriority();
    await game.settle();
    expect(game.zoneOf("S")).toBe("trash");
    expect(game.chain()).toHaveLength(0);
  });

  // Expected (357.1.a / 429.3): with an empty pool but two READY runes the play is legal — the card goes to the
  // chain first (354) and the runes' [Reaction] Add abilities may be activated inside step 4 (Pay). Actual: the
  // engine only offers a play when the pool ALREADY holds the full cost (runes must be pre-floated).
  test.failing("BUG: 357.1.a — a spell is not offered as playable when the pool is empty even though ready runes could be tapped during the Pay step", async () => {
    const game = await scenario().runes(P1, "fury", 2).hand(P1, fillerSpell(2), "S").fillDecks({ main: 10, runes: 0 }).build();
    expect(game.p1.runes({ ready: true })).toHaveLength(2);
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.can("cast", "S")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 356 — Determine Total Cost: increases, discounts, floors, minimums
// ---------------------------------------------------------------------------

describe("Determine Total Cost (356.3, 356.4, 356.4.e, 356.6, 356.1.c)", () => {
  test("an Energy discount larger than the cost floors at 0 — the play is free but nothing is refunded, and the printed cost is unchanged (356.4, 356.6, 356.1.c)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .legend(P1, legendWith("Quartermaster −3 (test legend)", [discountAura("unit", 3)]))
      .hand(P1, fillerUnit(2), "U")
      .build();
    expect(game.state("U").energyCost).toBe(2); // printed / base cost still reads 2
    expect(game.p1.can("play", "U")).toBe(true);
    await game.p1.play("U");
    await game.settle();
    expect(game.zoneOf("U")).toBe("base");
    expect(game.p1.energy()).toBe(1); // not 0 (no charge) and not 2 (no negative-cost credit)
    expect(game.state("U").energyCost).toBe(2);
  });

  test("a Power discount ('units you play cost [A] less') removes a pip but floors at 0 pips and never mints Power (356.6, 356.4.b)", async () => {
    const legend = legendWith("Armorer −[A] (test legend)", [discountAura("unit", { energy: 0, power: ["rainbow"] })]);
    // Case 1: 2E + [Fury] with no Fury power → the pip is waived, 2 energy paid.
    const one = await scenario().resources(P1, { energy: 2 }).legend(P1, legend).hand(P1, fillerUnit(2, ["fury"]), "F").fillDecks({ main: 10, runes: 0 }).build();
    expect(one.p1.can("play", "F")).toBe(true);
    await one.p1.play("F");
    await one.settle();
    expect(one.zoneOf("F")).toBe("base");
    expect(one.p1.energy()).toBe(0);
    expect(one.p1.power()).toBe(0);
    // Case 2: a pip-less 2E unit — power cost stays 0 (not −1), no power credited afterwards.
    const two = await scenario().resources(P1, { energy: 2 }).legend(P1, legend).hand(P1, fillerUnit(2), "N").fillDecks({ main: 10, runes: 0 }).build();
    await two.p1.play("N");
    await two.settle();
    expect(two.zoneOf("N")).toBe("base");
    expect(two.p1.energy()).toBe(0);
    expect(Object.values(two.p1.resources().power).every((v) => v === 0)).toBe(true);
    expect(two.p1.power()).toBe(0);
  });

  test("increases apply before discounts, so the floor is taken last: base 1, +1 increase, −3 discount = 0 → playable with an empty pool; without the discount the same taxed spell costs 2 (356.3 → 356.4 → 356.6)", async () => {
    const discountLegend = legendWith("Archivist −3 spells (test legend)", [discountAura("spell", 3)]);
    // `costModifier: +1` is the engine's applied "this costs [1] more" increase on the card.
    const taxed = { costModifier: 1 } as never;
    const game = await scenario().legend(P1, discountLegend).hand(P1, fillerSpell(1), "S", taxed).fillDecks({ main: 10, runes: 0 }).build();
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.can("cast", "S")).toBe(true); // (1+1)−3 → 0, NOT (1−3→0)+1 = 1
    await game.p1.cast("S");
    await game.settle();
    expect(game.zoneOf("S")).toBe("trash");
    expect(game.p1.energy()).toBe(0);

    // Negative control: no discount → total 2; empty pool → refused and untouched…
    const noDiscount = await scenario().hand(P1, fillerSpell(1), "S", taxed).fillDecks({ main: 10, runes: 0 }).build();
    expect(noDiscount.p1.can("cast", "S")).toBe(false);
    expect((await noDiscount.p1.try((p) => p.cast("S"))).ok).toBe(false);
    expect(noDiscount.zoneOf("S")).toBe("hand");
    // …and with exactly 2 energy it is paid in full.
    const payTwo = await scenario().resources(P1, { energy: 2 }).hand(P1, fillerSpell(1), "S", taxed).build();
    await payTwo.p1.cast("S");
    expect(payTwo.p1.energy()).toBe(0);
  });

  test("a discount's own 'to a minimum of 1' stops only that discount: alone it cannot take a 1-cost spell below 1 (356.4.e)", async () => {
    const apprentice = fillerUnit(1, [], { abilities: [discountAura("spell", 1, 1)], domain: "calm", might: 1, name: "Apprentice-alike (test)" });
    const empty = await scenario().unit(P1, "base", apprentice, "EA").hand(P1, fillerSpell(1), "one").fillDecks({ main: 10, runes: 0 }).build();
    expect(empty.p1.can("cast", "one")).toBe(false); // still costs 1
    const one = await scenario().resources(P1, { energy: 1 }).unit(P1, "base", apprentice, "EA").hand(P1, fillerSpell(1), "one").build();
    await one.p1.cast("one");
    expect(one.p1.energy()).toBe(0); // paid exactly 1
    // With a 3-cost spell the discount does apply: 3 → 2.
    const three = await scenario().resources(P1, { energy: 2 }).unit(P1, "base", apprentice, "EA").hand(P1, fillerSpell(3), "s3").build();
    expect(three.p1.can("cast", "s3")).toBe(true);
    await three.p1.cast("s3");
    expect(three.p1.energy()).toBe(0);
  });

  test("cross-check (356.4.e example shape): 'minimum 1' aura + the spell's own 'reduced by your highest Might' discount can be ordered aura-first to reach 0", async () => {
    const apprentice = fillerUnit(1, [], { abilities: [discountAura("spell", 1, 1)], domain: "calm", might: 1, name: "Apprentice-alike (test)" });
    const splitter = fillerSpell(8, [], {
      abilities: [
        { effect: { amount: 1, type: "draw" }, timing: "action", type: "spell" },
        { effect: { by: "the highest Might among units you control", target: "self", type: "cost-reduction" }, type: "static" },
      ],
      name: "Splitter-alike 8 (test)",
    });
    const game = await scenario()
      .unit(P1, "base", apprentice, "EA")
      .unit(P1, "base", { might: 7 }, "giant")
      .hand(P1, splitter, "X")
      .fillDecks({ main: 10, runes: 0 })
      .build();
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.can("cast", "X")).toBe(true); // 8 −1 (aura, min 1 → 7) −7 (own) = 0
    await game.p1.cast("X");
    await game.settle();
    expect(game.zoneOf("X")).toBe("trash");
    expect(game.p1.energy()).toBe(0);
  });

  // Expected (356.4.e): the "to a minimum of 1" belongs to the Apprentice-style discount only. With a second,
  // unfloored −7 aura the player orders the floored discount first (8→7) and then −7 → total 0, playable from an
  // empty pool. Actual: the engine clamps the FINAL total to the largest minimum among all board auras, so the
  // spell costs 1 and is refused.
  test.failing("BUG: 356.4.e — a 'to a minimum of N' on one board discount is applied to the combined total of all board discounts", async () => {
    const apprentice = fillerUnit(1, [], { abilities: [discountAura("spell", 1, 1)], domain: "calm", might: 1, name: "Apprentice-alike (test)" });
    const bigDiscount = legendWith("Grand Archivist −7 spells (test legend)", [discountAura("spell", 7)], "calm");
    const game = await scenario()
      .unit(P1, "base", apprentice, "EA")
      .legend(P1, bigDiscount)
      .hand(P1, fillerSpell(8), "X")
      .fillDecks({ main: 10, runes: 0 })
      .build();
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.can("cast", "X")).toBe(true);
    await game.p1.cast("X");
    await game.settle();
    expect(game.zoneOf("X")).toBe("trash");
    expect(game.p1.energy()).toBe(0);
  });

  test("total cost is locked when paid: if the discount source dies in response, no extra payment is demanded and the spell still resolves (356/357 happen once, at finalization; 359.3.c)", async () => {
    const auraUnit = fillerUnit(1, [], { abilities: [discountAura("spell", 1)], domain: "calm", might: 1, name: "Scribe −1 spells (test)" });
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .unit(P1, "base", auraUnit, "scribe")
      .hand(P1, fillerSpell(2), "S")
      .hand(P2, KILL_REACTION, "snuff")
      .build();
    const hand = game.p1.hand().length;
    await game.p1.cast("S");
    expect(game.p1.energy()).toBe(2); // paid 1 (2 − 1)
    expect(game.chain().map((c) => c.cardId)).toEqual(["S"]);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    await game.p2.cast("snuff", { targets: "scribe" });
    await game.settle(); // LIFO: snuff kills the scribe, then S resolves
    expect(game.zoneOf("scribe")).toBe("trash");
    expect(game.zoneOf("S")).toBe("trash"); // resolved, not undone
    expect(game.p1.hand()).toHaveLength(hand - 1 + 1); // S left hand, drew 1
    expect(game.p1.energy()).toBe(2); // no retroactive surcharge, no refund games
  });
});

// ---------------------------------------------------------------------------
// 356.1.b / 355.1.a — ignoring cost vs. optional additional costs (Accelerate)
// ---------------------------------------------------------------------------

describe("'Ignoring its cost' zeroes the base cost only; a chosen optional additional cost must still be paid (356.1.b, 356.1.b.3, 355.1.a)", () => {
  /** Unit whose attack trigger plays a unit from hand HERE ignoring its cost (Ava-style shape, no printed card). */
  const SUMMONER = fillerUnit(2, [], {
    abilities: [
      {
        effect: { from: "hand", ignoreCost: true, target: { controller: "friendly", type: "card" }, toLocation: "here", type: "play" },
        trigger: { event: "attack", on: "self" },
        type: "triggered",
      },
    ],
    might: 4,
    name: "Summoner (test)",
  });

  test("baseline: Accelerate played normally from hand costs base 2 + optional 1E+[Fury] and the unit enters READY (355.1.a, 356.2.b.1)", async () => {
    const game = await scenario().resources(P1, { energy: 3, power: { fury: 1 } }).hand(P1, ACCELERATE_UNIT, "L").build();
    const opt = game.p1.option("play", "L");
    expect(opt?.fields.some((f) => f.arg === "payOptional")).toBe(true); // the choice is surfaced at play time
    await game.p1.play("L", { accelerate: true });
    await game.settle();
    expect(game.zoneOf("L")).toBe("base");
    expect(game.state("L").isReady).toBe(true);
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power("fury")).toBe(0);
    // Declining: base 2 only, enters exhausted, the 1E+[Fury] stay in the pool.
    const decline = await scenario().resources(P1, { energy: 3, power: { fury: 1 } }).hand(P1, ACCELERATE_UNIT, "L").build();
    await decline.p1.play("L", { accelerate: false });
    await decline.settle();
    expect(decline.state("L").isExhausted).toBe(true);
    expect(decline.p1.energy()).toBe(1);
    expect(decline.p1.power("fury")).toBe(1);
  });

  test("case A — played via an effect 'ignoring its cost' without electing Accelerate: the base 2 is NOT charged, the unit enters exhausted, the pool is untouched (356.1.b.1)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { fury: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 1 }, "sentry")
      .unit(P1, "base", SUMMONER, "summoner")
      .hand(P1, ACCELERATE_UNIT, "L")
      .build();
    await game.p1.move("summoner", "bf1");
    // The attack trigger is on the chain; P1 then P2 may respond.
    expect(decisionOf(game)?.context).toBe("chain");
    expect(decisionOf(game)?.seat).toBe(P1);
    await game.settle();
    expect(game.zoneOf("L")).toBe("battlefield-bf1");
    expect(game.state("L").isExhausted).toBe(true);
    expect(game.p1.energy()).toBe(1);
    expect(game.p1.power("fury")).toBe(1);
  });

  // Expected (355.1.a + 356.1.b.3, Legion Rearguard example): even when the base cost is ignored the player may
  // still CHOOSE the optional Accelerate cost; it is added to the total (1E + [Fury]) and must be paid, and the
  // unit then enters ready. Actual: when a unit is played by an effect the engine never offers the optional
  // additional cost (it hard-codes "not paid"), so the unit always enters exhausted and the pool is untouched.
  test.failing("BUG: 355.1.a/356.1.b.3 — a unit played 'ignoring its cost' by an effect is never offered its optional Accelerate cost", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { fury: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 1 }, "sentry")
      .unit(P1, "base", SUMMONER, "summoner")
      .hand(P1, ACCELERATE_UNIT, "L")
      .script(P1, ["yes", true]) // elect + pay the optional cost however it is asked
      .build();
    await game.p1.move("summoner", "bf1");
    await game.settle({ policy: "first" });
    expect(game.zoneOf("L")).toBe("battlefield-bf1");
    expect(game.state("L").isReady).toBe(true);
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power("fury")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 204.4 — Applied costs on a move
// ---------------------------------------------------------------------------

describe("Applied Cost on a Standard Move (204.4, 204.4.b, 204.4.c, 429.3)", () => {
  /** Enemy unit imposing the engine's applied move cost: each unit you move beyond the first this turn costs [1]. */
  const INVESTIGATOR = fillerUnit(2, [], { domain: "order", might: 6, moveEscalation: true, name: "Investigator-alike (test)" });
  const build = () =>
    scenario()
      .battlefield("bfA", { controller: null })
      .battlefield("bfB", { controller: P2 })
      .unit(P2, "bfB", INVESTIGATOR, "mi")
      .unit(P1, "base", { might: 2 }, "U")
      .unit(P1, "base", { might: 2 }, "W")
      .fillDecks({ main: 10, runes: 0 });

  test("case A — with 1 Energy floating the taxed move is performed: 1 is paid as the move happens (no chain, no response window), the unit arrives exhausted", async () => {
    const game = await build().resources(P1, { energy: 1 }).build();
    await game.p1.move("W", "bfA"); // first move this turn: free
    await game.settle();
    expect(game.p1.energy()).toBe(1);
    expect(game.p1.legal().some((o) => o.key === "standardMove:to:bfB")).toBe(true);
    await game.p1.move("U", "bfB");
    expect(game.p1.energy()).toBe(0);
    expect(game.locationOf("U")).toBe("bfB");
    expect(game.state("U").isExhausted).toBe(true);
    expect(game.chain()).toHaveLength(0); // the payment did not use the chain
    // What follows is the normal combat showdown at bfB, attacker (P1) with Focus first.
    expect(decisionOf(game)?.context).toBe("showdown");
    expect(decisionOf(game)?.seat).toBe(P1);
  });

  test("case B — with no Energy and no rune the taxed move cannot be performed at all: the unit stays READY in base and nothing is staged at the battlefield (204.4.c)", async () => {
    const game = await build().build();
    await game.p1.move("W", "bfA");
    await game.settle();
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.legal().some((o) => o.key === "standardMove:to:bfB")).toBe(false);
    const r = await game.p1.try((p) => p.move("U", "bfB"));
    expect(r.ok).toBe(false);
    expect(game.locationOf("U")).toBe("base");
    expect(game.state("U").isReady).toBe(true); // exhaust-to-move was not spent on an impossible action
    expect(game.gameState.battlefields.bfB?.contested).toBe(false);
    expect(game.gameState.battlefields.bfB?.controller).toBe(P2);
    expect(decisionOf(game)?.context).toBe("main");
  });

  test("case A′ — a READY rune tapped first (Reaction Add) pays the applied cost with an identical end state: rune exhausted, pool 0, unit at the battlefield", async () => {
    const game = await build().rune(P1, "fury", { alias: "R" }).build();
    await game.p1.move("W", "bfA");
    await game.settle();
    await game.p1.tapRune("R");
    await game.p1.move("U", "bfB");
    expect(game.state("R").isExhausted).toBe(true);
    expect(game.p1.energy()).toBe(0);
    expect(game.locationOf("U")).toBe("bfB");
    expect(game.chain()).toHaveLength(0);
  });

  // Expected (204.4.b.1 / 429.3, whose example IS this situation): with an empty pool but a ready rune the move
  // is a legal action — the Add [Reaction] may be activated at the moment the applied cost is demanded, with no
  // priority window. Actual: the engine only lists the move when the pool already covers the surcharge.
  test.failing("BUG: 204.4.b.1/429.3 — a taxed move is not offered when the pool is empty even though a ready rune could pay the applied cost during the move", async () => {
    const game = await build().rune(P1, "fury", { alias: "R" }).build();
    await game.p1.move("W", "bfA");
    await game.settle();
    expect(game.state("R").isReady).toBe(true);
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.legal().some((o) => o.key === "standardMove:to:bfB")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 444.2 / 205 — optional Pay inside a resolving ability
// ---------------------------------------------------------------------------

describe("'You may pay [1]. If you do, …' inside a resolving trigger is skippable — unlike a play cost (444.2, 444.2.b, 205, 203.3)", () => {
  const PAYER = fillerUnit(1, [], {
    abilities: [
      {
        condition: { cost: { energy: 1 }, type: "pay-cost" },
        effect: { amount: 1, type: "draw" },
        optional: true,
        trigger: { event: "attack", on: "self" },
        type: "triggered",
      },
    ],
    might: 3,
    name: "Toll Raider (test)",
  });
  const build = () =>
    scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 1 }, "sentry")
      .unit(P1, "base", PAYER, "raider")
      .fillDecks({ main: 10, runes: 0 });

  test("case 1 — cannot pay (empty pool, no runes): the trigger still goes on the chain and resolves, the draw is simply skipped, nothing is undone and combat proceeds", async () => {
    const game = await build().build();
    const hand = game.p1.hand().length;
    await game.p1.move("raider", "bf1");
    expect(game.chain()).toHaveLength(1); // the attack trigger is a real chain item
    expect(decisionOf(game)?.context).toBe("chain");
    const s = await game.settle();
    if (s.reason === "unanswered") {
      // The engine may still ask; the only legal answer is "no".
      expect(game.decision()?.kind).toBe("yes-no");
      expect(game.decision()?.seat).toBe(P1);
      expect((await game.p1.try((p) => p.yes())).ok).toBe(false);
      await game.p1.no();
      await game.settle();
    }
    expect(game.p1.hand()).toHaveLength(hand);
    expect(game.p1.energy()).toBe(0);
    // Not undone: the raider attacked, combat resolved (3 vs 1) and it conquered bf1.
    expect(game.locationOf("raider")).toBe("bf1");
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("case 3 — can pay but CHOOSES not to: a yes/no decision is surfaced to P1; answering no keeps the 1 Energy and draws nothing", async () => {
    const game = await build().resources(P1, { energy: 1 }).build();
    const hand = game.p1.hand().length;
    await game.p1.move("raider", "bf1");
    const s = await game.settle();
    expect(s.reason).toBe("unanswered");
    expect(game.decision()?.kind).toBe("yes-no");
    expect(game.decision()?.seat).toBe(P1);
    await game.p1.no();
    await game.settle();
    expect(game.p1.energy()).toBe(1);
    expect(game.p1.hand()).toHaveLength(hand);
    expect(game.locationOf("raider")).toBe("bf1");
  });

  test("case 3′ — answering yes pays exactly 1 and draws exactly 1", async () => {
    const game = await build().resources(P1, { energy: 2 }).build();
    const hand = game.p1.hand().length;
    await game.p1.move("raider", "bf1");
    await game.settle();
    expect(game.decision()?.kind).toBe("yes-no");
    await game.p1.yes();
    await game.settle();
    expect(game.p1.energy()).toBe(1);
    expect(game.p1.hand()).toHaveLength(hand + 1);
  });

  // Expected (444.2.c / 429.3): when the resolving ability instructs P1 to pay [1], P1 may activate a rune's
  // [Reaction] Add at that moment — so with an empty pool but one READY rune "yes" must be a legal answer
  // (rune exhausted, 1 paid, 1 drawn). Actual: the engine only offers "yes" when the pool already holds the
  // energy; with just a ready rune the only legal resolution is "no" and no rune may be tapped meanwhile.
  test.failing("BUG: 444.2.c — cannot tap a ready rune to pay an optional 'you may pay [1]' while the ability resolves; only 'decline' is offered", async () => {
    const game = await build().rune(P1, "fury", { alias: "R" }).build();
    const hand = game.p1.hand().length;
    await game.p1.move("raider", "bf1");
    await game.settle();
    expect(game.decision()?.kind).toBe("yes-no");
    expect(game.decision()?.seat).toBe(P1);
    if (game.p1.can("tapRune", "R")) {
      await game.p1.tapRune("R");
    }
    await game.p1.yes();
    await game.settle();
    expect(game.state("R").isExhausted).toBe(true);
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.hand()).toHaveLength(hand + 1);
  });
});
