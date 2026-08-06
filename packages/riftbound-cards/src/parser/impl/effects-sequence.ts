/**
 * Effect parsers: 'and' compounds and pending-value sequences.
 */

import type { Effect, SequenceEffect } from "@tcg/riftbound-types/abilities/effect-types";
import type { AnyTarget } from "@tcg/riftbound-types/targeting";
import { parseEffect } from "./effect";
import { parseGrantDuration, resolveGrantTarget } from "./effects-grant-keyword";

/**
 * Try to parse a compound effect connected by "and": "EFFECT_A and EFFECT_B"
 * Returns a sequence if both halves parse as effects.
 * Only splits on " and " that separates two independent effects,
 * not " and " inside phrases like "spell and ability damage".
 */
export function parseAndCompoundEffect(text: string): SequenceEffect | undefined {
  // Special case: "Give TARGET +/-N :rb_might: [this turn] and [Keyword N] this turn."
  // The right half is a bare keyword clause that can't stand alone; re-use the target.
  const compoundMightKeywordMatch = text.match(
    /^Give (.+?)\s+([+-]\d+)\s*:rb_might:\s*(?:this turn\s+)?and\s+\[(\w+(?:-\w+)?)(?:\s+(\d+))?\]\s*(this turn|this combat)?\.?$/i,
  );
  if (compoundMightKeywordMatch) {
    const targetStr = compoundMightKeywordMatch[1];
    const amount = Number.parseInt(compoundMightKeywordMatch[2], 10);
    const keyword = compoundMightKeywordMatch[3];
    const valueStr = compoundMightKeywordMatch[4];
    const duration = parseGrantDuration(compoundMightKeywordMatch[5]);
    const target = resolveGrantTarget(targetStr);

    const mightEffect: {
      type: "modify-might";
      amount: number;
      target: AnyTarget;
      duration?: "turn";
    } = {
      amount,
      target,
      type: "modify-might",
    };
    if (duration === "turn") {
      mightEffect.duration = "turn";
    }

    const grantEffect: {
      type: "grant-keyword";
      keyword: string;
      target: AnyTarget;
      value?: number;
      duration?: "turn" | "combat";
    } = {
      keyword,
      target,
      type: "grant-keyword",
    };
    if (valueStr) {
      grantEffect.value = Number.parseInt(valueStr, 10);
    }
    if (duration) {
      grantEffect.duration = duration;
    }

    return {
      effects: [mightEffect as Effect, grantEffect as Effect],
      type: "sequence",
    } as SequenceEffect;
  }

  // Special case: "Give TARGET [Keyword1] and [Keyword2] this turn."
  const compoundTwoKeywordsMatch = text.match(
    /^Give (.+?)\s+\[(\w+(?:-\w+)?)(?:\s+(\d+))?\]\s+and\s+\[(\w+(?:-\w+)?)(?:\s+(\d+))?\]\s*(this turn|this combat)?\.?$/i,
  );
  if (compoundTwoKeywordsMatch) {
    const targetStr = compoundTwoKeywordsMatch[1];
    const keyword1 = compoundTwoKeywordsMatch[2];
    const value1Str = compoundTwoKeywordsMatch[3];
    const keyword2 = compoundTwoKeywordsMatch[4];
    const value2Str = compoundTwoKeywordsMatch[5];
    const duration = parseGrantDuration(compoundTwoKeywordsMatch[6]);
    const target = resolveGrantTarget(targetStr);

    const effect1: {
      type: "grant-keyword";
      keyword: string;
      target: AnyTarget;
      value?: number;
      duration?: "turn" | "combat";
    } = {
      keyword: keyword1,
      target,
      type: "grant-keyword",
    };
    if (value1Str) {
      effect1.value = Number.parseInt(value1Str, 10);
    }
    if (duration) {
      effect1.duration = duration;
    }

    const effect2: {
      type: "grant-keyword";
      keyword: string;
      target: AnyTarget;
      value?: number;
      duration?: "turn" | "combat";
    } = {
      keyword: keyword2,
      target,
      type: "grant-keyword",
    };
    if (value2Str) {
      effect2.value = Number.parseInt(value2Str, 10);
    }
    if (duration) {
      effect2.duration = duration;
    }

    return {
      effects: [effect1 as Effect, effect2 as Effect],
      type: "sequence",
    } as SequenceEffect;
  }

  const lower = text.toLowerCase();
  const andIndex = lower.indexOf(" and ");
  if (andIndex === -1) {
    return undefined;
  }

  const leftText = text.slice(0, andIndex).trim();
  const rightText = text.slice(andIndex + 5).trim();

  // Both halves must parse as valid effects
  const leftEffect = parseEffect(leftText);
  const rightEffect = parseEffect(rightText);

  if (!leftEffect || !rightEffect) {
    return undefined;
  }

  return { effects: [leftEffect, rightEffect], type: "sequence" } as SequenceEffect;
}

/**
 * Walk a parsed effect tree and return true if any leaf references a
 * `{ type: "pending-value" }` target. Used by sequence-building code to
 * detect when an earlier step must publish its produced value.
 */
export function effectReferencesPendingValue(effect: Effect | undefined): boolean {
  if (!effect || typeof effect !== "object") {
    return false;
  }
  const obj = effect as unknown as Record<string, unknown>;
  if (
    obj.target &&
    typeof obj.target === "object" &&
    (obj.target as { type?: string }).type === "pending-value"
  ) {
    return true;
  }
  // Recurse into nested effects / control-flow children.
  const nested: unknown[] = [];
  if (Array.isArray(obj.effects)) {
    nested.push(...(obj.effects as unknown[]));
  }
  if (obj.effect) {
    nested.push(obj.effect);
  }
  if (obj.then) {
    nested.push(obj.then);
  }
  if (obj.else) {
    nested.push(obj.else);
  }
  for (const n of nested) {
    if (effectReferencesPendingValue(n as Effect)) {
      return true;
    }
  }
  return false;
}

/**
 * Return true if the effect is a "value-producing" step — one that can bind
 * a card id for a later `pending-value` reference (banish, reveal, look,
 * choose, play-from-deck-reveal, etc.).
 */
export function effectProducesPendingValue(effect: Effect | undefined): boolean {
  if (!effect || typeof effect !== "object") {
    return false;
  }
  const t = (effect as { type?: string }).type;
  return t === "banish" || t === "look" || t === "reveal";
}

/**
 * Wrap an ordered list of sequence effects in a `SequenceEffect`, attaching
 * a `pendingValue` binding when a later step references a `pending-value`
 * target produced by an earlier step.
 */
export function buildSequenceWithPendingValue(effects: Effect[]): SequenceEffect {
  let sourceIdx: number | undefined;
  for (let i = 1; i < effects.length; i++) {
    if (effectReferencesPendingValue(effects[i])) {
      // Find the most recent producing step before this one.
      for (let j = i - 1; j >= 0; j--) {
        if (effectProducesPendingValue(effects[j])) {
          sourceIdx = j;
          break;
        }
      }
      if (sourceIdx !== undefined) {
        break;
      }
    }
  }
  if (sourceIdx !== undefined) {
    return {
      effects,
      pendingValue: { source: sourceIdx },
      type: "sequence",
    } as SequenceEffect;
  }
  return { effects, type: "sequence" } as SequenceEffect;
}
