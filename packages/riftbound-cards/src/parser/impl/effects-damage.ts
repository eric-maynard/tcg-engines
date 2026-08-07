/**
 * Effect parsers: damage / kill / fight / prevent-damage.
 */

import type {
  DamageEffect,
  FightEffect,
  KillEffect,
  PreventDamageEffect,
  SequenceEffect,
} from "@tcg/riftbound-types/abilities/effect-types";
import type { AnyTarget } from "@tcg/riftbound-types/targeting";
import { parseTarget } from "../parsers/target-parser";
import { parseEffect } from "./effect";
import { parseCardTarget } from "./targets";
import { wordToNumber } from "./tokens";

/**
 * Try to parse a damage effect: "Deal N to TARGET."
 */
export function parseDamageEffect(text: string): DamageEffect | SequenceEffect | undefined {
  // rule-id: ogn-005-298 — "Deal N to TARGET. If this kills it, do this: EFFECT."
  // The generic matcher below would swallow the rider into the target string and
  // drop it; emit damage → conditional(this-kills-target, EFFECT) so the follow-up
  // fires when the damage step left the bound target lethally damaged (rule 520).
  const killsMatch = text.match(
    /^Deal (\d+) to (.+?)\.\s+If this kills (?:it|them),\s+(?:do this:\s*)?(.+?)\.?$/i,
  );
  if (killsMatch) {
    const amount = Number.parseInt(killsMatch[1], 10);
    const target = parseCardTarget(killsMatch[2]);
    const thenText = killsMatch[3].trim();
    const thenEffect = parseEffect(`${thenText.charAt(0).toUpperCase()}${thenText.slice(1)}.`);
    if (thenEffect) {
      const damage: DamageEffect = { amount, target: target as AnyTarget, type: "damage" };
      return {
        effects: [
          damage,
          {
            condition: { type: "this-kills-target" },
            then: thenEffect,
            type: "conditional",
          },
        ],
        type: "sequence",
      } as SequenceEffect;
    }
  }

  // Handle "deal N damage split among" pattern
  const splitMatch = text.match(/^Deal (\d+) damage split among (.+?)\.?$/i);
  if (splitMatch) {
    const amount = Number.parseInt(splitMatch[1], 10);
    const target = parseCardTarget(splitMatch[2]);
    return { amount, split: true, target: target as AnyTarget, type: "damage" } as DamageEffect;
  }

  // rule-id: ven-017-166 (rule 428.1) — "Deal damage to a unit equal to the
  // damage marked on it": a dynamic amount read off the chosen unit's own
  // damage tally, never a printed number.
  const markedDamageMatch = text.match(
    /^Deal damage to (.+?) equal to the damage marked on (?:it|them|that unit)\.?$/i,
  );
  if (markedDamageMatch) {
    const target = parseCardTarget(markedDamageMatch[1]);
    return {
      amount: { damage: target as AnyTarget },
      target: target as AnyTarget,
      type: "damage",
    } as DamageEffect;
  }

  // Handle "deal damage equal to my/its Might/[Assault]/[keyword] to TARGET" pattern
  const mightDamageMatch = text.match(
    /^Deal damage equal to (?:my|its|his|her)\s+(?:Might|\[(\w+(?:-\w+)?)\])\s+to\s+(.+?)\.?$/i,
  );
  if (mightDamageMatch) {
    const keyword = mightDamageMatch[1];
    const target = parseCardTarget(mightDamageMatch[2]);
    // rule 807.2/807.3 — "damage equal to my [Assault]" reads the SUMMED value
    // of that keyword (printed + granted), not the unit's Might.
    return {
      amount: keyword ? { keywordValue: keyword, of: "self" } : { might: "self" },
      target: target as AnyTarget,
      type: "damage",
    } as DamageEffect;
  }

  // rule-id: ven-041-166 — "Deal N to TARGET for each COUNT" scales the amount by the
  // count expression; must not fall through to the generic matcher below (parseCardTarget
  // would see "each " in "for each Equipment" and emit quantity:"all", turning single-target
  // per-attachment damage into flat AoE).
  const forEachMatch = text.match(/^Deal (\d+) to (.+?) for each (.+?)\.?$/i);
  if (forEachMatch) {
    const per = Number.parseInt(forEachMatch[1], 10);
    const target = parseCardTarget(forEachMatch[2]);
    const countText = forEachMatch[3].trim();
    const count = /^equipment attached to (?:me|it|this)$/i.test(countText)
      ? ({ attachedTo: "self", quantity: "all", type: "equipment" } as unknown as AnyTarget)
      : ({ ...parseCardTarget(countText), quantity: "all" } as unknown as AnyTarget);
    return {
      amount: { count, ...(per !== 1 ? { multiplier: per } : {}) },
      target: target as AnyTarget,
      type: "damage",
    } as DamageEffect;
  }

  // rule-id: sfd-120-221 (rule 383.3.a.3) — "deal that much to TARGET" reads
  // back the amount named by the ability's own gating clause, so the amount is
  // a variable resolved at resolution time, never a literal. The caller
  // (trigger parsing) rebinds `that-much` to the condition's own variable.
  const thatMuchMatch = text.match(/^Deal that much (?:damage )?to (.+?)\.?$/i);
  if (thatMuchMatch) {
    const target = parseCardTarget(thatMuchMatch[1]);
    return {
      amount: { variable: "that-much" },
      target: target as AnyTarget,
      type: "damage",
    } as unknown as DamageEffect;
  }

  // Handle "Deal N to TARGET" pattern
  const match = text.match(/^Deal (\d+) to (.+?)\.?$/i);
  if (match) {
    const amount = Number.parseInt(match[1], 10);
    const target = parseCardTarget(match[2]);
    return { amount, target: target as AnyTarget, type: "damage" };
  }

  return undefined;
}

/**
 * Try to parse a kill effect: "Kill TARGET."
 *
 * Handles:
 * - "Kill me." / "Kill this." (self-kill)
 * - "Kill a/an/all [filter] [controller] unit/gear [location] [with ...]." (targeted kill)
 * - "Kill up to N gear." (quantity kill)
 * - "Each player kills one of their units/gear." (symmetric each-player kill)
 * - "Kill me to EFFECT." (self-sacrifice sequence)
 */
export function parseKillEffect(text: string): KillEffect | SequenceEffect | undefined {
  // Handle "kill me/this to EFFECT" as a sequence: kill self, then another effect
  const killToMatch = text.match(/^Kill (me|this) to (.+?)\.?$/i);
  if (killToMatch) {
    const killSelf: KillEffect = { target: "self" as AnyTarget, type: "kill" };
    const thenText = killToMatch[2].trim();
    // Capitalize first letter for the sub-effect parser
    const normalizedThen = thenText.charAt(0).toUpperCase() + thenText.slice(1);
    const thenEffect = parseEffect(normalizedThen);
    if (thenEffect) {
      return { effects: [killSelf, thenEffect], type: "sequence" };
    }
    // If the "then" part can't be parsed, fall through to treat as simple kill
  }

  // Handle self-kill: "Kill me." / "Kill this."
  if (/^Kill (me|this)\.?$/i.test(text)) {
    return { target: "self" as AnyTarget, type: "kill" };
  }

  // Handle pronoun-referential kill: "Kill it."
  // Used inside replacement bodies and chained sequences where the subject
  // Was bound by an earlier step (e.g., "When any unit takes damage this
  // Turn, kill it"). The resolver treats this as a generic unit target.
  if (/^Kill (it|them)\.?$/i.test(text)) {
    return { target: { type: "unit" } as AnyTarget, type: "kill" };
  }

  // Handle "Each player [must] kills/kill one of their units/gear."
  const eachPlayerMatch = text.match(
    /^Each player (?:must\s+)?kills?\s+one of their (units?|gear)\.?$/i,
  );
  if (eachPlayerMatch) {
    const cardType = eachPlayerMatch[1].replace(/s$/, "") as "unit" | "gear";
    // rule 422.1.a — "one of THEIR units/gear": each player picks among the
    // cards THEY control, so the target must be controller-scoped (the engine's
    // per-player fan-out keys off `controller: "friendly"`); a player with none
    // is simply unaffected, hence `upTo: 1`.
    return {
      player: "each",
      target: {
        controller: "friendly",
        quantity: { upTo: 1 },
        type: cardType,
      } as unknown as AnyTarget,
      type: "kill",
    };
  }

  // Handle kill with filters/conditions: "kill all damaged enemy units here."
  // Also handles: "Kill a friendly [Mighty] unit.", "Kill an enemy unit here.",
  // "Kill up to one gear.", "Kill up to N units."
  const richMatch = text.match(
    /^Kill ((?:a|an|all|any number of|up to (?:one|two|three|four|five|\d+))\s+(?:damaged\s+|stunned\s+|\[Mighty\]\s+)?(?:friendly\s+|enemy\s+)?(?:\[Mighty\]\s+)?(?:unit|units|gear)(?:\s+(?:at a battlefield|here|there))?)(\s+with\s+.+?)?\.?$/i,
  );
  if (richMatch) {
    const targetStr = richMatch[1];
    const withClause = richMatch[2];
    // Check if it looks like a gear target
    if (/gear/i.test(targetStr)) {
      const gearTarget: {
        type: "gear";
        controller?: "friendly" | "enemy";
        quantity?: "all" | { upTo: number };
        filter?: unknown;
      } = {
        type: "gear" as const,
      };
      if (/enemy/i.test(targetStr)) {
        gearTarget.controller = "enemy";
      } else if (/friendly/i.test(targetStr)) {
        gearTarget.controller = "friendly";
      }
      if (/all/i.test(targetStr)) {
        gearTarget.quantity = "all";
      }
      const upToGearMatch = targetStr.match(/up to (\w+)/i);
      if (upToGearMatch) {
        gearTarget.quantity = { upTo: wordToNumber(upToGearMatch[1]) };
      }
      // rule-id: sfd-074-221 (Pickpocket) — rule 206: "with Energy cost no more
      // than [N]" is a printed-cost restriction on which gear may be chosen, so
      // it must ride on the target as a filter, not be dropped with the clause.
      // normalize.ts has already rewritten a printed `[N]` pip as `:rb_energy_N:`.
      const energyLteMatch = withClause?.match(
        /with\s+Energy cost\s+(?:no more than|of no more than)?\s*(?::rb_energy_(\d+):|\[?(\d+)\]?)(?:\s+or less)?/i,
      );
      if (energyLteMatch) {
        gearTarget.filter = {
          energyCost: { lte: Number(energyLteMatch[1] ?? energyLteMatch[2]) },
        };
      } else if (
        // rule-id: ven-080-166 — "with Energy cost no more than my Might": the
        // ceiling is read off the source when the ability resolves, so it stays
        // a symbolic filter rather than a number.
        /with\s+Energy cost\s+no more than\s+my\s+(?::rb_might:|\[?Might\]?)/i.test(withClause ?? "")
      ) {
        gearTarget.filter = { energyCostAtMostSelfMight: true };
      }
      return { target: gearTarget as unknown as AnyTarget, type: "kill" };
    }
    // Use parseCardTarget for unit targets (handles controller, location, quantity, filter)
    const target = parseCardTarget(targetStr);
    // rule-id: sfd-158-221 — preserve "with N [Might] or less" constraint on kill targets
    const mightLteMatch = withClause?.match(/with\s+(\d+)\s*:rb_might:\s*or\s*less/i);
    if (mightLteMatch) {
      (target as { filter?: unknown }).filter = {
        might: { lte: Number.parseInt(mightLteMatch[1], 10) },
      };
    }
    // rule-id: ven-154-166 (rule 355.8) — "Kill an enemy unit with less Might
    // than IT": "it" is the unit named by the "Choose a friendly unit."
    // preamble, so the kill carries a caster-chosen `reference` (bound by
    // bindChosenTarget) and the victim is filtered against that unit's Might.
    if (/with\s+less\s+(?::rb_might:|\[?Might\]?)\s+than\s+it\b/i.test(withClause ?? "")) {
      (target as { filter?: unknown }).filter = { mightLessThanReference: true };
      return {
        reference: { type: "unit" },
        target: target as AnyTarget,
        type: "kill",
      } as unknown as KillEffect;
    }
    // rule-id: ogn-256-298 (Fox-Fire) — "any number of units ... with total
    // Might N or less": caster picks 0..n targets whose SUMMED Might ≤ N.
    if (/^any number of\b/i.test(targetStr)) {
      (target as { quantity?: unknown }).quantity = "any";
    }
    const totalMightLteMatch = withClause?.match(
      /with\s+total\s+(?:Might|:rb_might:|\[Might\])\s+(\d+)\s+or\s+less/i,
    );
    if (totalMightLteMatch) {
      (target as { totalMight?: unknown }).totalMight = {
        lte: Number.parseInt(totalMightLteMatch[1], 10),
      };
    }
    return { target: target as AnyTarget, type: "kill" };
  }

  return undefined;
}

/**
 * Try to parse a fight effect
 */
export function parseFightEffect(text: string): FightEffect | undefined {
  if (!/deal damage equal to their Mights to each other\.?$/i.test(text)) {
    return undefined;
  }
  // rule-id: unl-110-219-fight-targets-any — derive attacker/defender from the
  // leading "Choose …" clause instead of hardcoding friendly/enemy so
  // controller-agnostic wordings ("Choose two units") stay controller-agnostic.
  let attacker: AnyTarget = { controller: "friendly", type: "unit" } as AnyTarget;
  let defender: AnyTarget = { controller: "enemy", type: "unit" } as AnyTarget;
  const twoMatch = text.match(/^Choose two ((?:[\w-]+ )*?units?)\b/i);
  const pairMatch = text.match(/^Choose ((?:a|an|another) [^.]+?) and ((?:a|an|another) [^.]+?)\./i);
  if (twoMatch) {
    const t = parseTarget(twoMatch[1]);
    attacker = t;
    defender = t;
  } else if (pairMatch) {
    attacker = parseTarget(pairMatch[1]);
    defender = parseTarget(pairMatch[2]);
  }
  return { attacker, defender, type: "fight" };
}

/**
 * Try to parse a prevent-damage effect
 */
export function parsePreventDamageEffect(text: string): PreventDamageEffect | undefined {
  const match = text.match(/^Prevent (all|the next)\s*(?:(\w+(?:\s+and\s+\w+)?)\s+)?damage/i);
  if (!match) {
    return undefined;
  }
  const effect: {
    type: "prevent-damage";
    amount?: "all" | number;
    duration?: "turn" | "next";
    target?: AnyTarget;
  } = {
    type: "prevent-damage",
  };
  if (match[1].toLowerCase() === "all") {
    effect.amount = "all";
  } else if (match[2] && /^\d+$/.test(match[2])) {
    // rule 437.1.b.1.a — "Prevent the next 7 damage": the Prevent Value is a number.
    effect.amount = Number(match[2]);
  }
  effect.duration = text.toLowerCase().includes("this turn") ? "turn" : "next";
  // rule 355 — "…that would be dealt to it": the shield lands on the unit named
  // by the "Choose a unit." preamble (bindChosenTarget rewrites this pronoun).
  if (/\bdealt to (?:it|that unit)\b/i.test(text)) {
    effect.target = { type: "unit" } as AnyTarget;
  }
  return effect as PreventDamageEffect;
}
