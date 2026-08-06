/**
 * Triggered-ability parsing.
 */

import type { TriggeredAbility } from "@tcg/riftbound-types";
import type { DrawEffect, Effect } from "@tcg/riftbound-types/abilities/effect-types";
import { parseLeadingIfCondition, parseTrailingIfCondition } from "../parsers/condition-parser";
import { parseCost } from "../parsers/cost-parser";
import { parseEffects } from "./effects";
import { stripReminders } from "./normalize";
import { TRIGGER_PATTERNS } from "./trigger-patterns";

export function parseTriggeredAbility(text: string): TriggeredAbility | undefined {
  // Allow a leading "While you control this battlefield, ..." gating prefix on
  // Triggered abilities (used by battlefield cards). Parse the inner trigger
  // And re-attach the gating condition.
  const whileControlBfPrefix = text.match(/^While you control this battlefield,\s*/i);
  if (whileControlBfPrefix) {
    const inner = text.slice(whileControlBfPrefix[0].length);
    const innerAbility = parseTriggeredAbilityInner(inner);
    if (innerAbility) {
      const existingCondition = (innerAbility as { condition?: { type: string } }).condition;
      const wrapped = existingCondition
        ? {
            conditions: [
              { type: "while-control-battlefield" } as unknown as { type: string },
              existingCondition,
            ],
            type: "and" as const,
          }
        : ({ type: "while-control-battlefield" } as unknown);
      return {
        ...innerAbility,
        condition: wrapped,
      } as TriggeredAbility;
    }
  }
  return parseTriggeredAbilityInner(text);
}

export function parseTriggeredAbilityInner(text: string): TriggeredAbility | undefined {
  // Reorder "If <cond> at the start of your Beginning Phase, <effect>" to the
  // Canonical "At the start of your Beginning Phase, if <cond>, <effect>" form
  // So the trigger-pattern loop below matches. (Forsaken Baccai / Oasis Raider.)
  const ifAtPhaseMatch = text.match(
    /^If (.+?) at the start of your (Beginning|Main) Phase,\s*(.+)$/i,
  );
  if (ifAtPhaseMatch) {
    text = `At the start of your ${ifAtPhaseMatch[2]} Phase, if ${ifAtPhaseMatch[1]}, ${ifAtPhaseMatch[3]}`;
  }

  for (const tp of TRIGGER_PATTERNS) {
    const match = tp.pattern.exec(text);
    if (!match) {
      continue;
    }

    let effectText = text.slice(match[0].length).trim();

    // rule-id: ogn-067-298 — "When you play me to a battlefield, ..." only
    // triggers when the unit was played to a battlefield (not to base).
    const playedToBattlefield = tp.event === "play-self" && Boolean(match[1]);

    // Strip "Choose a/an <target>." targeting preamble — mirrors the spell
    // Parser's handling for effects like Solari Chief's "When you play me,
    // Choose an enemy unit. If it is stunned, kill it. Otherwise, stun it."
    effectText = effectText.replace(
      /^Choose (?:a|an) (?:friendly |enemy )?(?:unit|gear|spell)(?:\s+(?:at a battlefield|here|there))?\.\s*/i,
      "",
    );

    // Check for optional "you may" / "they may" / "that player may" (variants
    // Where the trigger applies to "any player" or "opponent" rather than the
    // Controller).
    let optional = false;
    let condition: { type: string } | undefined;
    const mayMatch = effectText.match(/^(?:you|they|that player)\s+may\s+/i);
    if (mayMatch) {
      optional = true;
      effectText = effectText.slice(mayMatch[0].length);
    }

    // Check for "pay :rb_energy_N: to" pattern (optional cost condition)
    const payMatch = effectText.match(
      /^pay\s+((?::rb_(?:energy_\d+|rune_(?:fury|calm|mind|body|chaos|order|rainbow)):)+)\s+to\s+/i,
    );
    if (payMatch) {
      optional = true;
      // rule-id: sfd-119-221 — keep the cost so the engine charges it on opt-in
      // instead of resolving the effect for free.
      condition = { cost: parseCost(payMatch[1]), type: "pay-cost" } as unknown as {
        type: string;
      };
      effectText = effectText.slice(payMatch[0].length);
    }

    // Check for "pay :rb_X:. If you do, Y" pattern: treat as optional cost
    // That gates the rest of the effect on having been paid.
    const payIfYouDoMatch = effectText.match(
      /^pay\s+((?::rb_(?:energy_\d+|rune_(?:fury|calm|mind|body|chaos|order|rainbow)):)+)\.\s+if you do,\s*/i,
    );
    if (payIfYouDoMatch) {
      optional = true;
      condition = { type: "paid-additional-cost" };
      effectText = effectText.slice(payIfYouDoMatch[0].length);
    }

    // Check for conditional "if you paid the additional cost," or "if you do,"
    // (both indicate the remainder only resolves if the prior "you may" cost
    // Was actually paid).
    const ifPaidMatch = effectText.match(/^(?:if you paid the additional cost|if you do),\s*/i);
    if (ifPaidMatch) {
      condition = { type: "paid-additional-cost" };
      effectText = effectText.slice(ifPaidMatch[0].length);
    }

    // Check for inline conditions via the condition parser's leading-if helper.
    // This recognizes: "if I'm alone,", "if I'm at a battlefield,", "if I'm [Mighty],",
    // "if you control a Poro,", "if you control two or more gear,",
    // "if an opponent's score is within 3 points of the Victory Score,",
    // "if you have 4+ units at battlefields,", etc.
    //
    // Skip when the effect text is an explicit "If X, A. Otherwise, B." form —
    // That belongs in the effect body as a ConditionalEffect, not hoisted to
    // The trigger's outer condition.
    if (!condition && !/\.\s+Otherwise,\s+/i.test(effectText)) {
      const leading = parseLeadingIfCondition(effectText);
      if (leading) {
        condition = leading.condition as { type: string };
        ({ effectText } = leading);
      }
    }

    // Strip reminders
    effectText = stripReminders(effectText).trim();

    // Strip well-known trailing restriction sentences that don't have an
    // Engine effect (they're enforced as part of the same triggered effect).
    effectText = effectText
      .replace(/\s*They can't move it this turn\.?\s*$/i, "")
      .replace(/\s*That player can't move it this turn\.?\s*$/i, "")
      .trim();

    // Handle "discard N, then draw N" pattern
    const discardThenDrawMatch = effectText.match(/^discard (\d+),\s*then draw (\d+)\.?$/i);
    if (discardThenDrawMatch) {
      const discardAmount = Number.parseInt(discardThenDrawMatch[1], 10);
      const drawAmount = Number.parseInt(discardThenDrawMatch[2], 10);
      const effect: Effect = {
        amount: discardAmount,
        then: { amount: drawAmount, type: "draw" } as DrawEffect,
        type: "discard",
      } as Effect;

      const trigger: { event: string; on?: string; location?: string; timing?: string } = {
        event: tp.event,
      };
      if (tp.on === "controller-here") {
        trigger.on = "controller";
        trigger.location = "here";
      } else if (tp.on) {
        trigger.on = tp.on;
      }

      const ability: TriggeredAbility = {
        effect,
        trigger: trigger as TriggeredAbility["trigger"],
        type: "triggered",
      };
      if (optional) {
        (ability as { optional: boolean }).optional = optional;
      }
      if (condition) {
        (ability as { condition: { type: string } }).condition = condition;
      }
      return ability;
    }

    // Parse the effect
    let effect = parseEffects(effectText);

    // Trailing "<effect> if <clause>" fallback: if the effect didn't parse,
    // Or parsed only as raw, try to split off a trailing condition and retry.
    const effectIsRaw = effect && (effect as { type?: string }).type === "raw";
    if ((!effect || effectIsRaw) && !condition) {
      const trailing = parseTrailingIfCondition(effectText);
      if (trailing) {
        const prefixEffect = parseEffects(trailing.effectText);
        const prefixIsStructured =
          prefixEffect && (prefixEffect as { type?: string }).type !== "raw";
        if (prefixIsStructured) {
          effect = prefixEffect;
          condition = trailing.condition as { type: string };
        }
      }
    }

    if (!effect && effectText) {
      // Use raw effect for unparsed text so we still return the trigger structure
      effect = { text: effectText, type: "raw" } as unknown as Effect;
    }
    if (!effect) {
      continue;
    }

    const trigger: {
      event: string;
      on?: string | { controller: string; type: string; excludeSelf?: boolean };
      timing?: string;
      location?: string;
      restrictions?: readonly { type: string; count?: number }[];
    } = { event: tp.event };
    if (tp.on === "self") {
      trigger.on = "self";
    } else if (tp.on === "friendly-units") {
      trigger.on = { controller: "friendly", type: "unit" };
    } else if (tp.on === "another-friendly-units") {
      trigger.on = { controller: "friendly", excludeSelf: true, type: "unit" };
    } else if (tp.on === "enemy-units") {
      trigger.on = { controller: "enemy", type: "unit" };
    } else if (tp.on === "controller") {
      trigger.on = "controller";
    } else if (tp.on === "controller-here") {
      trigger.on = "controller";
      trigger.location = "here";
    } else if (tp.on === "opponent") {
      trigger.on = "opponent";
    } else if (tp.on === "any-player") {
      trigger.on = "any-player";
    } else if (tp.on === "any") {
      trigger.on = "any";
    } else if (tp.on === "controller-or-allies") {
      trigger.on = "controller-or-allies";
    }

    // Add timing for "At" triggers
    if (
      tp.event === "start-of-turn" ||
      tp.event === "end-of-turn" ||
      tp.event === "beginning-phase"
    ) {
      trigger.timing = "at";
    }

    // Add restrictions if defined on the pattern
    if (tp.restrictions) {
      trigger.restrictions = tp.restrictions;
    }

    const ability: TriggeredAbility = {
      effect,
      trigger: trigger as TriggeredAbility["trigger"],
      type: "triggered",
    };
    if (optional) {
      (ability as { optional: boolean }).optional = optional;
    }
    if (playedToBattlefield) {
      const atBf = { type: "while-at-battlefield" };
      condition = condition
        ? ({ conditions: [atBf, condition], type: "and" } as unknown as { type: string })
        : atBf;
    }
    if (condition) {
      (ability as { condition: { type: string } }).condition = condition;
    }
    return ability;
  }

  return undefined;
}
