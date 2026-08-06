/**
 * Additional-cost and replacement ability parsing.
 */

import type { Ability } from "@tcg/riftbound-types";
import type { Effect, SequenceEffect } from "@tcg/riftbound-types/abilities/effect-types";
import { parseStaticAbility } from "../parsers/static-parser";
import { parseEffect } from "./effect";
import { parseEffects } from "./effects";

/**
 * Parse a non-keyword segment into one or more Abilities.
 * Returns a single ability, or undefined. For multiple abilities from one segment,
 * use parseOtherSegmentMulti.
 */
/**
 * Try to parse an additional cost ability.
 * Handles:
 * - "As you play me/this, you may ... as an additional cost. ..."
 * - "You may pay COST as an additional cost to play me."
 */
export function parseAdditionalCostAbility(text: string): Ability | undefined {
  // "As you play me/this, you may ... as an additional cost."
  const asYouPlayMatch = text.match(
    /^As you play (?:me|this),\s+you may\s+(.+?)\s+as an additional cost\b/i,
  );
  if (asYouPlayMatch) {
    return {
      effect: {
        additionalCost: asYouPlayMatch[1],
        optional: true,
        type: "additional-cost-option",
      } as unknown as Effect,
      type: "static",
    } as Ability;
  }

  // "You may pay COST as an additional cost to play me."
  // Captures the cost tokens so downstream consumers can read them.
  const youMayPayMatch = text.match(
    /^You may pay\s+((?::rb_(?:energy_\d+|rune_(?:fury|calm|mind|body|chaos|order|rainbow)):)+)\s+as an additional cost to play me\.?$/i,
  );
  if (youMayPayMatch) {
    return {
      effect: {
        additionalCost: youMayPayMatch[1],
        optional: true,
        type: "additional-cost-option",
      } as unknown as Effect,
      type: "static",
    } as Ability;
  }

  // "You may spend N XP as an additional cost to play me/this[. If you do, ...]"
  // UNL-set champion progression: emits an `xp` additional cost.
  // The optional trailing "If you do, I cost [N] less." payoff is captured
  // As the ability's `ifPaid` effect so downstream engine code can read it.
  const spendXpAdditionalMatch = text.match(
    /^You may spend\s+(\d+)\s+XP\s+as an additional cost to play (?:me|this)\.(?:\s+If you do,\s+(.+?))?\s*$/i,
  );
  if (spendXpAdditionalMatch) {
    const amount = Number.parseInt(spendXpAdditionalMatch[1], 10);
    const payoffRaw = spendXpAdditionalMatch[2]?.trim();
    let ifPaid: Effect | undefined;
    if (payoffRaw) {
      // Try the static cost-reduction parser first since "I cost N less" is
      // A static pattern, not a spell effect.
      const payoffAbility = parseStaticAbility(payoffRaw);
      if (payoffAbility) {
        ifPaid = (payoffAbility.ability as { effect: Effect }).effect;
      } else {
        ifPaid = parseEffects(payoffRaw) ?? parseEffect(payoffRaw);
      }
    }
    const effect: Record<string, unknown> = {
      additionalCost: { xp: amount },
      optional: true,
      type: "additional-cost-option",
    };
    if (ifPaid) {
      effect.ifPaid = ifPaid;
    }
    return {
      effect: effect as unknown as Effect,
      type: "static",
    } as Ability;
  }

  return undefined;
}

/**
 * Parse a replacement ability.
 *
 * Handles:
 * - "The next time TARGET would EVENT[, REPLACEMENT] instead."
 * - "Choose TARGET. The next time it would die this turn, ... instead."
 * - "EFFECT the next time it takes damage this turn." (Noxian Guillotine form)
 * - "If a combat where you are the attacker ends in a tie, RECALL instead."
 *   (combat-tie replacement)
 *
 * The replacement body is parsed recursively via `parseEffects` so that
 * compound effects ("heal it, exhaust it, and recall it") become proper
 * sequences rather than raw text.
 */
export function parseReplacementAbility(text: string): Ability | undefined {
  const cleaned = text
    .replace(/^Choose (?:a|an) (?:friendly |enemy )?(?:unit|gear)\.\s*/i, "")
    .trim();

  // Form 1: "The next time TARGET [would] EVENT[, [this turn,]] REPLACEMENT instead."
  // Trailing "instead" is optional — many cards omit it when the replacement body
  // Makes the substitution implicit ("heal it, exhaust it, and recall it").
  const theNextTimeMatch = cleaned.match(
    /^The next time (a friendly unit|an? (?:enemy )?unit|me|it) (?:would )?(die|dies|takes? damage)(?:\s+this turn)?,\s*(.+?)(?:\s+instead)?\.?\s*$/i,
  );
  if (theNextTimeMatch) {
    const eventStr = theNextTimeMatch[2].toLowerCase().replace(/s$/, "");
    const replaces: "die" | "take-damage" =
      eventStr === "die" || eventStr === "dies" ? "die" : "take-damage";
    const body = theNextTimeMatch[3].trim();
    const parsed = parseEffects(body) ?? parseEffect(body);
    return {
      duration: "next",
      replacement: (parsed ?? { text: body, type: "raw" }) as Effect,
      replaces,
      type: "replacement",
    } as Ability;
  }

  // Form 2: "EFFECT the next time it [would] EVENT this turn."
  // Covers Noxian Guillotine: "Kill it the next time it takes damage this turn."
  const trailingNextTimeMatch = cleaned.match(
    /^(.+?)\s+the next time (?:an? (?:friendly |enemy )?unit|it|me)\s+(?:would\s+)?(die|dies|takes? damage)(?:\s+this turn)?\.?$/i,
  );
  if (trailingNextTimeMatch) {
    const body = trailingNextTimeMatch[1].trim();
    const eventStr = trailingNextTimeMatch[2].toLowerCase().replace(/s$/, "");
    const replaces: "die" | "take-damage" =
      eventStr === "die" || eventStr === "dies" ? "die" : "take-damage";
    const parsed = parseEffects(body) ?? parseEffect(body);
    if (parsed) {
      return {
        duration: "next",
        replacement: parsed,
        replaces,
        type: "replacement",
      } as Ability;
    }
  }

  // Form 3: "When any unit takes damage this turn, REPLACEMENT."
  // Imperial Decree: turn-scoped damage-reaction that kills the damaged unit.
  // Parsed as a "turn"-duration replacement on take-damage.
  const whenAnyDamageMatch = cleaned.match(
    /^When any unit takes damage(?:\s+this turn)?,\s*(.+?)\.?$/i,
  );
  if (whenAnyDamageMatch) {
    const body = whenAnyDamageMatch[1].trim();
    const parsed = parseEffects(body) ?? parseEffect(body);
    if (parsed) {
      return {
        duration: "turn",
        replacement: parsed,
        replaces: "take-damage",
        type: "replacement",
      } as Ability;
    }
  }

  // Form 4: "If a combat where you are the attacker ends in a tie, RECALL instead."
  // Symbol of the Solari: combat-tie replacement.
  const combatTieMatch = cleaned.match(
    /^If a combat where you are the attacker ends in a tie,\s*(.+?)(?:\s+instead)?\.?$/i,
  );
  if (combatTieMatch) {
    const body = combatTieMatch[1].trim();
    const parsed = parseEffects(body) ?? parseEffect(body);
    if (parsed) {
      return {
        duration: "permanent",
        replacement: parsed,
        replaces: "combat-tie",
        type: "replacement",
      } as Ability;
    }
  }

  // Form 5: "If you would reveal cards from a deck, look at the top card first..."
  // Void Hatchling: a reveal replacement that inserts a look-and-optional-recycle
  // Step before the reveal happens.
  if (
    /^If you would reveal cards from a deck, look at the top card first\.\s*You may recycle it\.\s*Then reveal those cards\.?$/i.test(
      cleaned,
    )
  ) {
    return {
      duration: "permanent",
      replacement: {
        effects: [
          { amount: 1, from: "deck", then: { recycle: "rest" }, type: "look" } as unknown as Effect,
          { amount: 1, from: "deck", type: "reveal" } as unknown as Effect,
        ],
        type: "sequence",
      } as SequenceEffect,
      replaces: "reveal",
      type: "replacement",
    } as Ability;
  }

  return undefined;
}
