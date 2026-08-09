/**
 * Keyword Parser
 *
 * Parses keyword abilities including simple, value, and cost keywords.
 */

import type {
  CostKeyword,
  CostKeywordAbility,
  SimpleKeyword,
  SimpleKeywordAbility,
  ValueKeyword,
  ValueKeywordAbility,
} from "@tcg/riftbound-types";
import type { Cost, Domain } from "@tcg/riftbound-types/abilities/cost-types";
import { extractAndParseCost, mergeCosts, parseAdditionalCostText, parseCost } from "./cost-parser";

// ============================================================================
// Constants
// ============================================================================

/**
 * Cost keywords that have an associated cost
 */
export const COST_KEYWORDS: readonly CostKeyword[] = ["Accelerate", "Equip", "Repeat", "Flow"] as const;

// ============================================================================
// Cost Keyword Parsing
// ============================================================================

/**
 * Pattern to match cost keywords with their reminder text
 * Captures: [1] keyword name, [2] everything after until next keyword or end
 */
const COST_KEYWORD_PATTERN = /\[(Accelerate|Equip|Repeat|Flow)\]([^[]*?)(?=\[|$)/g;

/**
 * Pattern to extract cost from Accelerate reminder text
 * "You may pay <cost> as an additional cost..."
 */
const ACCELERATE_COST_PATTERN =
  /You may pay\s+((?::rb_(?:energy_\d+|rune_(?:fury|calm|mind|body|chaos|order|rainbow)):)+)/i;

/**
 * Pattern to extract cost from Equip text
 * "[Equip] <cost>" or "[Equip] — <cost>, <additional>"
 */
const EQUIP_COST_PATTERN =
  /^\s*(?:—\s*)?((?::rb_(?:energy_\d+|rune_(?:fury|calm|mind|body|chaos|order|rainbow)):)+)/;

/**
 * Pattern to extract cost from Repeat text
 * "[Repeat] <cost>"
 */
const REPEAT_COST_PATTERN =
  /^\s*((?::rb_(?:energy_\d+|rune_(?:fury|calm|mind|body|chaos|order|rainbow)):)+)/;

/**
 * Parse a cost keyword and extract its cost
 *
 * @param keyword - The cost keyword type
 * @param followingText - Text following the keyword (includes reminder text)
 * @returns CostKeywordAbility or null if parsing fails
 */
export function parseCostKeyword(
  keyword: CostKeyword,
  followingText: string,
  domain?: string,
): CostKeywordAbility | null {
  let cost: Cost | null = null;

  switch (keyword) {
    case "Accelerate": {
      // For Accelerate, cost is in reminder text: "(You may pay <cost> as an additional cost...)"
      const reminderMatch = followingText.match(/\([^)]*\)/);
      if (reminderMatch) {
        let costMatch = reminderMatch[0].match(ACCELERATE_COST_PATTERN);
        if (!costMatch) {
          // Handle italic markers (e.g., `_(Y_ou` -> `(You`) by protecting :rb_...: tokens,
          // Stripping stray underscores, then restoring tokens.
          const tokens: string[] = [];
          const protectedReminder = reminderMatch[0].replace(/:rb_[^:]+:/g, (m) => {
            tokens.push(m);
            return `\x00T${tokens.length - 1}\x00`;
          });
          const strippedReminder = protectedReminder.replace(/_/g, "");
          const restoredReminder = strippedReminder.replace(
            /\x00T(\d+)\x00/g,
            (_, idx) => tokens[Number.parseInt(idx, 10)],
          );
          costMatch = restoredReminder.match(ACCELERATE_COST_PATTERN);
        }
        if (costMatch) {
          cost = parseCost(costMatch[1]);
        }
      }
      // rule 805.1.a: Accelerate always costs [1][C] even when printed without
      // reminder text; the Power must match one of the card's domains (805.1.a.1),
      // or any domain when the card has none (805.1.a.2).
      if (!cost) {
        cost = { energy: 1, power: [(domain ?? "rainbow") as Domain] };
      }
      break;
    }

    case "Equip": {
      // For Equip, cost appears directly after keyword or after "—"
      // Handle both "[Equip] :rb_rune_body:" and "[Equip] — :rb_rune_chaos:, Recycle 2 cards"
      const costMatch = followingText.match(EQUIP_COST_PATTERN);
      // rule 818.1.c.3 (unl-158-219) — the non-resource half of an Equip cost
      // ("Recycle N cards", "Kill a friendly unit", "Spend N XP") may be the
      // WHOLE cost, so pips are optional. The parenthetical reminder text never
      // carries cost words and is stripped before matching.
      const additionalText = (
        costMatch ? followingText.slice(costMatch[0].length) : followingText
      ).replace(/\([^)]*\)/g, "");
      const additionalCost = parseAdditionalCostText(additionalText);
      const hasAdditional = Object.keys(additionalCost).length > 0;
      if (costMatch || hasAdditional) {
        cost = costMatch ? parseCost(costMatch[1]) : { energy: 0, power: [] };
        if (hasAdditional) {
          cost = mergeCosts(cost, additionalCost);
        }
      }
      break;
    }

    case "Repeat": {
      // For Repeat, cost appears directly after keyword
      const costMatch = followingText.match(REPEAT_COST_PATTERN);
      if (costMatch) {
        cost = parseCost(costMatch[1]);
      }
      break;
    }

    // rule-id: ven-049-166 — Flow cost appears directly after keyword, same shape as Repeat.
    case "Flow": {
      const costMatch = followingText.match(REPEAT_COST_PATTERN);
      if (costMatch) {
        cost = parseCost(costMatch[1]);
      }
      break;
    }
  }

  if (!cost) {
    return null;
  }

  return {
    cost,
    keyword,
    type: "keyword",
  };
}

/**
 * Extract all cost keyword abilities from text
 *
 * @param text - Full ability text
 * @returns Array of parsed cost keyword abilities with their positions
 */
export function parseCostKeywords(
  text: string,
): { ability: CostKeywordAbility; startIndex: number }[] {
  const results: { ability: CostKeywordAbility; startIndex: number }[] = [];
  const pattern = new RegExp(COST_KEYWORD_PATTERN.source, "g");

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const keyword = match[1] as CostKeyword;
    const followingText = match[2];

    const ability = parseCostKeyword(keyword, followingText);
    if (ability) {
      results.push({
        ability,
        startIndex: match.index,
      });
    }
  }

  return results;
}

/**
 * Check if a keyword is a cost keyword
 */
export function isCostKeyword(keyword: string): keyword is CostKeyword {
  return COST_KEYWORDS.includes(keyword as CostKeyword);
}
