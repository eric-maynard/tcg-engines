/**
 * Target Parser
 *
 * Parses target descriptions into structured Target objects.
 */

import type { AnyTarget, Quantity, Target, TargetController } from "@tcg/riftbound-types/targeting";

/**
 * Parse a target string into an AnyTarget object
 *
 * @param text - The target string to parse (e.g., "me", "a friendly unit", "an enemy unit")
 * @returns AnyTarget object
 *
 * @example
 * parseTarget("me")
 * // Returns: "self"
 *
 * @example
 * parseTarget("a friendly unit")
 * // Returns: { type: "unit", controller: "friendly" }
 *
 * @example
 * parseTarget("an enemy unit")
 * // Returns: { type: "unit", controller: "enemy" }
 */
export function parseTarget(text: string): AnyTarget {
  const normalized = text.toLowerCase().trim();

  // Self reference
  if (normalized === "me" || normalized === "it" || normalized === "itself") {
    return "self";
  }

  // "your legend" / "your legends" / "your runes"
  const yourMatch = normalized.match(
    /^(?:your|my)\s+(unit|units|gear|gears|legend|legends|rune|runes|equipment|spell|card|permanent)s?$/,
  );
  if (yourMatch) {
    const typeStr = yourMatch[1].replace(/s$/, "") as CardTypeStr;
    const isPlural = yourMatch[1].endsWith("s");
    const result: Record<string, unknown> = { controller: "friendly", type: typeStr };
    if (isPlural) {
      result.quantity = "all";
    }
    return result as Target;
  }

  // Parse "[a/an/that/the] [another] [controller] [TAG] CARD_TYPE [here/at a battlefield]"
  const cardTypePattern =
    /^(?:(?:a|an|that|the)\s+)?(?:(another)\s+)?(friendly\s+|enemy\s+)?((?:\w+\s+)*?)(unit|units|gear|gears|legend|legends|rune|runes|equipment|spell|card|permanent)s?(?:\s+(here|at a battlefield|there))?$/i;
  const match = normalized.match(cardTypePattern);

  if (match) {
    const anotherStr = match[1]; // "another" or undefined
    const controllerStr = match[2]?.trim();
    const tagStr = match[3]?.trim();
    const typeStr = match[4].replace(/s$/, "") as CardTypeStr;
    const locationStr = match[5];
    const controller = parseController(controllerStr);

    const result: Record<string, unknown> = { type: typeStr };

    if (controller) {
      result.controller = controller;
    }

    if (anotherStr) {
      result.excludeSelf = true;
    }

    if (locationStr) {
      if (locationStr === "here") {
        result.location = "here";
      } else if (locationStr === "at a battlefield") {
        result.location = "battlefield";
      }
    }

    // Handle tag (e.g., "Mech" in "another friendly Mech")
    if (tagStr && tagStr.length > 0) {
      result.filter = { tag: capitalizeTag(tagStr) };
    }

    return result as Target;
  }

  // Fallback: "[a/an] [another] [controller] TAG" where TAG implies unit type
  // E.g., "another friendly Mech", "a Dragon", "an enemy Poro"
  const tagPattern =
    /^(?:(?:a|an|that|the)\s+)?(?:(another)\s+)?(friendly\s+|enemy\s+)?(\w+(?:\s+\w+)?)$/i;
  const tagMatch = normalized.match(tagPattern);
  if (tagMatch) {
    const anotherStr = tagMatch[1];
    const controllerStr = tagMatch[2]?.trim();
    const tagStr = tagMatch[3]?.trim();
    const controller = parseController(controllerStr);

    // Only treat as tag if the tag word is capitalized in the original text
    // Or is a known tag - avoid matching random words
    if (tagStr) {
      const result: Record<string, unknown> = { type: "unit" };
      if (controller) {
        result.controller = controller;
      }
      if (anotherStr) {
        result.excludeSelf = true;
      }
      result.filter = { tag: capitalizeTag(tagStr) };
      return result as Target;
    }
  }

  // Default to unit target
  return { type: "unit" };
}

type CardTypeStr =
  | "unit"
  | "gear"
  | "legend"
  | "rune"
  | "equipment"
  | "spell"
  | "card"
  | "permanent";

/**
 * Capitalize a tag string (e.g., "mech" -> "Mech", "sand soldier" -> "Sand Soldier")
 */
function capitalizeTag(tag: string): string {
  return tag
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Parse controller string to TargetController
 */
function parseController(controllerStr: string | undefined): TargetController | undefined {
  if (!controllerStr) {
    return undefined;
  }

  const normalized = controllerStr.toLowerCase().trim();

  if (normalized === "friendly") {
    return "friendly";
  }
  if (normalized === "enemy") {
    return "enemy";
  }

  return undefined;
}

/**
 * Parse quantity string to Quantity
 *
 * @param text - The quantity string (e.g., "a", "an", "up to 2", "all")
 * @returns Quantity value
 */
export function parseQuantity(text: string): Quantity | undefined {
  const normalized = text.toLowerCase().trim();

  // "a" or "an" means exactly 1
  if (normalized === "a" || normalized === "an") {
    return 1;
  }

  // "all" means all matching
  if (normalized === "all") {
    return "all";
  }

  // "up to N" pattern
  const upToMatch = normalized.match(/^up to (\d+)$/);
  if (upToMatch) {
    return { upTo: Number.parseInt(upToMatch[1], 10) };
  }

  // Exact number
  const exactMatch = normalized.match(/^(\d+)$/);
  if (exactMatch) {
    return Number.parseInt(exactMatch[1], 10);
  }

  return undefined;
}

/**
 * Parse a target string with quantity into a Target object
 *
 * @param quantityStr - The quantity string (e.g., "a", "up to 2")
 * @param targetStr - The target description (e.g., "friendly unit", "enemy units")
 * @returns Target object with quantity
 */
export function parseTargetWithQuantity(quantityStr: string, targetStr: string): Target {
  const quantity = parseQuantity(quantityStr);
  const baseTarget = parseTarget(targetStr);

  // If baseTarget is a string (like "self"), convert to Target
  if (typeof baseTarget === "string") {
    return { type: "unit" };
  }

  // If baseTarget is not a card target, return as-is
  if (!("type" in baseTarget) || baseTarget.type === "player") {
    return { type: "unit" };
  }

  const target: Target = { ...baseTarget } as Target;

  if (quantity !== undefined && quantity !== 1) {
    return { ...target, quantity };
  }

  return target;
}
