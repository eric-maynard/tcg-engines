/**
 * Ruling 38a517e1a20b1295 — (a Legend's Domain Identity binds every card in the deck; no card named in the Q)
 *   Stand-ins: Herald of the Arcane (OGN-265 → ogn-265-298) — Viktor's Legend, domains Mind + Order — with
 *   Viktor, Innovator (OGN-117 → ogn-117-298) as the chosen champion; Chemtech Enforcer (OGN-003 → ogn-003-298)
 *   is the off-domain (Fury) card that has NO power cost at all.
 *
 * Q: With Viktor as my Legend, may I use cards of other colours — e.g. one with no recycle (power) cost?
 * A: No. The Legend's domains are the deck's Domain Identity and every Main Deck card must fit inside it,
 *    whether or not the card asks for any power. Runes and battlefields are bound the same way, which is what
 *    makes "all cards of one domain, 12 runes of the other" a legal build.
 * Rules: 103.1 (the Legend's domains ARE the Domain Identity), 103.1.b.3 / 103.2.c (every Main Deck card must
 *        fit the identity — the card's cost is irrelevant), 103.3.a.1 (the Rune Deck obeys it too).
 */
import { describe, expect, test } from "bun:test";
import type { Card, LegendCard, RuneCard, UnitCard } from "@tcg/riftbound-types/cards";
import { getAllCards } from "../../../../../riftbound-cards/src/data/all-cards";
import { DeckBuilder } from "../../../deckbuilder/deck-builder";
import { validateDeck } from "../../../validators/deck-validators";

const POOL = getAllCards() as unknown as Card[];
const byId = <T extends Card>(id: string): T => POOL.find((c) => (c.id as unknown as string) === id) as T;

const HERALD_OF_THE_ARCANE = byId<LegendCard>("ogn-265-298"); // Viktor's Legend — [mind, order]
const VIKTOR_INNOVATOR = byId<UnitCard>("ogn-117-298"); // champion unit, tag "Viktor", mind
const CHEMTECH_ENFORCER = byId<Card>("ogn-003-298"); // fury, energy-only: no power ("recycle") cost at all
const LECTURING_YORDLE = byId<Card>("ogn-087-298"); // mind, energy-only: inside the identity
const MIND_RUNE = byId<RuneCard>("ogn-089-298");
const ORDER_RUNE = byId<RuneCard>("ogn-214-298");
const FURY_RUNE = byId<RuneCard>("ogn-007-298");

function viktorBuilder(): DeckBuilder {
  const b = new DeckBuilder(POOL, "duel");
  b.setLegend(HERALD_OF_THE_ARCANE);
  expect(b.setChampion(VIKTOR_INNOVATOR)).toEqual({ success: true });
  return b;
}

describe("Ruling 38a517e1a20b1295 — a Viktor legend restricts the deck to its two domains, cost or no cost", () => {
  test("the Legend fixes the Domain Identity at exactly [mind, order]", async () => {
    expect(viktorBuilder().getDomainIdentity().sort()).toEqual(["mind", "order"]);
    expect(HERALD_OF_THE_ARCANE.championTag).toBe("Viktor");
  });

  test("an off-domain card is rejected even though it has NO power cost — Chemtech Enforcer (fury, energy only) can't be added", async () => {
    expect(CHEMTECH_ENFORCER.powerCost === undefined || CHEMTECH_ENFORCER.powerCost.length === 0).toBe(true);
    const b = viktorBuilder();
    const result = b.addToMainDeck(CHEMTECH_ENFORCER);
    expect(result).toMatchObject({ error: { code: "DOMAIN_MISMATCH" }, success: false });
    expect(b.getState().mainDeck).toEqual([]);
    expect(b.getAvailableMainDeckCards().map((c) => c.id as unknown as string)).not.toContain("ogn-003-298");
  });

  test("an in-domain card with no power cost is fine, so it really is the domain and not the cost that is being checked", async () => {
    const b = viktorBuilder();
    expect(b.addToMainDeck(LECTURING_YORDLE)).toEqual({ success: true });
    expect(b.getState().mainDeck.map((c) => c.id as unknown as string)).toEqual(["ogn-087-298"]);
  });

  test("validating a finished list flags the off-domain card by name — the deck is illegal, not merely unbuildable in the UI", async () => {
    const mainDeck: Card[] = [...Array.from({ length: 39 }, () => LECTURING_YORDLE), CHEMTECH_ENFORCER];
    const result = validateDeck({
      battlefields: [],
      chosenChampion: VIKTOR_INNOVATOR,
      legend: HERALD_OF_THE_ARCANE,
      mainDeck,
      runeDeck: Array.from({ length: 12 }, () => ORDER_RUNE),
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /Chemtech Enforcer/.test(e.message))).toBe(true);
  });

  test("the nuance: an all-mind main deck with 12 ORDER runes is a legal shape (both domains are in the identity), while a fury rune is not", async () => {
    const b = viktorBuilder();
    expect(b.addToRuneDeck(ORDER_RUNE)).toEqual({ success: true });
    expect(b.addToRuneDeck(MIND_RUNE)).toEqual({ success: true });
    expect(b.addToRuneDeck(FURY_RUNE)).toMatchObject({ success: false });
    expect(b.getState().runeDeck).toHaveLength(2);
  });
});
