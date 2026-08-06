/**
 * Spell-ability parsing (incl. Repeat handling).
 */

import type { SpellAbility } from "@tcg/riftbound-types";
import type { Effect } from "@tcg/riftbound-types/abilities/effect-types";
import type { AnyTarget } from "@tcg/riftbound-types/targeting";
import { parseCost } from "../parsers/cost-parser";
import { parseTarget } from "../parsers/target-parser";
import { parseEffects } from "./effects";
import { stripReminders } from "./normalize";
import { parseReplacementAbility } from "./replacement";
import type { TextSegment } from "./segments";
import { parseTriggeredAbility } from "./triggers";

// rule-id: ven-040-166 — "Choose X. <Verb> it …" spells: the preamble names the
// caster-chosen target and the effect sentence refers back with "it". Capture
// the head noun phrase (qualifier tails like "that's in combat with …" are
// accepted so the preamble is still recognised) and bind it into the parsed
// effect's pronoun slot; otherwise "Give it +N" parses as target 'self' and
// the spell resolves against itself with no targeting prompt.
const CHOOSE_PREAMBLE_RE =
  /^Choose ((?:a|an) (?:friendly |enemy )?(?:unit|gear|spell)(?:\s+(?:at a battlefield|here|there))?)(\s+and (?:a|an) (?:friendly |enemy )?(?:unit|gear|spell)(?:\s+(?:at a battlefield|here|there))?|,?\s+(?:that|with|in|from|being)\b[^.]*)?\.\s*/i;

function isPronounTarget(t: unknown): boolean {
  if (t === "self") {
    return true;
  }
  return (
    typeof t === "object" &&
    t !== null &&
    (t as { type?: string }).type === "unit" &&
    Object.keys(t).length === 1
  );
}

function bindChosenTarget(effect: Effect, chosen: AnyTarget): Effect {
  const e = effect as unknown as { type: string; target?: unknown; effects?: Effect[] };
  if (e.type === "sequence" && Array.isArray(e.effects) && e.effects.length > 0) {
    const [first, ...rest] = e.effects;
    return { ...e, effects: [bindChosenTarget(first, chosen), ...rest] } as unknown as Effect;
  }
  if ("target" in e && isPronounTarget(e.target)) {
    return { ...e, target: chosen } as unknown as Effect;
  }
  return effect;
}

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
  // and remember the single chosen target so "it" in the effect binds to it.
  let chosenTarget: AnyTarget | undefined;
  const chooseMatch = CHOOSE_PREAMBLE_RE.exec(effectText);
  if (chooseMatch) {
    effectText = effectText.slice(chooseMatch[0].length);
    if (!chooseMatch[2] || !/^\s+and /i.test(chooseMatch[2])) {
      chosenTarget = parseTarget(chooseMatch[1]);
    }
  }

  // Strip reminder text
  effectText = stripReminders(effectText).trim();

  // rule-id: ven-015-166 — "This can't be countered." is a static rider on
  // the spell (rule 544), not part of its resolve-time effect. Lift it into
  // a flag so the engine can refuse counter attempts against the chain item.
  const UNCOUNTERABLE_RE = /(?:^|\s)This can(?:'|’|')t be countered\.\s*/i;
  const uncounterable = UNCOUNTERABLE_RE.test(effectText);
  if (uncounterable) {
    effectText = effectText.replace(UNCOUNTERABLE_RE, " ").trim();
  }
  const flags: { uncounterable?: true } = uncounterable ? { uncounterable: true } : {};

  // Try parsing the effect
  const parsedEffect = parseEffects(effectText);
  const effect =
    parsedEffect && chosenTarget ? bindChosenTarget(parsedEffect, chosenTarget) : parsedEffect;
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
        ...flags,
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
        ...flags,
      };
    }

    // For spell abilities with unparsed effects, use raw text effect
    if (!effectText) {
      return undefined;
    }
    const rawEffect: Effect = { text: effectText, type: "raw" } as unknown as Effect;
    return { effect: rawEffect, timing: timingStr, type: "spell", ...flags };
  }

  return { effect, timing: timingStr, type: "spell", ...flags };
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
