/**
 * Effect parsers: play / next-unit / next-spell modifiers.
 */

import type { Effect } from "@tcg/riftbound-types/abilities/effect-types";
import type { AnyTarget } from "@tcg/riftbound-types/targeting";

/**
 * Try to parse a play-from-location effect: "play a spell/unit from your trash/hand/deck..."
 */
export function parsePlayEffect(text: string): Effect | undefined {
  // Self-play: "play me." / "play this." (Flame Chompers etc.)
  if (/^play (?:me|this)\.?$/i.test(text)) {
    return { target: "self" as AnyTarget, type: "play" } as Effect;
  }

  // Pending-value play: "play it[, ignoring (its |the )cost]."
  // Used as the second step of a sequence that first banishes/chooses/reveals a
  // Card (e.g., "Banish a friendly unit, then play it, ignoring its cost").
  const pendingItMatch = text.match(
    /^(?:(?:its owner|you)\s+)?play(?:s)? it(?:\s+to (?:their|your) base)?(?:,?\s*ignoring (?:its|the)\s+(?:cost|energy cost|power cost))?\.?$/i,
  );
  if (pendingItMatch) {
    return {
      ignoreCost: true,
      target: { type: "pending-value" } as AnyTarget,
      type: "play",
    } as Effect;
  }

  // Pending-value play of revealed cards (Promising Future form).
  // "each player plays those cards, ignoring Energy costs"
  if (
    /^(?:starting with [^,]+,?\s+)?each player plays those cards(?:,?\s*ignoring (?:its|their|Energy) costs?)?\.?$/i.test(
      text,
    )
  ) {
    return {
      ignoreCost: true,
      target: { name: "revealed", type: "pending-value" } as AnyTarget,
      type: "play",
    } as Effect;
  }

  const match = text.match(/^play a (\w+) from your (trash|hand|deck)(?:\s+.*)$/i);
  if (!match) {
    return undefined;
  }
  const cardType = match[1].toLowerCase();
  const from = match[2].toLowerCase() as "trash" | "hand" | "deck";
  return { from, target: { type: cardType } as AnyTarget, type: "play" } as Effect;
}

/**
 * Try to parse "The next unit you play this turn enters ready." style effects.
 * Emits a single-fire replacement effect shape backed by the engine's
 * `enters-ready` replacement event.
 */
export function parseNextUnitEntersReadyEffect(text: string): Effect | undefined {
  const match = text.match(/^The next (unit|spell|card) you play this turn enters ready\.?$/i);
  if (!match) {
    return undefined;
  }
  return {
    duration: "next",
    replaces: "enters-ready",
    target: { controller: "friendly", type: match[1].toLowerCase() },
    type: "replacement",
  } as unknown as Effect;
}

/**
 * Try to parse "The next spell you play this turn deals N Bonus Damage." style effects.
 * Emits a single-fire replacement effect shape backed by the engine's
 * `deals-bonus-damage` replacement event.
 */
export function parseNextSpellBonusDamageEffect(text: string): Effect | undefined {
  const match = text.match(
    /^The next (spell|unit|card) you play this turn deals (\d+) Bonus Damage\.?$/i,
  );
  if (!match) {
    return undefined;
  }
  return {
    bonusDamage: Number.parseInt(match[2], 10),
    duration: "next",
    replaces: "deals-bonus-damage",
    target: { controller: "friendly", type: match[1].toLowerCase() },
    type: "replacement",
  } as unknown as Effect;
}
