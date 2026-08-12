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

  // RULING-CONFLICT (adjudicated 2026-08-12 — this facet PREVIOUSLY asserted `zoneOf("p1filler") === "trash"`
  // as a `test.failing` bug marker, reading "P1's card is in hand at the end" as "P1's discard never ran").
  // The ruling only settles WHO WINS, and the engine matches it. The caster's half of "each player discards
  // their hand" DOES run first — but the very next instruction is a draw from an empty Main Deck, which Burns
  // Out (431.2.a: shuffle that player's trash back into their Main Deck, an opponent gains 1 point) and
  // "a Burn Out INTERRUPTS the draw, it does not cancel it" (431.2.d) — so the card just discarded is shuffled
  // into the deck and drawn straight back. P1's Main Deck started EMPTY, so a card in P1's hand at the end can
  // only have arrived through that recycle: its presence is the proof the discard happened, not evidence against it.
  test("RULING-CONFLICT e526facd7f5bc821 — the caster's hand IS discarded first; Burn Out (431.2) recycles it and the fatal draw takes it back", async () => {
    const game = await board().build();
    await game.p1.cast("invert");
    await game.settle();
    // rule 431.2.a: the Burn Out that ended the game could only recycle a trash the discard had filled.
    expect(game.p2.points()).toBeGreaterThan(7);
    expect(game.p1.deck()).toEqual([]);
    expect(game.zoneOf("p1filler")).toBe("hand");
    expect(game.zoneOf("p2filler")).toBe("trash"); // P2 discarded and never drew
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
