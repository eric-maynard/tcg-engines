/**
 * Ruling 701cb90d990b6d46 — Promising Future (OGN-115 → ogn-115-298) · Spell · Mind · [5][mind]
 *   "Each player looks at the top 5 cards of their Main Deck, banishes one of them, then recycles the rest. …"
 *
 * Q: My Main Deck holds only 4 cards when an effect tells me to look at the top 5. Is that a burnout?
 * A: No. You look at / reveal as many as are there (4). Looking does not MOVE the cards, so the deck is never
 *    emptied mid-look; a burnout needs the deck to be already empty when the look starts.
 * Rules: 359.3.e.11 (do as much as possible), 421 (look/reveal leave cards in the zone), burnout = draw from an
 *        empty Main Deck.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const PROMISING_FUTURE = "ogn-115-298";
const FODDER = { cardType: "unit", energyCost: 1, might: 1, name: "Fodder" } as const;

/** P1's turn with exactly [5][mind]. P1's Main Deck is FOUR cards; P2 has a full five so only P1 is short. */
function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { mind: 1 } })
    .fillDecks(false)
    .deck(P1, [FODDER, FODDER, FODDER, FODDER], ["a1", "a2", "a3", "a4"])
    .deck(P2, [FODDER, FODDER, FODDER, FODDER, FODDER], ["b1", "b2", "b3", "b4", "b5"])
    .hand(P1, PROMISING_FUTURE, "pf");
}

describe("Ruling 701cb90d990b6d46 — looking at 'the top 5' of a 4-card deck shows 4 and burns nobody out", () => {
  test("the spell is castable and the look prompt offers exactly the 4 cards that exist — no burnout, game still running", async () => {
    const game = await board().build();
    expect(game.p1.deck()).toHaveLength(4);
    await game.p1.cast("pf");
    await game.settle();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.length : -1).toBe(4);
    expect(d?.kind === "pick" ? d.options.map((o) => o.card).toSorted() : []).toEqual(["a1", "a2", "a3", "a4"]);
    expect(game.isOver()).toBe(false);
    expect(game.winner()).toBeUndefined();
  });

  test("the nuance — while the look is open the cards are STILL in the deck, so the deck is never 'empty' mid-reveal", async () => {
    const game = await board().build();
    await game.p1.cast("pf");
    await game.settle();
    expect(game.decision()?.seat).toBe(P1);
    expect(game.p1.deck()).toHaveLength(4); // looked at, not moved
    for (const id of ["a1", "a2", "a3", "a4"]) {
      expect(game.zoneOf(id)).toBe("mainDeck");
    }
    expect(game.isOver()).toBe(false);
  });

  test("answering it banishes one of the four and recycles the rest — nothing was drawn, so still no burnout", async () => {
    const game = await board().build();
    await game.p1.cast("pf");
    await game.settle();
    await game.p1.pick("a1");
    expect(game.zoneOf("a1")).toBe("banishment");
    // The other three are recycled — back into the Main Deck (bottom), so nothing was ever drawn off an empty deck.
    expect(game.p1.deck().toSorted()).toEqual(["a2", "a3", "a4"]);
    expect(game.isOver()).toBe(false);
    expect(game.violations()).toEqual([]);
  });
});
