/**
 * Pure arithmetic for the chain of damage replacement / modification effects
 * that apply to ONE damage event on ONE unit (rules 432 Double, 437 Prevent,
 * 465.2.c.4.a–465.2.c.5 combat assignment, 715.4.a Bonus Damage).
 *
 * `operations/deal-damage.ts` gathers the applicable effects and orders them
 * (rule 372); this module only folds an ordered list over an amount, and
 * answers "how much must be ASSIGNED for the result to be lethal" for the
 * combat damage step — so the assignment prompt, the resolver's kill check and
 * the damage finally dealt can never disagree.
 */

export type DamageOp =
  /** rule 432.1 — "double all damage that would be dealt to it". */
  | { readonly op: "double"; readonly key: string; readonly sourceCardId?: string; readonly label?: string }
  /** rule 437 — Prevent Value N or "all" (437.1.b.1.b). */
  | {
      readonly op: "prevent";
      readonly amount: number | "all";
      readonly key: string;
      readonly sourceCardId?: string;
      readonly label?: string;
    };

export interface DamageOpStep {
  readonly key: string;
  readonly op: DamageOp["op"];
  readonly before: number;
  readonly after: number;
  /** rule 437.3 — amount actually prevented by this step (prevent ops only). */
  readonly prevented?: number;
}

/** Fold `ops` (in order) over `amount`; the result is floored at 0 (437.2.a). */
export function applyDamageOps(
  amount: number,
  ops: readonly DamageOp[],
): { amount: number; steps: DamageOpStep[] } {
  let current = Math.max(0, Math.trunc(amount));
  const steps: DamageOpStep[] = [];
  for (const op of ops) {
    const before = current;
    if (op.op === "double") {
      current = before * 2;
      steps.push({ after: current, before, key: op.key, op: "double" });
      continue;
    }
    const prevented = op.amount === "all" ? before : Math.min(before, Math.max(0, op.amount));
    current = before - prevented;
    steps.push({ after: current, before, key: op.key, op: "prevent", prevented });
  }
  return { amount: Math.max(0, current), steps };
}

/**
 * rule 372 — does the ORDER of these ops change the outcome? Two things make it
 * matter:
 *  - arithmetic: a Double combined with a finite, non-zero Prevent ((a−N)×2 ≠
 *    2a−N); Prevent All yields 0 either way and several Doubles commute.
 *  - consumption (371.2.b): every Prevent here is single-use or decrementing,
 *    and a replacement that ends up preventing nothing is NOT used up. So with
 *    ≥2 Prevents the dealt amount may commute while WHICH shield survives does
 *    not (Ki Barrier 7 first ⇒ PV 7→3 and a one-shot stays armed; the one-shot
 *    first ⇒ it is spent and Ki keeps its full 7).
 */
export function damageOpsOrderMatters(ops: readonly DamageOp[]): boolean {
  const prevents = ops.filter((o) => o.op === "prevent");
  if (prevents.length >= 2) {
    return true;
  }
  const hasDouble = ops.some((o) => o.op === "double");
  const hasFinitePrevent = prevents.some((o) => o.op === "prevent" && o.amount !== "all" && o.amount > 0);
  const hasPreventAll = prevents.some((o) => o.op === "prevent" && o.amount === "all");
  return hasDouble && hasFinitePrevent && !hasPreventAll;
}

/**
 * rule 465.2.c.4.a / 465.2.c.5 / 437.5.a–b — the least amount of ASSIGNED
 * combat damage whose modified value reaches `health` (the non-zero damage the
 * unit still needs to have lethal damage). `Number.MAX_SAFE_INTEGER` when no
 * amount can (Prevent All): the unit is still assignable but never lethal.
 */
export function minAssignedForLethal(health: number, ops: readonly DamageOp[]): number {
  const need = Math.max(1, Math.trunc(health));
  if (ops.length === 0) {
    return need;
  }
  if (ops.some((o) => o.op === "prevent" && o.amount === "all")) {
    return Number.MAX_SAFE_INTEGER;
  }
  // Monotone in the assigned amount, and never more than need + ΣPrevent.
  let bound = need;
  for (const op of ops) {
    if (op.op === "prevent" && op.amount !== "all") {
      bound += Math.max(0, op.amount);
    }
  }
  for (let x = 1; x <= bound; x++) {
    if (applyDamageOps(x, ops).amount >= need) {
      return x;
    }
  }
  return bound;
}
