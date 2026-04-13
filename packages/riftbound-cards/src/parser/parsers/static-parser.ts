/**
 * Static Ability Parser
 *
 * Parses static abilities from ability text.
 * Static abilities are always active and include keyword grants, restrictions, etc.
 */

import type { AnyTarget, Condition, Effect, StaticAbility, Target } from "@tcg/riftbound-types";
import { parseConditionFromText } from "./condition-parser";

// ============================================================================
// Types
// ============================================================================

export interface StaticAbilityParseResult {
  readonly ability: StaticAbility;
  readonly startIndex: number;
  readonly endIndex: number;
}

// ============================================================================
// Patterns
// ============================================================================

/**
 * Pattern to match reminder text in parentheses
 */
const REMINDER_TEXT_PATTERN = /\([^)]*\)/g;

/**
 * Pattern for "TARGET have [KEYWORD]" - grants keyword to others
 * Examples:
 * - "Other friendly units here have [Assault]"
 * - "Your Mechs have [Shield]"
 * - "Friendly units have [Deflect]"
 */
const GRANT_KEYWORD_PATTERN =
  /^(.+?)\s+have\s+\[(\w+(?:-\w+)?)\](?:\s+and\s+\[(\w+(?:-\w+)?)\])?(?:\s*,\s*(?:and\s*)?\[(\w+(?:-\w+)?)\])?\.?/i;

/**
 * Pattern for "While CONDITION, I have [KEYWORDS]" - conditional self-grant
 * Examples:
 * - "While I'm [Mighty], I have [Deflect], [Ganking], and [Shield]"
 * - "While I'm buffed, I have [Ganking]"
 */
const CONDITIONAL_SELF_GRANT_PATTERN = /^(While .+?),\s*I have\s+(.+?)\.?$/i;

/**
 * Pattern for "If CONDITION, I have [KEYWORDS]" - conditional self-grant
 * Examples:
 * - "If you've discarded a card this turn, I have [Assault] and [Ganking]"
 */
const IF_SELF_GRANT_PATTERN = /^(If .+?),\s*I have\s+(.+?)\.?$/i;

/**
 * Pattern for "Units here have [KEYWORD]" - location-based grant.
 * Also matches "Enemy units here have ...", "Friendly units here have ...",
 * "Your units here have ...", and the "other" exclusion prefix.
 */
const LOCATION_GRANT_PATTERN =
  /^((?:(?:Other|Your|Friendly|Enemy)\s+)*units?)\s+here\s+have\s+\[(\w+(?:-\w+)?)\]\.?/i;

/**
 * Pattern for "Your Equipment each give [KEYWORD]"
 */
const EQUIPMENT_GIVE_PATTERN = /^Your Equipment each give\s+\[(\w+(?:-\w+)?)\]\.?/i;

/**
 * Pattern for "Each TYPE in ZONE has [KEYWORD]"
 */
const EACH_TYPE_HAS_PATTERN = /^Each (\w+) in your (\w+) has\s+\[(\w+(?:-\w+)?)\]\.?/i;

/**
 * Pattern for restriction abilities
 * Examples:
 * - "While I'm at a battlefield, opponents can't score points"
 * - "You may play me to an open battlefield"
 */
const RESTRICTION_PATTERN = /^(While .+?),\s*(opponents can't .+|.+ can't .+)\.?$/i;

/**
 * Pattern for play location abilities
 * Examples:
 * - "You may play me to an open battlefield"
 * - "You may play me to an occupied enemy battlefield"
 */
const PLAY_LOCATION_PATTERN = /^You may play me to (an? .+? battlefield)\.?$/i;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Remove reminder text from ability text
 */
function removeReminderText(text: string): string {
  return text.replace(REMINDER_TEXT_PATTERN, "").trim();
}

/**
 * Normalize token syntax in text.
 * Converts `[Might]` to `:rb_might:` so patterns match.
 */
function normalizeTokens(text: string): string {
  return text.replace(/\[Might\]/gi, ":rb_might:");
}

/**
 * Parse keywords from a keyword list string
 * Examples:
 * - "[Deflect], [Ganking], and [Shield]" -> ["Deflect", "Ganking", "Shield"]
 * - "[Assault] and [Ganking]" -> ["Assault", "Ganking"]
 */
function parseKeywordList(text: string): string[] {
  const keywords: string[] = [];
  const pattern = /\[(\w+(?:-\w+)?)\]/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    keywords.push(match[1]);
  }

  return keywords;
}

/**
 * Known tribal tag names mapped from plural form in text
 */
const TRIBAL_TAGS: Record<string, string> = {
  dragons: "Dragon",
  mechs: "Mech",
  poros: "Poro",
  recruits: "Recruit",
  "sand soldiers": "Sand Soldier",
  sprites: "Sprite",
};

/**
 * Parse target from grant text
 * Examples:
 * - "Other friendly units here" -> { type: "unit", controller: "friendly", location: "here", excludeSelf: true }
 * - "Your Mechs" -> { type: "unit", controller: "friendly", filter: { tag: "Mech" } }
 * - "Friendly units" -> { type: "unit", controller: "friendly" }
 * - "Sand Soldiers you play" -> { type: "unit", filter: { tag: "Sand Soldier" } }
 * - "Stunned enemy units here" -> { type: "unit", controller: "enemy", location: "here", filter: "stunned" }
 */
function parseGrantTarget(text: string): Target {
  const normalized = text.toLowerCase().trim();

  const target: {
    type: "unit" | "gear" | "card";
    controller?: "friendly" | "enemy" | "any";
    location?: string;
    excludeSelf?: boolean;
    filter?: { tag: string } | string;
    cardType?: string;
  } = { type: "unit" };

  // Check for "other" (excludes self)
  if (normalized.includes("other")) {
    target.excludeSelf = true;
  }

  // Check for controller. Check "enemy" first because "enemy" contains "my"
  // As a substring and would otherwise be mis-classified as friendly.
  if (/\benemy\b/.test(normalized)) {
    target.controller = "enemy";
  } else if (
    /\bfriendly\b/.test(normalized) ||
    /\byour\b/.test(normalized) ||
    /\bmy\b/.test(normalized)
  ) {
    target.controller = "friendly";
  }

  // Check for location
  if (/\bhere\b/.test(normalized)) {
    target.location = "here";
  } else if (normalized.includes("at my battlefield") || normalized.includes("at battlefield")) {
    target.location = "battlefield";
  }

  // Simple state filters (stunned, buffed, damaged, ready, exhausted)
  const stateFilters = ["stunned", "buffed", "damaged", "ready", "exhausted"];
  for (const f of stateFilters) {
    if (new RegExp(`\\b${f}\\b`).test(normalized)) {
      target.filter = f;
      break;
    }
  }

  // Check for specific types/tribes
  let foundTribe = false;
  for (const [plural, singular] of Object.entries(TRIBAL_TAGS)) {
    if (normalized.includes(plural)) {
      target.filter = { tag: singular };
      foundTribe = true;
      break;
    }
  }
  if (!foundTribe && normalized.includes("equipment")) {
    target.type = "gear";
  }

  return target as Target;
}

// ============================================================================
// Parser Functions
// ============================================================================

/**
 * Check if text is a static ability
 */
export function isStaticAbility(text: string): boolean {
  const cleanText = normalizeTokens(removeReminderText(text));

  return (
    GRANT_KEYWORD_PATTERN.test(cleanText) ||
    CONDITIONAL_SELF_GRANT_PATTERN.test(cleanText) ||
    IF_SELF_GRANT_PATTERN.test(cleanText) ||
    LOCATION_GRANT_PATTERN.test(cleanText) ||
    EQUIPMENT_GIVE_PATTERN.test(cleanText) ||
    EACH_TYPE_HAS_PATTERN.test(cleanText) ||
    RESTRICTION_PATTERN.test(cleanText) ||
    PLAY_LOCATION_PATTERN.test(cleanText)
  );
}

/**
 * Parse a static ability from text
 */
export function parseStaticAbility(text: string): StaticAbilityParseResult | undefined {
  const cleanText = normalizeTokens(removeReminderText(text));

  // First try the inner parser as-is. Many existing patterns already accept a
  // "While you control this battlefield, ..." prefix natively (cost reductions,
  // Grants, etc.).
  const direct = parseStaticAbilityInner(cleanText, text);
  if (direct) {
    return direct;
  }

  // Fallback: strip a leading "While you control this battlefield," prefix and
  // Re-parse the inner static, then wrap with a `while-control-battlefield`
  // Condition. Used by battlefield cards (Ornn's Forge, Forge of the Fluft, etc.)
  // Whose inner content isn't matched by the existing condition-aware patterns.
  const whileControlBfMatch = cleanText.match(/^While you control this battlefield,\s*/i);
  if (whileControlBfMatch) {
    const inner = cleanText.slice(whileControlBfMatch[0].length).trim();
    const innerResult = parseStaticAbilityInner(inner, text);
    if (innerResult) {
      return {
        ...innerResult,
        ability: {
          ...innerResult.ability,
          condition: {
            type: "while-control-battlefield",
          } as unknown as Condition,
        } as StaticAbility,
      };
    }
  }
  return undefined;
}

function parseStaticAbilityInner(
  cleanText: string,
  text: string,
): StaticAbilityParseResult | undefined {
  // "X can be played to an occupied battlefield[, if Y]" — a permission
  // Granting static used by UNL Ambush/Hunt units like Arachnoid Horror.
  // Emits a `can-play-to-occupied` effect that the engine can reference.
  const canPlayOccupiedMatch = cleanText.match(
    /^(I|Friendly units|Your units|Units here)\s+can be played to an occupied battlefield(?:\s+if (.+?))?\.?$/i,
  );
  if (canPlayOccupiedMatch) {
    const subject = canPlayOccupiedMatch[1].toLowerCase();
    const conditionClause = canPlayOccupiedMatch[2];
    const target: AnyTarget =
      subject === "i"
        ? ({ type: "self" } as AnyTarget)
        : ({
            controller:
              subject.includes("friendly") || subject.includes("your") ? "friendly" : undefined,
            location: subject.includes("here") ? "here" : undefined,
            type: "unit",
          } as unknown as AnyTarget);
    const effect = {
      target,
      type: "can-play-to-occupied",
    } as unknown as Effect;
    const ability: StaticAbility = { effect, type: "static" };
    if (conditionClause) {
      const condResult = parseConditionFromText(`if ${conditionClause},`);
      if (condResult?.condition) {
        (ability as { condition: Condition }).condition = condResult.condition;
      }
    }
    return {
      ability,
      endIndex: text.length,
      startIndex: 0,
    };
  }

  // Try conditional self-grant: "While I'm [Mighty], I have [Deflect]..."
  const conditionalMatch = CONDITIONAL_SELF_GRANT_PATTERN.exec(cleanText);
  if (conditionalMatch) {
    const conditionText = conditionalMatch[1];
    const keywordsText = conditionalMatch[2];
    const keywords = parseKeywordList(keywordsText);

    // Parse the condition
    const conditionResult = parseConditionFromText(conditionText + ",");
    const condition = conditionResult?.condition;

    if (condition && keywords.length > 0) {
      const effect: Effect =
        keywords.length === 1
          ? {
              keyword: keywords[0],
              target: { type: "self" } as AnyTarget,
              type: "grant-keyword",
            }
          : {
              keywords,
              target: { type: "self" } as AnyTarget,
              type: "grant-keywords",
            };

      return {
        ability: {
          condition,
          effect,
          type: "static",
        },
        endIndex: text.length,
        startIndex: 0,
      };
    }
  }

  // Try "If CONDITION, I have [KEYWORDS]"
  const ifSelfGrantMatch = IF_SELF_GRANT_PATTERN.exec(cleanText);
  if (ifSelfGrantMatch) {
    const conditionText = ifSelfGrantMatch[1];
    const keywordsText = ifSelfGrantMatch[2];
    const keywords = parseKeywordList(keywordsText);

    // Parse the condition
    const conditionResult = parseConditionFromText(conditionText + ",");
    const condition = conditionResult?.condition;

    if (condition && keywords.length > 0) {
      const effect: Effect =
        keywords.length === 1
          ? {
              keyword: keywords[0],
              target: { type: "self" } as AnyTarget,
              type: "grant-keyword",
            }
          : {
              keywords,
              target: { type: "self" } as AnyTarget,
              type: "grant-keywords",
            };

      return {
        ability: {
          condition,
          effect,
          type: "static",
        },
        endIndex: text.length,
        startIndex: 0,
      };
    }
  }

  // Try grant keyword: "TARGET have [KEYWORD]"
  const grantMatch = GRANT_KEYWORD_PATTERN.exec(cleanText);
  if (grantMatch) {
    const targetText = grantMatch[1];
    const keywords: string[] = [];

    // Collect all keywords from the match groups
    if (grantMatch[2]) {
      keywords.push(grantMatch[2]);
    }
    if (grantMatch[3]) {
      keywords.push(grantMatch[3]);
    }
    if (grantMatch[4]) {
      keywords.push(grantMatch[4]);
    }

    const target = parseGrantTarget(targetText);

    const effect: Effect =
      keywords.length === 1
        ? { keyword: keywords[0], target, type: "grant-keyword" }
        : { keywords, target, type: "grant-keywords" };

    return {
      ability: {
        effect,
        type: "static",
      },
      endIndex: text.length,
      startIndex: 0,
    };
  }

  // Try location grant: "Units here have [KEYWORD]" (and variants)
  const locationGrantMatch = LOCATION_GRANT_PATTERN.exec(cleanText);
  if (locationGrantMatch) {
    const subjectText = locationGrantMatch[1];
    const keyword = locationGrantMatch[2];
    const target = parseGrantTarget(subjectText + " here") as { location?: string };
    target.location = "here";

    return {
      ability: {
        effect: { keyword, target: target as Target, type: "grant-keyword" },
        type: "static",
      },
      endIndex: text.length,
      startIndex: 0,
    };
  }

  // Try equipment give: "Your Equipment each give [KEYWORD]"
  const equipmentGiveMatch = EQUIPMENT_GIVE_PATTERN.exec(cleanText);
  if (equipmentGiveMatch) {
    const keyword = equipmentGiveMatch[1];

    return {
      ability: {
        effect: {
          keyword,
          target: { controller: "friendly", type: "gear" } as Target,
          type: "grant-keyword",
        },
        type: "static",
      },
      endIndex: text.length,
      startIndex: 0,
    };
  }

  // Try "Each TYPE in ZONE has [KEYWORD]"
  const eachTypeMatch = EACH_TYPE_HAS_PATTERN.exec(cleanText);
  if (eachTypeMatch) {
    const cardType = eachTypeMatch[1];
    const zone = eachTypeMatch[2];
    const keyword = eachTypeMatch[3];

    return {
      ability: {
        effect: {
          keyword,
          target: {
            location: zone.toLowerCase(),
            type: cardType.toLowerCase() === "equipment" ? "gear" : "card",
          } as Target,
          type: "grant-keyword",
        },
        type: "static",
      },
      endIndex: text.length,
      startIndex: 0,
    };
  }

  // Try restriction: "While CONDITION, opponents can't..."
  const restrictionMatch = RESTRICTION_PATTERN.exec(cleanText);
  if (restrictionMatch) {
    const conditionText = restrictionMatch[1];
    const restrictionText = restrictionMatch[2];

    const conditionResult = parseConditionFromText(conditionText + ",");
    const condition = conditionResult?.condition;

    if (condition) {
      return {
        ability: {
          condition,
          effect: {
            restriction: restrictionText,
            type: "restriction",
          } as unknown as Effect,
          type: "static",
        },
        endIndex: text.length,
        startIndex: 0,
      };
    }
  }

  // Try play location: "You may play me to..."
  const playLocationMatch = PLAY_LOCATION_PATTERN.exec(cleanText);
  if (playLocationMatch) {
    const locationText = playLocationMatch[1];

    return {
      ability: {
        effect: {
          allowedLocation: locationText,
          type: "play-restriction",
        } as unknown as Effect,
        type: "static",
      },
      endIndex: text.length,
      startIndex: 0,
    };
  }

  // ========================================================================
  // Might Modifier Patterns (static)
  // ========================================================================

  // "TARGET have +N :rb_might: [here]." - static might bonus to others
  const otherMightMatch = cleanText.match(
    /^(.+?)\s+have\s+\+(\d+)\s*:rb_might:(?:\s+(here))?\.?$/i,
  );
  if (otherMightMatch) {
    const target = parseGrantTarget(otherMightMatch[1]);
    const amount = Number.parseInt(otherMightMatch[2], 10);
    if (otherMightMatch[3]) {
      (target as { location?: string }).location = "here";
    }

    return {
      ability: {
        effect: {
          amount,
          target,
          type: "modify-might",
        } as unknown as Effect,
        type: "static",
      },
      endIndex: text.length,
      startIndex: 0,
    };
  }

  // "TARGET have -N :rb_might: [here][, to a minimum of M :rb_might:]." - static might penalty to others
  // E.g. "Stunned enemy units here have -8 :rb_might:, to a minimum of 1 :rb_might:."
  const otherMightPenaltyMatch = cleanText.match(
    /^(.+?)\s+have\s+-(\d+)\s*:rb_might:(?:\s*,\s*to a minimum of\s+(\d+)\s*:rb_might:)?\.?$/i,
  );
  if (otherMightPenaltyMatch) {
    const target = parseGrantTarget(otherMightPenaltyMatch[1]);
    const amount = -Number.parseInt(otherMightPenaltyMatch[2], 10);
    const minimum = otherMightPenaltyMatch[3]
      ? Number.parseInt(otherMightPenaltyMatch[3], 10)
      : undefined;

    return {
      ability: {
        effect: {
          amount,
          ...(minimum !== undefined ? { minimum } : {}),
          target,
          type: "modify-might",
        } as unknown as Effect,
        type: "static",
      },
      endIndex: text.length,
      startIndex: 0,
    };
  }

  // "I have/get +N :rb_might: for each QUALIFIER." - static self might modifier
  const selfMightMatch = cleanText.match(
    /^I (?:have|get) \+(\d+)\s*:rb_might:\s+for each (.+?)\.?$/i,
  );
  if (selfMightMatch) {
    const amount = Number.parseInt(selfMightMatch[1], 10);

    return {
      ability: {
        effect: {
          amount,
          per: selfMightMatch[2],
          target: "self" as AnyTarget,
          type: "modify-might",
        } as unknown as Effect,
        type: "static",
      },
      endIndex: text.length,
      startIndex: 0,
    };
  }

  // "While CONDITION, I have [an additional] +N :rb_might:." - conditional static self-might
  const whileConditionMightMatch = cleanText.match(
    /^(While .+?),\s*I have(?:\s+an additional)?\s+\+(\d+)\s*:rb_might:\.?$/i,
  );
  if (whileConditionMightMatch) {
    const conditionResult = parseConditionFromText(whileConditionMightMatch[1] + ",");
    const condition: Condition =
      conditionResult?.condition ??
      ({ text: whileConditionMightMatch[1], type: "custom" } as unknown as Condition);

    return {
      ability: {
        condition,
        effect: {
          amount: Number.parseInt(whileConditionMightMatch[2], 10),
          target: "self" as AnyTarget,
          type: "modify-might",
        } as unknown as Effect,
        type: "static",
      },
      endIndex: text.length,
      startIndex: 0,
    };
  }

  // "I have +N :rb_might: while CONDITION." - conditional static self-might
  const whileMightMatch = cleanText.match(/^I have \+(\d+)\s*:rb_might:\s+(while .+?)\.?$/i);
  if (whileMightMatch) {
    const amount = Number.parseInt(whileMightMatch[1], 10);
    const conditionResult = parseConditionFromText(whileMightMatch[2] + ",");
    const condition =
      conditionResult?.condition ??
      ({
        text: whileMightMatch[2],
        type: "custom",
      } as unknown as Condition);

    return {
      ability: {
        condition,
        effect: {
          amount,
          target: "self" as AnyTarget,
          type: "modify-might",
        } as unknown as Effect,
        type: "static",
      },
      endIndex: text.length,
      startIndex: 0,
    };
  }

  // "If CONDITION, I have +N :rb_might: [and [KEYWORD]]." - conditional self-might
  const conditionalMightMatch = cleanText.match(
    /^(If .+?),\s*I have \+(\d+)\s*:rb_might:(?:\s+and\s+(.+?))?\.?$/i,
  );
  if (conditionalMightMatch) {
    const conditionResult = parseConditionFromText(conditionalMightMatch[1] + ",");
    const condition: Condition =
      conditionResult?.condition ??
      ({
        text: conditionalMightMatch[1],
        type: "custom",
      } as unknown as Condition);

    const keywords = conditionalMightMatch[3] ? parseKeywordList(conditionalMightMatch[3]) : [];

    // Build effect: modify-might + optional keyword grant
    const mightEffect: Effect = {
      amount: Number.parseInt(conditionalMightMatch[2], 10),
      target: "self" as AnyTarget,
      type: "modify-might",
    } as unknown as Effect;

    const effect: Effect =
      keywords.length > 0
        ? ({
            effects: [
              mightEffect,
              keywords.length === 1
                ? {
                    keyword: keywords[0],
                    target: { type: "self" } as AnyTarget,
                    type: "grant-keyword",
                  }
                : { keywords, target: { type: "self" } as AnyTarget, type: "grant-keywords" },
            ],
            type: "sequence",
          } as unknown as Effect)
        : mightEffect;

    return {
      ability: {
        condition,
        effect,
        type: "static",
      },
      endIndex: text.length,
      startIndex: 0,
    };
  }

  // "I have [+/-]N :rb_might:[ and <extras>]." - unconditional static self-might
  // Examples:
  //   "I have +1 :rb_might:."
  //   "I have +1 :rb_might: and enter ready."
  //   "I have +1 :rb_might: and [Deflect]."
  const unconditionalSelfMightMatch = cleanText.match(
    /^I have\s+([+-]\d+)\s*:rb_might:(?:\s+and\s+(.+?))?\.?$/i,
  );
  if (unconditionalSelfMightMatch) {
    const amount = Number.parseInt(unconditionalSelfMightMatch[1], 10);
    const extras = unconditionalSelfMightMatch[2]?.trim();

    const mightEffect: Effect = {
      amount,
      target: "self" as AnyTarget,
      type: "modify-might",
    } as unknown as Effect;

    let effect: Effect = mightEffect;
    if (extras) {
      // Try to recognize "enter ready" as a simple static note (keyword "enter-ready")
      // Or a bracketed keyword like "[Deflect]" / "[Ganking]".
      const keywordBracket = extras.match(/^\[(\w+(?:-\w+)?)(?:\s+(\d+))?\]\.?$/);
      const isEnterReady = /^enter(?:s)?\s+ready\.?$/i.test(extras);
      if (keywordBracket) {
        effect = {
          effects: [
            mightEffect,
            {
              keyword: keywordBracket[1],
              ...(keywordBracket[2] ? { value: Number.parseInt(keywordBracket[2], 10) } : {}),
              target: { type: "self" } as AnyTarget,
              type: "grant-keyword",
            },
          ],
          type: "sequence",
        } as unknown as Effect;
      } else if (isEnterReady) {
        effect = {
          effects: [
            mightEffect,
            { target: { type: "self" } as AnyTarget, type: "enter-ready" } as unknown as Effect,
          ],
          type: "sequence",
        } as unknown as Effect;
      }
    }

    return {
      ability: {
        effect,
        type: "static",
      },
      endIndex: text.length,
      startIndex: 0,
    };
  }

  // "Each Equipment attached to me gives double its base Might bonus." - equipment might bonus
  const equipmentMightMatch = cleanText.match(
    /^Each Equipment attached to me gives double its base Might bonus\.?$/i,
  );
  if (equipmentMightMatch) {
    return {
      ability: {
        effect: {
          multiplier: 2,
          source: "equipment",
          type: "modify-might",
        } as unknown as Effect,
        type: "static",
      },
      endIndex: text.length,
      startIndex: 0,
    };
  }

  // ========================================================================
  // Cost Reduction Patterns (static)
  // ========================================================================

  // "I cost COST less [for each QUALIFIER]." or "I cost COST less to play from..."
  // Also handles the bare "I cost COST less [instead]." form (no scope) used
  // Inside [Level N] gated static abilities.
  const selfCostScopeMatch = cleanText.match(/^I cost\s+(.+?)\s+less\s+(.+?)\.?$/i);
  if (selfCostScopeMatch) {
    return {
      ability: {
        effect: {
          reduction: selfCostScopeMatch[1],
          scope: selfCostScopeMatch[2],
          target: "self" as AnyTarget,
          type: "cost-reduction",
        } as unknown as Effect,
        type: "static",
      },
      endIndex: text.length,
      startIndex: 0,
    };
  }
  const selfCostBareMatch = cleanText.match(/^I cost\s+(.+?)\s+less(?:\s+instead)?\.?$/i);
  if (selfCostBareMatch) {
    return {
      ability: {
        effect: {
          reduction: selfCostBareMatch[1],
          target: "self" as AnyTarget,
          type: "cost-reduction",
        } as unknown as Effect,
        type: "static",
      },
      endIndex: text.length,
      startIndex: 0,
    };
  }

  // "This spell's Energy cost is reduced by ..." - spell cost reduction
  const spellCostMatch = cleanText.match(/^This spell's Energy cost is reduced by\s+(.+?)\.?$/i);
  if (spellCostMatch) {
    return {
      ability: {
        effect: {
          by: spellCostMatch[1],
          target: "self" as AnyTarget,
          type: "cost-reduction",
        } as unknown as Effect,
        type: "static",
      },
      endIndex: text.length,
      startIndex: 0,
    };
  }

  // "While CONDITION, the Energy costs for spells you play [is/are] reduced by COST[, to a minimum of MIN]."
  const whileSpellCostReduceMatch = cleanText.match(
    /^(While .+?),\s*the Energy costs? for spells you play (?:is|are) reduced by\s+(.+?)(?:,\s*to a minimum of\s+(.+?))?\.?$/i,
  );
  if (whileSpellCostReduceMatch) {
    const conditionResult = parseConditionFromText(whileSpellCostReduceMatch[1] + ",");
    const condition = conditionResult?.condition;
    if (condition) {
      return {
        ability: {
          condition,
          effect: {
            by: whileSpellCostReduceMatch[2],
            ...(whileSpellCostReduceMatch[3] ? { minimum: whileSpellCostReduceMatch[3] } : {}),
            target: { controller: "friendly", type: "spell" } as Target,
            type: "cost-reduction",
          } as unknown as Effect,
          type: "static",
        },
        endIndex: text.length,
        startIndex: 0,
      };
    }
  }

  // "While CONDITION, TARGET costs cost COST less." - conditional cost reduction for others
  const whileCostMatch = cleanText.match(
    /^(While .+?),\s*(.+?)\s+costs?\s+cost\s+(.+?)\s+less\.?$/i,
  );
  if (whileCostMatch) {
    const conditionResult = parseConditionFromText(whileCostMatch[1] + ",");
    const condition = conditionResult?.condition;
    if (condition) {
      return {
        ability: {
          condition,
          effect: {
            reduction: whileCostMatch[3],
            target: whileCostMatch[2],
            type: "cost-reduction",
          } as unknown as Effect,
          type: "static",
        },
        endIndex: text.length,
        startIndex: 0,
      };
    }
  }

  // "If CONDITION, this costs COST less." - conditional cost reduction
  const ifCostMatch = cleanText.match(/^(If .+?),\s*this costs?\s+(.+?)\s+less\.?$/i);
  if (ifCostMatch) {
    const conditionResult = parseConditionFromText(ifCostMatch[1] + ",");
    const condition = conditionResult?.condition;

    return {
      ability: {
        ...(condition ? { condition } : {}),
        effect: {
          reduction: ifCostMatch[2],
          target: "self" as AnyTarget,
          type: "cost-reduction",
        } as unknown as Effect,
        type: "static",
      },
      endIndex: text.length,
      startIndex: 0,
    };
  }

  // ========================================================================
  // Enter Ready Patterns (static)
  // ========================================================================

  // "I enter ready [if CONDITION]." - self enter ready
  const selfEnterReadyMatch = cleanText.match(/^I enter ready(?:\s+if\s+(.+?))?\.?$/i);
  if (selfEnterReadyMatch) {
    const conditionText = selfEnterReadyMatch[1];
    let condition: Condition | undefined;
    if (conditionText) {
      // Parse "if you control another TAG" -> { type: "control", target: { filter: { tag: TAG } } }
      const controlTagMatch = conditionText.match(/^you control another (\w+(?:\s+\w+)?)$/i);
      if (controlTagMatch) {
        const tagName = controlTagMatch[1];
        condition = {
          target: { filter: { tag: tagName } },
          type: "control",
        } as unknown as Condition;
      }
      // Parse "if you have N or more other units in your base"
      const baseUnitsMatch = conditionText.match(
        /^you have (\w+) or more other units in your base$/i,
      );
      if (baseUnitsMatch) {
        condition = {
          count: baseUnitsMatch[1],
          location: "base",
          type: "unit-count",
        } as unknown as Condition;
      }
    }

    return {
      ability: {
        ...(condition ? { condition } : {}),
        effect: {
          target: "self" as AnyTarget,
          type: "enter-ready",
        } as unknown as Effect,
        type: "static",
      },
      endIndex: text.length,
      startIndex: 0,
    };
  }

  // "If CONDITION, I enter ready." - conditional self enter ready
  const ifEnterReadyMatch = cleanText.match(/^(If .+?),\s*I enter ready\.?$/i);
  if (ifEnterReadyMatch) {
    const conditionText = ifEnterReadyMatch[1];
    // Try the shared condition parser for a structured match.
    const conditionResult = parseConditionFromText(conditionText + ",");
    let condition: Condition;
    if (conditionResult?.condition) {
      ({ condition } = conditionResult);
    } else if (/^If an opponent controls a battlefield$/i.test(conditionText)) {
      condition = { type: "opponent-controls" } as unknown as Condition;
    } else {
      condition = { text: conditionText, type: "custom" } as unknown as Condition;
    }

    return {
      ability: {
        condition,
        effect: {
          target: "self" as AnyTarget,
          type: "enter-ready",
        } as unknown as Effect,
        type: "static",
      },
      endIndex: text.length,
      startIndex: 0,
    };
  }

  // "Units you play this turn enter ready." / "Friendly units enter ready this turn." / "The next unit you play this turn enters ready."
  const othersEnterReadyMatch = cleanText.match(
    /^(?:Units you play this turn enter ready|Friendly units enter ready this turn|The next unit you play this turn enters ready)\.?$/i,
  );
  if (othersEnterReadyMatch) {
    return {
      ability: {
        effect: {
          duration: "turn",
          target: { controller: "friendly", type: "unit" } as Target,
          type: "enter-ready",
        } as unknown as Effect,
        type: "static",
      },
      endIndex: text.length,
      startIndex: 0,
    };
  }

  // ========================================================================
  // Restriction Patterns (non-While conditional)
  // ========================================================================

  // "If CONDITION, I don't take damage." - damage restriction
  const ifDamageRestrictionMatch = cleanText.match(/^(If .+?),\s*I don't take damage\.?$/i);
  if (ifDamageRestrictionMatch) {
    return {
      ability: {
        condition: { text: ifDamageRestrictionMatch[1], type: "custom" } as unknown as Condition,
        effect: {
          restriction: "no-damage",
          type: "restriction",
        } as unknown as Effect,
        type: "static",
      },
      endIndex: text.length,
      startIndex: 0,
    };
  }

  // ========================================================================
  // Win Condition Patterns (static)
  // ========================================================================

  // "If you have N or more points, you win the game."
  const winGameMatch = cleanText.match(
    /^If you have (\d+) or more points,\s*you win the game\.?$/i,
  );
  if (winGameMatch) {
    return {
      ability: {
        condition: {
          points: Number.parseInt(winGameMatch[1], 10),
          type: "score-threshold",
        } as unknown as Condition,
        effect: {
          type: "win-game",
        } as unknown as Effect,
        type: "static",
      },
      endIndex: text.length,
      startIndex: 0,
    };
  }

  // "If you're within N points of winning, EFFECT" - conditional effect on score proximity
  const scoreWithinMatch = cleanText.match(
    /^If you(?:'re|'re) within (\d+) points? of winning,\s*(.+?)\.?$/i,
  );
  if (scoreWithinMatch) {
    const points = Number.parseInt(scoreWithinMatch[1], 10);
    const effectText = scoreWithinMatch[2];
    // Parse the effect (e.g. "draw 2")
    const drawMatch = effectText.match(/^draw (\d+)$/i);
    const effect: Effect = drawMatch
      ? ({ amount: Number.parseInt(drawMatch[1], 10), type: "draw" } as unknown as Effect)
      : ({ text: effectText, type: "raw" } as unknown as Effect);

    return {
      ability: {
        condition: { points, type: "score-within" } as unknown as Condition,
        effect,
        type: "spell",
      } as unknown as StaticAbility,
      endIndex: text.length,
      startIndex: 0,
    };
  }

  // "If you've scored N or more points this turn, EFFECT" - conditional on score this turn
  const scoredThisTurnMatch = cleanText.match(
    /^If you(?:'ve|'ve) scored (\d+) or more points this turn,\s*(.+?)\.?$/i,
  );
  if (scoredThisTurnMatch) {
    const amount = Number.parseInt(scoredThisTurnMatch[1], 10);
    const effectText = scoredThisTurnMatch[2];
    // Parse the effect (e.g. "take an extra turn after this one")
    const extraTurnMatch = effectText.match(/^take an extra turn after this one$/i);
    const effect: Effect = extraTurnMatch
      ? ({ type: "extra-turn" } as unknown as Effect)
      : ({ text: effectText, type: "raw" } as unknown as Effect);

    return {
      ability: {
        condition: { amount, type: "score" } as unknown as Condition,
        effect,
        type: "spell",
      } as unknown as StaticAbility,
      endIndex: text.length,
      startIndex: 0,
    };
  }

  // "Your [KEYWORD] effects trigger an additional time." - keyword trigger doubling
  const triggerDoubleMatch = cleanText.match(
    /^Your \[(\w+(?:-\w+)?)\] effects trigger an additional time\.?$/i,
  );
  if (triggerDoubleMatch) {
    return {
      ability: {
        effect: {
          keyword: triggerDoubleMatch[1],
          type: "trigger-double",
        } as unknown as Effect,
        type: "static",
      },
      endIndex: text.length,
      startIndex: 0,
    };
  }

  // "SUBJECT you play have [KEYWORD]." - grant keyword to played cards
  const playGrantMatch = cleanText.match(/^(.+?) you play have\s+\[(\w+(?:-\w+)?)\]\.?$/i);
  if (playGrantMatch) {
    const target = parseGrantTarget(playGrantMatch[1]);
    return {
      ability: {
        effect: {
          keyword: playGrantMatch[2],
          target,
          type: "grant-keyword",
        },
        type: "static",
      },
      endIndex: text.length,
      startIndex: 0,
    };
  }

  // "Spells and abilities deal N Bonus Damage to units here." (Void Gate)
  const bonusDamageMatch = cleanText.match(
    /^Spells and abilities deal (\d+) Bonus Damage to units here\.?$/i,
  );
  if (bonusDamageMatch) {
    return {
      ability: {
        effect: {
          amount: Number.parseInt(bonusDamageMatch[1], 10),
          source: "spells-and-abilities",
          target: { location: "here", type: "unit" } as Target,
          type: "bonus-damage",
        } as unknown as Effect,
        type: "static",
      },
      endIndex: text.length,
      startIndex: 0,
    };
  }

  // "While a unit here is defending alone, it has -N [Might]." (Forbidding Waste)
  const defendingAloneMatch = cleanText.match(
    /^While a unit here is defending alone,\s*it has\s+([+-]\d+)\s*:rb_might:\.?$/i,
  );
  if (defendingAloneMatch) {
    return {
      ability: {
        condition: {
          location: "here",
          state: "defending-alone",
          type: "while-unit-state",
        } as unknown as Condition,
        effect: {
          amount: Number.parseInt(defendingAloneMatch[1], 10),
          target: { location: "here", type: "unit" } as Target,
          type: "modify-might",
        } as unknown as Effect,
        type: "static",
      },
      endIndex: text.length,
      startIndex: 0,
    };
  }

  // "Your units here with less Might than me can't be chosen by enemy spells and abilities." (Alpha Wildclaw)
  const protectMatch = cleanText.match(
    /^Your units here with less Might than me can't be chosen by enemy spells and abilities\.?$/i,
  );
  if (protectMatch) {
    return {
      ability: {
        effect: {
          restriction: "untargetable-by-enemy-spells-abilities",
          target: {
            controller: "friendly",
            filter: { mightLessThanSelf: true },
            location: "here",
            type: "unit",
          } as unknown as Target,
          type: "restriction",
        } as unknown as Effect,
        type: "static",
      },
      endIndex: text.length,
      startIndex: 0,
    };
  }

  // 'Units here have "[Exhaust]: <effect>"' (Gardens of Becoming)
  const grantedActivatedMatch = cleanText.match(
    /^Units here have ["“]\[Exhaust\]:\s*(.+?)["”]\.?$/i,
  );
  if (grantedActivatedMatch) {
    const innerText = grantedActivatedMatch[1].trim();
    return {
      ability: {
        effect: {
          grantedAbility: {
            cost: { exhaust: true },
            effect: { text: innerText, type: "raw-inner" },
            type: "activated",
          },
          target: { location: "here", type: "unit" } as Target,
          type: "grant-activated-ability",
        } as unknown as Effect,
        type: "static",
      },
      endIndex: text.length,
      startIndex: 0,
    };
  }

  // "While CONDITION, friendly spells cost X less to a minimum of M, and enemy spells cost X more." (Vex, Cheerless)
  // Compound variant: friendly cost-reduction + enemy cost-increase under a single condition.
  const whileFriendlyEnemySpellCostMatch = cleanText.match(
    /^(While .+?),\s*friendly spells cost\s+(.+?)\s+less(?:\s+to a minimum of\s+(.+?))?,\s*and enemy spells cost\s+(.+?)\s+more\.?$/i,
  );
  if (whileFriendlyEnemySpellCostMatch) {
    const conditionResult = parseConditionFromText(whileFriendlyEnemySpellCostMatch[1] + ",");
    const condition = conditionResult?.condition;
    if (condition) {
      const reduction = whileFriendlyEnemySpellCostMatch[2];
      const minimum = whileFriendlyEnemySpellCostMatch[3];
      const increase = whileFriendlyEnemySpellCostMatch[4];
      return {
        ability: {
          condition,
          effect: {
            effects: [
              {
                by: reduction,
                ...(minimum ? { minimum } : {}),
                target: { controller: "friendly", type: "spell" } as Target,
                type: "cost-reduction",
              },
              {
                by: increase,
                target: { controller: "enemy", type: "spell" } as Target,
                type: "cost-increase",
              },
            ],
            type: "sequence",
          } as unknown as Effect,
          type: "static",
        },
        endIndex: text.length,
        startIndex: 0,
      };
    }
  }

  // "the first friendly non-token gear played each turn costs [1] less." (Ornn's Forge)
  const firstOfTurnCostMatch = cleanText.match(
    /^the first (?:friendly )?(?:non-token )?(unit|gear|spell|card) played each turn costs\s+(.+?)\s+less\.?$/i,
  );
  if (firstOfTurnCostMatch) {
    const cardType = firstOfTurnCostMatch[1].toLowerCase();
    const reduction = firstOfTurnCostMatch[2];
    return {
      ability: {
        effect: {
          reduction,
          restrictions: [{ type: "first-of-turn" }, { type: "non-token" }],
          target: { controller: "friendly", type: cardType } as Target,
          type: "cost-reduction",
        } as unknown as Effect,
        type: "static",
      },
      endIndex: text.length,
      startIndex: 0,
    };
  }

  // 'Friendly legends have "[Exhaust]: <effect>"' (Forge of the Fluft)
  const grantedActivatedLegendsMatch = cleanText.match(
    /^Friendly legends have ["“]\[Exhaust\]:\s*(.+?)["”]\.?$/i,
  );
  if (grantedActivatedLegendsMatch) {
    const innerText = grantedActivatedLegendsMatch[1].trim();
    return {
      ability: {
        effect: {
          grantedAbility: {
            cost: { exhaust: true },
            effect: { text: innerText, type: "raw-inner" },
            type: "activated",
          },
          target: {
            controller: "friendly",
            filter: { cardType: "legend" },
            type: "unit",
          } as unknown as Target,
          type: "grant-activated-ability",
        } as unknown as Effect,
        type: "static",
      },
      endIndex: text.length,
      startIndex: 0,
    };
  }

  return undefined;
}

/**
 * Parse static abilities from text with positions
 */
export function parseStaticAbilitiesWithPositions(text: string): StaticAbilityParseResult[] {
  const result = parseStaticAbility(text);
  return result ? [result] : [];
}
