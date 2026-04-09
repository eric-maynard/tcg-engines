/**
 * Effect Keyword Parser
 *
 * Parses effect keywords: Deathknell, Legion, Vision
 * These keywords have attached effects that trigger under specific conditions.
 */

import type {
  AnyTarget,
  Condition,
  Effect,
  EffectKeyword,
  EffectKeywordAbility,
  Location,
} from "@tcg/riftbound-types";

// ============================================================================
// Types
// ============================================================================

export interface EffectKeywordParseResult {
  readonly ability: EffectKeywordAbility;
  readonly startIndex: number;
  readonly endIndex: number;
  /** Remaining text after the effect keyword (for multi-ability parsing) */
  readonly remainingText?: string;
}

// ============================================================================
// Patterns
// ============================================================================

/**
 * Effect keywords that have attached effects
 */
const EFFECT_KEYWORDS: readonly EffectKeyword[] = ["Deathknell", "Legion", "Vision"] as const;

/**
 * Pattern to match effect keywords with their effects
 * Captures: keyword, effect text (after em-dash or space)
 * Examples:
 * - [Deathknell] — Draw 1.
 * - [Legion] — When you play me, buff me.
 * - [Vision] (reminder text)
 */
const EFFECT_KEYWORD_PATTERN = new RegExp(
  `\\[(${EFFECT_KEYWORDS.join("|")})\\](?:\\s*—\\s*|\\s*)`,
  "gi",
);

/**
 * Pattern to match reminder text in parentheses
 */
const REMINDER_TEXT_PATTERN = /\([^)]*\)/g;

/**
 * Pattern to match draw effects: "Draw N."
 */
const DRAW_PATTERN = /^Draw (\d+)\.?/i;

/**
 * Pattern to match channel effects: "Channel N rune(s) [exhausted]."
 */
const CHANNEL_PATTERN = /^Channel (\d+) runes?(?:\s+(exhausted))?\.?/i;

/**
 * Pattern to match buff effects: "Buff TARGET."
 */
const BUFF_PATTERN = /^Buff (me|a friendly unit|a unit)\.?/i;

/**
 * Pattern to match ready effects: "Ready TARGET."
 */
const READY_PATTERN = /^Ready (me|a unit|your units|your runes|a friendly unit)\.?/i;

/**
 * Pattern to match damage effects: "Deal N to TARGET."
 */
const DAMAGE_PATTERN = /^Deal (\d+) to (.+?)\.?$/i;

/**
 * Word-to-number mapping for token quantities
 */
const WORD_NUMBERS: Record<string, number> = {
  a: 1,
  an: 1,
  five: 5,
  four: 4,
  one: 1,
  six: 6,
  three: 3,
  two: 2,
};

function wordToNumber(word: string): number {
  return WORD_NUMBERS[word.toLowerCase()] ?? (Number.parseInt(word, 10) || 1);
}

/**
 * Pattern to match "When you play me" trigger in effect text
 */
const WHEN_PLAY_ME_PATTERN = /^When you play me,\s*/i;

/**
 * Pattern to match conditions in effect text
 */
const IF_MIGHTY_PATTERN = /^If I was \[Mighty\],\s*/i;
const IF_ALONE_PATTERN = /^If I (?:died|was|'m) alone,\s*/i;

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
 * Parse a simple effect from text
 */
function parseSimpleEffect(text: string): Effect | undefined {
  const cleanText = removeReminderText(text).trim();

  // Try draw effect
  const drawMatch = DRAW_PATTERN.exec(cleanText);
  if (drawMatch) {
    return {
      amount: Number.parseInt(drawMatch[1], 10),
      type: "draw",
    };
  }

  // Try channel effect
  const channelMatch = CHANNEL_PATTERN.exec(cleanText);
  if (channelMatch) {
    const amount = Number.parseInt(channelMatch[1], 10);
    const exhausted = channelMatch[2] === "exhausted";
    return exhausted ? { amount, exhausted: true, type: "channel" } : { amount, type: "channel" };
  }

  // Try buff effect
  const buffMatch = BUFF_PATTERN.exec(cleanText);
  if (buffMatch) {
    const targetText = buffMatch[1].toLowerCase();
    const target =
      targetText === "me"
        ? { type: "self" as const }
        : (targetText === "a friendly unit"
          ? { controller: "friendly" as const, type: "unit" as const }
          : { type: "unit" as const });
    return { target, type: "buff" };
  }

  // Try ready effect
  const readyMatch = READY_PATTERN.exec(cleanText);
  if (readyMatch) {
    const targetText = readyMatch[1].toLowerCase();
    let target;
    if (targetText === "me") {
      target = { type: "self" as const };
    } else if (targetText === "your runes") {
      target = {
        controller: "friendly" as const,
        quantity: "all" as const,
        type: "rune" as const,
      };
    } else if (targetText === "your units") {
      target = {
        controller: "friendly" as const,
        quantity: "all" as const,
        type: "unit" as const,
      };
    } else if (targetText === "a friendly unit") {
      target = { controller: "friendly" as const, type: "unit" as const };
    } else {
      target = { type: "unit" as const };
    }
    return { target, type: "ready" };
  }

  // Try damage effect
  const damageMatch = DAMAGE_PATTERN.exec(cleanText);
  if (damageMatch) {
    const amount = Number.parseInt(damageMatch[1], 10);
    const targetText = damageMatch[2].toLowerCase();
    const target: {
      type: "unit";
      controller?: "friendly" | "enemy";
      location?: Location;
      quantity?: "all" | "any" | number;
    } = { type: "unit" };

    if (targetText.includes("enemy")) {
      target.controller = "enemy";
    } else if (targetText.includes("friendly")) {
      target.controller = "friendly";
    }

    if (targetText.includes("all units") || targetText.includes("all ")) {
      target.quantity = "all";
    }

    if (targetText.includes(" here")) {
      target.location = "here";
    } else if (targetText.includes("at my battlefield")) {
      target.location = { battlefield: "controlled" };
    }

    return { amount, target, type: "damage" };
  }

  // Try compound "EFFECT and EFFECT" sequence (e.g., "Channel 2 runes exhausted and draw 1")
  const andMatch = cleanText.match(/^(.+?) and (.+?)\.?$/i);
  if (andMatch) {
    const left = parseSimpleEffect(andMatch[1].trim() + ".");
    const right = parseSimpleEffect(andMatch[2].trim() + ".");
    if (left && right) {
      return { effects: [left, right], type: "sequence" };
    }
  }

  // Try "Recycle me to EFFECT." compound
  const recycleToMatch = cleanText.match(/^Recycle me to (.+?)\.?$/i);
  if (recycleToMatch) {
    const thenEffect = parseSimpleEffect(recycleToMatch[1].trim() + ".");
    if (thenEffect) {
      return { effects: [{ target: "self", type: "recycle" }, thenEffect], type: "sequence" };
    }
  }

  // Try "Discard N, then draw N." sequence effect
  const discardThenDrawMatch = cleanText.match(/^Discard (\d+),\s*then draw (\d+)\.?$/i);
  if (discardThenDrawMatch) {
    const discardAmount = Number.parseInt(discardThenDrawMatch[1], 10);
    const drawAmount = Number.parseInt(discardThenDrawMatch[2], 10);
    return {
      effects: [
        { amount: discardAmount, type: "discard" },
        { amount: drawAmount, type: "draw" },
      ],
      type: "sequence",
    };
  }

  // Try create-token: gear tokens "Play a Gold gear token [exhausted]."
  const gearTokenMatch = cleanText.match(
    /^Play (a|an|one|two|three|four|five|six|\d+)\s+(\w+(?:\s+\w+)?)\s+(gear)\s+tokens?\s*(exhausted)?(?:\s+(?:here|to your base))?\.?$/i,
  );
  if (gearTokenMatch) {
    const amount = wordToNumber(gearTokenMatch[1]);
    const token = { name: gearTokenMatch[2], type: gearTokenMatch[3] as "gear" };
    const effect: { type: "create-token"; token: typeof token; amount?: number } = {
      token,
      type: "create-token",
    };
    if (amount > 1) {
      effect.amount = amount;
    }
    return effect;
  }

  // Try create-token: unit tokens "Play [N] [ready] N :rb_might: NAME unit token(s) [with [KEYWORD]] [location]."
  const unitTokenMatch = cleanText.match(
    /^Play (a|an|one|two|three|four|five|six|\d+)\s+(?:(ready)\s+)?(\d+)\s*:rb_might:\s+(\w+(?:\s+\w+)?)\s+(unit)\s+tokens?(?:\s+with\s+\[(\w+(?:-\w+)?)\])?\s*(?:(here|to your base|into your base|exhausted))?\.?$/i,
  );
  if (unitTokenMatch) {
    const amount = wordToNumber(unitTokenMatch[1]);
    const might = Number.parseInt(unitTokenMatch[3], 10);
    const token: { name: string; type: "unit"; might: number; keywords?: string[] } = {
      might,
      name: unitTokenMatch[4],
      type: unitTokenMatch[5] as "unit",
    };
    if (unitTokenMatch[6]) {
      token.keywords = [unitTokenMatch[6]];
    }
    const effect: {
      type: "create-token";
      token: typeof token;
      amount?: number;
      ready?: boolean;
      location?: string;
    } = {
      token,
      type: "create-token",
    };
    if (amount > 1) {
      effect.amount = amount;
    }
    if (unitTokenMatch[2]) {
      effect.ready = true;
    }
    if (unitTokenMatch[7]) {
      const lower = unitTokenMatch[7].toLowerCase();
      if (lower === "here") {
        effect.location = "here";
      } else if (lower === "to your base" || lower === "into your base") {
        effect.location = "base";
      }
    }
    return effect;
  }

  // Try modify-might: "Give TARGET +/-N :rb_might: this turn."
  const modifyMightMatch = cleanText.match(
    /^Give ((?:a|an|two|three|four|five|\d+)?\s*(?:friendly |enemy )?(?:unit|units|me|it)(?:\s+(?:at a battlefield|here|there))?)\s+(?:each\s+)?([+-]\d+)\s*:rb_might:\s*(this turn)?(?:,?\s*(?:to a minimum of (\d+)\s*:rb_might:))?\.?$/i,
  );
  if (modifyMightMatch) {
    const targetStr = modifyMightMatch[1].trim().toLowerCase();
    let target: AnyTarget;
    if (targetStr === "me") {
      target = "self" as AnyTarget;
    } else {
      const t: { type: "unit"; controller?: "friendly" | "enemy" } = { type: "unit" };
      if (targetStr.includes("friendly")) {
        t.controller = "friendly";
      } else if (targetStr.includes("enemy")) {
        t.controller = "enemy";
      }
      target = t as AnyTarget;
    }
    const effect: {
      type: "modify-might";
      amount: number;
      target: AnyTarget;
      duration?: "turn";
      minimum?: number;
    } = {
      amount: Number.parseInt(modifyMightMatch[2], 10),
      target,
      type: "modify-might",
    };
    if (modifyMightMatch[3]) {
      effect.duration = "turn";
    }
    if (modifyMightMatch[4] !== undefined) {
      effect.minimum = Number.parseInt(modifyMightMatch[4], 10);
    }
    return effect;
  }

  // Try play effect: "You may play a TYPE from your ZONE..."
  const playMatch = cleanText.match(/^(?:You may )?play a (\w+).*?from your (trash|hand|deck)/i);
  if (playMatch) {
    return {
      from: playMatch[2].toLowerCase(),
      target: { type: playMatch[1].toLowerCase() },
      type: "play",
    };
  }

  // Try cost-reduction: "I cost COST less."
  const costReductionMatch = cleanText.match(/^I cost\s+(.+?)\s+less\.?$/i);
  if (costReductionMatch) {
    return {
      reduction: costReductionMatch[1],
      target: "self",
      type: "cost-reduction",
    };
  }

  // Try recycle effect: "Recycle me/a unit."
  const recycleMatch = cleanText.match(/^Recycle (me|a unit|a card|a gear)\.?$/i);
  if (recycleMatch) {
    const targetStr = recycleMatch[1].toLowerCase();
    const target = targetStr === "me" ? "self" : { type: targetStr.replace(/^a /, "") };
    return { target, type: "recycle" };
  }

  return undefined;
}

/**
 * Parse condition from effect text
 */
function parseCondition(text: string): {
  condition?: Condition;
  remainingText: string;
} {
  // Check for "If I was [Mighty]" condition
  const mightyMatch = IF_MIGHTY_PATTERN.exec(text);
  if (mightyMatch) {
    return {
      condition: { type: "while-mighty" },
      remainingText: text.slice(mightyMatch[0].length),
    };
  }

  // Check for "If I died alone" condition
  const aloneMatch = IF_ALONE_PATTERN.exec(text);
  if (aloneMatch) {
    return {
      condition: { type: "while-alone" },
      remainingText: text.slice(aloneMatch[0].length),
    };
  }

  return { remainingText: text };
}

/**
 * Parse effect text that may contain "When you play me" trigger
 * For Legion keyword, this creates a triggered effect
 */
function parseEffectWithTrigger(text: string): Effect | undefined {
  const cleanText = removeReminderText(text).trim();

  // Check for "When you play me" pattern
  const whenPlayMatch = WHEN_PLAY_ME_PATTERN.exec(cleanText);
  if (whenPlayMatch) {
    const effectText = cleanText.slice(whenPlayMatch[0].length);
    const effect = parseSimpleEffect(effectText);
    if (effect) {
      // Return the effect directly - the trigger is implicit in Legion
      return effect;
    }
  }

  // Try parsing as simple effect
  return parseSimpleEffect(cleanText);
}

// ============================================================================
// Main Parser Functions
// ============================================================================

/**
 * Check if text contains an effect keyword
 */
export function hasEffectKeyword(text: string): boolean {
  const pattern = new RegExp(`\\[(${EFFECT_KEYWORDS.join("|")})\\]`, "i");
  return pattern.test(text);
}

/**
 * Parse effect keywords from text with positions
 */
export function parseEffectKeywordsWithPositions(text: string): EffectKeywordParseResult[] {
  const results: EffectKeywordParseResult[] = [];
  const cleanText = removeReminderText(text);

  // Reset pattern lastIndex
  const pattern = new RegExp(EFFECT_KEYWORD_PATTERN.source, "gi");
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(cleanText)) !== null) {
    const keyword = match[1] as EffectKeyword;
    const startIndex = match.index;
    const keywordEndIndex = match.index + match[0].length;

    // Find the effect text after the keyword
    // Look for the next keyword or end of text
    const nextKeywordMatch = cleanText
      .slice(keywordEndIndex)
      .match(
        /\[(?:Deathknell|Legion|Vision|Tank|Ganking|Action|Reaction|Hidden|Temporary|Quick-Draw|Weaponmaster|Unique|Assault|Shield|Deflect|Accelerate|Equip|Repeat)(?:\s+\d+)?\]/i,
      );

    const effectEndIndex = nextKeywordMatch
      ? keywordEndIndex + (nextKeywordMatch.index ?? 0)
      : cleanText.length;

    let effectText = cleanText.slice(keywordEndIndex, effectEndIndex).trim();

    // Remove trailing period if present
    if (effectText.endsWith(".")) {
      effectText = effectText.slice(0, -1).trim();
    }

    // Parse condition from effect text
    const { condition, remainingText } = parseCondition(effectText);
    effectText = remainingText;

    // Parse the effect
    let effect: Effect | undefined;

    if (keyword === "Vision") {
      // Vision has an implicit "look" effect
      effect = {
        amount: 1,
        from: "deck",
        then: { recycle: 1 },
        type: "look",
      };
    } else {
      // Parse the effect text
      effect = parseEffectWithTrigger(effectText);
    }

    // Only add if we have an effect (or it's Vision which has implicit effect)
    if (effect) {
      const ability: EffectKeywordAbility = condition
        ? { condition, effect, keyword, type: "keyword" }
        : { effect, keyword, type: "keyword" };

      results.push({
        ability,
        endIndex: effectEndIndex,
        startIndex,
      });
    }
  }

  return results;
}

/**
 * Parse effect keywords from text
 */
export function parseEffectKeywords(text: string): EffectKeywordAbility[] {
  return parseEffectKeywordsWithPositions(text).map((r) => r.ability);
}

/**
 * Check if a keyword is an effect keyword
 */
export function isEffectKeyword(keyword: string): keyword is EffectKeyword {
  return EFFECT_KEYWORDS.includes(keyword as EffectKeyword);
}
