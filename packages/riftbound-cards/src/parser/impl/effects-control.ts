/**
 * Effect parsers: counter / control / extra turn / win game.
 */

import type {
  CounterEffect,
  Effect,
  GainControlOfSpellEffect,
  SequenceEffect,
} from "@tcg/riftbound-types/abilities/effect-types";
import type { AnyTarget, Location } from "@tcg/riftbound-types/targeting";
import { parseCost } from "../parsers/cost-parser";
import { parseEffect } from "./effect";

/**
 * Try to parse a counter effect: "Counter a spell."
 */
export function parseCounterEffect(text: string): CounterEffect | undefined {
  // Handle "Counter a spell unless its controller pays :rb_energy_N:" pattern
  const unlessMatch = text.match(
    /^Counter (a spell|an? .+spell.*?) unless its controller pays (.+?)\.?$/i,
  );
  if (unlessMatch) {
    const costStr = unlessMatch[2];
    const unless = parseCost(costStr);
    return { type: "counter", unless } as CounterEffect;
  }

  const match = text.match(/^Counter (a spell.*|an? .+spell.*|that spell.*)\.?$/i);
  if (!match) {
    return undefined;
  }
  return { type: "counter" };
}

/**
 * Try to parse a gain-control-of-spell effect
 */
export function parseGainControlOfSpellEffect(text: string): GainControlOfSpellEffect | undefined {
  const match = text.match(/^Gain control of a spell\.?\s*(You may make new choices for it\.?)?$/i);
  if (!match) {
    return undefined;
  }
  return match[1]
    ? { newChoices: true, type: "gain-control-of-spell" }
    : { type: "gain-control-of-spell" };
}

/**
 * Try to parse a take-control effect: "Take control of TARGET." or "Take control of it and recall it."
 */
export function parseTakeControlEffect(text: string): Effect | SequenceEffect | undefined {
  // Handle "Take control of it and recall it."
  const andRecallMatch = text.match(/^Take control of it and recall it\.?$/i);
  if (andRecallMatch) {
    return {
      effects: [
        { target: { type: "unit" } as AnyTarget, type: "take-control" } as Effect,
        { target: { type: "unit" } as AnyTarget, type: "recall" } as Effect,
      ],
      type: "sequence",
    };
  }

  // Handle "Take control of TARGET."
  const match = text.match(
    /^Take control of ((?:a|an)\s+(?:friendly |enemy )?(?:unit|gear)(?:\s+(?:at a battlefield|here|there|in a base))?)\.?$/i,
  );
  if (match) {
    const targetStr = match[1].toLowerCase();
    const target: {
      type: "unit" | "gear";
      controller?: "friendly" | "enemy";
      location?: Location;
    } = { type: "unit" };
    if (targetStr.includes("gear")) {
      target.type = "gear";
    }
    if (targetStr.includes("enemy")) {
      target.controller = "enemy";
    } else if (targetStr.includes("friendly")) {
      target.controller = "friendly";
    }
    if (targetStr.includes("at a battlefield")) {
      target.location = "battlefield";
    } else if (targetStr.includes("here")) {
      target.location = "here" as Location;
    } else if (targetStr.includes("in a base")) {
      target.location = "base";
    }
    return { target: target as AnyTarget, type: "take-control" } as Effect;
  }

  return undefined;
}

/**
 * Try to parse a lose-control effect: "Lose control of that unit and recall it at end of turn."
 */
export function parseLoseControlEffect(text: string): Effect | undefined {
  const match = text.match(
    /^Lose control of (?:that|a|an|the) (\w+)(?: and (.+?))?(?:\s+at end of turn)?\.?$/i,
  );
  if (!match) {
    return undefined;
  }
  const targetType = match[1].toLowerCase();
  const andEffect = match[2];
  const loseControl: Effect = {
    target: { type: targetType } as AnyTarget,
    type: "lose-control",
  } as unknown as Effect;
  if (andEffect) {
    const additional = parseEffect(andEffect.trim() + ".");
    if (additional) {
      return { effects: [loseControl, additional], type: "sequence" } as SequenceEffect;
    }
  }
  return loseControl;
}

/**
 * Try to parse an extra-turn effect: "Take an extra turn after this one."
 */
export function parseExtraTurnEffect(text: string): Effect | undefined {
  // rule-id: ogn-122-298 — "Take a turn after this one." must parse as extra-turn
  const match = text.match(/^Take an?(?: extra)? turn after this one\.?$/i);
  if (!match) {
    return undefined;
  }
  return { type: "extra-turn" } as Effect;
}

/**
 * Try to parse a win-game effect: "you win the game."
 */
export function parseWinGameEffect(text: string): Effect | undefined {
  const match = text.match(/^you win the game\.?$/i);
  if (!match) {
    return undefined;
  }
  return { type: "win-game" } as Effect;
}
