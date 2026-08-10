/**
 * Ruling 04c691fb9532e838 — Hand of Noxus (Darius legend, OGN-253 → ogn-253-298)
 *   "[Exhaust]: [Reaction], [Legion] — [Add] [1]. (Abilities that add resources can't be reacted to. Get the effect if you've
 *    played a card this turn.)"
 *
 * Q: Can you exhaust Darius every round to add one rune?
 * A: Darius doesn't add a RUNE — exhausting him adds 1 ENERGY to your rune pool (like an untapped rune would). Requirements:
 *    Legion must be active (you've played a card from your main deck this turn) and Darius must be unexhausted. If you
 *    exhausted him on your turn he isn't available on the opponent's turn; energy lives in the pool and pays costs.
 * Rules: 819 (Legion), 429 / 158 ([Add] abilities put resources in the Rune Pool and resolve immediately), 606 (exhaust cost),
 *        317.2 (pools empty at end of turn), 515.1 (your permanents ready in your Awaken step).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const HAND_OF_NOXUS = "ogn-253-298";
const PAWN = { cardType: "unit", energyCost: 0, might: 1, name: "Pawn" } as const; // a free card to switch Legion on
const SQUIRE = { cardType: "unit", energyCost: 1, might: 2, name: "Squire" } as const; // costs exactly the [1] Darius adds

function board() {
  return scenario()
    .legend(P1, HAND_OF_NOXUS, "darius")
    .runes(P1, "fury", 2)
    .hand(P1, PAWN, "pawn")
    .hand(P1, SQUIRE, "squire");
}

describe("Ruling 04c691fb9532e838 — Darius adds 1 ENERGY (not a rune), needs Legion and an unexhausted Darius", () => {
  test("no card played yet this turn ⇒ Legion is off ⇒ Darius's ability is not activatable", async () => {
    const game = await board().build();
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(0);
    expect(game.state("darius").isExhausted).toBe(false);
    expect(game.p1.can("activate", "darius")).toBe(false);
  });

  test("after playing a card (Legion on): exhausting Darius adds exactly 1 ENERGY to the pool — the number of runes on the board and in the rune deck is unchanged — and it happens immediately (no chain item)", async () => {
    const game = await board().build();
    await game.p1.play("pawn");
    await game.settle();
    expect(game.zoneOf("pawn")).toBe("base");
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
    const runesBefore = game.p1.runes().length;
    const runeDeckBefore = game.p1.runeDeck().length;
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.can("activate", "darius")).toBe(true);
    await game.p1.activate("darius");
    expect(game.state("darius").isExhausted).toBe(true);
    expect(game.p1.energy()).toBe(1); // +1 energy …
    expect(game.p1.runes()).toHaveLength(runesBefore); // … not +1 rune
    expect(game.p1.runeDeck()).toHaveLength(runeDeckBefore);
    expect(game.chain()).toEqual([]);
    // That energy pays costs like any other: the [1] Squire is now playable from an otherwise empty pool.
    expect(game.p1.can("play", "squire")).toBe(true);
    await game.p1.play("squire");
    await game.settle();
    expect(game.zoneOf("squire")).toBe("base");
    expect(game.p1.energy()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("Darius must be UNEXHAUSTED: once used he can't be exhausted again this turn, and — still exhausted — he is not available during the opponent's turn either; he readies at P1's next Awaken and works again once Legion is re-met", async () => {
    const game = await board().hand(P1, PAWN, "pawn2").build();
    await game.p1.play("pawn");
    await game.settle();
    await game.p1.activate("darius");
    expect(game.p1.can("activate", "darius")).toBe(false); // already exhausted
    await game.advanceTurn(); // → P2's turn
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("darius").isExhausted).toBe(true); // does not ready on the opponent's turn
    expect(game.p1.energy()).toBe(0); // and the unspent energy emptied at end of turn (it never was a rune)
    expect(game.p1.can("activate", "darius")).toBe(false);
    await game.advanceTurn(); // → P1's turn: Awaken readies Darius
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("darius").isExhausted).toBe(false);
    expect(game.p1.can("activate", "darius")).toBe(false); // new turn: Legion not yet met
    await game.p1.play("pawn2");
    await game.settle();
    const e = game.p1.energy();
    expect(game.p1.can("activate", "darius")).toBe(true);
    await game.p1.activate("darius");
    expect(game.p1.energy()).toBe(e + 1);
  });
});
