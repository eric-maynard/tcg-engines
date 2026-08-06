/**
 * Effect parsers: buff / modify-might / heal.
 */

import type {
  BuffEffect,
  Effect,
  ModifyMightEffect,
  SequenceEffect,
} from "@tcg/riftbound-types/abilities/effect-types";
import type { AnyTarget, Location } from "@tcg/riftbound-types/targeting";
import { parseTarget } from "../parsers/target-parser";
import { parseEffect } from "./effect";
import { wordToNumber } from "./tokens";

/**
 * Try to parse a buff effect: "Buff TARGET."
 *
 * Handles: "Buff me/it", "Buff a [friendly] unit", "Buff another friendly unit",
 * "Buff up to N [other] friendly units", "Buff all units here", "Buff friendly units"
 */
export function parseBuffEffect(text: string): BuffEffect | undefined {
  const match = text.match(
    // rule-id: unl-043-219 — `units?` not `(?:unit|units)`: the alternation matched
    // "unit" first and dropped the trailing "s here", so location:"here" was never set.
    /^Buff (me|it|(?:up to (?:two|three|four|five|six|\d+)\s+)?(?:another\s+|other\s+)?(?:all\s+)?(?:a\s+|an\s+)?(?:exhausted\s+|stunned\s+|damaged\s+)?(?:friendly |enemy )?units?(?:\s+(?:here|there|at a battlefield))?)\.?/i,
  );
  if (!match) {
    return undefined;
  }
  const targetText = match[1].toLowerCase().trim();

  // Self references
  if (targetText === "me" || targetText === "it") {
    return { target: "self" as AnyTarget, type: "buff" };
  }

  // Build target from text
  const buffTarget: {
    type: "unit";
    controller?: "friendly" | "enemy";
    location?: Location;
    quantity?: "all" | number | { upTo: number };
    excludeSelf?: boolean;
    filter?: string;
  } = { type: "unit" };

  if (targetText.includes("friendly")) {
    buffTarget.controller = "friendly";
  } else if (targetText.includes("enemy")) {
    buffTarget.controller = "enemy";
  }

  if (targetText.includes("here")) {
    buffTarget.location = "here" as Location;
  } else if (targetText.includes("there")) {
    buffTarget.location = "there" as Location;
  } else if (targetText.includes("at a battlefield")) {
    buffTarget.location = "battlefield";
  }

  if (targetText.includes("all ")) {
    buffTarget.quantity = "all";
  } else if (targetText.includes("another") || targetText.includes("other")) {
    buffTarget.excludeSelf = true;
  }

  // Parse state filters
  if (targetText.includes("exhausted")) {
    buffTarget.filter = "exhausted";
  } else if (targetText.includes("stunned")) {
    buffTarget.filter = "stunned";
  } else if (targetText.includes("damaged")) {
    buffTarget.filter = "damaged";
  }

  // Parse "up to N" quantity
  const upToMatch = targetText.match(/up to (two|three|four|five|six|\d+)/);
  if (upToMatch) {
    buffTarget.quantity = { upTo: wordToNumber(upToMatch[1]) };
  }

  return { target: buffTarget as AnyTarget, type: "buff" };
}

/**
 * Try to parse a modify-might effect: "Give TARGET +/-N :rb_might: this turn[, to a minimum of M :rb_might:]."
 */
export function parseModifyMightEffect(text: string): ModifyMightEffect | SequenceEffect | undefined {
  // Handle "Give a unit with the named tag +/-N :rb_might: this turn." (The List)
  const namedTagMatch = text.match(
    /^Give (?:a|an) unit with the named tag\s+([+-]\d+)\s*:rb_might:\s*(this turn)?\.?$/i,
  );
  if (namedTagMatch) {
    const amount = Number.parseInt(namedTagMatch[1], 10);
    const effect: {
      type: "modify-might";
      amount: number;
      target: AnyTarget;
      duration?: "turn";
    } = {
      amount,
      target: { filter: { tag: "named" }, type: "unit" } as AnyTarget,
      type: "modify-might",
    };
    if (namedTagMatch[2]) {
      effect.duration = "turn";
    }
    return effect as ModifyMightEffect;
  }

  // Handle compound: "Give TARGET1 +N :rb_might: this turn and another TARGET2 -M :rb_might: this turn."
  const compoundMatch = text.match(
    /^Give ((?:a|an|another|two|three|four|five|\d+)?\s*(?:friendly |enemy |attacking enemy )?(?:unit|units|me|it)(?:\s+(?:at a battlefield|here|there))?)\s+(?:each\s+)?([+-]\d+)\s*:rb_might:\s*(this turn)?(?:,?\s*(?:to a minimum of (\d+)\s*:rb_might:))?\s+and\s+(?:another\s+)?((?:a|an|another|two|three|four|five|\d+)?\s*(?:friendly |enemy |attacking enemy )?(?:unit|units|me|it)(?:\s+(?:at a battlefield|here|there))?)\s+([+-]\d+)\s*:rb_might:\s*(this turn)?(?:,?\s*(?:to a minimum of (\d+)\s*:rb_might:))?\.?$/i,
  );
  if (compoundMatch) {
    const effect1: {
      type: "modify-might";
      amount: number;
      target: AnyTarget;
      duration?: "turn";
      minimum?: number;
    } = {
      amount: Number.parseInt(compoundMatch[2], 10),
      target: parseTarget(compoundMatch[1]),
      type: "modify-might",
    };
    if (compoundMatch[3]) {
      effect1.duration = "turn";
    }
    if (compoundMatch[4] !== undefined) {
      effect1.minimum = Number.parseInt(compoundMatch[4], 10);
    }

    const effect2: {
      type: "modify-might";
      amount: number;
      target: AnyTarget;
      duration?: "turn";
      minimum?: number;
    } = {
      amount: Number.parseInt(compoundMatch[6], 10),
      target: parseTarget(compoundMatch[5]),
      type: "modify-might",
    };
    if (compoundMatch[7]) {
      effect2.duration = "turn";
    }
    if (compoundMatch[8] !== undefined) {
      effect2.minimum = Number.parseInt(compoundMatch[8], 10);
    }

    return {
      effects: [effect1 as Effect, effect2 as Effect],
      type: "sequence",
    } as SequenceEffect;
  }

  // Handle "Give TARGET each +N" and standard "Give TARGET +N"
  // The trailing "instead" modifier (used by [Level N] gated effects) is
  // Accepted and dropped; it's purely a text-level connector back to the
  // Base-level effect it replaces.
  const match = text.match(
    /^Give ((?:a|an|another|two|three|four|five|\d+)?\s*(?:friendly |enemy |attacking enemy )?(?:\w+ )*?(?:unit|units|me|it)(?:\s+(?:at a battlefield|here|there))?|your\s+\w+(?:\s+\w+)?)\s+(?:each\s+)?([+-]\d+)\s*:rb_might:\s*(this turn)?(?:,?\s*(?:to a minimum of (\d+)\s*:rb_might:))?(?:\s+instead)?\.?$/i,
  );
  if (!match) {
    return undefined;
  }

  const targetStr = match[1];
  const amount = Number.parseInt(match[2], 10);
  const durationStr = match[3];
  const minimumStr = match[4];

  // Parse target - check for tribal "your TAG" pattern
  let target: AnyTarget;
  const tribalMatch = targetStr.match(/^your\s+(.+)$/i);
  if (tribalMatch) {
    const tribeName = tribalMatch[1].trim();
    // Rule 419.2.a / 355.10.d: "your <Tribe>s" is a criteria-based mass selection,
    // not a caster Choice — mark quantity:"all" so the play is legal with zero matches.
    target = {
      controller: "friendly",
      filter: { tag: tribeName },
      quantity: "all",
      type: "unit",
    } as AnyTarget;
  } else {
    // Extract leading quantity word (two, three, etc.) before passing to parseTarget
    const quantityMatch = targetStr.match(
      /^(two|three|four|five|six|\d+)\s+((?:friendly |enemy |attacking enemy )?(?:unit|units).*)$/i,
    );
    if (quantityMatch) {
      const qty = wordToNumber(quantityMatch[1]);
      const restTarget = quantityMatch[2];
      target = parseTarget(restTarget);
      if (typeof target === "object" && target !== null && "type" in target) {
        (target as { quantity: number }).quantity = qty;
      }
    } else {
      target = parseTarget(targetStr);
    }
  }
  const effect: {
    type: "modify-might";
    amount: number;
    target: AnyTarget;
    duration?: "turn";
    minimum?: number;
  } = {
    amount,
    target,
    type: "modify-might",
  };

  if (durationStr) {
    effect.duration = "turn";
  }
  if (minimumStr !== undefined) {
    effect.minimum = Number.parseInt(minimumStr, 10);
  }

  return effect as ModifyMightEffect;
}

/**
 * Try to parse a heal effect: "Heal TARGET." / "Heal it." / "Heal all friendly units."
 *
 * Heal removes damage counters. Used mostly inside replacement effects and
 * reaction spells like Highlander and Tactical Retreat
 * ("heal it, exhaust it, and recall it").
 */
export function parseHealEffect(text: string): Effect | undefined {
  const match = text.match(
    /^Heal (me|it|them|(?:all\s+)?(?:friendly |enemy |your )?(?:unit|units|gear)(?:\s+(?:here|at a battlefield|there))?)\.?$/i,
  );
  if (!match) {
    return undefined;
  }
  const raw = match[1].trim().toLowerCase();
  let target: AnyTarget;
  if (raw === "me") {
    target = "self";
  } else if (raw === "it" || raw === "them") {
    target = { type: "unit" } as AnyTarget;
  } else {
    target = parseTarget(match[1]);
  }
  return { amount: "all", target, type: "heal" } as Effect;
}

/**
 * Try to parse a spend-buff effect: "Spend a buff to EFFECT."
 */
export function parseSpendBuffEffect(text: string): Effect | undefined {
  const match = text.match(/^Spend a buff to (.+?)\.?$/i);
  if (!match) {
    return undefined;
  }
  const thenText = match[1].trim();
  const thenEffect = parseEffect(thenText + ".");
  if (!thenEffect) {
    return undefined;
  }
  return { then: thenEffect, type: "spend-buff" } as Effect;
}
