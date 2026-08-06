/**
 * Effect parsers: grant keyword.
 */

import type { GrantKeywordEffect } from "@tcg/riftbound-types/abilities/effect-types";
import type { AnyTarget, Target } from "@tcg/riftbound-types/targeting";
import { parseTarget } from "../parsers/target-parser";

/**
 * Target portion for grant-keyword "Give TARGET ..." patterns.
 * Matches: "a unit", "a friendly unit", "it", "me", "them", "your other units here",
 * "your token units", "your units here", "one of your other units here",
 * "another friendly unit at a battlefield", etc.
 */
export const GRANT_TARGET_RE =
  String.raw`(?:(?:one of\s+)?(?:(?:a|an|another|all|your other|your|its owner's|my|other)\s+)*` +
  "(?:friendly |enemy )?" +
  String.raw`(?:(?:\w+\s+)*?)` +
  "(?:unit|units|gear|gears|legend|legends|me|it|them)" +
  String.raw`(?:\s+(?:at a battlefield|here|there))?)`;

/**
 * Resolve a grant-keyword target string into an AnyTarget.
 */
export function resolveGrantTarget(rawTargetStr: string): AnyTarget {
  const targetStr = rawTargetStr.trim();
  const lower = targetStr.toLowerCase();

  if (lower === "me") {
    return "self";
  }
  if (lower === "it" || lower === "them") {
    return { type: "unit" } as AnyTarget;
  }

  // Strip leading "one of"
  const cleaned = targetStr.replace(/^one of\s+/i, "");

  // Handle "your [other] units ..." / "your token units" / "your other units here"
  const yourMatch = cleaned.match(
    /^(?:your|my)\s+(other\s+)?(?:(\w+)\s+)?(unit|units|gear|gears|legend|legends)(?:\s+(here|at a battlefield|there))?$/i,
  );
  if (yourMatch) {
    const otherStr = yourMatch[1];
    const tagStr = yourMatch[2];
    const typeStr = yourMatch[3].toLowerCase().replace(/s$/, "");
    const isPlural = yourMatch[3].toLowerCase().endsWith("s");
    const locationStr = yourMatch[4];
    const result: Record<string, unknown> = {
      controller: "friendly",
      type: typeStr,
    };
    if (isPlural) {
      result.quantity = "all";
    }
    if (otherStr) {
      result.excludeSelf = true;
    }
    if (tagStr && tagStr.length > 0 && tagStr.toLowerCase() !== "other") {
      result.filter = { tag: tagStr.charAt(0).toUpperCase() + tagStr.slice(1).toLowerCase() };
    }
    if (locationStr) {
      if (locationStr.toLowerCase() === "here") {
        result.location = "here";
      } else if (locationStr.toLowerCase() === "at a battlefield") {
        result.location = "battlefield";
      }
    }
    return result as AnyTarget;
  }

  // Handle "another friendly unit", "all enemy units here", etc.
  const quantifierMatch = cleaned.match(
    /^(another|all)\s+((?:friendly |enemy )?(?:unit|units|gear|gears)(?:\s+(?:here|at a battlefield|there))?)$/i,
  );
  if (quantifierMatch) {
    const qualifier = quantifierMatch[1].toLowerCase();
    const rest = quantifierMatch[2];
    const baseTarget = parseTarget(rest) as Target;
    if (qualifier === "all") {
      return { ...baseTarget, quantity: "all" } as AnyTarget;
    }
    return { ...baseTarget, excludeSelf: true } as AnyTarget;
  }

  // Fallback: use parseTarget
  return parseTarget(cleaned);
}

/**
 * Parse a duration string suffix into a grant-keyword duration.
 * Returns undefined if no matching duration (permanent).
 */
export function parseGrantDuration(text: string | undefined): "turn" | "combat" | undefined {
  if (!text) {
    return undefined;
  }
  const lower = text.toLowerCase();
  if (lower.includes("combat")) {
    return "combat" as "turn";
  }
  if (lower.includes("turn")) {
    return "turn";
  }
  return undefined;
}

/**
 * Try to parse a grant-keyword effect: "Give TARGET [KEYWORD] this turn."
 *
 * Handles:
 * - "Give a unit [Assault]" (no duration)
 * - "Give a friendly unit [Tank] this turn."
 * - "Give a unit [Assault 3] this turn."
 * - "Give me [Ganking] this turn."
 * - "Give your other units here [Shield] this turn."
 * - "Give your token units [Tank]."
 * - "Give one of your other units here +N [Might] and [Tank] this turn." (via and-compound)
 * - "It has [Evasive]." (source reference)
 * - "It gains [Shield 2] this combat."
 * - "Friendly units have [Shield]." (static aura)
 */
export function parseGrantKeywordEffect(text: string): GrantKeywordEffect | undefined {
  // Handle "Give TARGET [KEYWORD N] [this turn/combat]." with optional value
  const giveRe = new RegExp(
    `^Give (${GRANT_TARGET_RE})\\s+\\[(\\w+(?:-\\w+)?)(?:\\s+(\\d+))?\\]\\s*(this turn|this combat)?\\.?$`,
    "i",
  );
  const match = text.match(giveRe);
  if (match) {
    const target = resolveGrantTarget(match[1]);
    const keyword = match[2];
    const valueStr = match[3];
    const duration = parseGrantDuration(match[4]);
    const effect: {
      type: "grant-keyword";
      keyword: string;
      target: AnyTarget;
      value?: number;
      duration?: "turn" | "combat";
    } = {
      keyword,
      target,
      type: "grant-keyword",
    };
    if (valueStr) {
      effect.value = Number.parseInt(valueStr, 10);
    }
    if (duration) {
      effect.duration = duration;
    }
    return effect as GrantKeywordEffect;
  }

  // "It has [Keyword]." / "It gains [Keyword N] this combat/turn." — source reference
  const itHasMatch = text.match(
    /^It (?:has|gains?) \[(\w+(?:-\w+)?)(?:\s+(\d+))?\]\s*(this turn|this combat)?\.?$/i,
  );
  if (itHasMatch) {
    const keyword = itHasMatch[1];
    const valueStr = itHasMatch[2];
    const duration = parseGrantDuration(itHasMatch[3]);
    const effect: {
      type: "grant-keyword";
      keyword: string;
      target: AnyTarget;
      value?: number;
      duration?: "turn" | "combat";
    } = {
      keyword,
      target: { type: "unit" } as AnyTarget,
      type: "grant-keyword",
    };
    if (valueStr) {
      effect.value = Number.parseInt(valueStr, 10);
    }
    if (duration) {
      effect.duration = duration;
    }
    return effect as GrantKeywordEffect;
  }

  // Handle "choose a unit. It gains [KEYWORD N] this combat/turn." pattern
  const chooseGainsMatch = text.match(
    /^choose a (?:friendly |enemy )?(?:unit|gear)\.\s*It gains \[(\w+(?:-\w+)?)\s*(\d+)?\]\s*(this (?:turn|combat))?\.?$/i,
  );
  if (chooseGainsMatch) {
    const keyword = chooseGainsMatch[1];
    const valueStr = chooseGainsMatch[2];
    const durationStr = chooseGainsMatch[3];
    const effect: {
      type: "grant-keyword";
      keyword: string;
      target: AnyTarget;
      value?: number;
      duration?: "turn" | "combat";
    } = {
      keyword,
      target: { type: "unit" } as AnyTarget,
      type: "grant-keyword",
    };
    if (valueStr) {
      effect.value = Number.parseInt(valueStr, 10);
    }
    if (durationStr) {
      effect.duration = durationStr.includes("combat") ? ("combat" as "turn") : "turn";
    }
    return effect as GrantKeywordEffect;
  }

  // Static aura: "Friendly units have [Keyword]." / "Your token units have [Tank]."
  const hasMatch = text.match(
    /^(?:(Friendly|Enemy|Your|Your other|Other friendly|Other enemy)\s+)(?:(\w+)\s+)?(unit|units|gear|gears)\s+have\s+\[(\w+(?:-\w+)?)(?:\s+(\d+))?\]\.?$/i,
  );
  if (hasMatch) {
    const qualifier = hasMatch[1].toLowerCase();
    const tagStr = hasMatch[2];
    const typeStr = hasMatch[3].toLowerCase().replace(/s$/, "");
    const keyword = hasMatch[4];
    const valueStr = hasMatch[5];
    const result: Record<string, unknown> = { quantity: "all", type: typeStr };
    if (qualifier.includes("friendly") || qualifier.includes("your")) {
      result.controller = "friendly";
    } else if (qualifier.includes("enemy")) {
      result.controller = "enemy";
    }
    if (qualifier.includes("other")) {
      result.excludeSelf = true;
    }
    if (tagStr && tagStr.length > 0) {
      result.filter = { tag: tagStr.charAt(0).toUpperCase() + tagStr.slice(1).toLowerCase() };
    }
    const effect: {
      type: "grant-keyword";
      keyword: string;
      target: AnyTarget;
      value?: number;
    } = {
      keyword,
      target: result as AnyTarget,
      type: "grant-keyword",
    };
    if (valueStr) {
      effect.value = Number.parseInt(valueStr, 10);
    }
    return effect as GrantKeywordEffect;
  }

  return undefined;
}
