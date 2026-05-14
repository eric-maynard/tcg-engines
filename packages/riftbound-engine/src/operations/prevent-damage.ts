/**
 * Prevent — rule 437.
 *
 * Preventing damage reduces the damage a set of game objects would take. A
 * Prevent action records a *Prevent Value* on a Unit (a number, or `"all"`
 * for an infinite amount — rule 437.1.b.1.b). When damage would be dealt to
 * a unit with a tracked Prevent Value:
 *
 *  - the damage is reduced by the Prevent Value (never below 0 — rule 437.2.a);
 *  - the Prevent Value is then reduced by the prevented amount (rule 437.3);
 *  - if it hits 0 or less, Prevent is no longer tracked and expires (437.3.a);
 *  - `"all"` stays `"all"` (437.3.c) and never expires.
 *
 * In combat (rule 437.5), damage can still be *assigned* to a unit affected by
 * Prevent — but it must be assigned up to a value that would be lethal taking
 * the Prevent Value into account (437.5.a), and no amount is lethal if the
 * Prevent Value is `"all"` (437.5.b).
 *
 * This module is pure: callers pass the current tracked value and get back the
 * damage to actually deal and the new tracked value to write to card meta.
 */

export type PreventValue = number | "all";

export interface PreventResult {
  /** Damage to actually deal after Prevent reduction (>= 0). */
  readonly dealt: number;
  /**
   * The new Prevent Value to track on the unit, or `undefined` if Prevent has
   * fully expired and should be removed from card meta (rule 437.3.a).
   */
  readonly remaining: PreventValue | undefined;
}

/**
 * Apply a unit's tracked Prevent Value to an incoming amount of damage.
 *
 * @param incoming - the damage that would be dealt (>= 0)
 * @param tracked - the Prevent Value currently tracked on the unit, or
 *   undefined/0 if none
 * @returns the damage to actually deal, and the new tracked value
 */
export function applyPrevent(incoming: number, tracked: PreventValue | undefined): PreventResult {
  const amount = Math.max(0, incoming);
  if (tracked === undefined || tracked === 0) {
    return { dealt: amount, remaining: tracked === 0 ? undefined : tracked };
  }
  if (tracked === "all") {
    // Rule 437.2 — reduced by an infinite amount → 0 dealt; "all" stays "all".
    return { dealt: 0, remaining: "all" };
  }
  // Numeric Prevent Value: prevent up to `tracked` of the incoming damage.
  const prevented = Math.min(amount, tracked);
  const dealt = amount - prevented;
  const newTracked = tracked - prevented;
  return { dealt, remaining: newTracked <= 0 ? undefined : newTracked };
}

/**
 * Sum two Prevent Values (rule 437 — multiple Prevent actions on a unit).
 * A numeric value plus `"all"` resolves to `"all"`.
 */
export function combinePreventValues(
  a: PreventValue | undefined,
  b: PreventValue | undefined,
): PreventValue {
  if (a === "all" || b === "all") {
    return "all";
  }
  return (a ?? 0) + (b ?? 0);
}

/**
 * Rule 437.5.a/.b — how much damage must be *assigned* to a unit in combat for
 * it to have lethal damage assigned, taking its Prevent Value into account.
 *
 * Normally lethal = (Might − marked damage). With a Prevent Value of N, the
 * unit needs Might − marked + N assigned (so that, after Prevent reduces it,
 * the dealt damage is still lethal). With a Prevent Value of `"all"`, no amount
 * is ever lethal — return `Infinity`.
 *
 * @param effectiveHealth - the unit's remaining health (Might − marked damage),
 *   clamped at >= 0 by the caller
 * @param tracked - the Prevent Value currently tracked on the unit
 */
export function lethalAssignmentThreshold(
  effectiveHealth: number,
  tracked: PreventValue | undefined,
): number {
  if (tracked === "all") {
    return Number.POSITIVE_INFINITY;
  }
  return Math.max(0, effectiveHealth) + (tracked ?? 0);
}
