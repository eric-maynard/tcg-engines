/**
 * Spell-ability parsing (incl. Repeat handling).
 */

import type { Ability, SpellAbility, StaticAbility, TriggeredAbility } from "@tcg/riftbound-types";
import type { Effect } from "@tcg/riftbound-types/abilities/effect-types";
import type { AnyTarget } from "@tcg/riftbound-types/targeting";
import { parseCost } from "../parsers/cost-parser";
import { parseStaticAbility } from "../parsers/static-parser";
import { parseTarget } from "../parsers/target-parser";
import { bindChosenTarget, CHOOSE_PREAMBLE_RE } from "./choose-preamble";
import { parseEffects } from "./effects";
import { stripReminders } from "./normalize";
import { parseAdditionalCostAbility, parseReplacementAbility } from "./replacement";
import type { TextSegment } from "./segments";
import { parseTriggeredAbility } from "./triggers";

// rule-id: ven-040-166 — "Choose X. <Verb> it …" spells: the preamble names the
// caster-chosen target and the effect sentence refers back with "it"; otherwise
// "Give it +N" parses as target 'self' and the spell resolves against itself
// with no targeting prompt. Shared with the triggered-ability parser.

// ============================================================================
// Spell Ability Parser
// ============================================================================

/**
 * Pattern for spell abilities: [Action] or [Reaction] followed by effect text
 */
export const SPELL_PATTERN = /^\[(Action|Reaction)\]\s*(?:_?\s*\([^)]*\)\s*_?\s*)?(.+)$/s;

/**
 * rule 155 / 159.2.a.1 — ability-level spell timing exists ONLY when the printed
 * text carries [Action]/[Reaction]. Untagged bodies get no `timing` field at all;
 * the card definition's own timing ("standard") governs when it may be played.
 * Returns a spreadable partial so callers stay `{...spellTimingFromText(text)}`.
 */
export function spellTimingFromText(text: string): { timing?: "action" | "reaction" } {
  if (/\[Reaction\]/i.test(text)) {
    return { timing: "reaction" };
  }
  if (/\[Action\]/i.test(text)) {
    return { timing: "action" };
  }
  return {};
}

// rule 466 / rule 356.4: cost-modifying sentences printed on a spell
// ("If …, this costs [2] less.", "This spell's Energy cost is reduced by …")
// are static riders read at pay time, not part of the resolve-time effect.
// `parseSpellAbility` strips them from the effect text; this lifts them into
// their own static `cost-reduction` abilities so the engine can apply them.
const SPELL_COST_RIDER_RES: readonly RegExp[] = [
  /^This spell's Energy cost is reduced by[^.]*\./i,
  /^If an enemy unit has died this turn, this costs[^.]*\./i,
  /^If an opponent's score is within \d+ points? of the Victory Score, this costs[^.]*\./i,
  /^If you(?:'re|’re) within \d+ points? of winning, this costs[^.]*\./i,
  // rule 356.4 / 827 (rule-id: ven-059-166) — trailing-condition rider
  // ("This costs [2] less if you control something that's [Empowered].").
  /^This costs\s+[^.]*?\s+less\s+if\s+[^.]*\./i,
];

// rule 356.2.b / rule 560 — "As you play this, you may … as an additional
// cost." printed on a spell is a play-time cost option, not part of the
// resolve-time effect; `parseSpellAbility` strips it, so lift it here.
const SPELL_ADDITIONAL_COST_RE = /^As you play (?:me|this),\s+you may\s+.+?\s+as an additional cost\b/i;
// rule 356.5 — "If you do, ignore this spell's cost." waives the base cost
// entirely when the optional additional cost is paid.
const IGNORE_COST_RIDER_RE = /^If you do,\s+ignore this (?:spell|card)'s cost\b/i;

export function parseSpellCostRiders(text: string): StaticAbility[] {
  const match = SPELL_PATTERN.exec(text);
  if (!match) {
    return [];
  }
  const out: StaticAbility[] = [];
  const sentences = match[2].split(/\n+|(?<=\.)\s*(?=[A-Z])/);
  for (const [i, line] of sentences.entries()) {
    const sentence = line.trim();
    if (SPELL_ADDITIONAL_COST_RE.test(sentence)) {
      const ability = parseAdditionalCostAbility(sentence) as StaticAbility | undefined;
      if (ability) {
        const next = sentences[i + 1]?.trim() ?? "";
        if (IGNORE_COST_RIDER_RE.test(next)) {
          (ability.effect as unknown as Record<string, unknown>).ifPaid = {
            type: "ignore-cost",
          };
        }
        out.push(ability);
      }
      continue;
    }
    for (const re of SPELL_COST_RIDER_RES) {
      const m = re.exec(sentence);
      if (!m) {
        continue;
      }
      const parsed = parseStaticAbility(m[0])?.ability;
      const eff = parsed?.effect as { type?: string } | undefined;
      if (parsed && eff?.type === "cost-reduction") {
        out.push(parsed);
      }
      break;
    }
  }
  return out;
}

/** The spell ability plus any static cost riders printed on it. */
export function parseSpellAbilities(text: string): Ability[] | undefined {
  const spell = parseSpellAbility(text);
  if (!spell) {
    return undefined;
  }
  return [spell, ...parseSpellCostRiders(text)];
}

export function parseSpellAbility(text: string): SpellAbility | TriggeredAbility | undefined {
  const match = SPELL_PATTERN.exec(text);
  if (!match) {
    return undefined;
  }

  const timingStr = match[1].toLowerCase() as "action" | "reaction";
  let effectText = match[2].trim();

  // rule 356.2.a.1 — "As an additional cost to play this, kill a friendly
  // unit.": a MANDATORY kill paid while the spell is played, not part of its
  // resolve-time effect. Lift it onto the spell ability's `additionalCost`
  // (what `getOptionalPlayCost` reads) and strip it from the effect text.
  let killAdditionalCost: AnyTarget | undefined;
  const killCostMatch =
    /^As an additional cost to play (?:this|me),\s*kill\s+([^.]*?)\.\s*(?:_?\s*\([^)]*\)\s*_?\s*)?/i.exec(
      effectText,
    );
  if (killCostMatch && !/\byou may\b/i.test(killCostMatch[1])) {
    killAdditionalCost = parseTarget(stripReminders(killCostMatch[1]).trim());
    if (killAdditionalCost) {
      effectText = effectText.slice(killCostMatch[0].length).trim();
    }
  }
  const additionalCostRider = killAdditionalCost
    ? { additionalCost: { kill: killAdditionalCost } }
    : {};

  // Strip any additional cost text at the start (e.g., "As you play this, you may spend...")
  effectText = effectText.replace(/^As you play this[^.]*\.\s*/i, "");
  // Strip "If you do, ..." preamble (follows "As you play this...")
  effectText = effectText.replace(/^If you do[^.]*\.\s*/i, "");
  // Strip "I cost :rb_energy_N: less..." preamble
  effectText = effectText.replace(/^I cost[^.]*\.\s*/i, "");
  // Strip "This spell's Energy cost is reduced..." preamble
  effectText = effectText.replace(/^This spell's Energy cost[^.]*\.\s*/i, "");
  // rule 356.4 (rule-id: ven-059-166) — strip the "This costs N less if …"
  // rider; `parseSpellCostRiders` lifts it into its own static.
  effectText = effectText.replace(/^This costs\s+[^.]*?\s+less\s+if\s+[^.]*\.\s*/i, "");
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
  // rule-id: ogn-266-298 (rule 355.8) — "Choose a battlefield. …units there…":
  // the battlefield is the play-time choice and every "there" refers to it, so
  // rewrite to the "at a battlefield" (all-at-one-battlefield) descriptor.
  const chooseBfMatch = /^Choose a battlefield\.\s*/i.exec(effectText);
  if (chooseBfMatch && /\bunits there\b/i.test(effectText)) {
    effectText = effectText
      .slice(chooseBfMatch[0].length)
      .replace(/\b(units) there\b/gi, "$1 at a battlefield");
  } else if (chooseMatch) {
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
  const flags: { uncounterable?: true; additionalCost?: { kill: AnyTarget } } = {
    ...additionalCostRider,
    ...(uncounterable ? { uncounterable: true as const } : {}),
  };

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
      // rule 355: the "Choose a friendly unit." preamble is a target of the
      // spell — carry it onto the replacement rider so the installed
      // replacement binds to the chosen unit instead of applying to nothing.
      const inner =
        chosenTarget && (replacementInner as { target?: unknown }).target === undefined
          ? { ...replacementInner, target: chosenTarget }
          : replacementInner;
      return {
        effect: inner as unknown as Effect,
        timing: timingStr,
        type: "spell",
        ...flags,
      };
    }

    // rule 813 / 806.1 (e.g. Janna, Savior sfd-053-221): on a permanent,
    // [Action]/[Reaction] is only a play-timing keyword — the body is an
    // ordinary triggered ability, NOT a spell effect. Return the triggered
    // ability itself so the engine's trigger machinery sees it; the card's
    // play timing comes from `def.timing`, not from this ability.
    const triggeredInner = parseTriggeredAbility(effectText);
    if (triggeredInner) {
      return triggeredInner;
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
