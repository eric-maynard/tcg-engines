/**
 * Card Data Tests
 *
 * Verifies card definitions are properly generated and accessible.
 */

import { describe, expect, test } from "bun:test";
import { SETS, enrichCardsWithStats, getAllCards, getCardRegistry, getRawCards } from "../data";
import * as cards from "../cards";

describe("Card Data", () => {
  test("sets metadata is populated", () => {
    expect(Object.keys(SETS).length).toBeGreaterThanOrEqual(3);
    expect(SETS.OGN).toBeDefined();
    expect(SETS.OGN.name).toBe("Origins");
    expect(SETS.UNL).toBeDefined();
    expect(SETS.SFD).toBeDefined();
  });

  test("card sets are exported", () => {
    expect(cards.ogn).toBeDefined();
    expect(cards.unl).toBeDefined();
    expect(cards.sfd).toBeDefined();
  });

  test("getAllCards returns all cards", () => {
    const allCards = getAllCards();
    expect(allCards.length).toBeGreaterThan(700);
  });

  test("getCardRegistry indexes by ID", () => {
    const registry = getCardRegistry();
    expect(registry.size).toBeGreaterThan(700);

    // Spot-check a known card
    const abandon = registry.get("unl-131-219");
    expect(abandon).toBeDefined();
    expect(abandon!.name).toBe("Abandon");
    expect(abandon!.cardType).toBe("spell");
  });

  test("unit cards have might", () => {
    const allCards = getAllCards();
    const units = allCards.filter((c) => c.cardType === "unit");
    expect(units.length).toBeGreaterThan(300);

    for (const unit of units) {
      if (unit.cardType === "unit") {
        expect(typeof unit.might).toBe("number");
      }
    }
  });

  test("spell cards have timing", () => {
    const allCards = getAllCards();
    const spells = allCards.filter((c) => c.cardType === "spell");
    expect(spells.length).toBeGreaterThan(100);

    for (const spell of spells) {
      if (spell.cardType === "spell") {
        expect(["action", "reaction"]).toContain(spell.timing);
      }
    }
  });

  test("rune cards have domain", () => {
    const allCards = getAllCards();
    const runes = allCards.filter((c) => c.cardType === "rune");
    expect(runes.length).toBe(6);

    for (const rune of runes) {
      if (rune.cardType === "rune") {
        expect(rune.domain).toBeDefined();
        expect(rune.isBasic).toBe(true);
      }
    }
  });

  test("legend cards have domain", () => {
    const allCards = getAllCards();
    const legends = allCards.filter((c) => c.cardType === "legend");
    expect(legends.length).toBeGreaterThan(30);

    for (const legend of legends) {
      if (legend.cardType === "legend") {
        expect(legend.domain).toBeDefined();
      }
    }
  });

  test("equipment cards are detected from gear", () => {
    const allCards = getAllCards();
    const equipment = allCards.filter((c) => c.cardType === "equipment");
    expect(equipment.length).toBeGreaterThan(0);

    for (const equip of equipment) {
      if (equip.cardType === "equipment") {
        expect(equip.rulesText).toContain("[Equip]");
      }
    }
  });

  test("cards have rulesText", () => {
    const allCards = getAllCards();
    const withText = allCards.filter((c) => c.rulesText && c.rulesText.length > 0);
    // Most cards should have rules text (runes may not)
    expect(withText.length).toBeGreaterThan(700);
  });

  test("no duplicate card IDs", () => {
    const allCards = getAllCards();
    const ids = allCards.map((c) => c.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  test("cards are enriched with parsed abilities", () => {
    const allCards = getAllCards();
    const withAbilities = allCards.filter((c) => c.abilities && c.abilities.length > 0);
    // At least 70% of cards with text should have abilities
    const withText = allCards.filter((c) => c.rulesText && c.rulesText.length > 0);
    const rate = (withAbilities.length / withText.length) * 100;
    console.log(
      `Cards with abilities: ${withAbilities.length}/${withText.length} (${rate.toFixed(1)}%)`,
    );
    expect(rate).toBeGreaterThan(70);
  });

  test("enrichment stats show parse rate", () => {
    const raw = getRawCards();
    const { stats } = enrichCardsWithStats(raw);
    console.log(`Enrichment: ${stats.enriched}/${stats.withText} (${stats.rate.toFixed(1)}%)`);
    expect(stats.enriched).toBeGreaterThan(0);
    expect(stats.rate).toBeGreaterThan(70);
  });

  test("Ahri, Alluring has a triggered ability", () => {
    const registry = getCardRegistry();
    const ahri = registry.get("ogn-066-298");
    expect(ahri).toBeDefined();
    expect(ahri!.abilities).toBeDefined();
    expect(ahri!.abilities!.length).toBeGreaterThan(0);
    expect(ahri!.abilities![0].type).toBe("triggered");
  });

  test("Tank keyword parsed correctly", () => {
    const allCards = getAllCards();
    const tankCards = allCards.filter((c) =>
      c.abilities?.some((a) => a.type === "keyword" && "keyword" in a && a.keyword === "Tank"),
    );
    expect(tankCards.length).toBeGreaterThan(0);
  });
});
