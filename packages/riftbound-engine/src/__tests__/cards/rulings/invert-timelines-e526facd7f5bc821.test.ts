/**
 * Ruling e526facd7f5bc821 — Invert Timelines (OGN-201 → ogn-201-298) · [3][chaos]
 *   "Each player discards their hand, then draws 4."
 *
 * Q: Both players are at 7 points with 0 cards left in their Main Deck and Invert Timelines is played — who wins?
 * A: The player who PLAYED it discards and draws first (simultaneous actions are ordered by turn order starting
 *    with the active player), tries to draw from an empty deck, and loses before the opponent ever draws.
 * Rules: 105.2 (simultaneous player actions resolve in turn order), 199 (drawing from an empty Main Deck loses).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const INVERT_TIMELINES = "ogn-201-298";

/** P1's turn. Both players at 7 points, both Main Decks EMPTY, both holding a card besides the spell. */
function board() {
  return scenario()
    .fillDecks(false)
    .points(P1, 7)
    .points(P2, 7)
    .resources(P1, { energy: 3, power: { chaos: 1 } })
    .hand(P1, INVERT_TIMELINES, "invert")
    .hand(P1, { cardType: "spell", energyCost: 1, name: "P1 Filler" }, "p1filler")
    .hand(P2, { cardType: "spell", energyCost: 1, name: "P2 Filler" }, "p2filler");
}

describe("Ruling e526facd7f5bc821 — Invert Timelines with two empty decks kills the caster first", () => {
  test("premise: both Main Decks are empty and both players sit at 7 points", async () => {
    const game = await board().build();
    expect(game.p1.deck()).toEqual([]);
    expect(game.p2.deck()).toEqual([]);
    expect(game.p1.points()).toBe(7);
    expect(game.p2.points()).toBe(7);
    expect(game.isOver()).toBe(false);
  });

  test("the caster resolves first, decks out on the draw, and LOSES — the opponent wins", async () => {
    const game = await board().build();
    await game.p1.cast("invert");
    await game.settle();
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P2);
  });

  test("the opponent never completes their own draw — the game is already over", async () => {
    const game = await board().build();
    await game.p1.cast("invert");
    await game.settle();
    expect(game.p2.hand()).toEqual([]); // discarded, but the 4 cards were never drawn
    expect(game.violations()).toEqual([]);
  });

  // The ruling's sequence has the CASTER discard-and-draw first; the engine ends the game with P1's hand still
  // in hand, i.e. P1's half of "each player discards their hand" never ran. Outcome (P2 wins) is right; the
  // intermediate discard is not.
  test.failing("BUG: ruling e526facd7f5bc821 — the caster's own hand should be discarded before the fatal draw (engine leaves it in hand)", async () => {
    const game = await board().build();
    await game.p1.cast("invert");
    await game.settle();
    expect(game.zoneOf("p1filler")).toBe("trash");
  });

  test("control: with a stocked deck the same play is harmless — each player ends on 4 cards", async () => {
    const game = await board()
      .deck(P1, Array.from({ length: 5 }, () => "ogn-175-298"))
      .deck(P2, Array.from({ length: 5 }, () => "ogn-175-298"))
      .build();
    await game.p1.cast("invert");
    await game.settle();
    expect(game.isOver()).toBe(false);
    expect(game.p1.hand()).toHaveLength(4);
    expect(game.p2.hand()).toHaveLength(4);
    expect(game.violations()).toEqual([]);
  });
});
