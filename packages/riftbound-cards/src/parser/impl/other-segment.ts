/**
 * Parsing of non-keyword text segments.
 */

import type { Ability, SpellAbility } from "@tcg/riftbound-types";
import { parseStaticAbility } from "../parsers/static-parser";
import { parseActivatedAbility } from "./activated";
import { parseEffects } from "./effects";
import { stripReminders } from "./normalize";
import { parseAdditionalCostAbility, parseReplacementAbility } from "./replacement";
import { parseSpellAbility } from "./spells";
import { splitOnAbilityBoundaries } from "./split";
import { parseTriggeredAbility } from "./triggers";

export function parseOtherSegment(text: string): Ability | undefined {
  const cleaned = stripReminders(text).trim();
  if (!cleaned) {
    return undefined;
  }

  // Try activated ability
  const activated = parseActivatedAbility(cleaned);
  if (activated) {
    return activated;
  }

  // Try spell ability
  const spell = parseSpellAbility(cleaned);
  if (spell) {
    return spell;
  }

  // Try triggered ability
  const triggered = parseTriggeredAbility(cleaned);
  if (triggered) {
    return triggered;
  }

  // Try replacement ability: "The next time TARGET would EVENT, REPLACEMENT."
  // Also handles "Choose a friendly unit. The next time it dies this turn, recall it exhausted instead."
  const replacementAbility = parseReplacementAbility(cleaned);
  if (replacementAbility) {
    return replacementAbility;
  }

  // Try additional cost ability: "As you play me/this, ..."
  const additionalCostAbility = parseAdditionalCostAbility(cleaned);
  if (additionalCostAbility) {
    return additionalCostAbility;
  }

  // Try static ability
  const staticResult = parseStaticAbility(cleaned);
  if (staticResult) {
    return staticResult.ability;
  }

  // Try standalone effect (treat as spell with action timing)
  const effect = parseEffects(cleaned);
  if (effect) {
    return { effect, timing: "action", type: "spell" } as SpellAbility;
  }

  return undefined;
}

/**
 * Parse a non-keyword segment that may contain multiple abilities.
 * Splits on trigger boundaries (When..., At the start of..., etc.)
 * and parses each sub-segment.
 */
export function parseOtherSegmentMulti(text: string): Ability[] {
  const cleaned = stripReminders(text).trim();
  if (!cleaned) {
    return [];
  }

  // Try splitting on trigger/ability boundaries first if there are multiple
  const subSegments = splitOnAbilityBoundaries(cleaned);
  if (subSegments.length > 1) {
    const abilities: Ability[] = [];
    for (const sub of subSegments) {
      const ability = parseOtherSegment(sub);
      if (ability) {
        abilities.push(ability);
      }
    }
    if (abilities.length > 0) {
      return abilities;
    }
  }

  // Fall back to single ability parse
  const single = parseOtherSegment(text);
  if (single) {
    return [single];
  }

  return [];
}

/**
 * Check if an ability has a raw effect (unparsed text).
 */
export function hasRawEffectAbility(ability: Ability): boolean {
  if ("effect" in ability) {
    const eff = (ability as { effect: { type: string } }).effect;
    return eff?.type === "raw";
  }
  return false;
}
