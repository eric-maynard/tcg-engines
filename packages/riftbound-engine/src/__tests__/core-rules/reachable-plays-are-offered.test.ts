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
 */

import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../harness";
import type { ActionDecision } from "../../harness";

/** Unit · 2 Energy, no Power. */
const TWO_COST_UNIT = { cardType: "unit", domain: "chaos", energyCost: 2, might: 2, name: "Filler Two Cost" };
/** Gear · 0 Energy + [chaos]. */
const CHAOS_GEAR = { cardType: "gear", domain: "chaos", energyCost: 0, name: "Filler Chaos Gear", powerCost: ["chaos"] };

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
