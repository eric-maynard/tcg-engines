/**
 * Core rules — a card you could pay for after ONE Reaction [Add] is OFFERED,
 * not hidden (rules 357.1.a / 429.3 / 164.2.a / 164.2.b / 594; DESIGN.md
 * §Paying costs).
 *
 * The reported shape: Turn 1 Main, 1 Energy pooled and a ready rune on board,
 * and every 2-cost card in hand sits inert — the player has to already know to
 * tap first, because nothing in the game says the card is one tap away. 357.1.a
 * lets the payer crack Reaction [Add] abilities during Pay Costs, so the play
 * must be LISTED with what it still owes.
 *
 * What that must NOT become is auto-payment. Paying stays the player's own act
 * (DESIGN.md): the move's `condition` prices the pool AS IT STANDS, so an
 * attempt made before the Add is refused and the reducer can never under-charge.
 *
 * Rules covered (riftbound-rules ids):
 *   357.1.a          Reaction [Add] abilities are usable during Pay Costs
 *   164.2.a          tapping a rune adds ENERGY
 *   164.2.b / 594    recycling adds POWER of that rune's Domain; readiness is no condition
 *   429.3.a          a Gold-style "[Exhaust]: [Add]" is an Add in the same window
 *   404.2            a cost NOTHING can fund is still not offered
 *   167.1 / 316.3    the pool is EMPTY at the start of every Main Phase — the
 *                    moment the player looks at their hand, so 0 pooled Energy
 *                    is the common case, not an edge case
 *   809.1.d          a [Deflect] instalment is part of what the play costs, so a
 *                    spell whose ONLY legal target is surcharged is reachable too
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario, surchargedPlayTargetsOf } from "../../harness";
import type { ActionDecision } from "../../harness";

/** Unit · 2 Energy, no Power. */
const TWO_COST_UNIT = { cardType: "unit", domain: "chaos", energyCost: 2, might: 2, name: "Filler Two Cost" };
/** Gear · 0 Energy + [chaos]. */
const CHAOS_GEAR = { cardType: "gear", domain: "chaos", energyCost: 0, name: "Filler Chaos Gear", powerCost: ["chaos"] };
/** Unit · 3 Energy + [fury]. */
const THREE_PLUS_FURY = { cardType: "unit", domain: "fury", energyCost: 3, might: 3, name: "Filler Three Fury", powerCost: ["fury"] };
/** Unit · 99 Energy — beyond anything ten runes could ever add. */
const UNFUNDABLE_UNIT = { cardType: "unit", domain: "fury", energyCost: 99, might: 9, name: "Filler Unfundable" };
/** Spell · 1 Energy · "Deal 2 to a unit." */
const BOLT = {
  abilities: [{ effect: { amount: 2, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Filler Bolt",
  timing: "action",
};
/** Enemy unit with [Deflect] 1 — choosing it costs an extra [rainbow] (809.1.c). */
const DEFLECTOR = {
  abilities: [{ keyword: "Deflect", type: "keyword", value: 1 }],
  cardType: "unit",
  domain: "calm",
  energyCost: 0,
  keywords: ["Deflect"],
  might: 2,
  name: "Filler Deflector",
};

const reach = (game: { decision: () => unknown }) =>
  ((game.decision() as ActionDecision | null)?.reachablePlays ?? []) as {
    card: string;
    moveId: string;
    needsAdd: { energy?: number; power?: Record<string, number>; reason: string };
  }[];

const entry = (game: { decision: () => unknown }, card: string) => reach(game).find((r) => r.card === card);

describe("357.1.a — a play one Reaction [Add] away is offered with its pay line", () => {
  test("1 Energy pooled + one READY rune: the 2-cost unit is listed as one tap short (164.2.a), and playing it before the tap is refused", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .rune(P1, "chaos", { alias: "r1" })
      .rune(P1, "chaos", { alias: "r2", exhausted: true })
      .hand(P1, TWO_COST_UNIT, "u")
      .build();

    expect(entry(game, "u")).toMatchObject({ moveId: "playUnit", needsAdd: { energy: 1 } });
    expect(entry(game, "u")?.needsAdd.reason).toContain("tap");

    // DESIGN §Paying costs — listed is not paid: the attempt is refused and the
    // board is untouched (nothing auto-taps).
    expect(game.p1.can("play", "u")).toBe(false);
    const early = await game.p1.try((p) => p.play("u"));
    expect(early.ok).toBe(false);
    expect(game.p1.resources()).toEqual({ energy: 1, power: {} });
    expect(game.zoneOf("u")).toBe("hand");

    // …and one tap is the whole fix.
    await game.p1.tapRune("r1");
    expect(entry(game, "u")).toBeUndefined();
    await game.p1.play("u");
    expect(game.p1.energy()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("no Power pooled + two chaos runes: the [chaos] gear is listed as one RECYCLE short — 594 counts the exhausted rune too, so the pip is reachable either way (164.2.b)", async () => {
    const game = await scenario()
      .rune(P1, "chaos", { alias: "r1" })
      .rune(P1, "chaos", { alias: "r2", exhausted: true })
      .hand(P1, CHAOS_GEAR, "g")
      .build();

    expect(entry(game, "g")).toMatchObject({ moveId: "playGear", needsAdd: { power: { chaos: 1 } } });
    expect(entry(game, "g")?.needsAdd.reason).toContain("recycle");
    expect((await game.p1.try((p) => p.play("g"))).ok).toBe(false);

    // 594 — recycling has no readiness condition, so the EXHAUSTED rune pays it.
    await game.p1.recycleRune("r2", "chaos");
    expect(entry(game, "g")).toBeUndefined();
    await game.p1.play("g");
    expect(game.p1.power("chaos")).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("wrong Domain: a [chaos] pip is NOT reachable off order runes alone, so the gear is neither playable nor listed (404.2)", async () => {
    const game = await scenario()
      .rune(P1, "order", { alias: "o1" })
      .rune(P1, "order", { alias: "o2" })
      .hand(P1, CHAOS_GEAR, "g")
      .build();
    expect(entry(game, "g")).toBeUndefined();
    expect(game.p1.can("play", "g")).toBe(false);
  });

  test("nothing to add at all: with an empty pool and no runes the 2-cost unit is neither playable nor listed (404.2)", async () => {
    const game = await scenario().hand(P1, TWO_COST_UNIT, "u").build();
    expect(entry(game, "u")).toBeUndefined();
    expect(game.p1.can("play", "u")).toBe(false);
  });

  test("429.3.a — a Gold's '[Add] [rainbow]' reaches the pip just as a rune does: with no runes at all the [chaos] gear is still listed, one crack short", async () => {
    const game = await scenario()
      .gear(P1, "sfd-t03", "gold")
      .hand(P1, CHAOS_GEAR, "g")
      .build();
    // 135.2.e.5.b — universal Power pays a [chaos] pip, so the Gold reaches it.
    expect(entry(game, "g")).toMatchObject({ moveId: "playGear" });
    expect((await game.p1.try((p) => p.play("g"))).ok).toBe(false);
    await game.p1.activate("gold");
    expect(game.p1.power("rainbow")).toBe(1);
    await game.p1.play("g");
    expect(game.violations()).toEqual([]);
  });
});

/**
 * rule 167.1 / 316.3 — the Rune Pool empties at end of turn and nothing refills
 * it automatically, so EVERY Main Phase opens at 0 pooled Energy with the
 * turn's runes ready. That is the moment the player looks at their hand: if
 * reachability quietly needed a pooled Energy to work, the whole hand would
 * read as dead exactly when it matters most. 0 is the common case, not an edge.
 */
describe("357.1.a at 0 pooled Energy — the start-of-Main-Phase pool is not a special case", () => {
  /** The start of a Main Phase: nothing pooled, ten ready runes, a mixed hand. */
  const openingMain = (energy: number) => {
    let s = scenario().resources(P1, { energy, power: {} });
    for (let i = 0; i < 5; i++) {
      s = s.rune(P1, "fury", { alias: `f${i}` });
    }
    for (let i = 0; i < 5; i++) {
      s = s.rune(P1, "chaos", { alias: `c${i}` });
    }
    return s
      .hand(P1, TWO_COST_UNIT, "two")
      .hand(P1, CHAOS_GEAR, "gear")
      .hand(P1, THREE_PLUS_FURY, "three")
      .hand(P1, UNFUNDABLE_UNIT, "huge");
  };

  test("0 Energy + ten ready runes: every fundable card is listed with the Adds it still owes, and the unfundable one is not", async () => {
    const game = await openingMain(0).build();

    expect(entry(game, "two")).toMatchObject({ moveId: "playUnit", needsAdd: { energy: 2, reason: "tap 2 runes first" } });
    expect(entry(game, "gear")).toMatchObject({ moveId: "playGear", needsAdd: { power: { chaos: 1 }, reason: "recycle a rune for [chaos] first" } });
    expect(entry(game, "three")).toMatchObject({
      moveId: "playUnit",
      needsAdd: { energy: 3, power: { fury: 1 }, reason: "tap 3 runes and recycle a rune for [fury] first" },
    });
    // 404.2 — ten runes cannot reach a 99-cost body, so it stays unlisted.
    expect(entry(game, "huge")).toBeUndefined();
    expect(reach(game).map((r) => r.card).sort()).toEqual(["gear", "three", "two"]);

    // Invariant 2 (FIXER-PRIMER) — listing is not a shortcut: the attempt is
    // still refused and the state is byte-identical afterwards.
    const before = JSON.stringify(game.gameState);
    expect(game.p1.can("play", "two")).toBe(false);
    expect((await game.p1.try((p) => p.play("two"))).ok).toBe(false);
    expect(JSON.stringify(game.gameState)).toBe(before);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
  });

  test("0 Energy and 1 Energy list the SAME cards — one pooled Energy only shortens the pay line", async () => {
    const zero = await openingMain(0).build();
    const one = await openingMain(1).build();

    expect(reach(zero).map((r) => r.card).sort()).toEqual(reach(one).map((r) => r.card).sort());
    expect(entry(zero, "two")?.needsAdd.energy).toBe(2);
    expect(entry(one, "two")?.needsAdd.energy).toBe(1);
    // …and the tap the line asks for is the whole fix at 0 too.
    await zero.p1.tapRune("f0");
    await zero.p1.tapRune("f1");
    expect(entry(zero, "two")).toBeUndefined();
    await zero.p1.play("two");
    expect(zero.p1.energy()).toBe(0);
    expect(zero.violations()).toEqual([]);
  });
});

/**
 * rule 809.1.d / 429.3 — the [Deflect] instalment a chosen target adds is part
 * of what THIS play costs. A spell whose ONLY legal target is surcharged is
 * therefore reachable in exactly the same sense as a body one tap short: the
 * card must carry its pay line, and the surcharged candidate must still reach
 * the client dimmed. Pricing the card's bare printed cost instead made those
 * two surfaces disagree — `surchargedPlayTargetsOf` offered the target while
 * `reachablePlaysOf` dropped the card, so the dimmed-target screen was
 * unreachable in precisely the case it exists for.
 */
describe("809.1.d — a spell whose ONLY legal target is [Deflect]-surcharged is offered, not inert", () => {
  const soleDeflectTarget = () =>
    scenario()
      .resources(P1, { energy: 1, power: {} })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", DEFLECTOR, "deflector")
      .hand(P1, BOLT, "bolt");

  test("the card is listed with the surcharge's pay line, the surcharged candidate is still shipped dimmed, and both surfaces quote the same Add", async () => {
    const game = await soleDeflectTarget().rune(P1, "fury", { alias: "r1" }).rune(P1, "fury", { alias: "r2" }).build();

    const bolt = entry(game, "bolt");
    expect(bolt).toMatchObject({ moveId: "playSpell", needsAdd: { power: { rainbow: 1 }, reason: "recycle a rune for [rainbow] first" } });

    // The two surfaces must never disagree about the same card (one vocabulary).
    const surcharged = surchargedPlayTargetsOf(
      (game as unknown as { engine: Parameters<typeof surchargedPlayTargetsOf>[0] }).engine,
      P1,
      "playSpell",
      game.card("bolt"),
    );
    const sole = surcharged.find((t) => t.targets.includes(game.card("deflector")));
    expect(sole).toMatchObject({ surcharge: 1, unaffordable: true });
    expect(sole?.needsAdd).toEqual(bolt?.needsAdd);

    // Invariant 2 — listed is not paid: the attempt is refused, byte-identical.
    const before = JSON.stringify(game.gameState);
    expect((await game.p1.try((p) => p.cast("bolt", { targets: "deflector" }))).ok).toBe(false);
    expect(JSON.stringify(game.gameState)).toBe(before);

    // …and the recycle the line asks for is the whole fix (135.2.e.5.b).
    await game.p1.recycleRune("r1", "fury");
    expect(entry(game, "bolt")).toBeUndefined();
    await game.p1.cast("bolt", { targets: "deflector" });
    await game.settle();
    expect(game.zoneOf("deflector")).toBe("trash"); // 2 damage on a 2-Might body
    expect(game.violations()).toEqual([]);
  });

  test("control — one affordable target alongside it makes the spell a legal play, so it leaves reachablePlays while the surcharged candidate stays dimmed", async () => {
    const game = await soleDeflectTarget()
      .unit(P2, "bf1", { might: 2, name: "Filler Plain" }, "plain")
      .rune(P1, "fury", { alias: "r1" })
      .build();

    expect(entry(game, "bolt")).toBeUndefined(); // payable NOW against `plain`
    expect(game.p1.can("play", "bolt")).toBe(true);
    const surcharged = surchargedPlayTargetsOf(
      (game as unknown as { engine: Parameters<typeof surchargedPlayTargetsOf>[0] }).engine,
      P1,
      "playSpell",
      game.card("bolt"),
    );
    expect(surcharged.find((t) => t.targets.includes(game.card("deflector")))).toMatchObject({ surcharge: 1, unaffordable: true });
  });

  test("404.2 — with no rune and no Power the surcharge is unreachable, so the spell is neither playable nor listed", async () => {
    const game = await soleDeflectTarget().build();
    expect(entry(game, "bolt")).toBeUndefined();
    expect(game.p1.can("play", "bolt")).toBe(false);
  });
});
