/**
 * Card Filters
 *
 * Filtering functions for the deck builder. Cards can be filtered by:
 * - Domain identity (auto-applied after legend selection)
 * - Card type (unit, spell, gear, equipment)
 * - Energy cost range
 * - Might range
 * - Rarity
 * - Set
 * - Keywords
 * - Name search (fuzzy)
 * - Champion tag
 * - Legality (fits in current deck)
 */

/**
 * Minimal card interface for filtering.
 * Works with both full Card types and the JSON set data.
 */
export interface FilterableCard {
  readonly id: string;
  readonly name: string;
  readonly cardType: string;
  readonly energyCost?: number;
  readonly might?: number;
  readonly domain?: string | string[];
  readonly rarity?: string;
  readonly setId?: string;
  readonly set?: string;
  readonly tags?: string[];
  readonly isChampion?: boolean;
  readonly rulesText?: string;
  readonly abilities?: readonly { type: string; keyword?: string }[];
}

/**
 * Filter criteria for card search.
 * All fields are optional — only non-undefined fields are applied.
 */
export interface CardFilterCriteria {
  /** Filter by domain identity — cards must match these domains */
  readonly domainIdentity?: string[];
  /** Filter by card type(s) */
  readonly cardType?: string | string[];
  /** Minimum energy cost */
  readonly minEnergy?: number;
  /** Maximum energy cost */
  readonly maxEnergy?: number;
  /** Exact energy cost */
  readonly energy?: number;
  /** Minimum might */
  readonly minMight?: number;
  /** Maximum might */
  readonly maxMight?: number;
  /** Filter by rarity */
  readonly rarity?: string | string[];
  /** Filter by set ID(s) */
  readonly set?: string | string[];
  /** Filter by keyword(s) — card must have ALL listed keywords */
  readonly keywords?: string[];
  /** Filter by keyword — card must have ANY of listed keywords */
  readonly anyKeyword?: string[];
  /** Search by name (case-insensitive substring match) */
  readonly nameSearch?: string;
  /** Filter by champion tag */
  readonly championTag?: string;
  /** Only champion units */
  readonly isChampion?: boolean;
  /** Exclude these card IDs */
  readonly excludeIds?: string[];
}

/**
 * Check if a card matches domain identity rules (rule 103.1.b).
 *
 * - Cards with no domain are always permitted (domain-neutral)
 * - Single-domain cards: permitted if their domain is in the identity
 * - Multi-domain cards: ALL domains must be in the identity
 * - "colorless" domain cards are always permitted
 */
export function matchesDomainIdentity(card: FilterableCard, domainIdentity: string[]): boolean {
  const cardDomains = getCardDomains(card);

  // No domain = domain-neutral, always permitted
  if (cardDomains.length === 0) {
    return true;
  }

  // Colorless is always permitted
  if (cardDomains.every((d) => d === "colorless")) {
    return true;
  }

  // All card domains must be within the identity
  return cardDomains.every((d) => d === "colorless" || domainIdentity.includes(d));
}

/**
 * Get the domains from a card (handles string | string[] | undefined).
 */
function getCardDomains(card: FilterableCard): string[] {
  if (!card.domain) {
    return [];
  }
  if (typeof card.domain === "string") {
    return [card.domain];
  }
  return [...card.domain];
}

/**
 * Get keywords from a card's abilities array.
 */
function getCardKeywords(card: FilterableCard): string[] {
  if (!card.abilities) {
    return [];
  }
  return card.abilities.filter((a) => a.type === "keyword" && a.keyword).map((a) => a.keyword!);
}

/**
 * Apply all filter criteria to a single card.
 */
export function matchesFilter(card: FilterableCard, criteria: CardFilterCriteria): boolean {
  // Domain identity
  if (criteria.domainIdentity) {
    if (!matchesDomainIdentity(card, criteria.domainIdentity)) {
      return false;
    }
  }

  // Card type
  if (criteria.cardType) {
    const types = Array.isArray(criteria.cardType) ? criteria.cardType : [criteria.cardType];
    if (!types.includes(card.cardType)) {
      return false;
    }
  }

  // Energy cost
  if (criteria.energy !== undefined) {
    if ((card.energyCost ?? 0) !== criteria.energy) {
      return false;
    }
  }
  if (criteria.minEnergy !== undefined) {
    if ((card.energyCost ?? 0) < criteria.minEnergy) {
      return false;
    }
  }
  if (criteria.maxEnergy !== undefined) {
    if ((card.energyCost ?? 0) > criteria.maxEnergy) {
      return false;
    }
  }

  // Might
  if (criteria.minMight !== undefined) {
    if ((card.might ?? 0) < criteria.minMight) {
      return false;
    }
  }
  if (criteria.maxMight !== undefined) {
    if ((card.might ?? 0) > criteria.maxMight) {
      return false;
    }
  }

  // Rarity
  if (criteria.rarity) {
    const rarities = Array.isArray(criteria.rarity) ? criteria.rarity : [criteria.rarity];
    if (!rarities.includes(card.rarity ?? "")) {
      return false;
    }
  }

  // Set
  if (criteria.set) {
    const sets = Array.isArray(criteria.set) ? criteria.set : [criteria.set];
    const cardSet = card.setId ?? card.set ?? "";
    if (!sets.includes(cardSet)) {
      return false;
    }
  }

  // Keywords (ALL must match)
  if (criteria.keywords && criteria.keywords.length > 0) {
    const cardKeywords = getCardKeywords(card);
    if (!criteria.keywords.every((kw) => cardKeywords.includes(kw))) {
      return false;
    }
  }

  // Any keyword
  if (criteria.anyKeyword && criteria.anyKeyword.length > 0) {
    const cardKeywords = getCardKeywords(card);
    if (!criteria.anyKeyword.some((kw) => cardKeywords.includes(kw))) {
      return false;
    }
  }

  // Name search
  if (criteria.nameSearch) {
    const search = criteria.nameSearch.toLowerCase();
    const name = card.name.toLowerCase();
    const text = (card.rulesText ?? "").toLowerCase();
    if (!name.includes(search) && !text.includes(search)) {
      return false;
    }
  }

  // Champion tag
  if (criteria.championTag) {
    if (!card.tags?.includes(criteria.championTag)) {
      return false;
    }
  }

  // Is champion
  if (criteria.isChampion !== undefined) {
    if (card.isChampion !== criteria.isChampion) {
      return false;
    }
  }

  // Exclude IDs
  if (criteria.excludeIds) {
    if (criteria.excludeIds.includes(card.id)) {
      return false;
    }
  }

  return true;
}

/**
 * Filter an array of cards by criteria.
 */
export function filterCards<T extends FilterableCard>(
  cards: T[],
  criteria: CardFilterCriteria,
): T[] {
  return cards.filter((card) => matchesFilter(card, criteria));
}

/**
 * Sort options for card display.
 */
export type CardSortField = "name" | "energy" | "might" | "rarity" | "cardType" | "collector";

/**
 * Sort cards by a field.
 */
export function sortCards<T extends FilterableCard>(
  cards: T[],
  field: CardSortField,
  direction: "asc" | "desc" = "asc",
): T[] {
  const sorted = [...cards].toSorted((a, b) => {
    let cmp = 0;
    switch (field) {
      case "name": {
        cmp = a.name.localeCompare(b.name);
        break;
      }
      case "energy": {
        cmp = (a.energyCost ?? 0) - (b.energyCost ?? 0);
        break;
      }
      case "might": {
        cmp = (a.might ?? 0) - (b.might ?? 0);
        break;
      }
      case "rarity": {
        const order = { common: 0, epic: 3, legendary: 4, rare: 2, uncommon: 1 };
        cmp =
          (order[a.rarity as keyof typeof order] ?? 0) -
          (order[b.rarity as keyof typeof order] ?? 0);
        break;
      }
      case "cardType": {
        cmp = (a.cardType ?? "").localeCompare(b.cardType ?? "");
        break;
      }
      case "collector": {
        cmp = 0; // Would need collectorNumber field
        break;
      }
    }
    return cmp;
  });
  return direction === "desc" ? sorted.toReversed() : sorted;
}
