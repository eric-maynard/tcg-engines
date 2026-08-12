/**
 * Ruling 8c96598a6c22530f — (general drawing / Burn Out; no specific card)
 *   Stand-in: an inline [Action] "Draw 4" against a three-card Main Deck.
 *
 * Q: Drawing 4 with only 3 cards left in the deck — is that a Burn Out after the third card, or do you draw
 *    three, refill and carry on?
 * A: No Burn Out. You draw the 3, shuffle your Trash into your Main Deck, then draw the fourth and the effect is
 *    done. Burn Out only happens when you ATTEMPT a draw with an empty Main Deck and nothing to refill from.
 * Rules: 431 (drawing; an empty Main Deck is refilled from the Trash), 432 (Burn Out on a draw attempt from a
 *        Main Deck that cannot be refilled), 359.3 ("do as much as possible" as an effect resolves).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const DRAW4 = {
  abilities: [{ effect: { amount: 4, type: "draw" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "mind",
  energyCost: 1,
  name: "Test Draw 4",
  powerCost: [],
  rulesText: "[Action] Draw 4.",
  timing: "action",
} as const;

const vanilla = (name: string) => ({ cardType: "unit", energyCost: 1, might: 1, name });

/** P1's turn: exactly 3 cards in the Main Deck, 2 in the Trash, and a Draw 4 in hand. No deck filler. */
function board() {
  return scenario()
    .fillDecks(false)
    .resources(P1, { energy: 2 })
    .deck(P1, [vanilla("Deck A"), vanilla("Deck B"), vanilla("Deck C")], ["d1", "d2", "d3"])
    .trash(P1, vanilla("Trash A"), "t1")
    .trash(P1, vanilla("Trash B"), "t2")
    .hand(P1, DRAW4, "draw4");
}

describe("Ruling 8c96598a6c22530f — draw 4 off a 3-card deck: refill mid-effect, no Burn Out", () => {
  test("the position: 3 cards in deck, 2 in trash", async () => {
    const game = await board().build();
    expect(game.p1.deck()).toHaveLength(3);
    expect(game.p1.trash().sort()).toEqual(["t1", "t2"]);
  });

  test("all four cards are drawn and the game goes on — nobody burns out", async () => {
    const game = await board().build();
    await game.p1.cast("draw4");
    await game.settle();
    expect(game.p1.hand()).toHaveLength(4); // the three deck cards + one from the refilled deck
    expect(game.isOver()).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("the refill is the Trash going back into the deck: the two trashed cards left the trash, and one of them is now the deck", async () => {
    const game = await board().build();
    await game.p1.cast("draw4");
    await game.settle();
    // Only the spell that was just played sits in the trash; t1/t2 were shuffled into the deck.
    expect(game.p1.trash()).toEqual(["draw4"]);
    expect(game.p1.deck()).toHaveLength(1); // 2 shuffled in, 1 drawn as the fourth card
    expect(game.p1.hand()).toEqual(expect.arrayContaining(["d1", "d2", "d3"]));
  });

  test("the fourth card really is one of the recycled trash cards", async () => {
    const game = await board().build();
    await game.p1.cast("draw4");
    await game.settle();
    const fourth = game.p1.hand().filter((id) => !["d1", "d2", "d3"].includes(id));
    expect(fourth).toHaveLength(1);
    expect(["t1", "t2"]).toContain(fourth[0]);
  });
});
