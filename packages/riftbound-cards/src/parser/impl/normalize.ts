/**
 * Text normalization: reminder-text stripping and icon-token normalization.
 */

// ============================================================================
// Reminder / Parenthetical Text Removal
// ============================================================================

/**
 * Remove parenthesized reminder text from ability text.
 * Handles italic markers like `_ (...)_`
 */
export function stripReminders(text: string): string {
  // Strip italic-wrapped reminder text like `_ (...)_` or `_(...)_`
  let cleaned = text.replace(/_?\s*\([^)]*\)\s*_?/g, "");
  // Also strip standalone parenthetical reminders
  cleaned = cleaned.replace(/\s*\([^)]*\)\s*/g, " ");
  return cleaned.trim();
}

/**
 * Normalize token syntax in effect text.
 * Converts human-readable bracket tokens to parser-expected emoji tokens:
 *   - `[Might]` -> `:rb_might:`
 *   - `[Buff]` -> `Buff` (strip brackets so it's treated as a plain verb)
 *   - `[Exhaust]` -> `:rb_exhaust:`
 *   - `[N]` (number) -> `:rb_energy_N:`
 *   - `[fury]`, `[calm]`, etc. -> `:rb_rune_X:`
 *   - `[&gt;]` / `[>]` / `[>>]` indicator markers -> stripped. These are
 *     visual arrows that separate a timing / threshold prefix (e.g.
 *     `[Reaction][>]`, `[Level 6][>]`, `[Deathknell][>]`) from the effect
 *     text and carry no parser-relevant meaning.
 */
export function normalizeTokens(text: string): string {
  let result = text;
  // Decode the HTML entity used in card text for the ">" arrow.
  result = result.replace(/&gt;/g, ">");
  // Strip "[>]" / "[>>]" indicator arrows wherever they appear.
  result = result.replace(/\[>>?\]/g, " ");
  // Convert [Might] to :rb_might: (case-insensitive)
  result = result.replace(/\[Might\]/gi, ":rb_might:");
  // Convert [Buff] to Buff (strip brackets so "Buff TARGET" patterns match)
  result = result.replace(/\[Buff\]/gi, "Buff");
  // Convert [Stun] to Stun (strip brackets so "Stun TARGET" patterns match)
  result = result.replace(/\[Stun\]/gi, "Stun");
  // Convert [Exhaust] to :rb_exhaust:
  result = result.replace(/\[Exhaust\]/gi, ":rb_exhaust:");
  // Convert [N] (numeric energy cost) to :rb_energy_N:
  result = result.replace(/\[(\d+)\]/g, ":rb_energy_$1:");
  // Strip parenthesized domain-icon reminders like "Body ([body])" → "Body".
  // Must run before the [domain]→:rb_rune_X: pass so stripReminders (which
  // replaces the leading-whitespace form with "") doesn't glue the tag to the
  // next word ("Bodyunit"), which defeats target parsing and, downstream, the
  // Rule 355.8 target-existence gate.
  result = result.replace(/\s*\(\[(?:fury|calm|mind|body|chaos|order|rainbow)\]\)/gi, "");
  // Convert [domain] to :rb_rune_domain:
  result = result.replace(
    /\[(fury|calm|mind|body|chaos|order|rainbow)\]/gi,
    (_match, domain: string) => `:rb_rune_${domain.toLowerCase()}:`,
  );
  // Collapse runs of whitespace left behind by arrow/entity removal.
  result = result.replace(/\s{2,}/g, " ");
  return result;
}
