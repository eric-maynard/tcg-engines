/**
 * Condition Parser
 *
 * Parses conditions from ability text.
 * Conditions modify when abilities are active or trigger.
 */

import type { Condition, Target } from "@tcg/riftbound-types";

// ============================================================================
// Types
// ============================================================================

export interface ConditionParseResult {
  readonly condition: Condition;
  /** The remaining text after the condition is extracted */
  readonly remainingText: string;
  /** Start index of the condition in original text */
  readonly startIndex: number;
}

// ============================================================================
// Shared helpers
// ============================================================================

/**
 * Known tribal/tag names that can appear as the object of "control a ___".
 * Keys are lowercased singular forms, values are canonical tag strings.
 */
const TRIBAL_TAGS: Record<string, string> = {
  bird: "Bird",
  cat: "Cat",
  dog: "Dog",
  dragon: "Dragon",
  mech: "Mech",
  poro: "Poro",
  recruit: "Recruit",
  "sand soldier": "Sand Soldier",
  sprite: "Sprite",
  yeti: "Yeti",
};

/**
 * Parse an English number word or numeric string into an integer.
 * Returns undefined if unrecognized.
 */
function parseNumberWord(word: string): number | undefined {
  const normalized = word.toLowerCase().trim();
  const asNumber = Number.parseInt(normalized, 10);
  if (!Number.isNaN(asNumber)) {
    return asNumber;
  }
  const words: Record<string, number> = {
    a: 1,
    an: 1,
    eight: 8,
    five: 5,
    four: 4,
    nine: 9,
    one: 1,
    seven: 7,
    six: 6,
    ten: 10,
    three: 3,
    two: 2,
  };
  return words[normalized];
}

/**
 * Build a Target for a "you control ___" or "there is ___" phrase.
 * Recognizes tribal tags ("a Poro"), facedown cards, state filters
 * ("ready", "stunned", "damaged", "exhausted", "buffed"), card types,
 * and generic "units"/"gear" with optional location qualifiers.
 */
function buildControlTarget(subject: string): Target | undefined {
  const s = subject.toLowerCase().trim();

  // "facedown card at a battlefield"
  if (/facedown card(?: at a battlefield)?/i.test(subject)) {
    return {
      controller: "friendly",
      filter: "facedown",
      location: "battlefield",
      type: "card",
    } as Target;
  }

  // State filter + optional controller + unit.
  // E.g., "stunned enemy unit", "ready friendly unit", "damaged unit".
  const stateMatch = s.match(
    /^(stunned|ready|damaged|exhausted|buffed)\s+(?:(enemy|friendly|your|my)\s+)?unit/i,
  );
  if (stateMatch) {
    const state = stateMatch[1];
    const controllerWord = stateMatch[2];
    // Check "enemy" before "friendly" because "enemy" is a distinct word.
    let controller: "friendly" | "enemy" = "friendly";
    if (controllerWord && /^enemy$/i.test(controllerWord)) {
      controller = "enemy";
    }
    return {
      controller,
      filter: state,
      type: "unit",
    } as Target;
  }

  // Bare "enemy unit" / "enemy gear" etc.
  if (/^(?:a |an )?enemy (unit|gear)/i.test(s)) {
    const kind = /gear/i.test(s) ? "gear" : "unit";
    return { controller: "enemy", type: kind } as Target;
  }

  // Tribal check: "Poro", "Mech", "Dragon", etc.
  for (const [key, tagName] of Object.entries(TRIBAL_TAGS)) {
    const re = new RegExp(`\\b${key}\\b`, "i");
    if (re.test(s)) {
      return {
        controller: "friendly",
        filter: { tag: tagName },
        type: "unit",
      } as Target;
    }
  }

  // "gear" / "gears"
  if (/\bgears?\b/i.test(s)) {
    return {
      controller: "friendly",
      type: "gear",
    } as Target;
  }

  // "equipment"
  if (/\bequipment\b/i.test(s)) {
    return {
      controller: "friendly",
      type: "gear",
    } as Target;
  }

  // "battlefield"
  if (/\bbattlefield\b/i.test(s)) {
    return {
      controller: "friendly",
      type: "card",
    } as Target;
  }

  // Generic "unit"
  if (/\bunits?\b/i.test(s)) {
    return {
      controller: "friendly",
      type: "unit",
    } as Target;
  }

  return undefined;
}

/**
 * Parse phrases like:
 *   - "you control a Poro"
 *   - "you control two or more gear"
 *   - "you control another Mech"
 *   - "you control a facedown card at a battlefield"
 * Returns a ControlCondition or undefined.
 */
function parseControlPhrase(text: string): Condition | undefined {
  // "you control <count/quantifier> <subject>"
  // Accepts: "a", "an", "another", "N or more", "N+", number words.
  const withCountMatch = text.match(
    /^you control (a|an|another|(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)(?:\+| or more)?)\s+(.+?)$/i,
  );
  if (withCountMatch) {
    const quantifier = withCountMatch[1];
    const subject = withCountMatch[2];
    const target = buildControlTarget(subject);
    if (target) {
      // Determine min count
      const orMoreMatch = quantifier.match(
        /^(\d+|one|two|three|four|five|six|seven|eight|nine|ten)(?:\+| or more)$/i,
      );
      if (orMoreMatch) {
        const min = parseNumberWord(orMoreMatch[1]) ?? 1;
        return {
          target: { ...target, quantity: { atLeast: min } },
          type: "control",
        } as Condition;
      }
      // "a" / "an" / "another" — min 1 (excludeSelf if "another")
      if (/^another$/i.test(quantifier)) {
        return {
          target: { ...target, excludeSelf: true },
          type: "control",
        } as Condition;
      }
      return { target, type: "control" } as Condition;
    }
  }

  return undefined;
}

/**
 * Parse phrases like:
 *   - "an opponent controls a stunned unit"
 *   - "an opponent controls a battlefield"
 */
function parseOpponentControlsPhrase(text: string): Condition | undefined {
  const match = text.match(/^an opponent controls (a|an|another)?\s*(.+?)$/i);
  if (!match) {
    return undefined;
  }
  const subject = match[2];
  const target = buildControlTarget(subject);
  if (target) {
    return {
      target: { ...target, controller: "enemy" },
      type: "opponent-controls",
    } as Condition;
  }
  return undefined;
}

/**
 * Parse phrases like:
 *   - "you have exactly 4 cards in hand"
 *   - "you have 4+ units at battlefields"
 *   - "you have 7+ units here"
 *   - "you have one or fewer cards in your hand"
 */
function parseHasCountPhrase(text: string): Condition | undefined {
  // "you have N or fewer cards in your hand" / "one or fewer cards in your hand"
  const fewerMatch = text.match(
    /^you have (one|two|three|four|five|six|\d+) or fewer (cards?|units?)(?:\s+in your hand)?$/i,
  );
  if (fewerMatch) {
    const count = parseNumberWord(fewerMatch[1]) ?? 1;
    const subjType = fewerMatch[2].toLowerCase().replace(/s$/, "");
    return {
      count,
      target: { controller: "friendly", location: "hand", type: subjType } as Target,
      type: "has-at-most",
    } as unknown as Condition;
  }

  // "you have N+ units at that battlefield" — same battlefield as the trigger
  const atThatBfMatch = text.match(/^you have (\d+)\+?\s+(units?|cards?)\s+at that battlefield$/i);
  if (atThatBfMatch) {
    const count = Number.parseInt(atThatBfMatch[1], 10);
    const subjType = atThatBfMatch[2].toLowerCase().replace(/s$/, "");
    return {
      count,
      target: {
        controller: "friendly",
        location: "trigger-battlefield",
        type: subjType,
      } as Target,
      type: "has-at-least",
    } as unknown as Condition;
  }

  // "you have N+ units [here|at battlefields]"
  const plusMatch = text.match(/^you have (\d+)\+?\s+(units?|cards?)(?:\s+(.+))?$/i);
  if (plusMatch) {
    const count = Number.parseInt(plusMatch[1], 10);
    const subjType = plusMatch[2].toLowerCase().replace(/s$/, "");
    const qualifier = (plusMatch[3] ?? "").toLowerCase();
    const target: Target = {
      ...(qualifier.includes("here")
        ? { location: "here" }
        : qualifier.includes("battlefield")
          ? { location: "battlefield" }
          : qualifier.includes("hand")
            ? { location: "hand" }
            : {}),
      controller: "friendly",
      type: subjType === "unit" ? "unit" : "card",
    } as Target;
    return { count, target, type: "has-at-least" } as Condition;
  }

  return undefined;
}

// ============================================================================
// Patterns
// ============================================================================

/**
 * Pattern for "While I'm [Mighty]" condition
 */
const WHILE_MIGHTY_PATTERN = /^While I'm \[Mighty\],?\s*/i;

/**
 * Pattern for "While I'm buffed" condition
 */
const WHILE_BUFFED_PATTERN = /^While I'm buffed,?\s*/i;

/**
 * Pattern for "While I'm at a battlefield" condition
 */
const WHILE_AT_BATTLEFIELD_PATTERN = /^While I'm at a battlefield,?\s*/i;

/**
 * Pattern for "While I'm in combat" condition
 */
const WHILE_IN_COMBAT_PATTERN = /^While I'm in combat,?\s*/i;

/**
 * Pattern for "While you control this battlefield" condition
 */
const WHILE_CONTROL_BATTLEFIELD_PATTERN = /^While you control this battlefield,?\s*/i;

/**
 * Pattern for "While your score is within N points of the Victory Score"
 */
const WHILE_SCORE_WITHIN_PATTERN =
  /^While your score is within (\d+) points? of the Victory Score,?\s*/i;

/**
 * Pattern for "If I was [Mighty]" condition (past tense, for Deathknell)
 */
const IF_MIGHTY_PATTERN = /^If I was \[Mighty\],?\s*/i;

/**
 * Pattern for "If I died alone" or "if I'm alone" condition
 */
const IF_ALONE_PATTERN = /^If I (?:died|was|'m) alone,?\s*/i;

/**
 * Pattern for "if I'm [Mighty]" condition (present tense, for triggers)
 */
const IF_IM_MIGHTY_PATTERN = /^if I'm \[Mighty\],?\s*/i;

/**
 * Pattern for "if I'm alone" condition (present tense, for triggers)
 */
const IF_IM_ALONE_PATTERN = /^if I'm alone,?\s*/i;

/**
 * Pattern for "if I'm at a battlefield" condition
 */
const IF_IM_AT_BATTLEFIELD_PATTERN = /^if I'm at a battlefield,?\s*/i;

/**
 * Pattern for "If you've discarded a card this turn" condition
 */
const IF_DISCARDED_THIS_TURN_PATTERN = /^If you've discarded a card this turn,?\s*/i;

/**
 * Pattern for "If you've spent at least RUNES this turn" condition
 */
const IF_SPENT_POWER_PATTERN = /^If you(?:'ve|'ve) spent at least .+? this turn,?\s*/i;

/**
 * Pattern for "If an enemy unit has died this turn" condition
 */
const IF_ENEMY_DIED_PATTERN = /^If an enemy unit has died this turn,?\s*/i;

/**
 * Pattern for "If an opponent's score is within N points of the Victory Score"
 */
const IF_OPPONENT_SCORE_WITHIN_PATTERN =
  /^If an opponent's score is within (\d+) points? of the Victory Score,?\s*/i;

/**
 * Pattern for "If you're within N points of winning"
 */
const IF_YOURE_WITHIN_PATTERN = /^If you(?:'re|'re) within (\d+) points? of winning,?\s*/i;

/**
 * Pattern for "[Legion]" condition (in activated abilities)
 */
const LEGION_CONDITION_PATTERN = /^\[Legion\]\s*—?\s*/i;

/**
 * Pattern for generic "if you control ..." - handled by parseControlPhrase
 */
const IF_YOU_CONTROL_PATTERN = /^if (you control .+?),?\s*$/i;

/**
 * Pattern for generic "if an opponent controls ..."
 */
const IF_OPPONENT_CONTROLS_PATTERN = /^if (an opponent controls .+?),?\s*$/i;

/**
 * Pattern for generic "if you have N ...." — count-based
 */
const IF_YOU_HAVE_PATTERN = /^if (you have .+?),?\s*$/i;

// ============================================================================
// Parser Functions
// ============================================================================

/**
 * Parse a condition from the start of text
 * Returns the condition and remaining text
 */
export function parseConditionFromText(text: string): ConditionParseResult | undefined {
  // Try "While I'm [Mighty]"
  const whileMightyMatch = WHILE_MIGHTY_PATTERN.exec(text);
  if (whileMightyMatch) {
    return {
      condition: { type: "while-mighty" },
      remainingText: text.slice(whileMightyMatch[0].length),
      startIndex: 0,
    };
  }

  // Try "While I'm buffed"
  const whileBuffedMatch = WHILE_BUFFED_PATTERN.exec(text);
  if (whileBuffedMatch) {
    return {
      condition: { type: "while-buffed" },
      remainingText: text.slice(whileBuffedMatch[0].length),
      startIndex: 0,
    };
  }

  // Try "While I'm at a battlefield"
  const whileAtBattlefieldMatch = WHILE_AT_BATTLEFIELD_PATTERN.exec(text);
  if (whileAtBattlefieldMatch) {
    return {
      condition: { type: "while-at-battlefield" },
      remainingText: text.slice(whileAtBattlefieldMatch[0].length),
      startIndex: 0,
    };
  }

  // Try "While I'm in combat"
  const whileInCombatMatch = WHILE_IN_COMBAT_PATTERN.exec(text);
  if (whileInCombatMatch) {
    return {
      condition: { type: "in-combat" },
      remainingText: text.slice(whileInCombatMatch[0].length),
      startIndex: 0,
    };
  }

  // Try "If I was [Mighty]" (past tense)
  const ifMightyMatch = IF_MIGHTY_PATTERN.exec(text);
  if (ifMightyMatch) {
    return {
      condition: { type: "while-mighty" },
      remainingText: text.slice(ifMightyMatch[0].length),
      startIndex: 0,
    };
  }

  // Try "If I died alone" or "if I was alone"
  const ifAloneMatch = IF_ALONE_PATTERN.exec(text);
  if (ifAloneMatch) {
    return {
      condition: { type: "while-alone" },
      remainingText: text.slice(ifAloneMatch[0].length),
      startIndex: 0,
    };
  }

  // Try "if I'm [Mighty]" (present tense, lowercase)
  const ifImMightyMatch = IF_IM_MIGHTY_PATTERN.exec(text);
  if (ifImMightyMatch) {
    return {
      condition: { type: "while-mighty" },
      remainingText: text.slice(ifImMightyMatch[0].length),
      startIndex: 0,
    };
  }

  // Try "if I'm alone" (present tense, lowercase)
  const ifImAloneMatch = IF_IM_ALONE_PATTERN.exec(text);
  if (ifImAloneMatch) {
    return {
      condition: { type: "while-alone" },
      remainingText: text.slice(ifImAloneMatch[0].length),
      startIndex: 0,
    };
  }

  // Try "if I'm at a battlefield" (present tense)
  const ifImAtBattlefieldMatch = IF_IM_AT_BATTLEFIELD_PATTERN.exec(text);
  if (ifImAtBattlefieldMatch) {
    return {
      condition: { type: "while-at-battlefield" },
      remainingText: text.slice(ifImAtBattlefieldMatch[0].length),
      startIndex: 0,
    };
  }

  // Try "If you've discarded a card this turn"
  const ifDiscardedMatch = IF_DISCARDED_THIS_TURN_PATTERN.exec(text);
  if (ifDiscardedMatch) {
    return {
      condition: { event: "discarded", type: "this-turn" },
      remainingText: text.slice(ifDiscardedMatch[0].length),
      startIndex: 0,
    };
  }

  // Try "While you control this battlefield"
  const whileControlBattlefieldMatch = WHILE_CONTROL_BATTLEFIELD_PATTERN.exec(text);
  if (whileControlBattlefieldMatch) {
    return {
      condition: { type: "control-battlefield" },
      remainingText: text.slice(whileControlBattlefieldMatch[0].length),
      startIndex: 0,
    };
  }

  // Try "While your score is within N points of the Victory Score"
  const whileScoreWithinMatch = WHILE_SCORE_WITHIN_PATTERN.exec(text);
  if (whileScoreWithinMatch) {
    return {
      condition: {
        points: Number.parseInt(whileScoreWithinMatch[1], 10),
        type: "score-within",
        whose: "your",
      },
      remainingText: text.slice(whileScoreWithinMatch[0].length),
      startIndex: 0,
    };
  }

  // Try "If an opponent's score is within N points of the Victory Score"
  const ifOpponentScoreMatch = IF_OPPONENT_SCORE_WITHIN_PATTERN.exec(text);
  if (ifOpponentScoreMatch) {
    return {
      condition: {
        points: Number.parseInt(ifOpponentScoreMatch[1], 10),
        type: "score-within",
        whose: "opponent",
      },
      remainingText: text.slice(ifOpponentScoreMatch[0].length),
      startIndex: 0,
    };
  }

  // Try "If you're within N points of winning"
  const ifYoureWithinMatch = IF_YOURE_WITHIN_PATTERN.exec(text);
  if (ifYoureWithinMatch) {
    return {
      condition: {
        points: Number.parseInt(ifYoureWithinMatch[1], 10),
        type: "score-within",
        whose: "your",
      },
      remainingText: text.slice(ifYoureWithinMatch[0].length),
      startIndex: 0,
    };
  }

  // Try "If you've spent at least RUNES this turn"
  const ifSpentPowerMatch = IF_SPENT_POWER_PATTERN.exec(text);
  if (ifSpentPowerMatch) {
    return {
      condition: { type: "spent-power" },
      remainingText: text.slice(ifSpentPowerMatch[0].length),
      startIndex: 0,
    };
  }

  // Try "If an enemy unit has died this turn"
  const ifEnemyDiedMatch = IF_ENEMY_DIED_PATTERN.exec(text);
  if (ifEnemyDiedMatch) {
    return {
      condition: { event: "enemy-died", type: "this-turn" },
      remainingText: text.slice(ifEnemyDiedMatch[0].length),
      startIndex: 0,
    };
  }

  // Try "[Legion]" condition
  const legionMatch = LEGION_CONDITION_PATTERN.exec(text);
  if (legionMatch) {
    return {
      condition: { type: "legion" },
      remainingText: text.slice(legionMatch[0].length),
      startIndex: 0,
    };
  }

  // Try generic "if you control X" (tribal, gear, count, etc.)
  const ifYouControlMatch = IF_YOU_CONTROL_PATTERN.exec(text.trim());
  if (ifYouControlMatch) {
    const condition = parseControlPhrase(ifYouControlMatch[1]);
    if (condition) {
      return {
        condition,
        remainingText: "",
        startIndex: 0,
      };
    }
  }

  // Try generic "if an opponent controls X"
  const ifOpponentControlsMatch = IF_OPPONENT_CONTROLS_PATTERN.exec(text.trim());
  if (ifOpponentControlsMatch) {
    const condition = parseOpponentControlsPhrase(ifOpponentControlsMatch[1]);
    if (condition) {
      return {
        condition,
        remainingText: "",
        startIndex: 0,
      };
    }
  }

  // Try generic "if you have N ..." count phrase
  const ifYouHaveMatch = IF_YOU_HAVE_PATTERN.exec(text.trim());
  if (ifYouHaveMatch) {
    const condition = parseHasCountPhrase(ifYouHaveMatch[1]);
    if (condition) {
      return {
        condition,
        remainingText: "",
        startIndex: 0,
      };
    }
  }

  return undefined;
}

/**
 * Try to match a leading "if ... , <rest>" condition and return both the
 * parsed condition and the remaining text. Used by the triggered and spell
 * ability parsers to hoist a condition out of an inline fragment.
 */
export function parseLeadingIfCondition(
  text: string,
): { condition: Condition; effectText: string } | undefined {
  // Match "if <clause>, <rest>" where clause has no top-level commas.
  const match = text.match(/^if ([^,]+?),\s*(.+)$/i);
  if (!match) {
    return undefined;
  }
  const clause = match[1].trim();
  const rest = match[2];

  // Dispatch on clause type:

  // "if I'm [Mighty]"
  if (/^I'm \[Mighty\]$/i.test(clause)) {
    return { condition: { type: "while-mighty" }, effectText: rest };
  }
  // "if I'm alone"
  if (/^I'm alone$/i.test(clause)) {
    return { condition: { type: "while-alone" }, effectText: rest };
  }
  // "if I'm at a battlefield"
  if (/^I'm at a battlefield$/i.test(clause)) {
    return { condition: { type: "while-at-battlefield" }, effectText: rest };
  }
  // "if I'm buffed"
  if (/^I'm buffed$/i.test(clause)) {
    return { condition: { type: "while-buffed" }, effectText: rest };
  }
  // "if it is stunned" / "if it's stunned"
  if (/^it (?:is|'s) stunned$/i.test(clause)) {
    return {
      condition: {
        target: { type: "unit" },
        type: "is-stunned",
      } as unknown as Condition,
      effectText: rest,
    };
  }
  // "if it is damaged" / "if it's damaged"
  if (/^it (?:is|'s) damaged$/i.test(clause)) {
    return {
      condition: {
        target: { type: "unit" },
        type: "is-damaged",
      } as unknown as Condition,
      effectText: rest,
    };
  }
  // "if I was [Mighty]"
  if (/^I was \[Mighty\]$/i.test(clause)) {
    return { condition: { type: "while-mighty" }, effectText: rest };
  }
  // "if you paid the additional cost"
  if (/^you paid the additional cost$/i.test(clause)) {
    return {
      condition: { type: "paid-additional-cost" },
      effectText: rest,
    };
  }
  // "if you assigned N or more excess damage [to (enemy) units]"
  const excessDamageMatch = clause.match(
    /^you assigned (\d+) or more excess damage(?:\s+to\s+(?:an enemy|enemy|all enemy)?\s*units?)?$/i,
  );
  if (excessDamageMatch) {
    return {
      condition: {
        amount: Number.parseInt(excessDamageMatch[1], 10),
        type: "excess-damage-assigned",
      } as unknown as Condition,
      effectText: rest,
    };
  }
  // "if you spent :rb_energy_N: or more [to play a spell this turn]"
  const spentEnergyMatch = clause.match(/^you(?:'ve|'ve)?\s*spent\s+:rb_energy_(\d+):\s+or more/i);
  if (spentEnergyMatch) {
    return {
      condition: {
        amount: Number.parseInt(spentEnergyMatch[1], 10),
        type: "spent-power",
      } as unknown as Condition,
      effectText: rest,
    };
  }
  // "if it's your Beginning Phase"
  if (/^it's your Beginning Phase$/i.test(clause)) {
    return {
      condition: { type: "your-beginning-phase" } as unknown as Condition,
      effectText: rest,
    };
  }
  // "if your other units have total Might N or more"
  const totalMightMatch = clause.match(/^your other units have total Might (\d+) or more$/i);
  if (totalMightMatch) {
    return {
      condition: {
        amount: Number.parseInt(totalMightMatch[1], 10),
        scope: "other-units",
        type: "total-might-at-least",
      } as unknown as Condition,
      effectText: rest,
    };
  }
  // "if an enemy unit is alone here" — used by UNL Hunt/Ambush triggers.
  if (/^an enemy unit is alone here$/i.test(clause)) {
    return {
      condition: {
        role: "either",
        target: { controller: "enemy", location: "here", type: "unit" },
        type: "alone-in-combat",
      } as unknown as Condition,
      effectText: rest,
    };
  }

  // "if a friendly unit is alone here"
  if (/^a friendly unit is alone here$/i.test(clause)) {
    return {
      condition: {
        role: "either",
        target: { controller: "friendly", location: "here", type: "unit" },
        type: "alone-in-combat",
      } as unknown as Condition,
      effectText: rest,
    };
  }

  // "if there is a ready enemy unit here" / "if there are N <subj> here"
  const thereIsMatch = clause.match(/^there (?:is|are) (?:a |an )?(.+?)\s+here$/i);
  if (thereIsMatch) {
    const subject = thereIsMatch[1];
    const target = buildControlTarget(subject) ?? ({ type: "unit" } as Target);
    return {
      condition: {
        target: { ...target, location: "here" },
        type: "exists-here",
      } as unknown as Condition,
      effectText: rest,
    };
  }
  // "if you control ___"
  const controlCondition = parseControlPhrase(clause);
  if (controlCondition) {
    return { condition: controlCondition, effectText: rest };
  }
  // "if an opponent controls ___"
  const oppControlCondition = parseOpponentControlsPhrase(clause);
  if (oppControlCondition) {
    return { condition: oppControlCondition, effectText: rest };
  }
  // "if you have ___"
  const hasCondition = parseHasCountPhrase(clause);
  if (hasCondition) {
    return { condition: hasCondition, effectText: rest };
  }
  // "if an opponent's score is within N points of the Victory Score"
  const scoreMatch = clause.match(
    /^an opponent's score is within (\d+) points? of the Victory Score$/i,
  );
  if (scoreMatch) {
    return {
      condition: {
        points: Number.parseInt(scoreMatch[1], 10),
        type: "score-within",
        whose: "opponent",
      },
      effectText: rest,
    };
  }
  // "if you're within N points of winning"
  const yoursScoreMatch = clause.match(/^you(?:'re|'re) within (\d+) points? of winning$/i);
  if (yoursScoreMatch) {
    return {
      condition: {
        points: Number.parseInt(yoursScoreMatch[1], 10),
        type: "score-within",
        whose: "your",
      },
      effectText: rest,
    };
  }

  return undefined;
}

/**
 * Try to match a trailing "<effect> if <clause>" condition and return both
 * the parsed condition and the preceding effect text. Mirror of
 * parseLeadingIfCondition, for effects of the shape "draw 1 if you have N cards".
 */
export function parseTrailingIfCondition(
  text: string,
): { condition: Condition; effectText: string } | undefined {
  // Match "<effect> if <clause>[.]" where clause has no top-level commas.
  const match = text.match(/^(.+?)\s+if\s+([^,]+?)\.?$/i);
  if (!match) {
    return undefined;
  }
  const before = match[1].trim();
  const clause = match[2].trim();

  // Reuse the leading parser's dispatch by wrapping the clause as "if X, stub".
  const dispatched = parseLeadingIfCondition(`if ${clause}, x`);
  if (!dispatched) {
    return undefined;
  }
  return { condition: dispatched.condition, effectText: before };
}

/**
 * Parse a condition from anywhere in the text (after a comma)
 * Used for triggered abilities like "When I attack, if I'm [Mighty], ..."
 */
export function parseInlineCondition(text: string): {
  condition?: Condition;
  effectText: string;
} {
  // Look for ", if I'm [Mighty]," pattern
  const mightyInlineMatch = text.match(/,\s*if I'm \[Mighty\],?\s*/i);
  if (mightyInlineMatch && mightyInlineMatch.index !== undefined) {
    const beforeCondition = text.slice(0, mightyInlineMatch.index);
    const afterCondition = text.slice(mightyInlineMatch.index + mightyInlineMatch[0].length);
    return {
      condition: { type: "while-mighty" },
      effectText: beforeCondition + ", " + afterCondition,
    };
  }

  // Look for ", if I'm alone," pattern
  const aloneInlineMatch = text.match(/,\s*if I'm alone,?\s*/i);
  if (aloneInlineMatch && aloneInlineMatch.index !== undefined) {
    const beforeCondition = text.slice(0, aloneInlineMatch.index);
    const afterCondition = text.slice(aloneInlineMatch.index + aloneInlineMatch[0].length);
    return {
      condition: { type: "while-alone" },
      effectText: beforeCondition + ", " + afterCondition,
    };
  }

  return { effectText: text };
}

/**
 * Check if text starts with a condition
 */
export function startsWithCondition(text: string): boolean {
  return (
    WHILE_MIGHTY_PATTERN.test(text) ||
    WHILE_BUFFED_PATTERN.test(text) ||
    WHILE_AT_BATTLEFIELD_PATTERN.test(text) ||
    WHILE_IN_COMBAT_PATTERN.test(text) ||
    WHILE_CONTROL_BATTLEFIELD_PATTERN.test(text) ||
    WHILE_SCORE_WITHIN_PATTERN.test(text) ||
    IF_MIGHTY_PATTERN.test(text) ||
    IF_ALONE_PATTERN.test(text) ||
    IF_IM_MIGHTY_PATTERN.test(text) ||
    IF_IM_ALONE_PATTERN.test(text) ||
    IF_IM_AT_BATTLEFIELD_PATTERN.test(text) ||
    IF_DISCARDED_THIS_TURN_PATTERN.test(text) ||
    IF_SPENT_POWER_PATTERN.test(text) ||
    IF_ENEMY_DIED_PATTERN.test(text) ||
    IF_OPPONENT_SCORE_WITHIN_PATTERN.test(text) ||
    IF_YOURE_WITHIN_PATTERN.test(text) ||
    LEGION_CONDITION_PATTERN.test(text)
  );
}

/**
 * Check if text contains an inline condition
 */
export function hasInlineCondition(text: string): boolean {
  return /,\s*if I'm \[Mighty\]/i.test(text) || /,\s*if I'm alone/i.test(text);
}
