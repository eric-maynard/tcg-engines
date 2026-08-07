/**
 * Effect parsers: if-you-do / if-else / pronoun chains / choice.
 */

import type {
  ChoiceEffect,
  Effect,
  SequenceEffect,
} from "@tcg/riftbound-types/abilities/effect-types";
import { parseLeadingIfCondition } from "../parsers/condition-parser";
import { parseTarget } from "../parsers/target-parser";
import { parseEffect } from "./effect";
import { parseEffects } from "./effects";

/**
 * Try to parse an "X. If you do, Y" (with optional "Otherwise, Z") pattern.
 *
 * Produces a sequence of:
 *   - an optional X effect (the "you may X" action)
 *   - a conditional { then: Y, else: Z } gated on that action having resolved
 *
 * The simplest, most useful shape is:
 *   sequence([optional(X), conditional(paid-additional-cost, Y, Z?)])
 *
 * We also support the bare "X. If you do, Y" without an else branch.
 */
export function parseIfYouDoEffect(text: string): Effect | undefined {
  // Normalize: find ". If you do," boundary
  const ifYouDoRe = /\.\s+if you do,\s+/i;
  const m = text.match(ifYouDoRe);
  if (!m || m.index === undefined) {
    return undefined;
  }
  const leftText = text.slice(0, m.index).trim();
  let rightText = text.slice(m.index + m[0].length).trim();

  // Split off optional ". Otherwise, Z"
  let elseText: string | undefined;
  const otherwiseRe = /\.\s+otherwise,\s+/i;
  const om = rightText.match(otherwiseRe);
  if (om && om.index !== undefined) {
    elseText = rightText
      .slice(om.index + om[0].length)
      .trim()
      .replace(/\.$/, "");
    rightText = rightText.slice(0, om.index).trim();
  }
  rightText = rightText.replace(/\.$/, "").trim();

  // Strip leading framing phrases that describe trigger context but are not
  // The effect itself. Examples:
  //   "As you play me, you may discard 1 as an additional cost"
  //   "As an additional cost to play this, you may exhaust a friendly unit"
  //   "When I attack or defend, you may pay :rb_rune_fury:"
  let leftCore = leftText;
  leftCore = leftCore.replace(/^as an additional cost to play (?:this|me),?\s*/i, "");
  leftCore = leftCore.replace(/^as you play (?:me|this),?\s*/i, "");
  // rule 355.9 — only an "as an additional cost"/"as you play me" framing is a
  // cost elected while PLAYING the card (`paid-additional-cost`). A plain
  // "you may X. If you do, Y" gates on X having been performed on resolution.
  const isAdditionalCost = leftCore !== leftText || /as an additional cost/i.test(leftText);
  // Trigger prefixes like "When I ...," are consumed by the outer trigger
  // Parser, but for defensive handling of cleaned text, strip them here too.
  leftCore = leftCore.replace(/^when i [^,]+,\s*/i, "");

  // Strip leading "you may " from the left side so parseEffect can find it
  const youMayMatch = leftCore.match(/^you may\s+/i);
  const isOptional = Boolean(youMayMatch);
  if (youMayMatch) {
    leftCore = leftCore.slice(youMayMatch[0].length);
  }
  // Also strip trailing "as an additional cost"
  leftCore = leftCore.replace(/\s+as an additional cost(?: to play (?:this|me))?/i, "");

  const leftEffect = parseEffect(`${leftCore}.`);
  if (!leftEffect) {
    return undefined;
  }
  const rightEffect = parseEffect(`${rightText}.`);
  if (!rightEffect) {
    return undefined;
  }
  const elseEffect = elseText ? parseEffect(`${elseText}.`) : undefined;

  const conditional: {
    type: "conditional";
    condition: { type: "paid-additional-cost" | "did-perform" };
    then: Effect;
    else?: Effect;
  } = {
    condition: { type: isAdditionalCost ? "paid-additional-cost" : "did-perform" },
    then: rightEffect,
    type: "conditional",
  };
  if (elseEffect) {
    conditional.else = elseEffect;
  }

  const leftWrapped: Effect = isOptional
    ? ({ effect: leftEffect, type: "optional" } as unknown as Effect)
    : leftEffect;

  return {
    effects: [leftWrapped, conditional as unknown as Effect],
    type: "sequence",
  } as SequenceEffect;
}

/**
 * Parse a pure "If <cond>, A. Otherwise, B." effect.
 *
 * Unlike `parseIfYouDoEffect` (which expects an "X. If you do, Y" framing),
 * this handles cards whose entire body is a conditional — e.g., Solari
 * Chief's "If it is stunned, kill it. Otherwise, stun it." The output is a
 * `ConditionalEffect` whose `condition` is parsed via
 * `parseLeadingIfCondition`.
 */
export function parseIfElseEffect(text: string): Effect | undefined {
  if (!/^If\s/i.test(text)) {
    return undefined;
  }
  // Must have an "Otherwise" branch at a sentence boundary.
  const otherwiseMatch = text.match(/\.\s+Otherwise,\s+(.+?)\.?\s*$/i);
  if (!otherwiseMatch || otherwiseMatch.index === undefined) {
    return undefined;
  }
  const thenText = text.slice(0, otherwiseMatch.index).trim();
  const elseText = otherwiseMatch[1].trim();

  const condResult = parseLeadingIfCondition(thenText);
  if (!condResult) {
    return undefined;
  }
  const thenBody = condResult.effectText.trim().replace(/\.$/, "");
  const thenEffect = parseEffects(`${thenBody}.`) ?? parseEffect(`${thenBody}.`);
  const elseEffect = parseEffects(`${elseText}.`) ?? parseEffect(`${elseText}.`);
  if (!thenEffect || !elseEffect) {
    return undefined;
  }
  return {
    condition: condResult.condition,
    else: elseEffect,
    then: thenEffect,
    type: "conditional",
  } as Effect;
}

/**
 * Parse a comma-joined chain of effects that all share the same pronoun
 * target ("it", "me", "them").
 *
 * Handles forms like:
 *   - "Heal it, exhaust it, and recall it."
 *   - "Heal it, exhaust it, recall it."
 *   - "Heal me, exhaust me."
 *
 * Each clause must parse as a standalone effect; the final clause may be
 * joined with "and". Returns a `SequenceEffect` containing the parsed
 * clauses in order, or `undefined` if any clause fails to parse.
 */
export function parseCommaPronounChain(text: string): SequenceEffect | undefined {
  // Quick filter: must mention a pronoun at least twice.
  const pronounCount = (text.match(/\b(?:it|me|them)\b/gi) ?? []).length;
  if (pronounCount < 2) {
    return undefined;
  }
  // Must have at least one comma.
  if (!text.includes(",")) {
    return undefined;
  }

  // Split on commas, then the last clause may be prefixed by "and".
  const rawClauses = text
    .replace(/\.\s*$/, "")
    .split(/,\s*/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (rawClauses.length < 2) {
    return undefined;
  }

  // Strip "and " from the last clause.
  const lastIdx = rawClauses.length - 1;
  rawClauses[lastIdx] = rawClauses[lastIdx].replace(/^and\s+/i, "");

  // Each clause must parse as a standalone effect.
  const effects: Effect[] = [];
  for (const clause of rawClauses) {
    // Add trailing period so single-effect parsers accept the clause.
    const eff = parseEffect(`${clause}.`);
    if (!eff) {
      return undefined;
    }
    effects.push(eff);
  }
  if (effects.length < 2) {
    return undefined;
  }
  return { effects, type: "sequence" } as SequenceEffect;
}

/**
 * Try to parse a choice effect: "EFFECT_A or EFFECT_B"
 */
export function parseChoiceEffect(text: string): ChoiceEffect | undefined {
  // Split on " or " that separates two effects
  const orIndex = text.toLowerCase().indexOf(" or ");
  if (orIndex === -1) {
    return undefined;
  }

  const leftText = text.slice(0, orIndex).trim();
  const rightText = text.slice(orIndex + 4).trim();

  // Handle "VERB or VERB TARGET" patterns where a target is shared
  // E.g., "ready or exhaust a legend" => choice between ready(legend) and exhaust(legend)
  const sharedTargetMatch = text.match(/^(ready|exhaust|stun) or (ready|exhaust|stun)\s+(.+)$/i);
  if (sharedTargetMatch) {
    const verb1 = sharedTargetMatch[1].toLowerCase();
    const verb2 = sharedTargetMatch[2].toLowerCase();
    const targetStr = sharedTargetMatch[3];
    const target = parseTarget(targetStr);
    const effect1 = { target, type: verb1 } as Effect;
    const effect2 = { target, type: verb2 } as Effect;
    return {
      options: [{ effect: effect1 }, { effect: effect2 }],
      type: "choice",
    } as ChoiceEffect;
  }

  const leftEffect = parseEffect(leftText);
  const rightEffect = parseEffect(rightText);

  if (!leftEffect || !rightEffect) {
    return undefined;
  }

  return {
    options: [{ effect: leftEffect }, { effect: rightEffect }],
    type: "choice",
  } as ChoiceEffect;
}
