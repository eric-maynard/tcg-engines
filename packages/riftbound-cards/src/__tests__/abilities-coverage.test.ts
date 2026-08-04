/**
 * Static coverage: every card whose rulesText describes behavior must have a
 * non-empty abilities[]. A card with rulesText but abilities:[] silently does
 * nothing at runtime — the class of bug where Traveling Merchant's "When I
 * move, discard 1" never fires.
 */
import { describe, expect, test } from "bun:test";
import { getAllCards } from "../data/all-cards";

describe("abilities coverage", () => {
  const cards = getAllCards();

  test("every card with behavioral rulesText has abilities[]", () => {
    const gaps = cards.filter((c) => {
      if (!c.rulesText?.trim()) return false;
      // Pure keyword tags like "[Tank]" are handled by the keyword system, not
      // abilities[]. Anything with a trigger word or a cost colon is behavioral.
      const behavioral = /\bwhen\b|\bwhenever\b|\bat the\b|\bif\b|:/i.test(c.rulesText);
      if (!behavioral && /^\s*\[/.test(c.rulesText)) return false;
      return !c.abilities || c.abilities.length === 0;
    });
    // Log the full gap list so CI output is actionable.
    for (const c of gaps) {
      // eslint-disable-next-line no-console
      console.log(`  ${c.id}  ${c.name}: "${(c.rulesText || "").replace(/\n/g, " | ")}"`);
    }
    expect(gaps.length, `${gaps.length} cards have rulesText but no abilities[]`).toBe(0);
  });
});
