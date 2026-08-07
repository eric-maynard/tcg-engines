/**
 * Public parser result/option types.
 */

import type { Ability } from "@tcg/riftbound-types";

/**
 * Options for controlling parser behavior and output
 */
export interface ParserOptions {
  /** Omit the 'id' field from AbilityWithText results */
  readonly omitId?: boolean;
  /** Omit the 'text' field from AbilityWithText results */
  readonly omitText?: boolean;
  /** Card ID prefix for generating ability IDs (e.g., "card-1") */
  readonly cardId?: string;
  /** Generate unique IDs for abilities */
  readonly generateAbilityUids?: boolean;
  /**
   * rule 805.1.a.1 — the card's domain. Accelerate printed without reminder text
   * still costs [1][C], where the Power must match one of the card's domains.
   */
  readonly domain?: string;
}

/**
 * Result of parsing a single ability text
 */
export interface ParseResult {
  readonly success: boolean;
  readonly ability?: Ability;
  readonly error?: string;
}

/**
 * Result of parsing ability text that may contain multiple abilities
 */
export interface ParseAbilitiesResult {
  readonly success: boolean;
  readonly abilities?: Ability[];
  readonly error?: string;
}
