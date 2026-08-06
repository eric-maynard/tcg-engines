/**
 * Effect parsers: stun / ready / exhaust.
 */

import type {
  Effect,
  SequenceEffect,
  StunEffect,
} from "@tcg/riftbound-types/abilities/effect-types";
import type { AnyTarget, Location, Target } from "@tcg/riftbound-types/targeting";
import { parseTarget } from "../parsers/target-parser";
import { parseEffect } from "./effect";
import { wordToNumber } from "./tokens";

/**
 * Try to parse a stun effect: "Stun TARGET."
 *
 * Handles:
 * - "Stun me." / "Stun it." (self/source references)
 * - "Stun a unit." / "Stun an enemy unit."
 * - "Stun another friendly unit."
 * - "Stun all enemy units here."
 * - "Stun an attacking [enemy] unit."
 * - "Stun an enemy unit at a battlefield."
 * - "Stun a friendly unit and an enemy unit..." (delegated to and-compound)
 */
export function parseStunEffect(text: string): StunEffect | undefined {
  // Self references: "Stun me." / "Stun it."
  if (/^Stun (me|it)\.?$/i.test(text)) {
    const selfMatch = text.match(/^Stun (me|it)\.?$/i);
    const ref = selfMatch?.[1].toLowerCase();
    if (ref === "me") {
      return { target: "self" as AnyTarget, type: "stun" };
    }
    // rule 355.10.d — "it" is the firing event's subject, determined
    // automatically; nobody chooses, so it is not a target.
    return { target: { type: "trigger-source" } as AnyTarget, type: "stun" };
  }

  const match = text.match(
    /^Stun ((?:(?:all|another)\s+)?(?:a|an)?\s*(?:attacking\s+)?(?:friendly |enemy )?(?:attacking\s+)?(?:unit|units)(?:\s+(?:at a battlefield|at its location|here|there))?)\.?$/i,
  );
  if (!match) {
    return undefined;
  }
  const targetStr = match[1].toLowerCase().trim();
  const target: {
    type: "unit";
    controller?: "friendly" | "enemy";
    location?: Location;
    filter?: { state: string };
    quantity?: "all";
    excludeSelf?: boolean;
  } = { type: "unit" };

  if (targetStr.includes("enemy")) {
    target.controller = "enemy";
  } else if (targetStr.includes("friendly")) {
    target.controller = "friendly";
  }
  if (targetStr.includes("here")) {
    target.location = "here" as Location;
  } else if (targetStr.includes("at a battlefield")) {
    target.location = "battlefield";
  } else if (targetStr.includes("at its location")) {
    // "at its location" — scoped to the previously mentioned target's spot.
    // Encoded as "here" on the location axis; effect executor resolves
    // Relative to the current target context.
    target.location = "here" as Location;
  }
  if (targetStr.includes("attacking")) {
    target.filter = { state: "attacking" };
  }
  if (/^all\b/.test(targetStr)) {
    target.quantity = "all";
  } else if (/^another\b/.test(targetStr)) {
    target.excludeSelf = true;
  }
  return { target: target as AnyTarget, type: "stun" };
}

/**
 * Try to parse a ready effect: "Ready TARGET."
 */
export function parseReadyEffect(text: string): Effect | undefined {
  // rule-id: ven-150-166 (Acceleration Gate) — "Ready up to 4 units, gear,
  // and/or runes.": a comma / "and/or" list of card types is ONE mixed pool the
  // caster picks from. Emit `types` (any-of) alongside a `permanent` base type.
  const mixed = parseMixedTypeReadyTarget(text);
  if (mixed) {
    return { target: mixed, type: "ready" };
  }

  // Pattern: "Ready [all/up to N/another] [controller] [TAG] TARGET [here]."
  // The broad alternation accepts:
  //   - pronouns: me, it, them
  //   - possessive plurals: your units, your runes
  //   - "something else" fallback
  //   - "up to N of them"
  //   - quantified/qualified targets ending in a card type OR a tag word (e.g., "Mech")
  const match = text.match(
    /^Ready (me|it|them|(?:(?:all|up to (?:two|three|four|five|six|\d+)|another)\s+)?(?:a |an )?(?:friendly |enemy |your )?(?:\w+\s+)*?(?:unit|units|gear|gears|legend|legends|rune|runes|equipment|card|permanent|[A-Z]\w*)(?:s)?(?:\s+(?:here|at a battlefield|there))?|your units|your runes|your legend|something else(?:\s+that's exhausted)?|up to (?:two|three|four|five|six|\d+) of them)\.?$/i,
  );
  if (!match) {
    return undefined;
  }
  const targetText = match[1].trim();
  const targetLower = targetText.toLowerCase();
  let target: AnyTarget;

  if (targetLower === "me") {
    target = "self";
  } else if (targetLower === "it" || targetLower === "them") {
    target = { type: "unit" as const } as AnyTarget;
  } else if (targetLower === "your units") {
    target = {
      controller: "friendly" as const,
      quantity: "all" as const,
      type: "unit" as const,
    } as AnyTarget;
  } else if (targetLower === "your runes") {
    target = {
      controller: "friendly" as const,
      quantity: "all" as const,
      type: "rune" as const,
    } as AnyTarget;
  } else if (targetLower === "your legend") {
    target = {
      controller: "friendly" as const,
      type: "legend" as const,
    } as AnyTarget;
  } else if (/^something else/i.test(targetLower)) {
    target = { type: "unit" as const } as AnyTarget;
  } else {
    // Handle "up to N of them" pronoun pattern
    const upToThemMatch = targetText.match(/^up to (\w+) of them$/i);
    if (upToThemMatch) {
      const quantity = { upTo: wordToNumber(upToThemMatch[1]) };
      target = { quantity, type: "unit" as const } as AnyTarget;
    } else {
      // Handle "all [controller] targets [location]" prefix
      const allMatch = targetText.match(/^all\s+(.+)$/i);
      if (allMatch) {
        const baseTarget = parseTarget(allMatch[1]) as Target;
        target = { ...baseTarget, quantity: "all" as const } as AnyTarget;
      } else {
        // Parse "up to N [word] ..." quantity prefix
        const upToMatch = targetText.match(/^up to (\w+)\s+(.+)$/i);
        if (upToMatch) {
          const quantity = { upTo: wordToNumber(upToMatch[1]) };
          const rest = upToMatch[2];
          const baseTarget = parseTarget(rest) as Target;
          target = { ...baseTarget, quantity } as AnyTarget;
        } else {
          // Parse "another [friendly] [Tag] [type]" patterns
          const anotherMatch = targetText.match(/^another\s+(.+)$/i);
          if (anotherMatch) {
            const baseTarget = parseTarget(anotherMatch[1]) as Target;
            target = { ...baseTarget, excludeSelf: true } as AnyTarget;
          } else {
            target = parseTarget(targetText);
          }
        }
      }
    }
  }
  return { target, type: "ready" };
}

const MIXED_TYPE_NOUNS: Record<string, "unit" | "gear" | "rune" | "legend" | "equipment"> = {
  equipment: "equipment",
  gear: "gear",
  gears: "gear",
  legend: "legend",
  legends: "legend",
  rune: "rune",
  runes: "rune",
  unit: "unit",
  units: "unit",
};

/**
 * rule-id: ven-150-166 — "Ready [up to N|all] [friendly|enemy|your] units, gear,
 * and/or runes." Requires ≥2 type nouns joined by "," / "and" / "or" / "and/or".
 */
function parseMixedTypeReadyTarget(text: string): AnyTarget | undefined {
  const noun = "(?:units?|gears?|runes?|legends?|equipment)";
  const sep = "(?:,\\s*(?:(?:and\\/or|and|or)\\s+)?|\\s+(?:and\\/or|and|or)\\s+)";
  const re = new RegExp(
    `^Ready (?:(all|up to (?:\\w+))\\s+)?(?:(friendly|enemy|your)\\s+)?(${noun}(?:${sep}${noun})+)\\.?$`,
    "i",
  );
  const m = text.match(re);
  if (!m) {
    return undefined;
  }
  const types = [
    ...new Set(
      m[3]
        .split(/,|\s+/)
        .map((w) => MIXED_TYPE_NOUNS[w.toLowerCase()])
        .filter((t): t is NonNullable<typeof t> => t !== undefined),
    ),
  ];
  if (types.length < 2) {
    return undefined;
  }
  const target: Record<string, unknown> = { type: "permanent", types };
  const qtyText = m[1]?.toLowerCase();
  if (qtyText === "all") {
    target.quantity = "all";
  } else if (qtyText) {
    const upTo = qtyText.match(/^up to (\w+)$/i);
    if (upTo) {
      target.quantity = { upTo: wordToNumber(upTo[1]) };
    }
  }
  const ctl = m[2]?.toLowerCase();
  if (ctl === "friendly" || ctl === "your") {
    target.controller = "friendly";
  } else if (ctl === "enemy") {
    target.controller = "enemy";
  }
  return target as unknown as AnyTarget;
}

/**
 * Try to parse an exhaust effect: "Exhaust TARGET."
 */
export function parseExhaustEffect(text: string): Effect | undefined {
  // Compound: "exhaust this/me to <effect>" — sequence of self-exhaust + inner effect.
  // Used by gear like Fresh Beans: "you may exhaust this to draw 1".
  const exhaustToMatch = text.match(/^exhaust (?:this|me|myself) to (.+?)\.?$/i);
  if (exhaustToMatch) {
    const innerText = `${exhaustToMatch[1]}.`;
    const inner = parseEffect(innerText);
    if (inner) {
      return {
        effects: [{ target: "self" as AnyTarget, type: "exhaust" }, inner],
        type: "sequence",
      } as SequenceEffect;
    }
  }

  // Pattern: "Exhaust [all/another] [controller] [TAG] TARGET [here/at a battlefield] [you control]."
  const match = text.match(
    /^Exhaust (me|it|(?:(?:all|another)\s+)?(?:a |an )?(?:friendly |enemy )?(?:\w+\s+)*?(?:unit|units|gear|gears|legend|legends|rune|runes|equipment|card|permanent|[A-Z]\w*)(?:s)?(?:\s+(?:here|at a battlefield|there))?(?:\s+you control)?)\.?$/i,
  );
  if (!match) {
    return undefined;
  }
  const targetText = match[1].trim();
  const targetLower = targetText.toLowerCase();
  let target: AnyTarget;

  if (targetLower === "me") {
    target = "self";
  } else if (targetLower === "it") {
    target = { type: "unit" as const } as AnyTarget;
  } else {
    // Strip "you control" suffix and treat as "friendly"
    let cleaned = targetText;
    let youControl = false;
    const youControlMatch = cleaned.match(/^(.+?)\s+you control$/i);
    if (youControlMatch) {
      cleaned = youControlMatch[1];
      youControl = true;
    }

    // Check for "all" prefix
    const allMatch = cleaned.match(/^all\s+(.+)$/i);
    if (allMatch) {
      const baseTarget = parseTarget(allMatch[1]) as Target;
      target = { ...baseTarget, quantity: "all" as const } as AnyTarget;
    } else {
      // Check for "another" prefix
      const anotherMatch = cleaned.match(/^another\s+(.+)$/i);
      if (anotherMatch) {
        const baseTarget = parseTarget(anotherMatch[1]) as Target;
        target = { ...baseTarget, excludeSelf: true } as AnyTarget;
      } else {
        target = parseTarget(cleaned);
      }
    }

    // Apply "you control" as friendly controller
    if (youControl && typeof target === "object" && !("controller" in target)) {
      target = { ...target, controller: "friendly" as const } as AnyTarget;
    }
  }
  return { target, type: "exhaust" };
}
