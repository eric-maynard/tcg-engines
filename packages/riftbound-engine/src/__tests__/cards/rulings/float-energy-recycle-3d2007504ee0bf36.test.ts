/**
 * Ruling 3d2007504ee0bf36 — (no specific card) floating energy from a rune and then recycling that rune
 *
 * Q: Can I tap a rune for 1 energy, float it, then recycle that same rune and use the floated energy to
 *    play a card?
 * A: Yes. Exhausting a rune puts 1 Energy in your pool; you are not obliged to spend it right away.
 *    Recycling the (now exhausted) rune afterwards is a separate action that adds Power. Both sit in the
 *    pool and both pay for the card.
 * Rules: 429 / 166 (Rune Pool; resources stay until a pool-emptying step), 430.3 ([Add] by exhausting a
 *        rune), 435 (Recycle a rune for 1 Power of its domain), 357 (paying costs from the pool).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

/** Costs [1][fury] — pays with one floated Energy plus one recycled Power. */
const SIGIL = {
  abilities: [{ effect: { amount: 1, type: "draw" }, type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Sigil",
  powerCost: ["fury"],
  rulesText: "Draw 1.",
} as const;

describe("Ruling 3d2007504ee0bf36 — float the energy, then recycle the same rune", () => {
  test("step 1–2: exhausting the rune adds 1 Energy that simply STAYS in the pool", async () => {
    const game = await scenario().rune(P1, "fury", { alias: "r1" }).hand(P1, SIGIL, "sigil").build();
    expect(game.p1.energy()).toBe(0);
    await game.p1.tapRune("r1");
    expect(game.p1.energy()).toBe(1);
    expect(game.state("r1").isExhausted).toBe(true);
    expect(game.p1.can("cast", "sigil")).toBe(false); // the [fury] pip is still missing
  });

  test("step 3–4: the already-exhausted rune can then be recycled for [fury], and the floated Energy pays the rest", async () => {
    const game = await scenario().rune(P1, "fury", { alias: "r1" }).hand(P1, SIGIL, "sigil").build();
    const handBefore = game.p1.hand().length;
    await game.p1.tapRune("r1");
    await game.p1.recycleRune("r1");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } });
    expect(game.p1.runes()).toEqual([]); // the rune left the pool when it was recycled
    expect(game.p1.can("cast", "sigil")).toBe(true);
    await game.p1.cast("sigil");
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.p1.hand().length).toBe(handBefore); // the sigil left, the draw replaced it
    expect(game.violations()).toEqual([]);
  });

  test("order matters for the energy: recycling WITHOUT tapping first leaves no floated Energy behind, and the sigil is unaffordable", async () => {
    const game = await scenario().rune(P1, "fury", { alias: "r1" }).hand(P1, SIGIL, "sigil").build();
    await game.p1.recycleRune("r1");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 1 } });
    expect(game.p1.can("cast", "sigil")).toBe(false);
    expect(game.violations()).toEqual([]);
  });
});
