/**
 * Effect parsers: channel / add resource / score / XP / empower.
 */

import type {
  AddResourceEffect,
  ChannelEffect,
  Effect,
  SequenceEffect,
} from "@tcg/riftbound-types/abilities/effect-types";
import type { AnyTarget } from "@tcg/riftbound-types/targeting";
import { parseTarget } from "../parsers/target-parser";
import { parseResourcePayload } from "./costs";
import { parseEffect } from "./effect";
import { parseCardTarget } from "./targets";

/**
 * Try to parse a channel effect: "Channel N rune(s) [exhausted]."
 *
 * Also supports "Each player channels N rune(s) [exhausted]." — used by
 * some battlefield/hold triggers — encoded with `player: "each"`.
 */
export function parseChannelEffect(text: string): ChannelEffect | undefined {
  // "Each player channels N rune(s) [exhausted]."
  const eachMatch = text.match(/^each player channels? (\d+) runes?(?:\s+(exhausted))?\.?$/i);
  if (eachMatch) {
    const amount = Number.parseInt(eachMatch[1], 10);
    const exhausted = eachMatch[2]?.toLowerCase() === "exhausted";
    const effect: ChannelEffect & { player?: "each" } = exhausted
      ? { amount, exhausted: true, type: "channel" }
      : { amount, type: "channel" };
    (effect as { player: "each" }).player = "each";
    return effect;
  }

  const match = text.match(/^channel (\d+) runes?(?:\s+(exhausted))?\.?/i);
  if (!match) {
    return undefined;
  }
  const amount = Number.parseInt(match[1], 10);
  const exhausted = match[2]?.toLowerCase() === "exhausted";
  return exhausted ? { amount, exhausted: true, type: "channel" } : { amount, type: "channel" };
}

/**
 * Try to parse an add-resource effect.
 *
 * Resource tokens have already been normalized by `normalizeTokens`:
 *   [N]      -> :rb_energy_N:
 *   [fury]   -> :rb_rune_fury:  (same for calm/mind/body/chaos/order/rainbow)
 *
 * Handles:
 * - "[Add] :rb_rune_rainbow:."                -> { type: "add-resource", power: ["rainbow"] }
 * - "[Add] :rb_energy_1:."                    -> { type: "add-resource", energy: 1 }
 * - "[Add] :rb_rune_calm:."                   -> { type: "add-resource", power: ["calm"] }
 * - "[Add] :rb_energy_1::rb_rune_rainbow:."   -> energy + power
 * - "Add :rb_energy_2:."  (bare "Add" verb without brackets)
 */
export function parseAddResourceEffect(text: string): AddResourceEffect | undefined {
  const match = text.match(
    /^(?:\[Add\]|Add)\s+((?::rb_(?:energy_\d+|rune_(?:fury|calm|mind|body|chaos|order|rainbow)):)+)\.?$/i,
  );
  if (!match) {
    return undefined;
  }
  return parseResourcePayload(match[1]);
}

/**
 * Try to parse a score effect: "you score N [additional] point(s)."
 *
 * Also handles bare "score N point(s)" (without a "you" subject) and
 * "they score N point(s)" — used inside sequences where the subject has
 * already been established by the outer clause.
 */
export function parseScoreEffect(text: string): Effect | undefined {
  // "you score 1 point" — the common default.
  const youMatch = text.match(/^you score (\d+)(?: additional)? points?\.?$/i);
  if (youMatch) {
    return { amount: Number.parseInt(youMatch[1], 10), type: "score" } as Effect;
  }

  // Bare "score 1 point" (e.g. inside sequences or triggered effects).
  const bareMatch = text.match(/^score (\d+)(?: additional)? points?\.?$/i);
  if (bareMatch) {
    return { amount: Number.parseInt(bareMatch[1], 10), type: "score" } as Effect;
  }

  // "they score N point(s)" / "that player scores N point(s)" — opponent scores.
  const theyMatch = text.match(/^(?:they|that player) scores? (\d+)(?: additional)? points?\.?$/i);
  if (theyMatch) {
    return {
      amount: Number.parseInt(theyMatch[1], 10),
      player: "opponent",
      type: "score",
    } as unknown as Effect;
  }

  return undefined;
}

/**
 * Try to parse a "Gain N XP" effect (UNL set).
 *
 * Handles:
 *   - "Gain 1 XP."
 *   - "Gain 2 XP"
 *   - "Gain 1 XP for each friendly unit."       -> AmountExpression {count: ...}
 */
export function parseGainXpEffect(text: string): Effect | undefined {
  // "Gain N XP for each TARGET"
  const forEachMatch = text.match(
    /^Gain (\d+) XP for each ((?:of )?(?:your |other |friendly |enemy )?(?:\[?\w+\]?\s*)?(?:units?|cards?|gear|legends?)(?:\s+(?:here|at a battlefield|there))?)\.?$/i,
  );
  if (forEachMatch) {
    const perUnit = Number.parseInt(forEachMatch[1], 10);
    const countTarget = forEachMatch[2].trim().toLowerCase();
    const countObj: {
      count: AnyTarget;
      multiplier?: number;
    } = {
      count: parseTarget(countTarget) as AnyTarget,
      ...(perUnit !== 1 ? { multiplier: perUnit } : {}),
    };
    return { amount: countObj, type: "gain-xp" } as unknown as Effect;
  }

  // "Gain N XP."
  const basic = text.match(/^Gain (\d+) XP\.?$/i);
  if (basic) {
    return {
      amount: Number.parseInt(basic[1], 10),
      type: "gain-xp",
    } as unknown as Effect;
  }
  return undefined;
}

/**
 * Try to parse a "Spend N XP to <effect>" compound (UNL set).
 *
 * Produces a sequence of `[spend-xp, <inner effect>]`. The outer caller wraps
 * with `optional` / `conditional` as appropriate (e.g., when the trigger
 * clause had "you may ..."). Falls through if the inner effect can't be
 * parsed so a simpler parser can take another pass at the text.
 */
export function parseSpendXpToEffect(text: string): Effect | undefined {
  const match = text.match(/^Spend (\d+) XP to (.+?)\.?$/i);
  if (!match) {
    return undefined;
  }
  const amount = Number.parseInt(match[1], 10);
  const inner = parseEffect(`${match[2]}.`);
  if (!inner) {
    return undefined;
  }
  // rule 204.3 / 740.4.a — "Spend N XP TO <effect>" is a cost within
  // instructions: `costStep` lets a triggered ability pay it while the item is
  // finalized (740.4.a.2) and gates the payoff on it everywhere else.
  return {
    effects: [{ amount, costStep: true, type: "spend-xp" } as unknown as Effect, inner],
    type: "sequence",
  } as unknown as SequenceEffect;
}

/**
 * Try to parse a "Spend N XP" effect (UNL set) used as a standalone verb.
 * Most "spend N XP" usages appear as an activated-ability cost; this parser
 * handles rare cases where "spend N XP" is an effect on its own.
 */
export function parseSpendXpEffect(text: string): Effect | undefined {
  const match = text.match(/^Spend (\d+) XP\.?$/i);
  if (!match) {
    return undefined;
  }
  return {
    amount: Number.parseInt(match[1], 10),
    type: "spend-xp",
  } as unknown as Effect;
}

/**
 * Try to parse any known effect from text
 */
/**
 * Try to parse an empower / disempower effect.
 *
 * Handles:
 * - "Empower me/it/this." / "empower me."
 * - "Empower a [friendly] unit."
 * - "Disempower me/it/this."
 * - "Disempower a [friendly|enemy] unit."
 */
export function parseEmpowerEffect(text: string): Effect | undefined {
  // rule 517.2.b (rule-id: ven-099-166) — "… Disempower it at end of turn."
  // is the duration of the empower it follows, not a separate effect.
  let body = text;
  let untilEndOfTurn = false;
  const tail = body.match(/[.,]?\s*disempower it at (?:the )?end of turn\.?$/i);
  if (tail) {
    untilEndOfTurn = true;
    body = body.slice(0, tail.index).trim();
  } else {
    // rule 517.2.b (rule-id: ven-035-166) — the mirror tail "… Empower it at
    // end of turn." after a Disempower is likewise that disempower's duration.
    // `(?<![a-z])` keeps it from matching inside the word "disempower".
    const reTail = body.match(/[.,]?\s*(?<![a-z])empower it at (?:the )?end of turn\.?$/i);
    if (reTail) {
      untilEndOfTurn = true;
      body = body.slice(0, reTail.index).trim();
    }
  }
  const match = body.match(
    /^(dis)?empower (me|it|this|(?:a|an|another)\s+(?:friendly |enemy )?(?:unit|gear)(?:\s+(?:here|at a battlefield))?(?:\s+that's \[empowered\])?|something(?: else)?(?:\s+here)?)\.?$/i,
  );
  if (!match) {
    return undefined;
  }
  const dis = Boolean(match[1]);
  const targetStr = match[2].toLowerCase().trim();
  let target: AnyTarget;
  if (targetStr === "me" || targetStr === "this") {
    target = "self" as AnyTarget;
  } else if (targetStr === "it") {
    target = { type: "unit" } as AnyTarget;
  } else if (targetStr.startsWith("something")) {
    target = {
      excludeSelf: targetStr.includes("else"),
      type: "permanent",
      ...(/\bhere$/.test(targetStr) ? { location: "here" } : {}),
    } as unknown as AnyTarget;
  } else {
    // rule-id: ven-062-166 — "Empower another gear": `parseCardTarget` only
    // ever yields `{type:"unit"}`, so the gear noun and the "another"
    // self-exclusion have to be re-applied here.
    const parsed = parseCardTarget(targetStr) as Record<string, unknown>;
    if (/\bgear\b/.test(targetStr)) {
      parsed.type = "gear";
    }
    if (/^another\b/.test(targetStr)) {
      parsed.excludeSelf = true;
    }
    target = parsed as AnyTarget;
  }
  return {
    target,
    type: dis ? "disempower" : "empower",
    ...(untilEndOfTurn ? { duration: "turn" } : {}),
  } as unknown as Effect;
}
