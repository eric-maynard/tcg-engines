/**
 * Parser Coverage Tests
 *
 * Measures parse success rate across ALL real cards.
 */

import { describe, expect, test } from "bun:test";
import { getAllCards } from "../data";
import { parseAbilities } from "../parser";

describe("Parser: Full Card Coverage", () => {
  test("measures parse rate across all cards with rules text", () => {
    const allCards = getAllCards();
    const cardsWithText = allCards.filter((c) => c.rulesText && c.rulesText.length > 0);

    let successes = 0;
    let failures = 0;
    const failedCards: { name: string; text: string; error?: string }[] = [];

    for (const card of cardsWithText) {
      const result = parseAbilities(card.rulesText!);
      if (result.success) {
        successes++;
      } else {
        failures++;
        if (failedCards.length < 20) {
          failedCards.push({
            error: result.error,
            name: card.name,
            text: card.rulesText!.slice(0, 100),
          });
        }
      }
    }

    const total = cardsWithText.length;
    const rate = (successes / total) * 100;

    console.log(`\n=== Parser Coverage ===`);
    console.log(`Total cards with text: ${total}`);
    console.log(`Successfully parsed: ${successes} (${rate.toFixed(1)}%)`);
    console.log(`Failed: ${failures}`);

    if (failedCards.length > 0) {
      console.log(`\nSample failures:`);
      for (const fc of failedCards.slice(0, 10)) {
        console.log(`  ${fc.name}: ${fc.text}...`);
      }
    }

    // Expect at least 60% parse rate
    expect(rate).toBeGreaterThan(60);
  });

  test("parses by card type breakdown", () => {
    const allCards = getAllCards();
    const byType: Record<string, { total: number; parsed: number }> = {};

    for (const card of allCards) {
      if (!card.rulesText || card.rulesText.length === 0) {
        continue;
      }

      if (!byType[card.cardType]) {
        byType[card.cardType] = { parsed: 0, total: 0 };
      }
      byType[card.cardType].total++;

      const result = parseAbilities(card.rulesText);
      if (result.success) {
        byType[card.cardType].parsed++;
      }
    }

    console.log(`\n=== Parse Rate by Card Type ===`);
    for (const [type, stats] of Object.entries(byType).toSorted()) {
      const rate = ((stats.parsed / stats.total) * 100).toFixed(1);
      console.log(`  ${type}: ${stats.parsed}/${stats.total} (${rate}%)`);
    }

    // All types should have some parse success
    for (const stats of Object.values(byType)) {
      expect(stats.parsed).toBeGreaterThan(0);
    }
  });
});
