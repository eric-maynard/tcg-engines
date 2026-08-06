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
 *
 * NOTE: Any card that declares an explicit `abilities` property (even an
 * empty array) is considered hand-authored and will NOT be re-parsed. This
 * lets us opt out of the parser entirely for deferred cards by setting
 * `abilities: []` alongside a TODO comment.
 */
function enrichCard(raw: Card): Card {
  const card = normalizeSpellTiming(raw);
  // Skip if the card declares an explicit abilities array (hand-authored opt-out)
  if (card.abilities !== undefined) {
    return card;
  }
  if (!card.rulesText || card.rulesText.trim().length === 0) {
    return card;
  }

  const result = parseAbilities(card.rulesText, { omitId: true, omitText: true });
  if (!result.success || !result.abilities || result.abilities.length === 0) {
    return card;
  }

  // ParseAbilities returns Ability[] directly
  const { abilities } = result;

  // Return a new card object with abilities attached
  return { ...card, abilities } as Card;
}

/**
 * rule 155 / 159.2.a.1: a spell's timing class comes from its printed
 * [Action]/[Reaction] keyword; without one it is "standard" (no showdowns).
 * The printed text is authoritative — card data historically only had
 * action|reaction to choose from, so plain spells were filed as "action".
 * Reminder text in parentheses is ignored (tokens can quote "[Reaction]").
 */
function normalizeSpellTiming(card: Card): Card {
  if (card.cardType !== "spell" || !card.rulesText) {
    return card;
  }
  const text = card.rulesText.replace(/\([^)]*\)/g, "");
  const timing = /\[Reaction\]/i.test(text) ? "reaction" : /\[Action\]/i.test(text) ? "action" : "standard";
  if (card.timing === timing) {
    return card;
  }
  return { ...card, timing } as Card;
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
