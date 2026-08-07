/**
 * Shared target / location string helpers.
 */

import type { Location } from "@tcg/riftbound-types/targeting";

/**
 * Parse a damage/kill target string into a Target-like object.
 * Extracts controller, location, quantity, and filter from natural language.
 */
type CardTargetFilter = string | { domain: string };

export function parseCardTarget(targetText: string): {
  type: "unit";
  controller?: "friendly" | "enemy";
  location?: Location;
  quantity?: "all" | number | { upTo: number };
  filter?: CardTargetFilter | CardTargetFilter[];
} {
  const lower = targetText.toLowerCase();
  const target: {
    type: "unit";
    controller?: "friendly" | "enemy";
    location?: Location;
    quantity?: "all" | number | { upTo: number };
    filter?: CardTargetFilter | CardTargetFilter[];
  } = { type: "unit" };

  if (lower.includes("enemy")) {
    target.controller = "enemy";
  } else if (lower.includes("friendly")) {
    target.controller = "friendly";
  } else if (/\b(?:you|i)\s+control\b/.test(lower)) {
    // rule 108.2 — "you"/"I" on a permanent means its CONTROLLER, so "units you
    // control" is a friendly-only audience (not every unit on the board).
    target.controller = "friendly";
  } else if (/\bopponents?\s+controls?\b/.test(lower)) {
    target.controller = "enemy";
  }

  if (lower.includes("all ") || lower.includes("each ")) {
    target.quantity = "all";
  }
  const upToMatch = lower.match(/up to (\w+)/);
  if (upToMatch) {
    const numWord = upToMatch[1];
    const wordMap: Record<string, number> = {
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
    target.quantity = { upTo: wordMap[numWord] ?? (Number.parseInt(numWord, 10) || 1) };
  }

  // rule-id: ven-021-166 — "at a battlefield I moved to or from" must restrict
  // targeting to the triggering move's source/destination battlefields; the
  // plain "at a battlefield" substring check below would silently drop the
  // qualifier and let the resolver treat it as any battlefield.
  if (lower.includes("i moved to or from") || lower.includes("i moved from or to")) {
    target.location = "move-to-or-from" as Location;
  } else if (lower.includes("at battlefields")) {
    // rule-id: ogn-133-298 / ogs-018-024 — "at battlefields" (plural) is every
    // battlefield at once; only the singular "at a battlefield" is a choice.
    target.location = "battlefields" as Location;
  } else if (
    lower.includes("at a battlefield") ||
    lower.includes("at my battlefield")
  ) {
    target.location = "battlefield";
  } else if (
    lower.includes("in a base") ||
    lower.includes("at base") ||
    lower.includes("in base")
  ) {
    target.location = "base";
  } else if (lower.includes("here") || lower.includes("at the same location")) {
    target.location = "here" as Location;
  }

  if (lower.includes("damaged")) {
    target.filter = "damaged";
  } else if (lower.includes("stunned")) {
    target.filter = "stunned";
  } else if (lower.includes("[mighty]")) {
    target.filter = "mighty";
  } else if (lower.includes("[empowered]")) {
    // rule 442.1.a (rule-id: ven-035-166) — "a unit that's [Empowered]" may
    // only choose a unit that currently has the Empowered status.
    target.filter = "empowered";
  }

  // rule 740.2.c: "units in combat" — only units with a combat designation at
  // the battlefield where combat is ongoing ("in combat with …" is a separate
  // relational filter handled elsewhere).
  if (/\bunits?\s+in combat\b(?!\s+with)/.test(lower)) {
    target.filter = target.filter === undefined ? "in-combat" : [target.filter, "in-combat"].flat();
  }

  // rule-id: ven-015-166 — "an enemy Calm unit": a domain adjective before
  // "unit(s)" restricts targets to that domain (normalize strips the "([calm])"
  // icon reminder, leaving the bare word).
  const domainMatch = lower.match(/\b(fury|calm|mind|body|chaos|order)\s+units?\b/);
  if (domainMatch) {
    const domainFilter = { domain: domainMatch[1] };
    target.filter = target.filter === undefined ? domainFilter : [target.filter, domainFilter].flat();
  }

  return target;
}

// ============================================================================
// Location Parsing
// ============================================================================

export function parseLocationString(locationStr: string): Location {
  const normalized = locationStr.toLowerCase().trim();
  if (
    normalized === "base" ||
    normalized === "its base" ||
    normalized === "your base" ||
    normalized === "to base" ||
    normalized === "to its base" ||
    normalized === "to your base"
  ) {
    return "base";
  }
  if (normalized === "here" || normalized === "to here" || normalized === "this battlefield") {
    return "here";
  }
  // rule 355.4 (sfd-125-221) — "to the same battlefield" is the battlefield the
  // triggering move went to, not a free choice; the engine reads `same` off
  // ctx.triggerToZone.
  if (normalized === "the same battlefield" || normalized === "to the same battlefield") {
    return "same";
  }
  if (
    normalized === "battlefield" ||
    normalized === "a battlefield" ||
    normalized === "to battlefield" ||
    normalized === "to a battlefield"
  ) {
    return "battlefield";
  }
  return "base";
}
