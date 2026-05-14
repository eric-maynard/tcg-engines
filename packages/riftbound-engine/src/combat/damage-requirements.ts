/**
 * Combat damage-assignment requirements (rule 460.2.c.7) — keyword fusion.
 *
 * A unit may carry MULTIPLE damage-assignment requirements at once. Rule
 * 460.2.c.7 covers the case where these requirements are EXCLUSIONARY
 * (e.g. printed [Patrolling] = "must be assigned damage LAST" + granted
 * [Tank] via an effect = "must be assigned damage FIRST"): the assigning
 * player chooses which one applies. The resolver consumes the list of
 * requirement priorities via `CombatUnit.damageAssignmentRequirements` and
 * uses an optional `ChooseRequirementHook` (or a default = smallest =
 * Tank-first) to pick one.
 *
 * The keyword-priority constants here are the SOURCE of truth for the
 * numeric priority each printed/granted keyword contributes. Lower = earlier
 * in the damage-assignment order (Tank goes first; Backline/Patrolling go
 * last). A `0` (default) is the "no requirement" baseline.
 */

import type { CombatUnit } from "./combat-resolver";

/**
 * Numeric damage-assignment priorities per keyword. `lower = earlier`.
 *
 * - **Tank (-1)** — rule 800: "Tank — must be assigned combat damage first."
 * - **Backline (+1)** — rule 826 (Unleashed): "must be assigned lethal damage
 *   AFTER non-Backline allies." Same numeric priority as Patrolling — both
 *   mean "assigned last."
 * - **Patrolling (+1)** — rule note on cards with "I must be assigned combat
 *   damage last." text (e.g. Caitlyn, Patrolling). Treated as a keyword
 *   here so a granted/printed "Patrolling-style last" requirement composes
 *   cleanly with Tank under rule 460.2.c.7.
 */
export const KEYWORD_DAMAGE_PRIORITIES: Readonly<Record<string, number>> = Object.freeze({
  Backline: 1,
  Patrolling: 1,
  Tank: -1,
});

/**
 * Granted-keyword shape (subset of `GrantedKeyword`) the helper needs.
 * Decoupled from the meta type so the helper is straightforward to test in
 * isolation.
 */
export interface GrantedKeywordLike {
  readonly keyword: string;
  readonly value?: number;
  readonly duration?: string;
}

/**
 * Minimal meta surface consumed by `collectDamageRequirements`.
 */
export interface DamageRequirementMeta {
  readonly grantedKeywords?: readonly GrantedKeywordLike[];
  /**
   * Explicit per-effect override priority (rule 460.2.c.2). When set this
   * contributes alongside any keyword-derived priorities — and dedupe will
   * keep both if they differ, so the assigner gets to choose under .c.7.
   */
  readonly damageAssignmentPriority?: number;
}

/**
 * Collect the full set of damage-assignment-requirement priorities for a
 * combat unit. Fuses (1) printed keywords on the `CombatUnit.keywords` list
 * (which already includes definition keywords) with (2) granted keywords
 * from `meta.grantedKeywords` and (3) any explicit `damageAssignmentPriority`
 * override stored on meta.
 *
 * Returns a deduped + ascending-sorted readonly array. The resolver will:
 *  - assignment-default: pick the smallest (Tank-first / assigner-favored);
 *  - hook override: a `ChooseRequirementHook` may pick any value in the list.
 *
 * Empty array means "no specific requirements" → the resolver falls back to
 * its existing keyword-derived default in `damageAssignmentPriorityOf`.
 *
 * NOTE: this helper is INTENTIONALLY GENERIC — no per-card if-statements,
 * no per-set special-cases. Every printed and granted keyword (Tank,
 * Backline, Patrolling — and any future ones added to
 * `KEYWORD_DAMAGE_PRIORITIES`) feeds the same dedup pipeline.
 */
export function collectDamageRequirements(
  unit: { readonly keywords: readonly string[] },
  meta?: DamageRequirementMeta,
): readonly number[] {
  const set = new Set<number>();

  for (const kw of unit.keywords) {
    const p = KEYWORD_DAMAGE_PRIORITIES[kw];
    if (typeof p === "number") {
      set.add(p);
    }
  }

  if (meta?.grantedKeywords) {
    for (const gk of meta.grantedKeywords) {
      const p = KEYWORD_DAMAGE_PRIORITIES[gk.keyword];
      if (typeof p === "number") {
        set.add(p);
      }
    }
  }

  // Rule 460.2.c.2: an explicit effect-granted priority is its own
  // Requirement. Pass it through alongside any keyword-derived requirements
  // — the assigner picks one of them under rule 460.2.c.7.
  if (typeof meta?.damageAssignmentPriority === "number") {
    set.add(meta.damageAssignmentPriority);
  }

  if (set.size === 0) {
    return [];
  }
  return [...set].toSorted((a, b) => a - b);
}

/**
 * Apply `collectDamageRequirements` to a partially-built `CombatUnit`
 * record. Returns the unit with `damageAssignmentRequirements` set when ≥1
 * requirement exists (resolver default for `[]` already matches the keyword
 * fallback, so we skip the write to keep meta lean).
 *
 * If the unit ends up with EXACTLY ONE requirement that matches the
 * keyword-fallback default, we leave `damageAssignmentRequirements` unset
 * so the resolver uses its inline `damageAssignmentPriorityOf` path (no
 * difference in behavior; less meta noise).
 */
export function withDamageRequirements(
  unit: CombatUnit,
  meta?: DamageRequirementMeta,
): CombatUnit {
  const reqs = collectDamageRequirements(unit, meta);
  if (reqs.length === 0) {
    return unit;
  }
  return { ...unit, damageAssignmentRequirements: reqs };
}
