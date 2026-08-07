/**
 * Multi-effect parser (parseEffects).
 */

import type {
  ChoiceEffect,
  Effect,
  SequenceEffect,
} from "@tcg/riftbound-types/abilities/effect-types";
import { parseCost } from "../parsers/cost-parser";
import { parseEffect } from "./effect";
import {
  parseChoiceEffect,
  parseCommaPronounChain,
  parseIfElseEffect,
  parseIfYouDoEffect,
} from "./effects-conditional";
import { parseReturnToHandEffect } from "./effects-return";
import { buildSequenceWithPendingValue, parseAndCompoundEffect } from "./effects-sequence";
import { normalizeTokens, stripReminders } from "./normalize";
import { splitOnThen, splitSentences } from "./split";

/**
 * Parse multiple sequential effects from text, returning a sequence if more than one.
 * Splits on sentence boundaries (". ") and tries to parse each.
 */
export function parseEffects(text: string): Effect | undefined {
  const cleaned = normalizeTokens(stripReminders(text)).trim();
  if (!cleaned) {
    return undefined;
  }

  // Try "X. If you do, Y" pattern BEFORE any other splitting.
  // This must run before splitOnThen because "If you do" is a conditional,
  // Not a sequence.
  const ifYouDoEffect = parseIfYouDoEffect(cleaned);
  if (ifYouDoEffect) {
    return ifYouDoEffect;
  }

  // Try "If <cond>, A. Otherwise, B" — a pure if/else conditional that
  // Belongs in a single effect slot. Used by cards like Solari Chief:
  // "If it is stunned, kill it. Otherwise, stun it."
  const ifElseEffect = parseIfElseEffect(cleaned);
  if (ifElseEffect) {
    return ifElseEffect;
  }

  // Try "Choose one — OPTION1.OPTION2." pattern
  const chooseOneMatch = cleaned.match(/^Choose one\s*—\s*(.+)$/is);
  if (chooseOneMatch) {
    const optionsText = chooseOneMatch[1];
    // For choose-one, split on any period followed by an uppercase letter (options are sentences)
    const options = optionsText
      .split(/\.(?=[A-Z])/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (options.length >= 2) {
      const parsedOptions: { effect: Effect }[] = [];
      for (const opt of options) {
        const eff = parseEffect(opt.trim());
        if (eff) {
          parsedOptions.push({ effect: eff });
        } else {
          parsedOptions.push({ effect: { text: opt.trim(), type: "raw" } as unknown as Effect });
        }
      }
      if (parsedOptions.length >= 2) {
        return { options: parsedOptions, type: "choice" } as ChoiceEffect;
      }
    }
  }

  // rule-id: unl-007-219 (Smite) — "EFFECT. If it would die this turn, REPLACEMENT instead."
  // The trailing sentence is a turn-scoped die-replacement rider bound to the
  // same target as the leading effect. Emit a sequence whose second step is a
  // runtime `replacement` effect; the sequence carries the head target so
  // play-time targeting (rule 355.8) still enumerates the chosen unit.
  const dieRiderMatch = cleaned.match(
    /^(.+?\.)\s+If (?:it|they) would die this turn,\s*(.+?)\s+instead\.?$/i,
  );
  if (dieRiderMatch) {
    const head = parseEffects(dieRiderMatch[1]);
    const bodyText = `${dieRiderMatch[2].trim().replace(/\.$/, "")}.`;
    const body = parseEffects(bodyText) ?? parseEffect(bodyText);
    if (head && body) {
      const headTarget = (head as { target?: unknown }).target;
      return {
        effects: [
          head,
          {
            duration: "turn",
            replacement: body,
            replaces: "die",
            ...(headTarget !== undefined ? { target: headTarget } : {}),
            type: "replacement",
          } as unknown as Effect,
        ],
        ...(headTarget !== undefined ? { target: headTarget } : {}),
        type: "sequence",
      } as unknown as SequenceEffect;
    }
  }

  // Try "X or Y" choice pattern before single-effect parse (e.g., "draw 1 or channel 1 rune exhausted")
  const choiceEffect = parseChoiceEffect(cleaned);
  if (choiceEffect) {
    return choiceEffect;
  }

  // Compound return-to-hand: "Return X and Y to their owners' hands."
  // Split the shared "to their owners' hands" suffix across two targets.
  const compoundReturnMatch = cleaned.match(
    /^Return (?:(another)\s+)?((?:(?:a|an)\s+)?(?:friendly|enemy)?\s*(?:unit|gear)(?:\s+(?:at a battlefield|here|there))?)\s+and\s+((?:(?:a|an)\s+)?(?:friendly|enemy)?\s*(?:unit|gear)(?:\s+(?:at a battlefield|here|there))?)\s+to\s+their owners'?\s+hands?\.?$/i,
  );
  if (compoundReturnMatch) {
    const another = compoundReturnMatch[1];
    const leftRaw = compoundReturnMatch[2].trim();
    const rightRaw = compoundReturnMatch[3].trim();
    // Ensure each target starts with a/an for the per-effect parser.
    const normalize = (s: string) => (/^(?:a|an)\s/i.test(s) ? s : `a ${s}`);
    const leftEff = parseReturnToHandEffect(
      `Return ${another ? "another " : ""}${normalize(leftRaw)} to its owner's hand.`,
    );
    const rightEff = parseReturnToHandEffect(`Return ${normalize(rightRaw)} to its owner's hand.`);
    if (leftEff && rightEff) {
      return { effects: [leftEff, rightEff], type: "sequence" } as SequenceEffect;
    }
  }

  // Try splitting on " and " as a sequence separator BEFORE single-effect parse
  // So that "buff me and draw 1" produces a sequence instead of just a buff
  const andEffect = parseAndCompoundEffect(cleaned);
  if (andEffect) {
    return andEffect;
  }

  // Try splitting on comma-joined pronoun-chained effects:
  // "heal it, exhaust it, and recall it" / "heal it, exhaust it and recall it"
  // Only kicks in when every clause starts with a verb and refers to "it" / "me" / "them".
  const commaChainEffect = parseCommaPronounChain(cleaned);
  if (commaChainEffect) {
    return commaChainEffect;
  }

  // Multi-sentence bodies ("Deal 4 to a unit at a battlefield. Draw 1.") must be
  // split BEFORE the single-effect attempt: leaf parsers match the leading clause
  // and silently drop every later sentence. Only accept the split when every
  // sentence parses on its own, so ambiguous riders still fall through below.
  const strictSentences = parseSentenceSequence(cleaned, true);
  if (strictSentences) {
    return strictSentences;
  }

  // Try as a single effect
  const single = parseEffect(cleaned);
  if (single) {
    return single;
  }

  // Try splitting on "then" connectors (". Then ", ", then ", " Then ")
  // Before generic sentence splitting. This handles compound effects like
  // "Exhaust all friendly units, then deal 12 to ALL units at battlefields."
  const thenParts = splitOnThen(cleaned);
  if (thenParts && thenParts.length >= 2) {
    const thenEffects: Effect[] = [];
    let allParsed = true;
    for (const part of thenParts) {
      const eff = parseEffects(part);
      if (eff) {
        thenEffects.push(eff);
      } else {
        allParsed = false;
        break;
      }
    }
    if (allParsed && thenEffects.length >= 2) {
      return buildSequenceWithPendingValue(thenEffects);
    }
  }

  // Try splitting on sentence boundaries
  return parseSentenceSequence(cleaned, false);
}

/** "You may pay :rb_rune_order: to ready it." — optional cost + pronoun rider. */
const PAY_TO_RIDER_RE =
  /^You may pay\s+((?::rb_(?:energy_\d+|rune_(?:fury|calm|mind|body|chaos|order|rainbow)|exhaust):)+)\s+to\s+(.+?\s+(?:it|them))\.?$/i;

const CHANNEL_FALLBACK_RE =
  /^If you (?:can'?t|couldn'?t)(?:\s+channel\s+(\d+)\s+runes?(?:\s+this way)?)?,\s*(.+?)\.?$/i;

/**
 * Split a body into sentences and parse each one into a sequence.
 *
 * `strict` requires every sentence to parse (used before the single-effect
 * attempt, where a partial match would silently drop text); the lenient pass
 * keeps whatever parsed, as a last resort.
 */
function parseSentenceSequence(cleaned: string, strict: boolean): Effect | undefined {
  const sentences = splitSentences(cleaned);
  if (sentences.length <= 1) {
    return undefined;
  }

  const effects: Effect[] = [];
  for (const sentence of sentences) {
    // rule-id: unl-131-219 — "Counter a spell. Return it to its owner's hand
    // instead of putting it in their trash." The rider sentence modifies the
    // preceding counter's destination rather than being its own effect.
    const prev = effects[effects.length - 1];
    if (
      prev?.type === "counter" &&
      /^Return it to its owner'?s hand instead of putting it in (?:their|its owner'?s) trash\.?$/i.test(
        sentence.trim(),
      )
    ) {
      effects[effects.length - 1] = { ...prev, destination: "hand" } as Effect;
      continue;
    }
    // rule 430.3 — "Channel N rune(s) …. If you can't, X." / "If you couldn't
    // channel N runes this way, X.": the rider fires when the Rune Deck ran dry,
    // so fold it into a `channeled-fewer-than` conditional on the channel above.
    const channelFallback = CHANNEL_FALLBACK_RE.exec(sentence.trim());
    if (prev?.type === "channel" && channelFallback) {
      const fallback = parseEffects(`${channelFallback[2].trim().replace(/\.$/, "")}.`);
      if (fallback) {
        const wanted =
          channelFallback[1] !== undefined
            ? Number.parseInt(channelFallback[1], 10)
            : ((prev as { amount?: number }).amount ?? 1);
        effects.push({
          condition: { amount: wanted, type: "channeled-fewer-than" },
          then: fallback,
          type: "conditional",
        } as unknown as Effect);
        continue;
      }
    }
    // rule 383.3.b (rule-id: sfd-154-221) — "Play a … token. You may pay [X]
    // to <do something to> it.": the rider is an opt-in cost charged when the
    // spell resolves, and "it" names the token the previous sentence made, so
    // it rides along as the create-token's `then` (the engine executes that
    // with the created ids bound).
    const payRider = prev?.type === "create-token" ? PAY_TO_RIDER_RE.exec(sentence.trim()) : null;
    if (payRider && prev) {
      const inner = parseEffect(`${payRider[2].trim().replace(/\.$/, "")}.`);
      if (inner) {
        effects[effects.length - 1] = {
          ...prev,
          then: {
            condition: { cost: parseCost(payRider[1]), type: "pay-cost" },
            then: inner,
            type: "conditional",
          },
        } as unknown as Effect;
        continue;
      }
    }
    const eff = parseEffect(sentence.trim());
    if (eff) {
      effects.push(eff);
    } else if (strict) {
      return undefined;
    }
  }

  if (effects.length === 0) {
    return undefined;
  }
  if (effects.length === 1) {
    return strict ? undefined : effects[0];
  }
  return buildSequenceWithPendingValue(effects);
}
