/**
 * Cost Parser
 *
 * Parses cost strings into structured Cost objects.
 */

import type { Cost, Domain } from "@tcg/riftbound-types/abilities/cost-types";
import { ENERGY_PATTERN, EXHAUST_PATTERN, POWER_PATTERN, isValidDomain } from "../patterns/costs";

/**
 * Parse a cost string into a Cost object
 *
 * @param text - The cost string to parse (e.g., ":rb_energy_1::rb_rune_fury:")
 * @returns Cost object with extracted values
 *
 * @example
 * parseCost(":rb_energy_1::rb_rune_fury:")
 * // Returns: { energy: 1, power: ["fury"] }
 *
 * @example
 * parseCost(":rb_rune_body:")
 * // Returns: { power: ["body"] }
 *
 * @example
 * parseCost(":rb_exhaust:")
 * // Returns: { exhaust: true }
 */
export function parseCost(text: string): Cost {
  const cost: {
    energy?: number;
    power?: Domain[];
    exhaust?: boolean;
  } = {};

  // Parse energy cost
  const energyPattern = new RegExp(ENERGY_PATTERN.source, "g");
  let energyMatch: RegExpExecArray | null;
  while ((energyMatch = energyPattern.exec(text)) !== null) {
    const value = Number.parseInt(energyMatch[1], 10);
    // Sum multiple energy costs (though typically there's only one)
    cost.energy = (cost.energy ?? 0) + value;
  }

  // Parse power/rune costs
  const powerPattern = new RegExp(POWER_PATTERN.source, "g");
  let powerMatch: RegExpExecArray | null;
  while ((powerMatch = powerPattern.exec(text)) !== null) {
    const domain = powerMatch[1];
    if (isValidDomain(domain)) {
      if (!cost.power) {
        cost.power = [];
      }
      cost.power.push(domain);
    }
  }

  // Parse exhaust cost
  const exhaustPattern = new RegExp(EXHAUST_PATTERN.source, "g");
  if (exhaustPattern.test(text)) {
    cost.exhaust = true;
  }

  return cost;
}

/**
 * Check if a Cost object is empty (no cost)
 */
export function isEmptyCost(cost: Cost): boolean {
  return (
    cost.energy === undefined &&
    (cost.power === undefined || cost.power.length === 0) &&
    cost.exhaust !== true &&
    cost.kill === undefined &&
    cost.discard === undefined &&
    cost.recycle === undefined &&
    cost.spend === undefined &&
    cost.returnToHand === undefined
  );
}

/**
 * Extract the first cost string from text and parse it
 *
 * @param text - Text that may contain cost notation
 * @returns Cost object or null if no cost found
 */
export function extractAndParseCost(text: string): Cost | null {
  // Pattern to match a sequence of cost tokens
  const costSequencePattern =
    /(?::rb_(?:energy_\d+|rune_(?:fury|calm|mind|body|chaos|order|rainbow)|exhaust):)+/;
  const match = text.match(costSequencePattern);

  if (!match) {
    return null;
  }

  return parseCost(match[0]);
}

/**
 * Parse additional cost components like "Recycle N cards" or "Kill a friendly unit"
 *
 * @param text - Text that may contain additional cost descriptions
 * @returns Partial Cost object with additional cost components
 */
export function parseAdditionalCostText(text: string): Partial<Cost> {
  // Build the cost object with all properties at once
  const recycleMatch = text.match(/Recycle\s+(\d+)\s+cards?/i);
  const hasKillFriendlyUnit = /Kill\s+a\s+friendly\s+unit/i.test(text);
  // rule 827.1.c.2 — a non-resource cost worded "Discard a spell" / "Discard 1"
  // (Mel ven-110a-166, ven-133-166): a typed discard names the card type the
  // hand card must have, a numeric one just counts cards.
  const discardTypeMatch = text.match(/Discard\s+(?:a|an|one|1)\s+(gear|unit|card|spell|legend)s?\b/i);
  const discardCountMatch = discardTypeMatch ? null : text.match(/Discard\s+(\d+)\b/i);
  // rule 818.1.c.3 / 730.2 (unl-158-219) — "Spend N XP" is a non-resource cost
  // component: it is paid in full on activation and is unpayable below N XP.
  const xpMatch = text.match(/Spend\s+(\d+)\s+XP\b/i);

  return {
    ...(xpMatch ? { xp: Number.parseInt(xpMatch[1], 10) } : undefined),
    ...(discardTypeMatch
      ? ({
          discard: { amount: 1, cardType: discardTypeMatch[1].toLowerCase() },
        } as unknown as Partial<Cost>)
      : undefined),
    ...(discardCountMatch
      ? ({ discard: { amount: Number.parseInt(discardCountMatch[1], 10) } } as unknown as Partial<Cost>)
      : undefined),
    ...(recycleMatch ? { recycle: Number.parseInt(recycleMatch[1], 10) } : undefined),
    ...(hasKillFriendlyUnit
      ? {
          kill: {
            controller: "friendly" as const,
            type: "unit" as const,
          },
        }
      : undefined),
  };
}

/**
 * Merge two Cost objects
 */
export function mergeCosts(base: Cost, additional: Partial<Cost>): Cost {
  return {
    discard: additional.discard ?? base.discard,
    energy: additional.energy !== undefined ? (base.energy ?? 0) + additional.energy : base.energy,
    exhaust: additional.exhaust ?? base.exhaust,
    kill: additional.kill ?? base.kill,
    power:
      additional.power !== undefined ? [...(base.power ?? []), ...additional.power] : base.power,
    recycle: additional.recycle ?? base.recycle,
    returnToHand: additional.returnToHand ?? base.returnToHand,
    spend: additional.spend ?? base.spend,
    xp: additional.xp ?? base.xp,
  };
}
