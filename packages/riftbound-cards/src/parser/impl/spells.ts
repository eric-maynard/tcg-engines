/**
 * Spell-ability parsing (incl. Repeat handling).
 */

import type { SpellAbility } from "@tcg/riftbound-types";
import type { Effect } from "@tcg/riftbound-types/abilities/effect-types";
import { parseCost } from "../parsers/cost-parser";
import { parseEffects } from "./effects";
import { stripReminders } from "./normalize";
import { parseReplacementAbility } from "./replacement";
import type { TextSegment } from "./segments";
import { parseTriggeredAbility } from "./triggers";

// ============================================================================
// Spell Ability Parser
// ============================================================================

/**
 * Pattern for spell abilities: [Action] or [Reaction] followed by effect text
 */
export const SPELL_PATTERN = /^\[(Action|Reaction)\]\s*(?:_?\s*\([^)]*\)\s*_?\s*)?(.+)$/s;

export function parseSpellAbility(text: string): SpellAbility | undefined {
  const match = SPELL_PATTERN.exec(text);
  if (!match) {
    return undefined;
  }

  const timingStr = match[1].toLowerCase() as "action" | "reaction";
  let effectText = match[2].trim();

  // Strip any additional cost text at the start (e.g., "As you play this, you may spend...")
  effectText = effectText.replace(/^As you play this[^.]*\.\s*/i, "");
  // Strip "If you do, ..." preamble (follows "As you play this...")
  effectText = effectText.replace(/^If you do[^.]*\.\s*/i, "");
  // Strip "I cost :rb_energy_N: less..." preamble
  effectText = effectText.replace(/^I cost[^.]*\.\s*/i, "");
  // Strip "This spell's Energy cost is reduced..." preamble
  effectText = effectText.replace(/^This spell's Energy cost[^.]*\.\s*/i, "");
  // Strip "Ignore [Deflect] while paying this spell's cost." preamble — a
  // static cost rider, not the spell's targeted effect (Rule 355.8 target
  // parsing must reach the effect sentence that follows).
  effectText = effectText.replace(/^Ignore \[Deflect\][^.]*\.\s*/i, "");
  // Strip "If an enemy unit has died this turn, this costs..." preamble
  effectText = effectText.replace(/^If an enemy unit has died this turn[^.]*\.\s*/i, "");
  // Strip "If an opponent's score is within N points of the Victory Score, this costs..." preamble
  effectText = effectText.replace(
    /^If an opponent's score is within \d+ points? of the Victory Score[^.]*\.\s*/i,
    "",
  );
  // Strip "If you're within N points of winning, this costs..." preamble
  effectText = effectText.replace(
    /^If you(?:'re|'re) within \d+ points? of winning[^.]*\.\s*/i,
    "",
  );
  // Strip "Choose a/an ..." targeting preamble (e.g., "Choose an enemy unit at a battlefield.")
  effectText = effectText.replace(
    /^Choose (?:a|an) (?:friendly |enemy )?(?:unit|gear|spell)(?:\s+(?:at a battlefield|here|there|and (?:a|an) (?:friendly |enemy )?(?:unit|gear|spell)(?:\s+(?:at a battlefield|here|there))?))*\.\s*/i,
    "",
  );

  // Strip reminder text
  effectText = stripReminders(effectText).trim();

  // Try parsing the effect
  const effect = parseEffects(effectText);
  if (!effect) {
    // Some spells wrap a replacement ability (e.g., Tactical Retreat:
    // "The next time it would die this turn, heal it, exhaust it, and
    // Recall it instead"). Try the replacement parser before falling back
    // To raw text — this produces a structured replacement body.
    const replacementInner = parseReplacementAbility(effectText);
    if (replacementInner) {
      return {
        effect: replacementInner as unknown as Effect,
        timing: timingStr,
        type: "spell",
      };
    }

    // Some spells wrap a triggered ability in their body (e.g., Janna, Savior:
    // "[Reaction] When you play me, heal your units here, then move..."). In
    // That case the spell simply carries the triggered ability; parse and
    // Lift it into the spell's effect slot.
    const triggeredInner = parseTriggeredAbility(effectText);
    if (triggeredInner) {
      return {
        effect: triggeredInner as unknown as Effect,
        timing: timingStr,
        type: "spell",
      };
    }

    // For spell abilities with unparsed effects, use raw text effect
    if (!effectText) {
      return undefined;
    }
    const rawEffect: Effect = { text: effectText, type: "raw" } as unknown as Effect;
    return { effect: rawEffect, timing: timingStr, type: "spell" };
  }

  return { effect, timing: timingStr, type: "spell" };
}

/**
 * Handle the special case where [Action]/[Reaction] is followed by [Repeat].
 * These merge into a single spell ability with a repeat cost.
 */
export function mergeSpellWithRepeat(segments: TextSegment[]): TextSegment[] {
  const merged: TextSegment[] = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];

    // Check if this is a [Action] or [Reaction] segment
    if (seg.type === "keyword" && /^\[(Action|Reaction)\]/i.test(seg.text)) {
      // Check if next segment is [Repeat]
      if (
        i + 1 < segments.length &&
        segments[i + 1].type === "keyword" &&
        /^\[Repeat\]/i.test(segments[i + 1].text)
      ) {
        // And there's an effect segment after that
        if (i + 2 < segments.length && segments[i + 2].type === "other") {
          // Merge all three into one "other" segment
          merged.push({
            text: `${seg.text}${segments[i + 1].text}${segments[i + 2].text}`,
            type: "other",
          });
          i += 2;
          continue;
        }
        // Merge spell + repeat into one segment
        merged.push({
          text: `${seg.text}${segments[i + 1].text}`,
          type: "other",
        });
        i += 1;
        continue;
      }

      // Check if this [Action]/[Reaction] is followed by "other" (its effect)
      // This is the normal case for [Hidden][Action] Effect.
      // The [Action] needs its following effect text
      if (i + 1 < segments.length && segments[i + 1].type === "other") {
        merged.push({
          text: `${seg.text}${segments[i + 1].text}`,
          type: "other",
        });
        i += 1;
        continue;
      }
    }

    // Check if this is [Repeat] without a preceding [Action]/[Reaction]
    if (seg.type === "keyword" && /^\[Repeat\]/i.test(seg.text)) {
      // Check if followed by effect text
      if (i + 1 < segments.length && segments[i + 1].type === "other") {
        merged.push({
          text: `${seg.text}${segments[i + 1].text}`,
          type: "other",
        });
        i += 1;
        continue;
      }
    }

    merged.push(seg);
  }

  return merged;
}

// ============================================================================
// Spell + Repeat Parsing
// ============================================================================

/**
 * Parse spell abilities that include [Repeat] keywords.
 *
 * Handles patterns like:
 * - "[Action][Repeat] :cost: (reminder)Effect text."
 * - "[Reaction][Repeat] :cost: (reminder)Effect text."
 * - "[Repeat] :cost: (reminder)Effect text."
 */
export function parseSpellWithRepeat(text: string): SpellAbility | undefined {
  // Match: optional [Action|Reaction], then [Repeat] with cost
  const pattern =
    /^(?:\[(Action|Reaction)\]\s*(?:_?\s*\([^)]*\)\s*_?\s*)?)?\[Repeat\]\s*((?::rb_(?:energy_\d+|rune_(?:fury|calm|mind|body|chaos|order|rainbow)):)+)\s*(?:_?\s*\([^)]*\)\s*_?\s*)?(.+)$/s;
  const match = pattern.exec(text);
  if (!match) {
    return undefined;
  }

  const timingStr = match[1]?.toLowerCase() as "action" | "reaction" | undefined;
  const costStr = match[2];
  const effectText = stripReminders(match[3]).trim();

  const repeatCost = parseCost(costStr);

  // Parse the effect
  const effect = parseEffects(effectText);
  if (!effect) {
    // Use raw effect for unparsed text
    const rawEffect = { text: effectText, type: "raw" } as unknown as Effect;
    const spell: SpellAbility = {
      effect: rawEffect,
      repeat: repeatCost,
      timing: timingStr ?? "action",
      type: "spell",
    };
    return spell;
  }

  return {
    effect,
    repeat: repeatCost,
    timing: timingStr ?? "action",
    type: "spell",
  } as SpellAbility;
}
