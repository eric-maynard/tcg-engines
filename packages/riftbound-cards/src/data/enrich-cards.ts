/**
 * Card Enrichment
 *
 * Runs the parser on each card's rulesText and attaches
 * the resulting abilities. This is done once at load time.
 */

import type { Card } from "@tcg/riftbound-types/cards";
import { parseAbilities } from "../parser";

/**
 * Enrich a single card with parsed abilities.
 * If the card already has abilities or has no rulesText, returns as-is.
 */
function enrichCard(card: Card): Card {
  // Skip if already has abilities or no text to parse
  if (card.abilities && card.abilities.length > 0) {
    return card;
  }
  if (!card.rulesText || card.rulesText.trim().length === 0) {
    return card;
  }

  const result = parseAbilities(card.rulesText, { omitId: true, omitText: true });
  if (!result.success || !result.abilities || result.abilities.length === 0) {
    return card;
  }

  // Extract the Ability objects from AbilityWithText wrappers
  const abilities = result.abilities.map((a) => a.ability);

  // Return a new card object with abilities attached
  return { ...card, abilities } as Card;
}

/**
 * Enrich all cards with parsed abilities.
 */
export function enrichCards(cards: Card[]): Card[] {
  return cards.map(enrichCard);
}

/**
 * Stats from enrichment (for diagnostics)
 */
export interface EnrichmentStats {
  total: number;
  withText: number;
  enriched: number;
  failed: number;
  rate: number;
}

/**
 * Enrich cards and return stats.
 */
export function enrichCardsWithStats(cards: Card[]): { cards: Card[]; stats: EnrichmentStats } {
  let withText = 0;
  let enriched = 0;
  let failed = 0;

  const result = cards.map((card) => {
    if (!card.rulesText || card.rulesText.trim().length === 0) {
      return card;
    }
    withText++;

    const enrichedCard = enrichCard(card);
    if (enrichedCard.abilities && enrichedCard.abilities.length > 0) {
      enriched++;
    } else {
      failed++;
    }
    return enrichedCard;
  });

  return {
    cards: result,
    stats: {
      enriched,
      failed,
      rate: withText > 0 ? (enriched / withText) * 100 : 0,
      total: cards.length,
      withText,
    },
  };
}
