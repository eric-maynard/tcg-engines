/**
 * Ruling 86d905137db02121 — Twisted Fate, Gambler (OGN-200 → ogn-200-298) · Unit · Chaos ("purple") · [4] · 4 Might
 *     "When I attack, reveal the top rune of your rune deck, then recycle it. Do one of the following based on its
 *      domain: [fury] … [mind] … [order] …"
 *
 * Q: Can you play Twisted Fate in non-purple decks?
 * A: No. His abilities care about other domains, but his own domain identity still gates deckbuilding: your
 *    Legend's domain identity must include Chaos (purple) for him to be a legal inclusion.
 * Rules: 103.1.b (a card is legal only if every domain of it is within the deck's domain identity),
 *        644 (the Legend fixes that identity).
 */
import { describe, expect, test } from "bun:test";
import { getAllCards } from "../../../../../riftbound-cards/src/data/all-cards";
import type { Card, LegendCard } from "@tcg/riftbound-types/cards";
import { DeckBuilder } from "../../../deckbuilder";
import { matchesDomainIdentity } from "../../../deckbuilder/card-filters";

const TWISTED_FATE = "ogn-200-298";
const LOOSE_CANNON = "ogn-251-298"; // Jinx — [fury, chaos]: purple IS in the identity
const WUJU_BLADESMAN = "ogs-019-024"; // Yi — [calm, body]: no purple

const pool = getAllCards() as unknown as Card[];
const card = (id: string): Card => pool.find((c) => c.id === id)!;

describe("Ruling 86d905137db02121 — Twisted Fate needs Chaos (purple) in the deck's domain identity", () => {
  test("premise: his printed domain is Chaos alone, whatever his text says about other domains", () => {
    const tf = card(TWISTED_FATE);
    expect(tf.domain).toBe("chaos");
    expect(tf.rulesText).toMatch(/\[fury\]|\[mind\]|\[order\]/); // his ABILITIES read other domains
  });

  test("the identity check is on his own domain: allowed under any identity containing chaos, refused otherwise", () => {
    const tf = card(TWISTED_FATE) as unknown as Parameters<typeof matchesDomainIdentity>[0];
    expect(matchesDomainIdentity(tf, ["fury", "chaos"])).toBe(true);
    expect(matchesDomainIdentity(tf, ["mind", "chaos"])).toBe(true);
    expect(matchesDomainIdentity(tf, ["calm", "body"])).toBe(false); // Yi's identity — no purple
    expect(matchesDomainIdentity(tf, ["fury", "order"])).toBe(false);
  });

  test("under a purple Legend (Jinx, [fury][chaos]) he goes into the main deck", () => {
    const builder = new DeckBuilder(pool);
    builder.setLegend(card(LOOSE_CANNON) as LegendCard);
    expect(builder.getDomainIdentity()).toEqual(expect.arrayContaining(["chaos"]));
    expect(builder.addToMainDeck(card(TWISTED_FATE))).toEqual({ success: true });
  });

  test("under a non-purple Legend (Wuju Bladesman, [calm][body]) the add is rejected — his abilities caring about other domains does not help", () => {
    const builder = new DeckBuilder(pool);
    builder.setLegend(card(WUJU_BLADESMAN) as LegendCard);
    expect(builder.getDomainIdentity()).not.toContain("chaos");
    const result = builder.addToMainDeck(card(TWISTED_FATE));
    expect(result.success).toBe(false);
  });

  test("control — a Chaos card of another kind behaves identically, and a colourless card is fine under either Legend", () => {
    const builder = new DeckBuilder(pool);
    builder.setLegend(card(WUJU_BLADESMAN) as LegendCard);
    expect(builder.addToMainDeck(card("ogn-183-298")).success).toBe(false); // Stacked Deck, Chaos
    expect(builder.addToMainDeck(card("ogn-175-298")).success).toBe(false); // Shipyard Skulker, Chaos
    const jinx = new DeckBuilder(pool);
    jinx.setLegend(card(LOOSE_CANNON) as LegendCard);
    expect(jinx.addToMainDeck(card("ogn-175-298")).success).toBe(true);
  });
});
