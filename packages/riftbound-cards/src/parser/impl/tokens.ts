/**
 * Shared token regexes and number-word helpers.
 */

// ============================================================================
// Emoji / Token Pattern Constants
// ============================================================================

export const ENERGY_RE = /:rb_energy_(\d+):/g;
export const POWER_RE = /:rb_rune_(fury|calm|mind|body|chaos|order|rainbow):/g;
export const EXHAUST_TOKEN = ":rb_exhaust:";
export const MIGHT_TOKEN = ":rb_might:";

// ============================================================================
// Word-to-Number Helper
// ============================================================================

export const WORD_NUMBERS: Record<string, number> = {
  a: 1,
  an: 1,
  five: 5,
  four: 4,
  one: 1,
  six: 6,
  three: 3,
  two: 2,
};

export function wordToNumber(word: string): number {
  return WORD_NUMBERS[word.toLowerCase()] ?? (Number.parseInt(word, 10) || 1);
}
