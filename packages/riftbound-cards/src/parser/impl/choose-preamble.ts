/**
 * Shared "Choose <target>. … it …" preamble handling.
 *
 * rule 355 — a "Choose X." sentence names the target the controller picks; the
 * following sentence refers back to it with "it". Both spell abilities and
 * triggered abilities print this shape, so the capture/bind pair lives here
 * (spells.ts imports triggers.ts, so it cannot own the helpers).
 */

import type { Effect } from "@tcg/riftbound-types/abilities/effect-types";
import type { AnyTarget } from "@tcg/riftbound-types/targeting";

// rule-id: ven-040-166 — capture the head noun phrase (qualifier tails like
// "that's in combat with …" are accepted so the preamble is still recognised).
export const CHOOSE_PREAMBLE_RE =
  /^Choose ((?:a|an) (?:friendly |enemy )?(?:unit|gear|spell)(?:\s+(?:at a battlefield|here|there))?(?:\s+without \[[^\]]+\])?)(\s+and (?:a|an) (?:friendly |enemy )?(?:unit|gear|spell)(?:\s+(?:at a battlefield|here|there))?|,?\s+(?:that|with|in|from|being)\b[^.]*)?\.\s*/i;

export function isPronounTarget(t: unknown): boolean {
  if (t === "self") {
    return true;
  }
  return (
    typeof t === "object" &&
    t !== null &&
    (t as { type?: string }).type === "unit" &&
    Object.keys(t).length === 1
  );
}

export function bindChosenTarget(effect: Effect, chosen: AnyTarget): Effect {
  const e = effect as unknown as { type: string; target?: unknown; effects?: Effect[] };
  if (e.type === "sequence" && Array.isArray(e.effects) && e.effects.length > 0) {
    const [first, ...rest] = e.effects;
    return { ...e, effects: [bindChosenTarget(first, chosen), ...rest] } as unknown as Effect;
  }
  // rule-id: ven-154-166 (rule 355.8) — "…with less Might than IT": the
  // comparison's referent is the chosen unit, carried as `reference`.
  const withRef = e as { reference?: unknown };
  if (isPronounTarget(withRef.reference)) {
    const bound = { ...e, reference: chosen } as unknown as Effect;
    return isPronounTarget((bound as unknown as { target?: unknown }).target)
      ? ({ ...(bound as unknown as object), target: chosen } as unknown as Effect)
      : bound;
  }
  if ("target" in e && isPronounTarget(e.target)) {
    return { ...e, target: chosen } as unknown as Effect;
  }
  return effect;
}
