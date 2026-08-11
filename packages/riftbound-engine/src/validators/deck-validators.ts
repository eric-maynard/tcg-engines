/**
 * Riftbound Deck Validators
 *
 * Validates deck construction according to Riftbound rules 101-103.
 *
 * Rules enforced:
 * - 103.1: 1 Champion Legend dictating Domain Identity
 * - 103.1.b: Domain Identity matching for main deck cards
 * - 103.2: Main Deck of at least 40 cards
 * - 103.2.a: Chosen Champion must be a champion unit matching legend tag
 * - 103.2.b: Max 3 copies of same named card
 * - 103.2.d: Max 3 Signature cards matching champion tag
 * - 103.3.a: Exactly 12 rune cards in rune deck
 * - 103.3.a.1: Rune domain must match chosen champion's domain
 * - 103.4.b: Battlefields subject to domain identity
 */

import type {
  BattlefieldCard,
  Card,
  LegendCard,
  RuneCard,
  UnitCard,
} from "@tcg/riftbound-types/cards";
import type { Domain } from "@tcg/riftbound-types";

// ============================================================================
// Types
// ============================================================================

/**
 * Result of deck validation
 */
export interface DeckValidationResult {
  readonly valid: boolean;
  readonly errors: DeckValidationError[];
}

/**
 * A single deck validation error
 */
export interface DeckValidationError {
  readonly code: string;
  readonly message: string;
}

/**
 * Game mode determining battlefield count
 */
export type GameMode = "duel" | "match" | "ffa3" | "ffa4" | "magmaChamber";

/**
 * Configuration for deck validation
 */
export interface DeckConfig {
  readonly legend: LegendCard;
  readonly chosenChampion: UnitCard;
  readonly mainDeck: Card[];
  readonly runeDeck: RuneCard[];
  readonly battlefields: BattlefieldCard[];
  readonly mode?: GameMode;
}

// ============================================================================
// Constants
// ============================================================================

/** Minimum number of cards in the main deck (rule 103.2) */
const MIN_MAIN_DECK_SIZE = 40;

/** Maximum copies of a single named card (rule 103.2.b) */
const MAX_COPIES_PER_NAME = 3;

/** Maximum copies of a card printing [Unique] (rule 825.3.a) */
const MAX_UNIQUE_COPIES = 1;

/** The [Unique] keyword's printed name */
const UNIQUE_KEYWORD = "Unique";

/** Maximum total signature cards with champion tag (rule 103.2.d) */
const MAX_SIGNATURE_CARDS = 3;

/** Exact number of rune cards required (rule 103.3.a) */
const RUNE_DECK_SIZE = 12;

/** Initial count for card name tracking */
const INITIAL_COUNT = 0;

/** Increment for counting */
const COUNT_INCREMENT = 1;

/** No errors constant */
const NO_ERRORS = 0;

/**
 * Required battlefield count per game mode — how many the DECK provides, not how
 * many end up in play.
 * rule 485.4.a / 486.4.a: a duel/match deck provides 3 battlefields; only 2 of them
 * are put into play (rule 485.4), so the deck count is 3, never 2.
 * rule 488.4.a / 489.4.a: multiplayer decks likewise provide three; a mode's
 * "Battlefield Count" is how many end up in play, and 488.4.b's removal of the
 * first player's three is a setup step, not a deck-construction reduction.
 */
const BATTLEFIELD_COUNT_BY_MODE: Record<GameMode, number> = {
  duel: 3,
  ffa3: 3,
  ffa4: 3,
  magmaChamber: 3,
  match: 3,
};

// ============================================================================
// Domain Identity Helpers
// ============================================================================

/**
 * Extract the set of domains from a legend card's domain field.
 *
 * @param legend - The champion legend card
 * @returns Array of domains representing the deck's domain identity
 */
export const getLegendDomains = (legend: LegendCard): Domain[] => {
  if (Array.isArray(legend.domain)) {
    return legend.domain;
  }
  return [legend.domain];
};

/**
 * Get the domains for a card (if it has domain identity).
 *
 * @param card - Any card
 * @returns Array of domains, or empty array if the card has no domain
 */
const getCardDomains = (card: Card): Domain[] => {
  if (card.domain === undefined) {
    return [];
  }
  if (Array.isArray(card.domain)) {
    return card.domain;
  }
  return [card.domain];
};

/**
 * Check if a card's domain identity fits within the legend's domain identity.
 *
 * Rules 103.1.b.3-4:
 * - Single-domain card: permitted if that domain is in the legend's identity
 * - Multi-domain card: ALL domains must be in the legend's identity
 *
 * Cards with no domain are always permitted (domain-neutral).
 *
 * @param cardDomains - The card's domain(s)
 * @param legendDomains - The legend's domain identity
 * @returns True if the card is permitted
 */
const matchesDomainIdentity = (cardDomains: Domain[], legendDomains: Domain[]): boolean => {
  if (cardDomains.length === NO_ERRORS) {
    return true;
  }
  return cardDomains.every((domain) => legendDomains.includes(domain));
};

// ============================================================================
// Signature Card Helper
// ============================================================================

/**
 * Count the number of signature cards in the main deck.
 *
 * Signature cards are non-champion cards that share the champion tag
 * of the legend (rule 103.2.d.3: Signature cards are NOT champion units).
 */
const countSignatureCards = (mainDeck: Card[], championTag: string): number => {
  let count = INITIAL_COUNT;

  for (const card of mainDeck) {
    const isChampionUnit = card.cardType === "unit" && (card as UnitCard).isChampion;
    const hasChampionTag = card.tags?.includes(championTag) ?? false;

    if (!isChampionUnit && hasChampionTag) {
      count += COUNT_INCREMENT;
    }
  }

  return count;
};

// ============================================================================
// Individual Validators
// ============================================================================

/**
 * Validate main deck minimum size (rule 103.2)
 */
const validateMainDeckSize = (mainDeck: Card[]): DeckValidationError[] => {
  if (mainDeck.length < MIN_MAIN_DECK_SIZE) {
    return [
      {
        code: "MAIN_DECK_TOO_SMALL",
        message: `Main deck must contain at least ${MIN_MAIN_DECK_SIZE} cards, but has ${mainDeck.length}`,
      },
    ];
  }
  return [];
};

/**
 * Validate max 3 copies of same named card (rule 103.2.b)
 */
const validateCopyLimit = (mainDeck: Card[]): DeckValidationError[] => {
  const errors: DeckValidationError[] = [];
  const nameCounts = new Map<string, number>();

  for (const card of mainDeck) {
    const count = (nameCounts.get(card.name) ?? INITIAL_COUNT) + COUNT_INCREMENT;
    nameCounts.set(card.name, count);
  }

  for (const [name, count] of nameCounts) {
    if (count > MAX_COPIES_PER_NAME) {
      errors.push({
        code: "TOO_MANY_COPIES",
        message: `Card "${name}" has ${count} copies, but maximum is ${MAX_COPIES_PER_NAME}`,
      });
    }
  }

  return errors;
};

/**
 * Does this card print the [Unique] keyword? Keywords live either flat on
 * `keywords` or as `{ type: "keyword" }` abilities.
 */
const isUnique = (card: Card): boolean => {
  const flat = (card as { keywords?: string[] }).keywords ?? [];
  if (flat.includes(UNIQUE_KEYWORD)) {
    return true;
  }
  const abilities = (card as { abilities?: { keyword?: string; type?: string }[] }).abilities ?? [];
  return abilities.some((a) => a.type === "keyword" && a.keyword === UNIQUE_KEYWORD);
};

/**
 * Validate the [Unique] deck-construction limit.
 *
 * rule 825.3.a: a deck may contain only ONE card with the name of a Unique card.
 * rule 825.4: Unique has no effect during gameplay — construction only.
 */
const validateUniqueLimit = (mainDeck: Card[]): DeckValidationError[] => {
  const errors: DeckValidationError[] = [];
  const uniqueNames = new Set<string>();
  const nameCounts = new Map<string, number>();

  for (const card of mainDeck) {
    nameCounts.set(card.name, (nameCounts.get(card.name) ?? INITIAL_COUNT) + COUNT_INCREMENT);
    if (isUnique(card)) {
      uniqueNames.add(card.name);
    }
  }

  for (const name of uniqueNames) {
    const count = nameCounts.get(name) ?? INITIAL_COUNT;
    if (count > MAX_UNIQUE_COPIES) {
      errors.push({
        code: "TOO_MANY_UNIQUE_COPIES",
        message: `Card "${name}" is [Unique]: a deck may contain only ${MAX_UNIQUE_COPIES} card with that name, but has ${count}`,
      });
    }
  }

  return errors;
};

/**
 * Validate chosen champion matches legend's champion tag (rule 103.2.a.2)
 */
const validateChosenChampion =(champion: UnitCard, legend: LegendCard): DeckValidationError[] => {
  const errors: DeckValidationError[] = [];

  if (!champion.isChampion) {
    errors.push({
      code: "CHAMPION_NOT_CHAMPION_UNIT",
      message: `Chosen champion "${champion.name}" must be a champion unit (isChampion must be true)`,
    });
  }

  if (legend.championTag) {
    const hasMatchingTag = champion.tags?.includes(legend.championTag) ?? false;
    if (!hasMatchingTag) {
      errors.push({
        code: "CHAMPION_TAG_MISMATCH",
        message: `Chosen champion "${champion.name}" must have tag "${legend.championTag}" matching the champion legend`,
      });
    }
  }

  return errors;
};

/**
 * Validate domain identity for main deck cards (rules 103.1.b, 103.2.c)
 */
const validateMainDeckDomainIdentity = (
  mainDeck: Card[],
  legendDomains: Domain[],
): DeckValidationError[] => {
  const errors: DeckValidationError[] = [];

  for (const card of mainDeck) {
    const cardDomains = getCardDomains(card);
    if (!matchesDomainIdentity(cardDomains, legendDomains)) {
      errors.push({
        code: "DOMAIN_IDENTITY_VIOLATION",
        message: `Card "${card.name}" has domain [${cardDomains.join(", ")}] which does not fit within legend's domain identity [${legendDomains.join(", ")}]`,
      });
    }
  }

  return errors;
};

/**
 * Validate signature card limit (rule 103.2.d)
 *
 * Signature cards are non-champion cards that share the champion tag
 * of the legend. Max 3 total regardless of name.
 */
const validateSignatureLimit = (mainDeck: Card[], legend: LegendCard): DeckValidationError[] => {
  if (!legend.championTag) {
    return [];
  }

  const signatureCount = countSignatureCards(mainDeck, legend.championTag);

  if (signatureCount > MAX_SIGNATURE_CARDS) {
    return [
      {
        code: "TOO_MANY_SIGNATURE_CARDS",
        message: `Deck contains ${signatureCount} signature cards with tag "${legend.championTag}", but maximum is ${MAX_SIGNATURE_CARDS}`,
      },
    ];
  }

  return [];
};

/**
 * Validate that every Signature card carries the legend's champion tag.
 *
 * rule 103.2.d.2: a Signature card may only be included in a deck whose
 * Champion Legend shares its champion tag.
 */
const validateSignatureTags = (mainDeck: Card[], legend: LegendCard): DeckValidationError[] => {
  const errors: DeckValidationError[] = [];

  for (const card of mainDeck) {
    if (card.isSignature !== true) {
      continue;
    }
    const hasChampionTag =
      legend.championTag !== undefined && (card.tags?.includes(legend.championTag) ?? false);
    if (!hasChampionTag) {
      errors.push({
        code: "SIGNATURE_TAG_MISMATCH",
        message: `Signature card "${card.name}" does not carry the legend's champion tag "${legend.championTag ?? ""}"`,
      });
    }
  }

  return errors;
};

/**
 * Validate rune deck size (rule 103.3.a)
 */
const validateRuneDeckSize = (runeDeck: RuneCard[]): DeckValidationError[] => {
  if (runeDeck.length !== RUNE_DECK_SIZE) {
    return [
      {
        code: "RUNE_DECK_WRONG_SIZE",
        message: `Rune deck must contain exactly ${RUNE_DECK_SIZE} cards, but has ${runeDeck.length}`,
      },
    ];
  }
  return [];
};

/**
 * Validate rune deck domain identity (rule 103.3.a.1)
 *
 * Runes must match the chosen champion's domain identity.
 * The chosen champion's domain is part of the legend's domain identity.
 */
const validateRuneDeckDomainIdentity = (
  runeDeck: RuneCard[],
  legendDomains: Domain[],
): DeckValidationError[] => {
  const errors: DeckValidationError[] = [];

  for (const rune of runeDeck) {
    if (!legendDomains.includes(rune.domain)) {
      errors.push({
        code: "RUNE_DOMAIN_VIOLATION",
        message: `Rune "${rune.name}" has domain "${rune.domain}" which is not in the legend's domain identity [${legendDomains.join(", ")}]`,
      });
    }
  }

  return errors;
};

/**
 * Validate battlefield domain identity (rule 103.4.b)
 */
const validateBattlefieldDomainIdentity = (
  battlefields: BattlefieldCard[],
  legendDomains: Domain[],
): DeckValidationError[] => {
  const errors: DeckValidationError[] = [];

  for (const battlefield of battlefields) {
    const bfDomains = getCardDomains(battlefield);
    if (!matchesDomainIdentity(bfDomains, legendDomains)) {
      errors.push({
        code: "BATTLEFIELD_DOMAIN_VIOLATION",
        message: `Battlefield "${battlefield.name}" has domain [${bfDomains.join(", ")}] which does not fit within legend's domain identity [${legendDomains.join(", ")}]`,
      });
    }
  }

  return errors;
};

/**
 * Validate that no two battlefields in a deck share a name.
 * rule 103.4.c: the battlefields in a deck must all have different names.
 */
const validateBattlefieldNamesDistinct = (
  battlefields: BattlefieldCard[],
): DeckValidationError[] => {
  const seen = new Set<string>();
  const reported = new Set<string>();
  const errors: DeckValidationError[] = [];
  for (const battlefield of battlefields) {
    const name = battlefield.name;
    if (seen.has(name) && !reported.has(name)) {
      reported.add(name);
      errors.push({
        code: "DUPLICATE_BATTLEFIELD_NAME",
        message: `Battlefields in a deck must have different names, but "${name}" appears more than once`,
      });
    }
    seen.add(name);
  }
  return errors;
};

/**
 * Validate battlefield count for deck construction.
 * Required count depends on game mode. If no mode is specified, skip the check.
 */
const validateBattlefieldCount = (
  battlefields: BattlefieldCard[],
  mode?: GameMode,
): DeckValidationError[] => {
  if (mode === undefined) {
    return [];
  }
  const required = BATTLEFIELD_COUNT_BY_MODE[mode];
  if (battlefields.length !== required) {
    return [
      {
        code: "WRONG_BATTLEFIELD_COUNT",
        message: `Decks require exactly ${required} battlefields for ${mode} mode, but ${battlefields.length} were provided`,
      },
    ];
  }
  return [];
};

// ============================================================================
// Main Validation - Collected Validators
// ============================================================================

/**
 * Run all main deck validations and collect errors
 */
const collectMainDeckErrors = (
  config: DeckConfig,
  legendDomains: Domain[],
): DeckValidationError[] => [
  ...validateMainDeckSize(config.mainDeck),
  ...validateCopyLimit(config.mainDeck),
  ...validateUniqueLimit(config.mainDeck),
  ...validateChosenChampion(config.chosenChampion, config.legend),
  ...validateMainDeckDomainIdentity(config.mainDeck, legendDomains),
  ...validateSignatureLimit(config.mainDeck, config.legend),
  ...validateSignatureTags(config.mainDeck, config.legend),
];

/**
 * Run all rune and battlefield validations and collect errors
 */
const collectSupportDeckErrors = (
  config: DeckConfig,
  legendDomains: Domain[],
): DeckValidationError[] => [
  ...validateRuneDeckSize(config.runeDeck),
  ...validateRuneDeckDomainIdentity(config.runeDeck, legendDomains),
  ...validateBattlefieldDomainIdentity(config.battlefields, legendDomains),
  ...validateBattlefieldCount(config.battlefields, config.mode),
  ...validateBattlefieldNamesDistinct(config.battlefields),
];

// ============================================================================
// Main Validation Function
// ============================================================================

/**
 * Validate a complete deck configuration against Riftbound rules 101-103.
 *
 * Checks all construction rules and returns all errors found (does not
 * short-circuit on the first error).
 *
 * @param config - The deck configuration to validate
 * @returns Validation result with all errors
 */
export const validateDeck = (config: DeckConfig): DeckValidationResult => {
  const legendDomains = getLegendDomains(config.legend);

  const errors: DeckValidationError[] = [
    ...collectMainDeckErrors(config, legendDomains),
    ...collectSupportDeckErrors(config, legendDomains),
  ];

  return {
    errors,
    valid: errors.length === NO_ERRORS,
  };
};
