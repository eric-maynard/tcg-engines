/**
 * Riftbound Deck Validation Tests
 *
 * Tests for deck construction rules (rules 101-103).
 */

import { describe, expect, test } from "bun:test";
import type { Domain } from "@tcg/riftbound-types";
import {
  type BattlefieldCard,
  type Card,
  type LegendCard,
  type RuneCard,
  type UnitCard,
  createCardId,
} from "@tcg/riftbound-types/cards";
import { type DeckConfig, getLegendDomains, validateDeck } from "../validators/deck-validators";

// ============================================================================
// Test Helpers
// ============================================================================

let cardCounter = 0;

const nextId = (): string => {
  cardCounter++;
  return `test-card-${cardCounter}`;
};

const makeLegend = (overrides: Partial<LegendCard> = {}): LegendCard => ({
  cardType: "legend",
  championTag: "Warrior",
  domain: ["fury", "mind"] as Domain[],
  id: createCardId(nextId()),
  name: "Test Legend",
  ...overrides,
});

const makeChampion = (overrides: Partial<UnitCard> = {}): UnitCard => ({
  cardType: "unit",
  domain: "fury" as Domain,
  id: createCardId(nextId()),
  isChampion: true,
  might: 5,
  name: "Warrior, Champion",
  tags: ["Warrior"],
  ...overrides,
});

const makeUnit = (overrides: Partial<UnitCard> = {}): UnitCard => ({
  cardType: "unit",
  domain: "fury" as Domain,
  id: createCardId(nextId()),
  might: 3,
  name: `Unit ${cardCounter}`,
  ...overrides,
});

const makeSpell = (overrides: Partial<Card> = {}): Card =>
  ({
    cardType: "spell",
    domain: "fury" as Domain,
    id: createCardId(nextId()),
    name: `Spell ${cardCounter}`,
    timing: "action",
    ...overrides,
  }) as Card;

const makeRune = (overrides: Partial<RuneCard> = {}): RuneCard => ({
  cardType: "rune",
  domain: "fury" as Domain,
  id: createCardId(nextId()),
  isBasic: true,
  name: "Fury Rune",
  ...overrides,
});

const makeBattlefield = (overrides: Partial<BattlefieldCard> = {}): BattlefieldCard => ({
  cardType: "battlefield",
  domain: "fury" as Domain,
  id: createCardId(nextId()),
  name: "Test Battlefield",
  ...overrides,
});

/**
 * Create a main deck of N cards, all valid for the given domain.
 */
const makeMainDeck = (count: number, domain: Domain = "fury"): Card[] =>
  Array.from({ length: count }, (_unused, idx) => makeUnit({ domain, name: `Card ${idx + 1}` }));

/**
 * Create a rune deck of N cards, all valid for the given domain.
 */
const makeRuneDeck = (count: number, domain: Domain = "fury"): RuneCard[] =>
  Array.from({ length: count }, () => makeRune({ domain }));

/**
 * Create a valid deck config with sensible defaults.
 */
const makeValidConfig = (overrides: Partial<DeckConfig> = {}): DeckConfig => ({
  battlefields: [makeBattlefield(), makeBattlefield()],
  chosenChampion: makeChampion(),
  legend: makeLegend(),
  mainDeck: makeMainDeck(40),
  mode: "duel",
  runeDeck: makeRuneDeck(12),
  ...overrides,
});

// ============================================================================
// Tests
// ============================================================================

describe("Deck Validation", () => {
  describe("getLegendDomains", () => {
    test("returns array when legend has array domain", () => {
      const legend = makeLegend({ domain: ["fury", "mind"] });
      expect(getLegendDomains(legend)).toEqual(["fury", "mind"]);
    });

    test("wraps single domain in array", () => {
      const legend = makeLegend({ domain: "fury" as Domain });
      expect(getLegendDomains(legend)).toEqual(["fury"]);
    });
  });

  describe("valid deck", () => {
    test("accepts a fully valid deck", () => {
      const result = validateDeck(makeValidConfig());
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test("accepts a valid deck without mode specified", () => {
      const result = validateDeck(makeValidConfig({ mode: undefined }));
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test("accepts a deck with more than 40 cards", () => {
      const result = validateDeck(makeValidConfig({ mainDeck: makeMainDeck(60) }));
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("main deck size (rule 103.2)", () => {
    test("rejects deck with fewer than 40 cards", () => {
      const result = validateDeck(makeValidConfig({ mainDeck: makeMainDeck(39) }));
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ code: "MAIN_DECK_TOO_SMALL" }),
      );
    });

    test("rejects empty main deck", () => {
      const result = validateDeck(makeValidConfig({ mainDeck: [] }));
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ code: "MAIN_DECK_TOO_SMALL" }),
      );
    });

    test("accepts deck with exactly 40 cards", () => {
      const result = validateDeck(makeValidConfig({ mainDeck: makeMainDeck(40) }));
      const sizeErrors = result.errors.filter((err) => err.code === "MAIN_DECK_TOO_SMALL");
      expect(sizeErrors).toHaveLength(0);
    });
  });

  describe("copy limit (rule 103.2.b)", () => {
    test("rejects more than 3 copies of the same named card", () => {
      const deck = makeMainDeck(40);
      // Replace first 4 cards with same name
      for (let idx = 0; idx < 4; idx++) {
        deck[idx] = makeUnit({ domain: "fury", name: "Duplicate Card" });
      }

      const result = validateDeck(makeValidConfig({ mainDeck: deck }));
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: "TOO_MANY_COPIES",
          message: expect.stringContaining("Duplicate Card"),
        }),
      );
    });

    test("accepts exactly 3 copies of the same named card", () => {
      const deck = makeMainDeck(40);
      for (let idx = 0; idx < 3; idx++) {
        deck[idx] = makeUnit({ domain: "fury", name: "Triple Card" });
      }

      const result = validateDeck(makeValidConfig({ mainDeck: deck }));
      const copyErrors = result.errors.filter((err) => err.code === "TOO_MANY_COPIES");
      expect(copyErrors).toHaveLength(0);
    });

    test("allows 3 copies each of different-named cards for same character", () => {
      const deck = makeMainDeck(34);
      for (let idx = 0; idx < 3; idx++) {
        deck.push(makeUnit({ domain: "fury", name: "Yasuo, Remorseful" }));
      }
      for (let idx = 0; idx < 3; idx++) {
        deck.push(makeUnit({ domain: "fury", name: "Yasuo, Windrider" }));
      }

      const result = validateDeck(makeValidConfig({ mainDeck: deck }));
      const copyErrors = result.errors.filter((err) => err.code === "TOO_MANY_COPIES");
      expect(copyErrors).toHaveLength(0);
    });
  });

  describe("chosen champion (rule 103.2.a)", () => {
    test("rejects non-champion unit as chosen champion", () => {
      const champion = makeChampion({ isChampion: false });

      const result = validateDeck(makeValidConfig({ chosenChampion: champion }));
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ code: "CHAMPION_NOT_CHAMPION_UNIT" }),
      );
    });

    test("rejects champion without matching tag", () => {
      const legend = makeLegend({ championTag: "Jinx" });
      const champion = makeChampion({ tags: ["Annie"] });

      const result = validateDeck(makeValidConfig({ chosenChampion: champion, legend }));
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ code: "CHAMPION_TAG_MISMATCH" }),
      );
    });

    test("rejects champion with no tags", () => {
      const legend = makeLegend({ championTag: "Warrior" });
      const champion = makeChampion({ tags: undefined });

      const result = validateDeck(makeValidConfig({ chosenChampion: champion, legend }));
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ code: "CHAMPION_TAG_MISMATCH" }),
      );
    });

    test("accepts champion with matching tag among multiple tags", () => {
      const legend = makeLegend({ championTag: "Warrior" });
      const champion = makeChampion({ tags: ["Mech", "Warrior", "Human"] });

      const result = validateDeck(makeValidConfig({ chosenChampion: champion, legend }));
      const championErrors = result.errors.filter(
        (err) => err.code === "CHAMPION_TAG_MISMATCH" || err.code === "CHAMPION_NOT_CHAMPION_UNIT",
      );
      expect(championErrors).toHaveLength(0);
    });

    test("skips tag check when legend has no championTag", () => {
      const legend = makeLegend({ championTag: undefined });
      const champion = makeChampion({ tags: ["Anything"] });

      const result = validateDeck(makeValidConfig({ chosenChampion: champion, legend }));
      const tagErrors = result.errors.filter((err) => err.code === "CHAMPION_TAG_MISMATCH");
      expect(tagErrors).toHaveLength(0);
    });
  });

  describe("domain identity - main deck (rules 103.1.b, 103.2.c)", () => {
    test("rejects card with domain outside legend identity", () => {
      const legend = makeLegend({ domain: ["fury", "mind"] });
      const deck = makeMainDeck(39, "fury");
      deck.push(makeUnit({ domain: "calm" as Domain, name: "Calm Card" }));

      const result = validateDeck(makeValidConfig({ legend, mainDeck: deck }));
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ code: "DOMAIN_IDENTITY_VIOLATION" }),
      );
    });

    test("accepts single-domain card matching one legend domain", () => {
      const legend = makeLegend({ domain: ["fury", "mind"] });
      const deck = makeMainDeck(20, "fury");
      for (let idx = 0; idx < 20; idx++) {
        deck.push(
          makeUnit({
            domain: "mind" as Domain,
            name: `Mind Unit ${idx}`,
          }),
        );
      }

      const result = validateDeck(makeValidConfig({ legend, mainDeck: deck }));
      const domainErrors = result.errors.filter((err) => err.code === "DOMAIN_IDENTITY_VIOLATION");
      expect(domainErrors).toHaveLength(0);
    });

    test("accepts multi-domain card when all domains match legend", () => {
      const legend = makeLegend({ domain: ["fury", "mind", "body"] });
      const deck = makeMainDeck(39, "fury");
      deck.push(
        makeUnit({
          domain: ["fury", "mind"] as Domain[],
          name: "Multi-Domain Unit",
        }),
      );

      const result = validateDeck(makeValidConfig({ legend, mainDeck: deck }));
      const domainErrors = result.errors.filter((err) => err.code === "DOMAIN_IDENTITY_VIOLATION");
      expect(domainErrors).toHaveLength(0);
    });

    test("rejects multi-domain card when not all domains match legend", () => {
      const legend = makeLegend({ domain: ["fury", "mind"] });
      const deck = makeMainDeck(39, "fury");
      deck.push(
        makeUnit({
          domain: ["fury", "calm"] as Domain[],
          name: "Bad Multi-Domain",
        }),
      );

      const result = validateDeck(makeValidConfig({ legend, mainDeck: deck }));
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ code: "DOMAIN_IDENTITY_VIOLATION" }),
      );
    });

    test("accepts domain-neutral card (no domain)", () => {
      const legend = makeLegend({ domain: ["fury"] });
      const deck = makeMainDeck(39, "fury");
      deck.push(makeUnit({ domain: undefined, name: "Neutral Card" }));

      const result = validateDeck(makeValidConfig({ legend, mainDeck: deck }));
      const domainErrors = result.errors.filter((err) => err.code === "DOMAIN_IDENTITY_VIOLATION");
      expect(domainErrors).toHaveLength(0);
    });

    test("single-domain legend validates correctly", () => {
      const legend = makeLegend({ domain: "fury" as Domain });
      const deck = makeMainDeck(40, "fury");

      const result = validateDeck(makeValidConfig({ legend, mainDeck: deck }));
      const domainErrors = result.errors.filter((err) => err.code === "DOMAIN_IDENTITY_VIOLATION");
      expect(domainErrors).toHaveLength(0);
    });
  });

  describe("signature card limit (rule 103.2.d)", () => {
    test("rejects more than 3 signature cards with champion tag", () => {
      const legend = makeLegend({ championTag: "Jinx" });
      const deck = makeMainDeck(36, "fury");
      // Add 4 non-champion cards with the Jinx tag (signature cards)
      for (let idx = 0; idx < 4; idx++) {
        deck.push(
          makeUnit({
            domain: "fury",
            isChampion: false,
            name: `Jinx Signature ${idx}`,
            tags: ["Jinx"],
          }),
        );
      }

      const result = validateDeck(makeValidConfig({ legend, mainDeck: deck }));
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ code: "TOO_MANY_SIGNATURE_CARDS" }),
      );
    });

    test("accepts exactly 3 signature cards", () => {
      const legend = makeLegend({ championTag: "Jinx" });
      const deck = makeMainDeck(37, "fury");
      for (let idx = 0; idx < 3; idx++) {
        deck.push(
          makeUnit({
            domain: "fury",
            isChampion: false,
            name: `Jinx Signature ${idx}`,
            tags: ["Jinx"],
          }),
        );
      }

      const result = validateDeck(makeValidConfig({ legend, mainDeck: deck }));
      const sigErrors = result.errors.filter((err) => err.code === "TOO_MANY_SIGNATURE_CARDS");
      expect(sigErrors).toHaveLength(0);
    });

    test("does not count champion units as signature cards", () => {
      const legend = makeLegend({ championTag: "Jinx" });
      const deck = makeMainDeck(36, "fury");
      // 3 signature (non-champion) cards
      for (let idx = 0; idx < 3; idx++) {
        deck.push(
          makeUnit({
            domain: "fury",
            isChampion: false,
            name: `Jinx Helper ${idx}`,
            tags: ["Jinx"],
          }),
        );
      }
      // 1 champion unit with the same tag - should NOT count
      deck.push(
        makeUnit({
          domain: "fury",
          isChampion: true,
          name: "Jinx, Rebel",
          tags: ["Jinx"],
        }),
      );

      const result = validateDeck(makeValidConfig({ legend, mainDeck: deck }));
      const sigErrors = result.errors.filter((err) => err.code === "TOO_MANY_SIGNATURE_CARDS");
      expect(sigErrors).toHaveLength(0);
    });

    test("counts signature spells toward the limit", () => {
      const legend = makeLegend({ championTag: "Annie" });
      const deck = makeMainDeck(36, "fury");
      // 4 spell cards with Annie tag
      for (let idx = 0; idx < 4; idx++) {
        deck.push(
          makeSpell({
            domain: "fury",
            name: `Annie Spell ${idx}`,
            tags: ["Annie"],
          }),
        );
      }

      const result = validateDeck(makeValidConfig({ legend, mainDeck: deck }));
      expect(result.errors).toContainEqual(
        expect.objectContaining({ code: "TOO_MANY_SIGNATURE_CARDS" }),
      );
    });

    test("skips signature check when legend has no championTag", () => {
      const legend = makeLegend({ championTag: undefined });
      const deck = makeMainDeck(36, "fury");
      for (let idx = 0; idx < 5; idx++) {
        deck.push(
          makeUnit({
            domain: "fury",
            name: `Tagged Unit ${idx}`,
            tags: ["SomeTag"],
          }),
        );
      }

      const result = validateDeck(makeValidConfig({ legend, mainDeck: deck }));
      const sigErrors = result.errors.filter((err) => err.code === "TOO_MANY_SIGNATURE_CARDS");
      expect(sigErrors).toHaveLength(0);
    });
  });

  describe("rune deck size (rule 103.3.a)", () => {
    test("rejects rune deck with fewer than 12 cards", () => {
      const result = validateDeck(makeValidConfig({ runeDeck: makeRuneDeck(11) }));
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ code: "RUNE_DECK_WRONG_SIZE" }),
      );
    });

    test("rejects rune deck with more than 12 cards", () => {
      const result = validateDeck(makeValidConfig({ runeDeck: makeRuneDeck(13) }));
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ code: "RUNE_DECK_WRONG_SIZE" }),
      );
    });

    test("accepts rune deck with exactly 12 cards", () => {
      const result = validateDeck(makeValidConfig({ runeDeck: makeRuneDeck(12) }));
      const runeErrors = result.errors.filter((err) => err.code === "RUNE_DECK_WRONG_SIZE");
      expect(runeErrors).toHaveLength(0);
    });
  });

  describe("rune deck domain identity (rule 103.3.a.1)", () => {
    test("rejects rune with domain outside legend identity", () => {
      const legend = makeLegend({ domain: ["fury", "mind"] });
      const runeDeck = makeRuneDeck(11, "fury");
      runeDeck.push(makeRune({ domain: "calm" as Domain }));

      const result = validateDeck(makeValidConfig({ legend, runeDeck }));
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ code: "RUNE_DOMAIN_VIOLATION" }),
      );
    });

    test("accepts runes matching any domain in legend identity", () => {
      const legend = makeLegend({ domain: ["fury", "mind"] });
      const runeDeck = [...makeRuneDeck(6, "fury"), ...makeRuneDeck(6, "mind")];

      const result = validateDeck(makeValidConfig({ legend, runeDeck }));
      const runeErrors = result.errors.filter((err) => err.code === "RUNE_DOMAIN_VIOLATION");
      expect(runeErrors).toHaveLength(0);
    });
  });

  describe("battlefield domain identity (rule 103.4.b)", () => {
    test("rejects battlefield with domain outside legend identity", () => {
      const legend = makeLegend({ domain: ["fury", "mind"] });
      const battlefields = [
        makeBattlefield({ domain: "fury" as Domain }),
        makeBattlefield({ domain: "calm" as Domain }),
      ];

      const result = validateDeck(makeValidConfig({ battlefields, legend }));
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ code: "BATTLEFIELD_DOMAIN_VIOLATION" }),
      );
    });

    test("accepts battlefields matching legend domains", () => {
      const legend = makeLegend({ domain: ["fury", "mind"] });
      const battlefields = [
        makeBattlefield({ domain: "fury" as Domain }),
        makeBattlefield({ domain: "mind" as Domain }),
      ];

      const result = validateDeck(makeValidConfig({ battlefields, legend }));
      const bfErrors = result.errors.filter((err) => err.code === "BATTLEFIELD_DOMAIN_VIOLATION");
      expect(bfErrors).toHaveLength(0);
    });

    test("accepts domain-neutral battlefield", () => {
      const legend = makeLegend({ domain: ["fury"] });
      const battlefields = [
        makeBattlefield({ domain: undefined }),
        makeBattlefield({ domain: "fury" as Domain }),
      ];

      const result = validateDeck(makeValidConfig({ battlefields, legend }));
      const bfErrors = result.errors.filter((err) => err.code === "BATTLEFIELD_DOMAIN_VIOLATION");
      expect(bfErrors).toHaveLength(0);
    });
  });

  describe("battlefield count", () => {
    test("rejects wrong battlefield count for duel mode", () => {
      const result = validateDeck(
        makeValidConfig({
          battlefields: [makeBattlefield()],
          mode: "duel",
        }),
      );
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ code: "WRONG_BATTLEFIELD_COUNT" }),
      );
    });

    test("requires 3 battlefields for ffa3", () => {
      const result = validateDeck(
        makeValidConfig({
          battlefields: [makeBattlefield(), makeBattlefield(), makeBattlefield()],
          mode: "ffa3",
        }),
      );
      const countErrors = result.errors.filter((err) => err.code === "WRONG_BATTLEFIELD_COUNT");
      expect(countErrors).toHaveLength(0);
    });

    test("requires 4 battlefields for ffa4", () => {
      const result = validateDeck(
        makeValidConfig({
          battlefields: [makeBattlefield(), makeBattlefield()],
          mode: "ffa4",
        }),
      );
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: "WRONG_BATTLEFIELD_COUNT",
          message: expect.stringContaining("4"),
        }),
      );
    });

    test("requires 3 battlefields for magmaChamber", () => {
      const result = validateDeck(
        makeValidConfig({
          battlefields: [makeBattlefield(), makeBattlefield(), makeBattlefield()],
          mode: "magmaChamber",
        }),
      );
      const countErrors = result.errors.filter((err) => err.code === "WRONG_BATTLEFIELD_COUNT");
      expect(countErrors).toHaveLength(0);
    });

    test("skips battlefield count check when no mode specified", () => {
      const result = validateDeck(
        makeValidConfig({
          battlefields: [makeBattlefield()],
          mode: undefined,
        }),
      );
      const countErrors = result.errors.filter((err) => err.code === "WRONG_BATTLEFIELD_COUNT");
      expect(countErrors).toHaveLength(0);
    });
  });

  describe("multiple errors", () => {
    test("reports all errors, not just the first", () => {
      const legend = makeLegend({ championTag: "Warrior", domain: ["fury"] });
      const champion = makeChampion({
        isChampion: false,
        tags: ["Mage"],
      });

      const result = validateDeck({
        battlefields: [],
        chosenChampion: champion,
        legend,
        mainDeck: makeMainDeck(10),
        mode: "duel",
        runeDeck: makeRuneDeck(5),
      });

      expect(result.valid).toBe(false);
      // Expects: deck too small, not champion, tag mismatch,
      // Wrong rune count, wrong battlefield count
      expect(result.errors.length).toBeGreaterThanOrEqual(5);

      const codes = result.errors.map((err) => err.code);
      expect(codes).toContain("MAIN_DECK_TOO_SMALL");
      expect(codes).toContain("CHAMPION_NOT_CHAMPION_UNIT");
      expect(codes).toContain("CHAMPION_TAG_MISMATCH");
      expect(codes).toContain("RUNE_DECK_WRONG_SIZE");
      expect(codes).toContain("WRONG_BATTLEFIELD_COUNT");
    });
  });

  describe("edge cases", () => {
    test("handles legend with single domain (not array)", () => {
      const legend = makeLegend({ domain: "body" as Domain });
      const champion = makeChampion({
        domain: "body" as Domain,
        tags: ["Warrior"],
      });
      const deck = makeMainDeck(40, "body");
      const runeDeck = makeRuneDeck(12, "body");
      const battlefields = [
        makeBattlefield({ domain: "body" as Domain }),
        makeBattlefield({ domain: "body" as Domain }),
      ];

      const result = validateDeck({
        battlefields,
        chosenChampion: champion,
        legend,
        mainDeck: deck,
        mode: "duel",
        runeDeck,
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test("handles mixed card types in main deck", () => {
      const legend = makeLegend({ domain: ["fury", "mind"] });
      const deck: Card[] = [
        ...Array.from({ length: 15 }, (_unused, idx) =>
          makeUnit({ domain: "fury" as Domain, name: `Unit ${idx}` }),
        ),
        ...Array.from({ length: 15 }, (_unused, idx) =>
          makeSpell({ domain: "mind" as Domain, name: `Spell ${idx}` }),
        ),
        ...Array.from({ length: 10 }, (_unused, idx) => ({
          cardType: "gear" as const,
          domain: "fury" as Domain,
          id: createCardId(nextId()),
          name: `Gear ${idx}`,
        })),
      ];

      const result = validateDeck(makeValidConfig({ legend, mainDeck: deck }));
      const domainErrors = result.errors.filter((err) => err.code === "DOMAIN_IDENTITY_VIOLATION");
      expect(domainErrors).toHaveLength(0);
    });

    test("error messages include helpful card names", () => {
      const legend = makeLegend({ domain: ["fury"] });
      const deck = makeMainDeck(39, "fury");
      deck.push(makeUnit({ domain: "mind" as Domain, name: "Ethereal Scholar" }));

      const result = validateDeck(makeValidConfig({ legend, mainDeck: deck }));
      const domainError = result.errors.find((err) => err.code === "DOMAIN_IDENTITY_VIOLATION");
      expect(domainError).toBeDefined();
      expect(domainError!.message).toContain("Ethereal Scholar");
    });
  });
});
