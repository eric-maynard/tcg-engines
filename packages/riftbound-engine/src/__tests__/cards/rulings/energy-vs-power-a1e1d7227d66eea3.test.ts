/**
 * Ruling a1e1d7227d66eea3 — (no specific card) the [Add] symbol vs the circled-number symbol.
 *
 * Q: What is the difference between the "add a rune" symbol and the generic circled-number symbol?
 * A: Numbers are ENERGY; the coloured symbols are POWER. A cost written as a circled number plus a
 *    rune symbol means "exhaust a rune (for the energy) and recycle a rune of that colour (for the
 *    power)" — and both halves may be paid with the SAME rune, since recycling an untapped rune taps
 *    it for the energy on the way. Effects that hand out power directly stand in for the recycle.
 * Rules: 200s (Energy and Power are distinct resources; a cost's number is Energy, its pips are Power),
 *        414 (Exhaust a rune → 1 Energy), 416 (Recycle a rune → 1 Power of its domain).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

/** Costs [1][fury] — one Energy and one Fury Power. */
const SPARK = {
  abilities: [{ effect: { amount: 1, type: "draw" }, type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Spark",
  powerCost: ["fury"],
  rulesText: "Draw 1.",
} as const;

describe("Ruling a1e1d7227d66eea3 — the number is Energy, the pip is Power, and one rune can supply both", () => {
  test("exhausting a rune yields ENERGY, not power", async () => {
    const game = await scenario().rune(P1, "fury", { alias: "r1" }).build();
    expect(game.p1.resources()).toMatchObject({ energy: 0 });
    await game.p1.tapRune("r1");
    expect(game.p1.energy()).toBe(1);
    expect(game.p1.power("fury")).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("recycling a rune yields POWER of that rune's domain", async () => {
    const game = await scenario().runes(P1, "fury", 2).build();
    const [a, b] = game.p1.runes();
    await game.p1.tapRune(a);
    await game.p1.recycleRune(b, "fury");
    expect(game.p1.power("fury")).toBeGreaterThanOrEqual(1);
    expect(game.violations()).toEqual([]);
  });

  test("the exhausted rune and the recycled rune may be the SAME rune: one rune pays [1][fury]", async () => {
    const game = await scenario().rune(P1, "fury", { alias: "solo" }).hand(P1, SPARK, "spark").build();
    expect(game.p1.can("cast", "spark")).toBe(false); // nothing paid yet
    await game.p1.tapRune("solo"); // the circled number: exhaust for 1 Energy
    expect(game.p1.energy()).toBe(1);
    await game.p1.recycleRune("solo", "fury"); // the SAME rune, now recycled for the [fury] pip
    expect(game.p1.power("fury")).toBe(1);
    expect(game.p1.energy()).toBe(1);
    expect(game.p1.can("cast", "spark")).toBe(true);
    await game.p1.cast("spark");
    await game.settle();
    expect(game.zoneOf("spark")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("power granted directly by an effect substitutes for the recycle — energy alone still cannot pay a Power pip", async () => {
    const energyOnly = await scenario().resources(P1, { energy: 5 }).hand(P1, SPARK, "spark").build();
    expect(energyOnly.p1.power("fury")).toBe(0);
    expect(energyOnly.p1.can("cast", "spark")).toBe(false); // 5 Energy does not buy a [fury] pip

    const both = await scenario().resources(P1, { energy: 1, power: { fury: 1 } }).hand(P1, SPARK, "spark").build();
    expect(both.p1.can("cast", "spark")).toBe(true);
    await both.p1.cast("spark");
    await both.settle();
    expect(both.zoneOf("spark")).toBe("trash");
    expect(both.violations()).toEqual([]);
  });
});
