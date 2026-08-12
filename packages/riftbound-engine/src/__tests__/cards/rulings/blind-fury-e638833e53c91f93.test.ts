/**
 * Ruling e638833e53c91f93 — Blind Fury (OGN-025 → ogn-025-298) · [Action] [4][fury][fury]
 *   "Each opponent reveals the top card of their Main Deck. Choose one and banish it, then play it, ignoring its
 *    cost. Then recycle the rest."
 *
 * Q: How do you pay for a revealed card whose rune/power cost you cannot produce?
 * A: You don't. "Ignoring its cost" ignores the WHOLE cost — energy and power alike. Nothing is paid through an
 *    alternative route, and the card is not recycled for being unpayable.
 * Rules: 204 (costs), 357 ("ignoring its cost" = the cost is not paid at all), Blind Fury's own text.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const BLIND_FURY = "ogn-025-298";

/** An expensive OFF-domain unit: P1 will hold no [calm] at all, so this could never be paid for normally. */
const CALM_COLOSSUS = {
  cardType: "unit",
  domain: "calm",
  energyCost: 8,
  might: 7,
  name: "Calm Colossus",
  powerCost: ["calm", "calm", "calm"],
} as const;

/** P1's turn with EXACTLY Blind Fury's cost and no other resource. P2's deck top is the unaffordable Colossus. */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { fury: 2 } })
    .hand(P1, BLIND_FURY, "fury")
    .deckTop(P2, CALM_COLOSSUS, "colossus");
}

describe("Ruling e638833e53c91f93 — Blind Fury ignores the played card's cost outright", () => {
  test("premise: P1 could never pay the Colossus normally — [8][calm][calm][calm] against 4 energy and only [fury]", async () => {
    const game = await board().build();
    expect(game.state("colossus")).toMatchObject({ energyCost: 8, powerCost: ["calm", "calm", "calm"] });
    expect(game.p1.resources()).toEqual({ energy: 4, power: { fury: 2 } });
  });

  test("the Colossus is played anyway: it lands on P1's board and NOTHING beyond Blind Fury's own cost is spent", async () => {
    const game = await board().build();
    await game.p1.cast("fury");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } }); // Blind Fury's own [4][fury][fury]
    await game.settle();
    if (game.decision()?.kind === "pick") await game.p1.pick("colossus");
    await game.settle();
    expect(game.zoneOf("colossus")).toBe("base");
    expect(game.state("colossus").controller).toBe(P1);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } }); // no power, no energy, no alternative payment
    expect(game.violations()).toEqual([]);
  });

  test("it is not recycled for being unpayable — it is on the board, not back in P2's rune/main deck", async () => {
    const game = await board().build();
    await game.p1.cast("fury");
    await game.settle();
    if (game.decision()?.kind === "pick") await game.p1.pick("colossus");
    await game.settle();
    expect(game.p2.deck()).not.toContain("colossus");
    expect(game.zoneOf("colossus")).not.toBe("mainDeck");
    expect(game.zoneOf("colossus")).not.toBe("runeDeck");
    expect(game.zoneOf("fury")).toBe("trash");
  });
});
