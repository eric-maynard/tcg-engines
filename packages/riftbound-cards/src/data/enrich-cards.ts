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
  const abilities = mergeRepeatedSpellAbilities(result.abilities);

  // Return a new card object with abilities attached
  return { ...card, abilities } as Card;
}

/**
 * rule 355.8 (ogn-029-298 Falling Star, ogn-248-298) — a spell printed as the
 * SAME instruction several times ("Deal 3 to a unit.\nDeal 3 to a unit.") is
 * one spell with several independently-targeted instructions, not several
 * spell abilities: the engine resolves exactly one spell ability per card.
 * Collapse identical repeats into a single `sequence` flagged
 * `independentTargets` so each step keeps its own caster-chosen target (the
 * same unit may be picked twice — no "another" restriction). Spell abilities
 * that differ (level gates, distinct instructions) are left alone.
 */
function mergeRepeatedSpellAbilities<T>(abilities: readonly T[]): T[] {
  const spells = abilities.filter((a) => (a as { type?: string })?.type === "spell");
  if (spells.length < 2 || spells.length !== abilities.length) {
    return [...abilities];
  }
  const first = JSON.stringify(spells[0]);
  if (!spells.every((a) => JSON.stringify(a) === first)) {
    return [...abilities];
  }
  const lead = spells[0] as { effect?: unknown };
  if (lead.effect === undefined) {
    return [...abilities];
  }
  return [
    {
      ...(lead as Record<string, unknown>),
      effect: {
        effects: spells.map((a) => (a as { effect: unknown }).effect),
        independentTargets: true,
        type: "sequence",
      },
    } as T,
  ];
}

/**
 * rule 155 / 159.2.a.1: a spell's timing class comes from its printed
 * [Action]/[Reaction] keyword; without one it is "standard" (no showdowns).
 * The printed text is authoritative — card data historically only had
 * action|reaction to choose from, so plain spells were filed as "action".
 * Reminder text in parentheses is ignored (tokens can quote "[Reaction]").
 */
function normalizeSpellTiming(card: Card): Card {
  if (!card.rulesText) {
    return card;
  }
  const text = card.rulesText.replace(/\([^)]*\)/g, "");
  // rule 813.1 / 806.1: [Action] and [Reaction] are timing permissions on ANY
  // card type — a unit or gear printing one keeps its own default timing
  // otherwise (only spells fall back to "standard").
  if (card.cardType !== "spell") {
    const printed = /\[Reaction\]/i.test(text)
      ? "reaction"
      : /\[Action\]/i.test(text)
        ? "action"
        : undefined;
    if (printed === undefined || card.timing === printed) {
      return card;
    }
    return { ...card, timing: printed } as Card;
  }
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
