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
/**
 * rule 710 (ven-105-166 Twilight Step) — split a trailing "with N [Might] or
 * less / or more" clause off a target phrase. The bound is a ceiling/floor on
 * the candidate's CURRENT Might and includes the named value. Returns the noun
 * phrase without the clause plus the filter to attach to it.
 */
export function parseMightBoundClause(
  text: string,
): { filter: { might: { gte?: number; lte?: number } }; rest: string } | undefined {
  const match = text
    .replace(/[.,;:]+\s*$/, "")
    .trim()
    .match(/^(.+?)\s+with\s+(\d+)\s*(?::rb_might:|\[might\]|might)\s+or\s+(less|fewer|more|greater)$/i);
  if (!match) return undefined;
  const bound = Number.parseInt(match[2], 10);
  const dir = match[3].toLowerCase();
  const atMost = dir === "less" || dir === "fewer";
  return { filter: { might: atMost ? { lte: bound } : { gte: bound } }, rest: match[1] };
}

export function parseTarget(text: string): AnyTarget {
  // Bracketed keywords/states ("[Mighty] units") read as plain adjectives here.
  const normalized = text
    .toLowerCase()
    .trim()
    .replace(/\[([^\]]+)\]/g, "$1")
    .replace(/\s+/g, " ")
    // A target phrase lifted from the tail of a sentence keeps its terminal
    // punctuation ("a legend."); it is not part of the noun phrase.
    .replace(/[.,;:]+$/, "")
    .trim();

  // rule 206 (ven-080-166) — "a gear with Energy cost no more than my Might":
  // a cost ceiling read off the SOURCE's Might at execution, not a fixed number.
  const selfMightCostMatch = normalized.match(
    /^(.+?)\s+with\s+(?:an?\s+)?energy cost(?:\s+of)?\s+no more than my might$/,
  );
  if (selfMightCostMatch) {
    const base = parseTarget(selfMightCostMatch[1]);
    if (typeof base === "object" && "type" in base) {
      const existing = (base as { filter?: unknown }).filter;
      const ceiling = { energyCostAtMostSelfMight: true };
      const filter = existing === undefined ? ceiling : [...[existing].flat(), ceiling];
      return { ...(base as object), filter } as Target;
    }
  }

  // rule 710 (ven-105-166 Twilight Step) — "a unit with 3 [Might] or less": a
  // numeric ceiling/floor on the candidate's CURRENT Might, read at the moment
  // the choice is made. "or less"/"or more" include the named value.
  const mightBound = parseMightBoundClause(normalized);
  if (mightBound) {
    const base = parseTarget(mightBound.rest);
    if (typeof base === "object" && "type" in base) {
      const existing = (base as { filter?: unknown }).filter;
      const filter = existing === undefined ? mightBound.filter : [...[existing].flat(), mightBound.filter];
      return { ...(base as object), filter } as Target;
    }
  }

  // rule 355.10 — "a friendly unit without [Temporary]": the trailing clause is
  // an exclusion filter on the choice, not part of the noun phrase.
  const withoutMatch = normalized.match(/^(.+?)\s+without\s+([\w -]+)$/);
  if (withoutMatch) {
    const base = parseTarget(withoutMatch[1]);
    if (typeof base === "object" && "type" in base) {
      const existing = (base as { filter?: unknown }).filter;
      const excl = { excludeKeyword: capitalizeTag(withoutMatch[2].trim()) };
      const filter = existing === undefined ? excl : [...[existing].flat(), excl];
      return { ...(base as object), filter } as Target;
    }
  }

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
    /^(?:(a|an|that|the)\s+)?(?:(another)\s+)?(friendly\s+|enemy\s+|your\s+|my\s+)?((?:\w+\s+)*?)(unit|units|gear|gears|legend|legends|rune|runes|equipment|spell|card|permanent)(s?)(?:\s+(here|at a battlefield|there|anywhere))?$/i;
  const match = normalized.match(cardTypePattern);

  if (match) {
    const articleStr = match[1]; // "a"/"an"/"that"/"the" or undefined
    const anotherStr = match[2]; // "another" or undefined
    const controllerStr = match[3]?.trim();
    const tagStr = match[4]?.trim();
    const typeStr = match[5].replace(/s$/, "") as CardTypeStr;
    const isPlural = match[5].endsWith("s") || match[6] === "s";
    const locationStr = match[7];
    const controller = parseController(controllerStr);

    const result: Record<string, unknown> = { type: typeStr };

    if (controller) {
      result.controller = controller;
    }

    // Rule 419.2.a: a bare plural ("enemy units", "friendly units here") with no
    // determiner is a criteria-based mass selection, not a single targeted choice.
    if (isPlural && !articleStr && !anotherStr) {
      result.quantity = "all";
    }

    if (anotherStr) {
      result.excludeSelf = true;
    }

    // "anywhere" is an explicit absence of a location limit (base or any
    // battlefield), so it contributes no `location` key at all.
    if (locationStr && locationStr !== "anywhere") {
      if (locationStr === "here") {
        result.location = "here";
      } else if (locationStr === "at a battlefield") {
        result.location = "battlefield";
      }
    }

    // rule 355.5 (rule-id: ven-194-166) — a leading count ("Ready 2 gear") is a
    // quantity on the choice, not a tribal tag: the chooser names exactly N.
    const countStr = tagStr?.trim().toLowerCase();
    const explicitCount =
      countStr === undefined || countStr.length === 0
        ? undefined
        : (NUMBER_WORD_VALUES[countStr] ??
          (/^\d+$/.test(countStr) ? Number.parseInt(countStr, 10) : undefined));
    if (explicitCount !== undefined && explicitCount > 1) {
      result.quantity = explicitCount;
      return result as Target;
    }

    // Handle tag (e.g., "Mech" in "another friendly Mech") or a state adjective
    // ("[Mighty] units" — rule 710) which is a filter, not a tribal tag.
    if (tagStr && tagStr.length > 0) {
      const stateFilter = STATE_ADJECTIVE_FILTERS[tagStr];
      result.filter = stateFilter ? stateFilter : { tag: capitalizeTag(tagStr) };
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

/** Spelled-out counts a target phrase may carry ("Ready two gear"). */
const NUMBER_WORD_VALUES: Record<string, number> = {
  five: 5,
  four: 4,
  three: 3,
  two: 2,
};

/** Adjectives that describe a unit's state rather than a tribal tag. */
const STATE_ADJECTIVE_FILTERS: Record<string, string> = {
  buffed: "buffed",
  damaged: "damaged",
  exhausted: "exhausted",
  mighty: "mighty",
  ready: "ready",
  stunned: "stunned",
  token: "token",
};

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
 * rule 105.2: tribal rules text names the tag in the plural ("your Mechs", "Sand
 * Soldiers you play") but the tag printed on a card/token is singular ("Mech"),
 * so a filter built from that text must be singularized to match anything.
 */
export function singularizeTag(tag: string): string {
  if (/(?:ss|us|is)$/i.test(tag)) {
    return tag;
  }
  if (/ies$/i.test(tag)) {
    return tag.replace(/ies$/i, "y");
  }
  if (/(?:ch|sh|x|z)es$/i.test(tag)) {
    return tag.replace(/es$/i, "");
  }
  if (/s$/i.test(tag)) {
    return tag.replace(/s$/i, "");
  }
  return tag;
}

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

  if (normalized === "friendly" || normalized === "your" || normalized === "my") {
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
