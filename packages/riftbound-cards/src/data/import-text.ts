/**
 * Gallery rich text → plain card text.
 *
 * The card-gallery download (`downloads/riftbound-cards.json`) carries printed
 * text as HTML with `:rb_*:` glyph tokens and the odd HTML entity. Everything
 * downstream — the ability parser, the engine registry, any UI that prints a
 * card — reads ONE plain-text token format:
 *   `[Might]` `[Exhaust]` `[3]` `[fury]` `[rainbow]`, one printed line per `\n`,
 *   no markup, no entities.
 * This module is that conversion, shared by the set-JSON importer and the
 * card-definition sync script so both pipelines emit identical text.
 */

import { decodeHtmlEntities } from "./decode-entities";

/** Convert one gallery `richText.body` HTML fragment to plain card text. */
export function richTextToPlain(html: string | null | undefined): string {
  if (!html) {
    return "";
  }
  let text = html;
  // Printed line breaks. List items (modal bullets) are deliberately glued to
  // the lead-in sentence — "Choose one —Deal 4 to a unit.Kill a gear." is the
  // shape the modal-spell parser reads.
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<[^>]+>/g, "");
  text = decodeHtmlEntities(text);
  text = text.replace(/:rb_might:/g, "[Might]");
  text = text.replace(/:rb_exhaust:/g, "[Exhaust]");
  text = text.replace(/:rb_energy_(\d+):/g, "[$1]");
  text = text.replace(/:rb_rune_(\w+):/g, "[$1]");
  text = text.replace(/:rb_(\w+):/g, "[$1]");
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("\n");
}

/**
 * rule 136 — a card's full printed text: its Rules Text followed by its Effect
 * Text (the box an Equipment confers on the unit it is attached to), one per
 * line. `effectText` is also kept as its own field so consumers can tell the
 * two boxes apart; this is the display/coverage form.
 */
export function composeRulesText(rulesText: string, effectText: string | null | undefined): string {
  if (!effectText) {
    return rulesText;
  }
  return rulesText ? `${rulesText}\n${effectText}` : effectText;
}

/**
 * Text as an earlier importer revision emitted it, mapped onto today's format:
 * entities decoded and the `[energy_N]` glyph spelled `[N]`. A stored row whose
 * text equals the fresh import under this mapping was never hand-edited, so a
 * re-import may overwrite it; anything else is somebody's deliberate wording
 * and is left alone.
 */
export function legacyEquivalentText(text: string): string {
  return decodeHtmlEntities(text).replace(/\[energy_(\d+)\]/g, "[$1]");
}
