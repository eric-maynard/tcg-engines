/**
 * Riftbound Ability Parser
 *
 * Parser for converting card ability text to structured ability objects.
 */

import type { Ability, SpellAbility } from "@tcg/riftbound-types";
import type { Effect } from "@tcg/riftbound-types/abilities/effect-types";
import { parseStaticAbility } from "./parsers/static-parser";
import { parseActivatedAbility } from "./impl/activated";
import { parseEffects } from "./impl/effects";
import { parseEmpoweredGatedAbilities, parseLevelGatedAbilities } from "./impl/gated";
import {
  expandHuntKeywords,
  parseKeywordSegment,
  splitCommaSeparatedKeywords,
} from "./impl/keywords";
import { normalizeTokens, stripReminders } from "./impl/normalize";
import { parseOtherSegmentMulti } from "./impl/other-segment";
import { splitAbilityText } from "./impl/segments";
import { mergeSpellWithRepeat, parseSpellAbilities, parseSpellWithRepeat } from "./impl/spells";
import { parseTriggeredAbility } from "./impl/triggers";
import type { ParseAbilitiesResult, ParserOptions } from "./impl/types";

export type { ParseAbilitiesResult, ParseResult, ParserOptions } from "./impl/types";
export { buildAbilityWithText, parseAbilityText } from "./impl/ability-text";

// ============================================================================
// Main Multi-Ability Parser
// ============================================================================

/**
 * Parse ability text that may contain multiple abilities.
 *
 * Card text often contains multiple abilities separated by line breaks or
 * specific patterns. This function parses all abilities from the text.
 *
 * @param text - The ability text to parse (may contain multiple abilities)
 * @param _options - Optional parser options to control output fields
 * @returns ParseAbilitiesResult with all parsed abilities or error
 */
export function parseAbilities(text: string, options?: ParserOptions): ParseAbilitiesResult {
  const result = parseAbilitiesInner(text, options);
  // Post-process: expand [Hunt N] keywords into the triggered gain-xp
  // Abilities they imply on conquer and hold.
  if (result.success && result.abilities) {
    return { ...result, abilities: expandHuntKeywords(result.abilities) };
  }
  return result;
}

function parseAbilitiesInner(text: string, _options?: ParserOptions): ParseAbilitiesResult {
  if (!text || text.trim().length === 0) {
    return { error: "Empty ability text", success: false };
  }

  // Normalize bracket tokens to :rb_xxx: format before any parsing/splitting.
  // This converts [Exhaust] -> :rb_exhaust:, [N] -> :rb_energy_N:,
  // [fury]/[calm]/etc -> :rb_rune_X:, [Might] -> :rb_might:, [Buff] -> Buff,
  // And strips "[>]" indicator arrows.
  const trimmed = normalizeTokens(text.trim());

  // === Level-gated pre-pass (UNL set) ===
  // "[Level N] <effect>" means the effect is active only while the controller
  // Has at least N XP. Split the text on `[Level N]` boundaries, parse each
  // Chunk, and wrap the resulting abilities with a `while-level` condition.
  // Non-level content before any `[Level N]` marker is parsed normally.
  if (/\[Level\s+\d+\]/i.test(trimmed)) {
    const levelResult = parseLevelGatedAbilities(trimmed, parseAbilitiesInner);
    if (levelResult) {
      return levelResult;
    }
  }

  // === Empowered-gated pre-pass (VEN set, rule 827) ===
  if (/^\[Empowered\]/im.test(trimmed)) {
    const empoweredResult = parseEmpoweredGatedAbilities(trimmed, parseAbilitiesInner);
    if (empoweredResult) {
      return empoweredResult;
    }
  }

  // === Fast path: try single-ability parse first ===
  // This handles activated, spell, triggered, and standalone effects.
  // These parsers already handle keywords embedded in their text
  // (e.g., "give a unit [Ganking]").
  const singleResult = parseSingleAbility(trimmed);
  if (singleResult.success) {
    const hasRawEffect = singleResult.abilities?.some(
      (a) => "effect" in a && (a as { effect: { type: string } }).effect?.type === "raw",
    );
    const startsWithKeyword =
      /^\[(?:Tank|Backline|Ganking|Hidden|Temporary|Quick-Draw|Weaponmaster|Unique|Ambush|Assault|Shield|Deflect|Hunt|Accelerate|Equip|Repeat|Flow|Deathknell|Legion|Vision|Action|Reaction)(?:\s+\d+)?\]/.test(
        trimmed,
      );

    // When text starts with a keyword bracket, check if parseSingleAbility preserved it.
    // If the first result is not a keyword ability, the leading keyword was dropped
    // By triggered/static/spell parsing -- fall through to multi-split which preserves keywords.
    const firstIsKeyword = singleResult.abilities?.[0]?.type === "keyword";
    const droppedLeadingKeyword = startsWithKeyword && !firstIsKeyword;

    if (startsWithKeyword) {
      // For [Action]/[Reaction], accept if no raw effects AND no [Repeat] keyword
      // ([Repeat] needs special spell+repeat parsing that the single path misses)
      if (/^\[(Action|Reaction)\]/.test(trimmed) && !hasRawEffect && !/\[Repeat\]/.test(trimmed)) {
        return singleResult;
      }
      // For other keywords, always try multi-ability to preserve keywords
    } else {
      // Text doesn't start with a keyword bracket.
      // Still try multi-ability if there are clear indicators of multiple abilities:
      // - A closing paren immediately followed by text that starts a new ability
      //   (e.g., "...(reminder)I enter ready..." or "...(reminder):rb_energy_1:...")
      // - A period followed by :rb_ (activated ability after sentence)
      // - Newlines separating abilities (e.g., "When I move, discard 1.\nWhen I win a combat, draw 1.")
      // - Multiple "Spend N XP" or "Spend <buff>" activated-cost openers (e.g., Voidreaver)
      const hasPostReminderAbility = /\)[A-Z:I]/.test(trimmed) || /\.\s*:rb_/.test(trimmed);
      const hasNewlineSeparatedAbilities = trimmed.includes("\n");
      const hasMultipleSpendActivated = (trimmed.match(/\bSpend\s+\d+\s+XP\b/g) ?? []).length >= 2;
      if (
        !hasRawEffect &&
        !hasPostReminderAbility &&
        !hasNewlineSeparatedAbilities &&
        !hasMultipleSpendActivated
      ) {
        return singleResult;
      }
    }
    // Fall through to multi-ability splitting for better results
  }

  // === Single-ability parse failed. Try multi-ability splitting. ===

  // Check for comma-separated keywords like "[Assault 2], [Shield 2]"
  const commaResult = splitCommaSeparatedKeywords(trimmed);
  if (commaResult && commaResult.length > 0) {
    return { abilities: commaResult, success: true };
  }

  // Try spell+repeat pattern
  const spellRepeat = parseSpellWithRepeat(trimmed);
  if (spellRepeat) {
    return { abilities: [spellRepeat], success: true };
  }

  // Multi-ability splitting
  const rawSegments = splitAbilityText(trimmed);

  // Merge [Action]/[Reaction] with their following [Repeat] and/or effect
  const segments = mergeSpellWithRepeat(rawSegments);

  // If splitting produced only one segment, try parsing it as a multi-ability "other" segment
  // Before falling back to the single-ability result.
  if (segments.length <= 1) {
    if (segments.length === 1) {
      const seg = segments[0];
      if (seg.type === "keyword") {
        const kwAbility = parseKeywordSegment(seg.text);
        if (kwAbility) {
          return { abilities: [kwAbility], success: true };
        }
      }
      // Try multi-ability parse on the single "other" segment
      if (seg.type === "other") {
        const multiResult = parseOtherSegmentMulti(seg.text);
        if (multiResult.length > (singleResult.abilities?.length ?? 0)) {
          return { abilities: multiResult, success: true };
        }
      }
    }
    // Fall back to single-ability raw result if the multi-ability split couldn't do better
    if (singleResult.success) {
      return singleResult;
    }
    return { error: "Could not parse ability text", success: false };
  }

  const abilities: Ability[] = [];

  for (const seg of segments) {
    if (seg.type === "keyword") {
      // Check if this is [Action] or [Reaction] that should be parsed as spell
      if (/^\[(Action|Reaction)\]/i.test(seg.text)) {
        const spell = parseSpellAbilities(seg.text);
        if (spell) {
          abilities.push(...spell);
          continue;
        }
      }

      const kwAbility = parseKeywordSegment(seg.text);
      if (kwAbility) {
        abilities.push(kwAbility);
      }
    } else {
      // "other" segment - try all non-keyword parsers
      const cleaned = seg.text;

      // Check if this contains a [Repeat] pattern merged with spell
      const repeatSpell = parseSpellWithRepeat(cleaned);
      if (repeatSpell) {
        abilities.push(repeatSpell);
        continue;
      }

      const parsedAbilities = parseOtherSegmentMulti(cleaned);
      if (parsedAbilities.length > 0) {
        for (const ability of parsedAbilities) {
          abilities.push(ability);
        }
      } else {
        // Unparsed "other" segment in multi-ability context: preserve as raw static
        const strippedOther = stripReminders(cleaned).trim();
        if (strippedOther.length > 10) {
          abilities.push({
            effect: { text: strippedOther, type: "raw" } as unknown as Effect,
            type: "static",
          } as Ability);
        }
      }
    }
  }

  if (abilities.length > 0) {
    // Compare quality: prefer whichever result has more "real" (non-raw) ability structure.
    // An activated/triggered/keyword is worth more than a raw static.
    if (singleResult.success) {
      const isRealAbility = (a: Ability): boolean =>
        a.type === "keyword" ||
        a.type === "replacement" ||
        ((a.type === "activated" ||
          a.type === "triggered" ||
          a.type === "spell" ||
          a.type === "static") &&
          (!("effect" in a) || (a as { effect: { type: string } }).effect?.type !== "raw"));
      const singleReal = (singleResult.abilities ?? []).filter(isRealAbility).length;
      const multiReal = abilities.filter(isRealAbility).length;
      // If multi is strictly worse (fewer real abilities), prefer single
      if (multiReal < singleReal) {
        return singleResult;
      }
      // If tied on real count but single has more total, also prefer single
      // (multi may have padded with raw statics)
      if (multiReal === singleReal && (singleResult.abilities?.length ?? 0) >= abilities.length) {
        return singleResult;
      }
    }
    return { abilities, success: true };
  }

  // Multi-ability splitting failed. Fall back to single-ability raw result if available.
  if (singleResult.success) {
    return singleResult;
  }

  return { error: "Could not parse ability text", success: false };
}

/**
 * Check if text contains any keyword bracket pattern
 */
function hasAnyKeywordBracket(text: string): boolean {
  return /\[(Tank|Backline|Ganking|Hidden|Temporary|Quick-Draw|Weaponmaster|Unique|Ambush|Assault|Shield|Deflect|Hunt|Accelerate|Equip|Repeat|Flow|Deathknell|Legion|Vision|Action|Reaction)(?:\s+\d+)?\]/.test(
    text,
  );
}

/**
 * Parse text as a single ability (original behavior)
 */
function parseSingleAbility(text: string): ParseAbilitiesResult {
  // Try activated ability
  const activated = parseActivatedAbility(text);
  if (activated) {
    return { abilities: [activated], success: true };
  }

  // Try spell ability
  const spell = parseSpellAbilities(text);
  if (spell) {
    return { abilities: spell, success: true };
  }

  // Try triggered ability
  const triggered = parseTriggeredAbility(text);
  if (triggered) {
    return { abilities: [triggered], success: true };
  }

  // Try static ability
  const staticResult = parseStaticAbility(text);
  if (staticResult) {
    return { abilities: [staticResult.ability], success: true };
  }

  // Try standalone effect (treat as spell with action timing)
  const effect = parseEffects(text);
  if (effect) {
    return {
      abilities: [{ effect, timing: "action", type: "spell" } as SpellAbility],
      success: true,
    };
  }

  return { error: "Could not parse ability text", success: false };
}

/**
 * Validate ability text without fully parsing
 *
 * @param text - The ability text to validate
 * @returns true if the text appears to be valid ability text
 */
export function validateAbilityText(text: string): boolean {
  if (!text || text.trim().length === 0) {
    return false;
  }
  return true;
}
