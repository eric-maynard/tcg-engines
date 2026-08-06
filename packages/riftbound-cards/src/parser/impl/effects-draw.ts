/**
 * Effect parsers: draw / look / discard / recycle / predict.
 */

import type { DrawEffect, Effect, LookEffect } from "@tcg/riftbound-types/abilities/effect-types";
import type { AnyTarget } from "@tcg/riftbound-types/targeting";
import { parseTarget } from "../parsers/target-parser";

// ============================================================================
// Effect Parsers
// ============================================================================

/**
 * Try to parse a draw effect: "Draw N."
 */
export function parseDrawEffect(text: string): DrawEffect | undefined {
  // Handle "Draw N for each [other] battlefield you (or allies )?control" patterns
  const forEachBattlefieldMatch = text.match(
    /^Draw (\d+) for each (other )?battlefield you(?: or allies)? control\.?$/i,
  );
  if (forEachBattlefieldMatch) {
    const perUnit = Number.parseInt(forEachBattlefieldMatch[1], 10);
    const excludeSelf = Boolean(forEachBattlefieldMatch[2]);
    const countObj: {
      count: AnyTarget;
      multiplier?: number;
    } = {
      count: {
        controller: "friendly-or-allies",
        excludeSelf,
        type: "battlefield",
      } as unknown as AnyTarget,
      ...(perUnit !== 1 ? { multiplier: perUnit } : {}),
    };
    return { amount: countObj, type: "draw" } as unknown as DrawEffect;
  }

  // Handle "Draw N for each ..." conditional draw patterns
  const forEachMatch = text.match(
    /^Draw (\d+) for each (?:of )?((?:your |other |friendly )?(?:\[?\w+\]?\s*)?(?:units?|friendly units?|cards?|gear)(?:\s+(?:here|at a battlefield|there))?)\.?$/i,
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
    return { amount: countObj, type: "draw" } as unknown as DrawEffect;
  }

  // Handle "Its controller draws N" / "Their controller draws N"
  // rule 359.3.e.14.a — "its" refers to the chosen object, so the DRAW belongs to
  // that object's controller (who need not be the caster's opponent).
  const controllerDrawMatch = text.match(/^Its controller draws (\d+)\.?$/i);
  if (controllerDrawMatch) {
    return {
      amount: Number.parseInt(controllerDrawMatch[1], 10),
      player: "target-controller",
      type: "draw",
    };
  }

  // Handle "They draw N" / "that player draws N"
  const theyDrawMatch = text.match(/^(?:They|that player) draws? (\d+)\.?$/i);
  if (theyDrawMatch) {
    return { amount: Number.parseInt(theyDrawMatch[1], 10), player: "opponent", type: "draw" };
  }

  // Handle "Each player draws N" / "you and that player each draw N"
  const eachDrawMatch = text.match(/^(?:Each player|you and that player each) draws? (\d+)\.?$/i);
  if (eachDrawMatch) {
    return { amount: Number.parseInt(eachDrawMatch[1], 10), player: "each", type: "draw" };
  }

  // Basic "Draw N" pattern (anchored to end to avoid matching partial compounds)
  const match = text.match(/^Draw (\d+)\.?$/i);
  if (!match) {
    return undefined;
  }
  return { amount: Number.parseInt(match[1], 10), type: "draw" };
}

/**
 * Try to parse a look effect: "Look at the top N cards of your DECK."
 */
export function parseLookEffect(text: string): LookEffect | undefined {
  const match = text.match(/^Look at the top (\d+) cards? of your (Main Deck|Rune Deck|deck)\.?/i);
  if (!match) {
    return undefined;
  }
  const amount = Number.parseInt(match[1], 10);
  const from = match[2].toLowerCase() === "rune deck" ? ("rune-deck" as const) : ("deck" as const);
  // rule-id: ven-089-166-look-banish-play — "You may banish a unit [or gear]
  // from among them and/then play it, reducing its [Energy] cost by [N]" must
  // banish-then-play the pick at a discount, not fall through to the bare-look
  // default (draw to hand).
  const rest = text.slice(match[0].length).trim();
  const banishPlay = rest.match(
    /^You may banish an? (unit or gear|gear or unit|unit|gear) from among them,?\s*(?:and|then)\s+play it(?:,?\s*reducing its (?:Energy )?cost by (?:\[|:rb_energy_)(\d+)(?:\]|:))?/i,
  );
  if (banishPlay) {
    const kinds = banishPlay[1].toLowerCase();
    const allowsUnit = kinds.includes("unit");
    const allowsGear = kinds.includes("gear");
    const excludeCardTypes = [
      "spell",
      "legend",
      "battlefield",
      "rune",
      ...(allowsUnit ? [] : ["unit"]),
      ...(allowsGear ? [] : ["gear", "equipment"]),
    ];
    const reduce = banishPlay[2] ? Number.parseInt(banishPlay[2], 10) : 0;
    // rule-id: ven-089-166-look-then-empower — trailing "Then you may do
    // this: Empower it." is an optional follow-up on the played card, not
    // text to discard.
    const tail = rest.slice(banishPlay[0].length);
    const followUp = /Then you may do this:\s*Empower it\b/i.test(tail)
      ? ({
          effect: { target: { type: "trigger-source" }, type: "empower" },
          type: "optional",
        } as unknown as LookEffect["followUp"])
      : undefined;
    return {
      amount,
      filter: { excludeCardTypes },
      from,
      onPicked: "play",
      optional: true,
      ...(reduce > 0 ? { reduceCost: { energy: reduce } } : {}),
      ...(followUp ? { followUp } : {}),
      type: "look",
    } as LookEffect;
  }
  return { amount, from, type: "look" };
}

/**
 * Try to parse a discard effect: "Discard N."
 */
export function parseDiscardEffect(text: string): Effect | undefined {
  // Handle "Each player discards their hand, then draws N"
  const eachDiscardHandMatch = text.match(
    /^Each player discards their hand,?\s*then draws? (\d+)\.?$/i,
  );
  if (eachDiscardHandMatch) {
    const drawAmount = Number.parseInt(eachDiscardHandMatch[1], 10);
    return {
      amount: "hand",
      player: "each",
      then: { amount: drawAmount, player: "each", type: "draw" } as DrawEffect,
      type: "discard",
    } as Effect;
  }

  // Handle "They discard N" / "that player discards N" (opponent-targeted)
  const theyDiscardMatch = text.match(/^(?:They|that player) discards? (\d+|a card|it)\.?$/i);
  if (theyDiscardMatch) {
    const amountStr = theyDiscardMatch[1].toLowerCase();
    const amount =
      amountStr === "a card" || amountStr === "it" ? 1 : Number.parseInt(amountStr, 10);
    return { amount, player: "opponent", type: "discard" } as Effect;
  }

  // Handle "discard N, then draw N" (sequence)
  const discardThenDrawMatch = text.match(/^discard (\d+),?\s*then draw (\d+)\.?$/i);
  if (discardThenDrawMatch) {
    const discardAmount = Number.parseInt(discardThenDrawMatch[1], 10);
    const drawAmount = Number.parseInt(discardThenDrawMatch[2], 10);
    return {
      amount: discardAmount,
      then: { amount: drawAmount, type: "draw" } as DrawEffect,
      type: "discard",
    } as Effect;
  }

  // Handle "discard a card" / "discard N"
  const match = text.match(/^discard (\d+|a card)\.?$/i);
  if (!match) {
    return undefined;
  }
  const amountStr = match[1].toLowerCase();
  const amount = amountStr === "a card" ? 1 : Number.parseInt(amountStr, 10);
  return { amount, type: "discard" } as Effect;
}

/**
 * Try to parse a recycle effect.
 *
 * Handles:
 * - Self-recycle: "Recycle me." / "Recycle this." -> { type: "recycle", from: "self", target: "self" }
 * - Targeted board recycle: "Recycle a rune." / "Recycle a unit." -> { type: "recycle", target, from: "board" }
 * - Simple card recycle: "Recycle a card." / "Recycle a gear."
 * - Quantified recycle from a zone:
 *     "Recycle 3 from your trash." -> { type: "recycle", amount: 3, from: "trash" }
 *     "Recycle 2 from your hand."  -> { type: "recycle", amount: 2, from: "hand" }
 *     "Recycle N cards from your trash/hand."
 *     "Recycle up to N cards from (your trash|trashes)."
 */
export function parseRecycleEffect(text: string): Effect | undefined {
  // "Recycle this." / "Recycle me." / "Recycle myself." (self-recycle)
  const selfMatch = text.match(/^Recycle (?:this|me|myself)\.?$/i);
  if (selfMatch) {
    return { from: "self", target: "self" as AnyTarget, type: "recycle" } as Effect;
  }

  // "Recycle N [cards] from your trash|hand" / "Recycle up to N cards from (your trash|trashes)"
  const zoneMatch = text.match(
    /^Recycle (?:up to\s+)?(\d+)(?:\s+cards?)?\s+from\s+(?:your\s+(trash|hand)|(trashes))\.?$/i,
  );
  if (zoneMatch) {
    const amount = Number.parseInt(zoneMatch[1], 10);
    // "trashes" (plural, any player's trash) -> still "trash" for effect purposes.
    const fromZone = zoneMatch[2]?.toLowerCase() === "hand" ? "hand" : "trash";
    return { amount, from: fromZone, type: "recycle" } as Effect;
  }

  // "Recycle a/an <card-like target>." e.g. "Recycle a rune.", "Recycle a unit.", "Recycle a gear."
  // We treat targeted recycles (not "a card") as board-sourced.
  const targetedMatch = text.match(
    /^Recycle ((?:a|an)\s+(?:friendly |enemy )?(unit|rune|gear|legend|card))(?:\s+(?:at a battlefield|here|there|from your trash|from your hand))?\.?$/i,
  );
  if (targetedMatch) {
    const targetStr = targetedMatch[1];
    const cardType = targetedMatch[2].toLowerCase();
    const target = parseTarget(targetStr);
    // "a card" has no implicit source zone; default to trash (most common).
    // Everything else is a board permanent (unit, rune, gear, legend).
    const from: "board" | "trash" = cardType === "card" ? "trash" : "board";
    return { from, target, type: "recycle" } as Effect;
  }

  return undefined;
}

/**
 * Try to parse a "[Predict]" / "[Predict N]" effect (UNL set).
 *
 * Predict N: look at the top N cards of the main deck, recycle any, then
 * put the rest back in any order.
 */
export function parsePredictEffect(text: string): Effect | undefined {
  // Match the bracketed form with optional trailing period.
  // Example: "[Predict 2]." / "[Predict]"
  const match = text.match(/^\[Predict(?:\s+(\d+))?\]\.?$/i);
  if (!match) {
    return undefined;
  }
  const amount = match[1] ? Number.parseInt(match[1], 10) : 1;
  return { amount, type: "predict" } as unknown as Effect;
}

/**
 * rule 440.1 — "[Burn N]" / "They [Burn N]": put the top N cards of the
 * indicated player's Main Deck into their trash (no look, no reveal).
 */
export function parseBurnEffect(text: string): Effect | undefined {
  const match = text.match(/^(?:(You|They)\s+)?\[Burn (\d+)\]\.?$/i);
  if (!match) {
    return undefined;
  }
  const player = (match[1] ?? "").toLowerCase() === "they" ? "opponent" : "self";
  return { amount: Number(match[2]), player, type: "mill" } as unknown as Effect;
}
