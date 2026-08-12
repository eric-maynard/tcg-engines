/**
 * Ruling b559d821980c8750 — Darius, Trifarian (OGN-027 → ogn-027-298) · Unit · [5][fury] · 5 Might
 *   "When you play your second card in a turn, give me +2 [Might] this turn and ready me."
 *
 * Q: If Darius himself is the second card I play this turn, does his Legion effect trigger and ready him?
 * A: Yes. The card being played counts as that second card, so playing Darius second triggers his own
 *    ability: he gets +2 [Might] this turn and is readied.
 * Rules: 411.4 ("when you <do X>" counts the action being taken), 383.3 (the trigger is added after the play).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const DARIUS = "ogn-027-298";

/** Enough for a 1-cost body plus Darius ([5][fury]). */
function darius(inHand = true) {
  const s = scenario()
    .resources(P1, { energy: 6, power: { fury: 1 } })
    .hand(P1, { cardType: "unit", energyCost: 1, might: 1, name: "Cadet" }, "cadet");
  return inHand ? s.hand(P1, DARIUS, "darius") : s;
}

describe("Ruling b559d821980c8750 — Darius played as your second card triggers his own Legion effect", () => {
  test("first card, then Darius: he lands with 7 [Might] (5 + 2 this turn) and ready", async () => {
    const game = await darius().build();
    await game.p1.play("cadet");
    await game.settle();
    await game.p1.play("darius");
    await game.settle();
    expect(game.zoneOf("darius")).toBe("base");
    expect(game.state("darius").baseMight).toBe(5);
    expect(game.state("darius").might).toBe(7);
    expect(game.state("darius").mightModifier).toBe(2);
    expect(game.state("darius").isReady).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  test("the +2 is only 'this turn' — it is gone once the turn ends", async () => {
    const game = await darius().build();
    await game.p1.play("cadet");
    await game.settle();
    await game.p1.play("darius");
    await game.settle();
    await game.advanceTurn();
    expect(game.state("darius").might).toBe(5);
  });

  test("Darius as the FIRST card of the turn does not trigger — the count is of cards played, not of Darius", async () => {
    const game = await darius().build();
    await game.p1.play("darius");
    await game.settle();
    expect(game.state("darius").might).toBe(5);
    expect(game.state("darius").mightModifier).toBe(0);
    // …and the next card played that turn is the second one, which does trigger him.
    await game.p1.play("cadet");
    await game.settle();
    expect(game.state("darius").might).toBe(7);
  });

  test("the 'ready me' half is real — an already-exhausted Darius on board is readied by the second card", async () => {
    const game = await darius(false)
      .hand(P1, { cardType: "unit", energyCost: 1, might: 1, name: "Cadet II" }, "cadet2")
      .unit(P1, "base", DARIUS, "darius", { exhausted: true })
      .build();
    await game.p1.play("cadet");
    await game.settle();
    expect(game.state("darius").isExhausted).toBe(true); // only the FIRST card so far
    await game.p1.play("cadet2");
    await game.settle();
    expect(game.state("darius").isExhausted).toBe(false);
    expect(game.state("darius").might).toBe(7);
  });
});
