/**
 * parseAbilityText / buildAbilityWithText.
 */

import type { Ability, AbilityWithText, SpellAbility } from "@tcg/riftbound-types";
import { parseActivatedAbility } from "./activated";
import { parseEffects } from "./effects";
import { parseSpellAbility } from "./spells";
import { parseTriggeredAbility } from "./triggers";
import type { ParseResult, ParserOptions } from "./types";

// ============================================================================
// Main Parser Entry Point
// ============================================================================

/**
 * Parse ability text into a structured ability object.
 *
 * @param text - The ability text to parse
 * @returns ParseResult with the parsed ability or error
 */
export function parseAbilityText(text: string): ParseResult {
  if (!text || text.trim().length === 0) {
    return { error: "Empty ability text", success: false };
  }

  const trimmed = text.trim();
  const ability =
    parseActivatedAbility(trimmed) ?? parseSpellAbility(trimmed) ?? parseTriggeredAbility(trimmed);

  if (ability) {
    return { ability, success: true };
  }

  // Try as standalone effect (spell without timing)
  const effect = parseEffects(trimmed);
  if (effect) {
    return {
      ability: { effect, timing: "action", type: "spell" } as SpellAbility,
      success: true,
    };
  }

  return { error: "Could not parse ability text", success: false };
}

/**
 * Generate an ability ID from card ID and index
 * @param cardId - Card ID prefix (e.g., "card-1")
 * @param index - 1-based ability index
 * @returns Ability ID (e.g., "card-1-1")
 */
export function generateAbilityId(cardId: string, index: number): string {
  return `${cardId}-${index}`;
}

/**
 * Build an AbilityWithText object based on parser options
 * @param ability - The parsed ability
 * @param text - The original ability text
 * @param options - Parser options
 * @param index - 1-based ability index (for multi-ability parsing)
 * @returns AbilityWithText with fields conditionally included based on options
 */
export function buildAbilityWithText(
  ability: Ability,
  text: string,
  options?: ParserOptions,
  index = 1,
): AbilityWithText {
  const result: { ability: Ability; text?: string; id?: string } = { ability };

  // Include text unless omitText is true
  if (!options?.omitText) {
    result.text = text;
  }

  // Include id if generateAbilityUids is true and cardId is provided, unless omitId is true
  if (options?.generateAbilityUids && options?.cardId && !options?.omitId) {
    result.id = generateAbilityId(options.cardId, index);
  }

  return result as AbilityWithText;
}
