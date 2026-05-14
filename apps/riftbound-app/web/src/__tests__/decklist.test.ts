/**
 * Decklist parser / formatter / validator unit tests.
 *
 * Uses a small synthetic card pool — keeps the test deterministic and
 * independent of the real card JSON (which may change between sets).
 *
 * The module under test lives in `apps/riftbound-app/src/decklist.ts`
 * (server-side TS). We import it via a relative path so the same code path
 * the Bun server exercises is what's tested here.
 */
import { describe, expect, test } from "vitest";
import type { Card } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";
import { formatDecklist, parseDecklist, validateDeck } from "../../../src/decklist";

function makeCard(
  id: string,
  name: string,
  cardType: Card["cardType"],
  extra: Partial<Card> = {},
): Card {
  return {
    cardType,
    id: createCardId(id),
    name,
    ...extra,
  } as Card;
}

const POOL: Card[] = [
  makeCard("legend-trundle", "Trundle", "legend"),
  makeCard("bf-altar", "Altar to Unity", "battlefield"),
  makeCard("bf-climb", "Aspirant's Climb", "battlefield"),
  makeCard("unit-enforcer", "Chemtech Enforcer", "unit", { might: 4 } as Partial<Card>),
  makeCard("spell-sabotage", "Sabotage", "spell"),
  makeCard("rune-body", "Body Rune", "rune"),
  makeCard("rune-mind", "Mind Rune", "rune"),
];

const FULL_DECKLIST = `# Test Deck

## Legends
1 Trundle

## Battlefields
3 Altar to Unity
3 Aspirant's Climb

## Main Deck
3 Chemtech Enforcer
2 Sabotage

## Rune Deck
6 Body Rune
6 Mind Rune
`;

describe("parseDecklist", () => {
  test("parses a well-formed decklist", () => {
    const out = parseDecklist(FULL_DECKLIST, POOL);
    expect(out.name).toBe("Test Deck");
    expect(out.legendId).toBe("legend-trundle");
    expect(out.warnings).toEqual([]);

    const bfs = out.cards.filter((c) => c.zone === "battlefield");
    expect(bfs).toHaveLength(2);
    expect(bfs[0].quantity).toBe(3);

    const mains = out.cards.filter((c) => c.zone === "main");
    expect(mains.map((c) => c.cardId)).toContain("unit-enforcer");
    expect(mains.map((c) => c.cardId)).toContain("spell-sabotage");

    const runes = out.cards.filter((c) => c.zone === "rune");
    expect(runes).toHaveLength(2);
    const total = runes.reduce((a, c) => a + c.quantity, 0);
    expect(total).toBe(12);
  });

  test("treats `3x Card`, `3 x Card`, and `3× Card` the same as `3 Card`", () => {
    const text = `# T\n## Main Deck\n3x Chemtech Enforcer\n2× Sabotage\n`;
    const out = parseDecklist(text, POOL);
    const quantities = out.cards.map((c) => c.quantity).toSorted();
    expect(quantities).toEqual([2, 3]);
  });

  test("records warnings for unknown card names without crashing", () => {
    const text = `# T\n## Main Deck\n3 Unknown Card\n2 Sabotage\n`;
    const out = parseDecklist(text, POOL);
    expect(out.warnings.length).toBeGreaterThan(0);
    expect(out.warnings[0]).toContain("Unknown Card");
    expect(out.cards).toHaveLength(1);
    expect(out.cards[0].cardId).toBe("spell-sabotage");
  });

  test("accepts card ids in addition to names", () => {
    const text = `# T\n## Main Deck\n2 unit-enforcer\n`;
    const out = parseDecklist(text, POOL);
    expect(out.cards).toHaveLength(1);
    expect(out.cards[0].cardId).toBe("unit-enforcer");
  });

  test("ignores comments and blank lines", () => {
    const text = `# T\n// header comment\n\n## Main Deck\n; section comment\n1 Sabotage\n`;
    const out = parseDecklist(text, POOL);
    expect(out.cards).toHaveLength(1);
  });
});

describe("formatDecklist", () => {
  test("round-trips a parsed deck to the canonical format", () => {
    const parsed = parseDecklist(FULL_DECKLIST, POOL);
    const formatted = formatDecklist(
      { cards: parsed.cards, championId: null, legendId: parsed.legendId, name: parsed.name },
      POOL,
    );
    const reparsed = parseDecklist(formatted, POOL);
    expect(reparsed.legendId).toBe("legend-trundle");
    expect(reparsed.cards.filter((c) => c.zone === "main")).toHaveLength(2);
    expect(reparsed.cards.filter((c) => c.zone === "rune")).toHaveLength(2);
    expect(reparsed.cards.filter((c) => c.zone === "battlefield")).toHaveLength(2);
  });

  test("renders unknown card ids verbatim", () => {
    const text = formatDecklist(
      {
        cards: [{ cardId: "mystery-card", quantity: 2, zone: "main" }],
        championId: null,
        legendId: null,
        name: "Mystery",
      },
      POOL,
    );
    expect(text).toContain("2 mystery-card");
  });
});

describe("validateDeck", () => {
  test("accepts a well-formed deck", () => {
    const cards: { cardId: string; quantity: number; zone: "main" | "rune" | "battlefield" | "sideboard" }[] = [
      { cardId: "bf-altar", quantity: 3, zone: "battlefield" },
      { cardId: "bf-climb", quantity: 3, zone: "battlefield" },
      { cardId: "unit-enforcer", quantity: 3, zone: "main" },
      { cardId: "spell-sabotage", quantity: 3, zone: "main" },
    ];
    for (let i = 0; i < 34; i++) {
      cards.push({ cardId: `pad-${i}`, quantity: 1, zone: "main" });
    }
    cards.push({ cardId: "rune-body", quantity: 6, zone: "rune" });
    cards.push({ cardId: "rune-mind", quantity: 6, zone: "rune" });

    const result = validateDeck(
      { cards, championId: null, legendId: "legend-trundle", name: "ok" },
      POOL,
    );
    expect(result.mainCount).toBe(40);
    expect(result.runeCount).toBe(12);
    expect(result.errors).toEqual([]);
  });

  test("rejects too-few main cards and missing legend", () => {
    const result = validateDeck(
      {
        cards: [{ cardId: "unit-enforcer", quantity: 1, zone: "main" }],
        championId: null,
        legendId: null,
        name: "bad",
      },
      POOL,
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("legend"))).toBe(true);
    expect(result.errors.some((e) => e.includes("Main deck"))).toBe(true);
  });

  test("rejects > 3 copies of a non-rune card", () => {
    const result = validateDeck(
      {
        cards: [{ cardId: "unit-enforcer", quantity: 4, zone: "main" }],
        championId: null,
        legendId: "legend-trundle",
        name: "x",
      },
      POOL,
    );
    expect(result.errors.some((e) => e.includes("Too many copies"))).toBe(true);
  });
});
