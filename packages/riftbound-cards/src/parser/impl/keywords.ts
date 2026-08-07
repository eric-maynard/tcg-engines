/**
 * Keyword tables and keyword-segment parsing.
 */

import type {
  Ability,
  CostKeyword,
  KeywordAbility,
  SimpleKeyword,
  SimpleKeywordAbility,
  TriggeredAbility,
  ValueKeyword,
  ValueKeywordAbility,
} from "@tcg/riftbound-types";
import type { Effect } from "@tcg/riftbound-types/abilities/effect-types";
import { parseCostKeyword } from "../parsers/keyword-parser";
import { parseEffectKeywordsWithPositions } from "../parsers/effect-keyword-parser";

// ============================================================================
// Keyword Constants
// ============================================================================

export const ALL_SIMPLE_KEYWORDS: readonly string[] = [
  "Tank",
  "Backline",
  "Ganking",
  "Hidden",
  "Temporary",
  "Quick-Draw",
  "Weaponmaster",
  "Unique",
  "Ambush",
];

export const ALL_VALUE_KEYWORDS: readonly string[] = [
  "Assault",
  "Shield",
  "Deflect",
  "Hunt",
  // NOTE: "Predict" is intentionally omitted here. Although it is declared as
  // A ValueKeyword in riftbound-types for schema completeness, it is
  // *Always* used as an inline effect (e.g., "[Deathknell] [Predict 2]")
  // Rather than as a standalone keyword ability on a unit. Treating it as a
  // Keyword in the splitter would wrongly peel it off as its own ability.
];

export const ALL_COST_KEYWORDS: readonly string[] = ["Accelerate", "Equip", "Repeat", "Flow"];

export const ALL_EFFECT_KEYWORDS: readonly string[] = ["Deathknell", "Legion", "Vision"];

/** All keywords that can appear as `[Keyword]` in card text */
export const ALL_KEYWORDS = [
  ...ALL_SIMPLE_KEYWORDS,
  ...ALL_VALUE_KEYWORDS,
  ...ALL_COST_KEYWORDS,
  ...ALL_EFFECT_KEYWORDS,
];

/**
 * Pattern to match a keyword bracket at a given position.
 * Captures: keyword name, optional value
 */
export const KEYWORD_AT_POS_RE =
  /^\[(Tank|Backline|Ganking|Hidden|Temporary|Quick-Draw|Weaponmaster|Unique|Ambush|Assault|Shield|Deflect|Hunt|Accelerate|Equip|Repeat|Flow|Deathknell|Legion|Vision)(?:\s+(\d+))?\]/;

/**
 * Find the index of the next keyword bracket in text.
 * Returns -1 if no keyword is found.
 */
export function findNextKeywordIndex(text: string): number {
  // Build a regex that matches any keyword bracket
  const pattern = new RegExp(`\\[(${ALL_KEYWORDS.join("|")})(?:\\s+\\d+)?\\]`);
  const match = pattern.exec(text);
  return match ? match.index : -1;
}

/**
 * Find the index of the next STANDALONE keyword bracket in text.
 * Skips keyword references that are embedded inside sentences
 * (e.g., "have [Vision]", "gain [Assault]", "give [Tank]").
 * Returns -1 if no standalone keyword is found.
 */
export function findNextStandaloneKeywordIndex(text: string): number {
  const pattern = new RegExp(`\\[(${ALL_KEYWORDS.join("|")})(?:\\s+\\d+)?\\]`, "g");
  // A standalone keyword bracket appears at sentence boundaries -- either at
  // The very start of the remaining text, or immediately after a sentence-ending
  // Character (period, closing paren, closing bracket, italic marker).
  // Keyword brackets mid-sentence are references (e.g., "have [Vision]",
  // "give it [Temporary]", "with [Assault]") and should NOT be split on.
  const standaloneStartPattern = /(?:^|[.)_\]\n]\s*)$/;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const before = text.slice(0, match.index);
    if (standaloneStartPattern.test(before)) {
      return match.index;
    }
    // This is a keyword reference inside a sentence, skip it
  }
  return -1;
}

// ============================================================================
// Single Segment Parsers
// ============================================================================

/**
 * Parse a keyword segment into an Ability.
 */
export function parseKeywordSegment(text: string, domain?: string): KeywordAbility | undefined {
  // Match the keyword bracket
  const kwMatch = KEYWORD_AT_POS_RE.exec(text);
  if (!kwMatch) {
    return undefined;
  }

  const keyword = kwMatch[1];
  const valueStr = kwMatch[2];
  const afterBracket = text.slice(kwMatch[0].length);

  // Simple keywords
  if (ALL_SIMPLE_KEYWORDS.includes(keyword)) {
    return { keyword: keyword as SimpleKeyword, type: "keyword" } as SimpleKeywordAbility;
  }

  // Value keywords
  if (ALL_VALUE_KEYWORDS.includes(keyword)) {
    const value = valueStr ? Number.parseInt(valueStr, 10) : 1;
    return { keyword: keyword as ValueKeyword, type: "keyword", value } as ValueKeywordAbility;
  }

  // Cost keywords
  if (ALL_COST_KEYWORDS.includes(keyword)) {
    const result = parseCostKeyword(keyword as CostKeyword, afterBracket, domain);
    if (result) {
      return result;
    }
    // If cost parsing failed but it's a valid cost keyword, return undefined
    return undefined;
  }

  // Effect keywords
  if (ALL_EFFECT_KEYWORDS.includes(keyword)) {
    const results = parseEffectKeywordsWithPositions(text);
    if (results.length > 0) {
      return results[0].ability;
    }
    return undefined;
  }

  return undefined;
}

/**
 * Handle comma-separated value keywords like "[Assault 2], [Shield 2]"
 */
export function splitCommaSeparatedKeywords(text: string): Ability[] | undefined {
  // Match pattern: [Keyword N], [Keyword N] (reminder)
  const commaKwPattern = /^\[(\w+(?:-\w+)?)(?:\s+(\d+))?\]\s*,\s*\[(\w+(?:-\w+)?)(?:\s+(\d+))?\]/;
  const match = commaKwPattern.exec(text);
  if (!match) {
    return undefined;
  }

  const kw1 = match[1];
  const val1 = match[2] ? Number.parseInt(match[2], 10) : 1;
  const kw2 = match[3];
  const val2 = match[4] ? Number.parseInt(match[4], 10) : 1;

  const abilities: Ability[] = [];

  if (ALL_VALUE_KEYWORDS.includes(kw1)) {
    abilities.push({
      keyword: kw1 as ValueKeyword,
      type: "keyword",
      value: val1,
    } as ValueKeywordAbility);
  } else if (ALL_SIMPLE_KEYWORDS.includes(kw1)) {
    abilities.push({ keyword: kw1 as SimpleKeyword, type: "keyword" } as SimpleKeywordAbility);
  }

  if (ALL_VALUE_KEYWORDS.includes(kw2)) {
    abilities.push({
      keyword: kw2 as ValueKeyword,
      type: "keyword",
      value: val2,
    } as ValueKeywordAbility);
  } else if (ALL_SIMPLE_KEYWORDS.includes(kw2)) {
    abilities.push({ keyword: kw2 as SimpleKeyword, type: "keyword" } as SimpleKeywordAbility);
  }

  return abilities.length > 0 ? abilities : undefined;
}

// ============================================================================
// Hunt Keyword Expansion (UNL set)
// ============================================================================

/**
 * Expand a `[Hunt N]` keyword ability into the two triggered abilities it
 * implies: "When I conquer, gain N XP." and "When I hold, gain N XP."
 *
 * The original Hunt keyword ability is preserved in the output for display
 * and trigger-matching (the engine's `find-matching-triggers` walks the
 * ability list), so downstream code can still tell the unit has Hunt.
 */
/**
 * Trigger events that effect-keyword shorthands expand to. The engine's
 * trigger-runner/trigger-matcher only walk `type === "triggered"` abilities,
 * so each `{type:"keyword", keyword:K, effect:E}` also gets an explicit
 * `{type:"triggered", trigger:{event:…}, effect:E}` sibling.
 */
export const KEYWORD_TRIGGER_EVENTS: Readonly<Record<string, string>> = {
  Deathknell: "die", // Rule 808.1
  Vision: "play-self", // Rule 729
  // Legion (rule 724) is NOT a pure trigger shorthand — it modifies whatever
  // ability follows (static cost reduction, activated, or triggered), so it
  // stays as {type:"keyword", keyword:"Legion"} for the engine's legion
  // condition handling.
};

export function expandHuntKeywords(abilities: Ability[]): Ability[] {
  const result: Ability[] = [];
  // A hand-authored card may already spell out the triggered sibling next to
  // the keyword; never install a second copy of the same event+effect.
  const alreadyTriggered = (event: string, effect: unknown): boolean =>
    abilities.some(
      (a) =>
        (a as { type?: string }).type === "triggered" &&
        (a as { trigger?: { event?: string } }).trigger?.event === event &&
        JSON.stringify((a as { effect?: unknown }).effect) === JSON.stringify(effect),
    );
  for (const ab of abilities) {
    result.push(ab);
    if (ab.type !== "keyword") {
      continue;
    }
    const kw = (ab as { keyword?: string }).keyword;
    if (kw === "Hunt") {
      const amount = (ab as { value?: number }).value ?? 1;
      const gainXp = { amount, type: "gain-xp" } as unknown as Effect;
      if (alreadyTriggered("conquer", gainXp)) {
        continue;
      }
      result.push({
        effect: gainXp,
        trigger: { event: "conquer", on: "self" },
        type: "triggered",
      } as TriggeredAbility);
      result.push({
        effect: gainXp,
        trigger: { event: "hold", on: "self" },
        type: "triggered",
      } as TriggeredAbility);
      continue;
    }
    const event = kw ? KEYWORD_TRIGGER_EVENTS[kw] : undefined;
    if (event) {
      const effect = (ab as { effect?: Effect }).effect;
      if (effect && !alreadyTriggered(event, effect)) {
        const condition = (ab as { condition?: unknown }).condition;
        result.push({
          ...(condition ? { condition } : {}),
          effect,
          trigger: { event, on: "self" },
          type: "triggered",
        } as TriggeredAbility);
      }
    }
  }
  return result;
}
