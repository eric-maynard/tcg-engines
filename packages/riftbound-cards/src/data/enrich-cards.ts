/**
 * Card Enrichment
 *
 * Runs the parser on each card's rulesText and attaches
 * the resulting abilities. This is done once at load time.
 */

import type { Card } from "@tcg/riftbound-types/cards";
import { parseAbilities } from "../parser";
import { expandHuntKeywords } from "../parser/impl/keywords";
import { decodeHtmlEntities, hasHtmlEntity } from "./decode-entities";

/**
 * Printed text scraped out of HTML can still carry entities (`&gt;`, `&quot;`).
 * Decode once here so the parser, the engine and any card renderer all see
 * plain text — no consumer needs its own entity workaround.
 */
function decodeCardText(card: Card): Card {
  const text = (card as { rulesText?: string }).rulesText;
  if (typeof text !== "string" || !hasHtmlEntity(text)) {
    return card;
  }
  return { ...card, rulesText: decodeHtmlEntities(text) } as Card;
}

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
  const card = normalizeSpellTiming(decodeCardText(raw));
  // Skip if the card declares an explicit abilities array (hand-authored opt-out).
  // rule 823 / 808.1: Hunt and Deathknell still need their `triggered` sibling
  // here — the engine's trigger matcher only walks `type === "triggered"`
  // abilities. rule 729: Vision does not — the trigger runner synthesises the
  // play-self trigger from the printed keyword ability itself (and covers
  // play-token-unit too), so expanding it here would put the same ability in
  // the registry payload twice.
  if (card.abilities !== undefined) {
    if (card.abilities.length === 0) {
      return card;
    }
    const expanded = expandHuntKeywords(
      card.abilities as Parameters<typeof expandHuntKeywords>[0],
      { skipKeywords: ["Vision"] },
    );
    return expanded.length === card.abilities.length
      ? card
      : ({ ...card, abilities: expanded } as Card);
  }
  if (!card.rulesText || card.rulesText.trim().length === 0) {
    return card;
  }

  const result = parseAbilities(card.rulesText, {
    domain: (card as { domain?: string }).domain,
    omitId: true,
    omitText: true,
  });
  if (!result.success || !result.abilities || result.abilities.length === 0) {
    return card;
  }

  // ParseAbilities returns Ability[] directly
  const abilities = unwrapSpellWrappedAbilities(
    mergeRepeatedSpellAbilities(result.abilities),
    card.cardType,
  );

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
 * same unit may be picked twice — no "another" restriction). Distinct
 * instructions split across sentences (sfd-076-221 "Play a … token." /
 * "Draw 1.") collapse the same way, without that flag. Gated alternatives
 * ("[Level 6] … instead", conditional/cost-riding spells) are left alone.
 */
function mergeRepeatedSpellAbilities<T>(abilities: readonly T[]): T[] {
  const isPlainSpell = (a: unknown): boolean => {
    const ab = a as
      | {
          type?: string;
          effect?: { type?: string };
          condition?: unknown;
          cost?: unknown;
          repeat?: unknown;
          repeatCost?: unknown;
        }
      | undefined;
    return (
      ab?.type === "spell" &&
      ab.effect !== undefined &&
      ab.effect.type !== "raw" &&
      ab.condition === undefined &&
      ab.cost === undefined &&
      ab.repeat === undefined &&
      ab.repeatCost === undefined
    );
  };
  const spells = abilities.filter(isPlainSpell);
  if (spells.length < 2) {
    return [...abilities];
  }
  const first = JSON.stringify(spells[0]);
  const allIdentical =
    spells.length === abilities.length && spells.every((a) => JSON.stringify(a) === first);
  const stepsOf = (a: T): unknown[] => {
    const e = (a as { effect: { type?: string; effects?: unknown[] } }).effect;
    // Flatten a sequence this merge itself accumulated; leave a parsed
    // sequence that already carries its own targeting flags intact.
    const accumulated =
      e.type === "sequence" &&
      Array.isArray(e.effects) &&
      (allIdentical || !("independentTargets" in e));
    return accumulated ? [...(e.effects as unknown[])] : [e];
  };
  const out: T[] = [];
  for (const ability of abilities) {
    const prev = out[out.length - 1];
    if (
      prev !== undefined &&
      isPlainSpell(prev) &&
      isPlainSpell(ability) &&
      (prev as { timing?: string }).timing === (ability as { timing?: string }).timing
    ) {
      out[out.length - 1] = {
        ...(prev as Record<string, unknown>),
        effect: {
          effects: [...stepsOf(prev), ...stepsOf(ability)],
          ...(allIdentical ? { independentTargets: true } : {}),
          type: "sequence",
        },
      } as T;
      continue;
    }
    out.push(ability);
  }
  return out;
}

/**
 * rule 813 / 806.1 (sfd-053-221 Janna, Savior) — a [Reaction] printed on a UNIT
 * or GEAR is a timing permission (handled in `normalizeSpellTiming`), not a
 * spell ability. The parser has no card type, so it files the rest of such a
 * card's text under `{ type: "spell", timing, effect }`; on a non-spell card
 * that wrapper hides a real ability (a play-self trigger, a static, …) from the
 * engine. Lift the inner ability back to the top level.
 */
const ABILITY_KINDS = new Set(["triggered", "static", "activated", "keyword", "replacement"]);

function unwrapSpellWrappedAbilities<T>(abilities: readonly T[], cardType: string): T[] {
  if (cardType === "spell") {
    return [...abilities];
  }
  return abilities.map((a) => {
    const ability = a as { type?: string; effect?: { type?: string } };
    if (ability?.type !== "spell" || !ability.effect?.type) {
      return a;
    }
    return ABILITY_KINDS.has(ability.effect.type) ? (ability.effect as T) : a;
  });
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
