/**
 * Ruling 83abb9fa616ddedb — (no specific card) the opening of a 1v1 duel.
 *   Driven through a real duel setup (Game.fromDecks) with two vanilla decks, not a seeded board.
 *
 * Q: Does the player going second draw on their first turn, or do they just keep the opening 4?
 * A: Both players open with 4 cards. Nobody draws simultaneously — each player draws during the Draw Step
 *    of their OWN turn. So the player going second draws on their first turn as well; on that turn they
 *    also channel one extra rune (3 instead of 2) for going second. The "no draw on your first turn" rule
 *    belongs to multiplayer formats, not to a duel.
 * Rules: 485.7 (duel First Turn Process — the player going second channels an extra rune), 315.3.b
 *        (the Turn Player channels 2), 315.4 (Draw Step, on your own turn), 483.7 / 485 (duel setup).
 */
import { describe, expect, test } from "bun:test";
import { Game, P1, P2 } from "../../../harness";

/** A vanilla constructed duel deck: 40 Shipyard Skulkers, 12 runes, one battlefield, a quiet legend. */
const VANILLA_DECK = {
  battlefieldIds: ["ogn-277-298"],
  championId: "unl-113-219",
  legendId: "unl-191-219", // Wuju Master — both lines are Level gated, so nothing fires in the opening turns
  mainDeckCardIds: Array.from({ length: 40 }, () => "ogn-175-298"),
  runeDeckCardIds: Array.from({ length: 12 }, () => "ogn-007-298"),
};

async function duel(): Promise<Game> {
  const game = await Game.fromDecks({ p1: VANILLA_DECK, p2: VANILLA_DECK });
  await game.settle();
  return game;
}

describe("Ruling 83abb9fa616ddedb — in a duel the player going second draws on their first turn", () => {
  test("turn 1 belongs to P1: the 4-card opening hand plus their own Draw Step makes 5, and 2 runes are channeled", async () => {
    const game = await duel();
    expect(game.turnNumber()).toBe(1);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.hand()).toHaveLength(5); // 4 opening + 1 drawn on their own turn
    expect(game.p1.runes()).toHaveLength(2);
    // P2 has NOT drawn with them — drawing is not simultaneous
    expect(game.p2.hand()).toHaveLength(4);
    expect(game.p2.runes()).toHaveLength(0);
  });

  test("P2's first turn: they DO draw (4 → 5) — they are not stuck on the opening four", async () => {
    const game = await duel();
    const p1HandAfterTurn1 = game.p1.hand().length;
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p2.hand()).toHaveLength(5);
    expect(game.p1.hand()).toHaveLength(p1HandAfterTurn1); // and P1 does not draw on P2's turn
  });

  test("going second also channels the extra rune on that first Channel Phase only (485.7): 3 now, 2 every turn after", async () => {
    const game = await duel();
    await game.advanceTurn(); // → P2's first turn
    expect(game.p2.runes()).toHaveLength(3);
    await game.advanceTurn(); // → P1's second turn: still 2 per turn for the player going first
    expect(game.p1.runes()).toHaveLength(4);
    expect(game.p1.hand()).toHaveLength(6);
    await game.advanceTurn(); // → P2's second turn: the bonus was first-Channel-only
    expect(game.p2.runes()).toHaveLength(5);
    expect(game.p2.hand()).toHaveLength(6);
    expect(game.violations()).toEqual([]);
  });
});
