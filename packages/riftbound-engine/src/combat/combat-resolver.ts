/**
 * Combat Resolver
 *
 * Implements automated combat resolution per Riftbound rules 620-628.
 *
 * Combat uses MUTUAL SIMULTANEOUS DAMAGE (rule 626):
 * 1. Calculate total Might for each side (Assault for attackers, Shield for defenders)
 * 2. Attackers deal their total Might as damage to defending units
 * 3. Defenders deal their total Might as damage to attacking units
 * 4. Both happen simultaneously — Tank units receive damage first, lethal before next
 * 5. Units with total damage >= base Might are killed
 * 6. Outcome: if all defenders killed + attackers survive → conquer;
 *    if both sides survive → attackers recalled; ties → attackers recalled
 */

import { applyPrevent, lethalAssignmentThreshold } from "../operations/prevent-damage";

/**
 * A unit participating in combat.
 */
export interface CombatUnit {
  readonly id: string;
  readonly owner: string;
  readonly baseMight: number;
  readonly currentDamage: number;
  readonly keywords: string[];
  /** Keyword numeric values (e.g., Assault 3 → { Assault: 3 }) */
  readonly keywordValues?: Record<string, number>;
  /**
   * Rule 460.2.c.2 — abilities or effects may influence the order in which
   * combat damage is assigned. This is the unit's damage-assignment priority:
   * units with a *lower* number must be assigned (lethal) damage *before*
   * units with a higher number. `undefined` means "normal" (treated as 0).
   *
   * Derived per-unit by `resolveCombat`/`distributeDamage` from keywords
   * (Tank → −1 "first"; Backline → +1 "last"; rule 800/826/Tank), but a
   * caller may pass an explicit value to model arbitrary "must be assigned
   * damage first/last"-style granted effects beyond the printed keywords.
   * When a unit carries an explicit value AND a keyword that disagrees,
   * the explicit value wins (rule 460.2.c.7/.c.8 — the assigning player picks
   * one applicable requirement; we surface the explicit override).
   */
  readonly damageAssignmentPriority?: number;
  /**
   * Rule 460.2.c.7 — when a unit has TWO OR MORE *conflicting* damage-
   * assignment requirements (e.g. printed [Patrolling] = "must be assigned
   * damage LAST" + granted [Tank] = "must be assigned damage FIRST"), the
   * assigning player chooses which requirement applies. Callers that know
   * such a conflict exists may pass the full list of requirement priorities
   * here (one entry per conflicting requirement). The resolver consults the
   * optional `chooseRequirement` hook on `distributeDamage`/`resolveCombat`
   * to pick one; without that hook it defaults to the smallest (i.e. "Tank
   * wins" — the strictly-first requirement — consistent + simplest).
   *
   * When this is set, it OVERRIDES the deterministic
   * `damageAssignmentPriority` / keyword fallback above.
   */
  readonly damageAssignmentRequirements?: readonly number[];
  /**
   * Rule 460.2.c.9 — "If a unit cannot be dealt damage, then no amount of
   * damage can be considered lethal. Such a unit is exempt from any
   * considerations of mandatory assignment." (e.g. Kayn, Unleashed after
   * moving twice). Such a unit is sorted last for assignment, never has
   * lethal damage required of it, and is never killed by combat damage.
   */
  readonly cannotTakeDamage?: boolean;
  /**
   * Rule 437.5 — Prevent. The Prevent Value currently tracked on this unit
   * (a number, or `"all"` for an infinite amount). Damage can still be
   * *assigned* to a unit affected by Prevent, but it must be assigned up to a
   * value that would be lethal accounting for the Prevent Value (rule 437.5.a);
   * with `"all"`, no amount is ever considered lethal (rule 437.5.b). When the
   * assigned combat damage is *dealt*, the Prevent Value reduces it
   * (rule 437.2/.3); the resolver surfaces the *reduced* (actually-dealt)
   * damage in `damageAssignment` and the post-deal tracked value in
   * `preventRemaining` so the caller can update card meta.
   */
  readonly preventValue?: number | "all";
  /**
   * Rule 423.1.b — "A Stunned Unit does not contribute its might to damage in
   * the combat damage step." Stunned units still take damage and still die
   * with damage ≥ their *full* Might (rule 423.1.c), so we don't zero out
   * `baseMight` — we only suppress the unit's contribution to its side's
   * summed Might in `calculateSideMight`. The unit's lethal-assignment
   * threshold in `distributeDamage` continues to use the real `baseMight`.
   */
  readonly stunned?: boolean;
  /**
   * Barrier keyword (rule 712) — the first time this unit would be dealt
   * combat damage > 0, that damage is reduced to 0 and Barrier is removed.
   * Modelled separately from `preventValue` because Barrier is a one-shot
   * keyword (consumed on first real hit), whereas a numeric Prevent Value
   * persists until exhausted.  The resolver surfaces consumed units in
   * `CombatResult.barrierConsumed` so the caller can strip the keyword.
   */
  readonly hasBarrier?: boolean;
}

/**
 * Rule 460.2.c.2 / Tank / Backline / Guard — derive a unit's damage-assignment
 * priority. Lower = assigned (lethal) damage earlier.
 *
 * - explicit `damageAssignmentPriority` on the unit wins (granted effects);
 * - else Guard → −2 ("must be assigned damage before all others, even Tank");
 * - else Tank → −1 ("must be assigned damage first");
 * - else Backline → +1 ("must be assigned lethal damage after non-Backline");
 * - else 0.
 *
 * A unit that `cannotTakeDamage` is always sorted last (large positive),
 * regardless of any other priority (rule 460.2.c.9 — exempt from mandatory
 * assignment).
 */
function damageAssignmentPriorityOf(
  unit: CombatUnit,
  chooseRequirement?: ChooseRequirementHook,
): number {
  if (unit.cannotTakeDamage) {
    return Number.POSITIVE_INFINITY;
  }
  // Rule 460.2.c.7 — exclusionary requirements; assigner picks one. We
  // Consult the choice hook (or fall back to "first/smallest wins" =
  // Tank-style, matching the rule's example of choosing Tank over Patrolling
  // When forced).
  const reqs = unit.damageAssignmentRequirements;
  if (reqs && reqs.length > 0) {
    if (reqs.length === 1) {
      return reqs[0]!;
    }
    if (chooseRequirement) {
      const chosen = chooseRequirement(unit, reqs);
      if (typeof chosen === "number") {
        return chosen;
      }
    }
    // Default: smallest priority wins (assigner-favored, Tank-first).
    return Math.min(...reqs);
  }
  if (typeof unit.damageAssignmentPriority === "number") {
    return unit.damageAssignmentPriority;
  }
  // Guard: must be assigned lethal damage before Tank and all other units.
  if (unit.keywords.includes("Guard")) {
    return -2;
  }
  if (unit.keywords.includes("Tank")) {
    return -1;
  }
  if (unit.keywords.includes("Backline")) {
    return 1;
  }
  return 0;
}

/**
 * Rule 460.2.c.7 hook — chosen by the assigning player. Given a unit with
 * conflicting damage-assignment requirements, return the priority value to
 * use (must be one of the values in `requirements`). Return `undefined` to
 * use the default ("smallest priority wins" = Tank-first).
 */
export type ChooseRequirementHook = (
  unit: CombatUnit,
  requirements: readonly number[],
) => number | undefined;

/**
 * Combat outcome (rule 461.3).
 *
 * - `"attacker"` / `"defender"` — that player is the *sole* player with units
 *   remaining at the battlefield during the Resolution Step; they win and
 *   Establish Control (a Conquer if not yet scored this turn).
 * - `"tie"` — neither player has units remaining; "No Result", battlefield
 *   becomes Uncontrolled. (Rule 461.3.d covers this — kept as `"tie"` for
 *   backward-compat with callers.)
 * - `"no-result"` — BOTH players still have units remaining (rule 461.3.d):
 *   "No Result", and a new Combat is *staged* at the battlefield. The combat
 *   does not end the contest — the battlefield stays Contested and combat
 *   re-runs on the next Cleanup.
 */
export type CombatOutcome = "attacker" | "defender" | "tie" | "no-result";

/**
 * Result of a combat between two sides.
 */
export interface CombatResult {
  readonly winner: CombatOutcome;
  readonly attackerTotal: number;
  readonly defenderTotal: number;
  /** Units killed during combat (from either side) */
  readonly killed: string[];
  /** Units surviving on the winning side */
  readonly winningSurvivors: string[];
  /** Units surviving on the losing side (to be recalled) */
  readonly losingSurvivors: string[];
  /**
   * Damage to actually *deal* to each unit (after rule 437 Prevent reduction).
   * The caller should add these as marked-damage counters.
   */
  readonly damageAssignment: Record<string, number>;
  /**
   * Rule 437.2/.3 — for any unit whose tracked Prevent Value changed during
   * the Combat Damage Step (because it absorbed damage), the new value to
   * write to card meta (or `undefined` to clear it — Prevent expired).
   */
  readonly preventRemaining: Record<string, number | "all" | undefined>;
  /**
   * IDs of units whose Barrier keyword was consumed during this combat.
   * The caller must strip the Barrier keyword from each listed unit so it
   * does not protect on the next hit.
   */
  readonly barrierConsumed: string[];
}

/**
 * Get a keyword's numeric value.
 * Checks keywordValues map first, then falls back to counting keyword occurrences.
 */
function getKeywordValue(unit: CombatUnit, keyword: string): number {
  // Check the values map first (populated from card definitions and granted keywords)
  if (unit.keywordValues?.[keyword] !== undefined) {
    return unit.keywordValues[keyword];
  }
  // Fallback: count keyword occurrences (each = +1)
  return unit.keywords.filter((k) => k === keyword).length;
}

/**
 * Calculate total Might for a side.
 * Assault adds +X for attackers (rule 719).
 * Shield adds +X for defenders (rule 726: "+X Might while defending").
 */
export function calculateSideMight(units: CombatUnit[], isAttacker: boolean): number {
  let total = 0;
  for (const unit of units) {
    // Rule 423.1.b — Stunned units do NOT contribute their Might to combat
    // Damage. Their Assault / Shield combat bonuses also don't fire (the
    // Unit isn't contributing *any* might to the combat damage step).
    if (unit.stunned) {
      continue;
    }
    let unitMight = unit.baseMight;
    if (isAttacker) {
      unitMight += getKeywordValue(unit, "Assault");
    } else {
      unitMight += getKeywordValue(unit, "Shield");
    }
    total += Math.max(0, unitMight);
  }
  return total;
}

/**
 * Distribute damage among units (rule 460.2.c).
 *
 * - Starting with the highest-priority units, lethal damage must be assigned
 *   to a unit in full before moving on (rule 460.2.c.3).
 * - Tank ("must be assigned damage first") → priority −1; Backline ("must be
 *   assigned lethal damage after non-Backline allies") → priority +1; an
 *   explicit `damageAssignmentPriority` on the unit overrides the keyword
 *   (rule 460.2.c.2/.c.7/.c.8). The sort is *stable*, so units sharing a
 *   priority keep their input order (rule 460.2.c.6 — assigner's free choice).
 * - A unit that cannot be dealt damage is exempt from mandatory lethal
 *   assignment and is sorted last (rule 460.2.c.9).
 * - A unit with a Prevent Value of `"all"` is likewise never lethal and so
 *   gets no mandatory assignment (rule 437.5.b); a numeric Prevent Value of N
 *   raises the lethal-assignment threshold by N (rule 437.5.a).
 * - Units cannot have more damage assigned than the minimum required for
 *   lethal unless no further (assignable) unit remains (rule 460.2.c.4).
 *
 * @param units - Target units to distribute damage to
 * @param totalDamage - Total damage to distribute
 * @returns Damage assigned to each unit
 */
export function distributeDamage(
  units: CombatUnit[],
  totalDamage: number,
  chooseRequirement?: ChooseRequirementHook,
): Record<string, number> {
  const assignment: Record<string, number> = {};
  let remaining = totalDamage;

  // Stable sort by damage-assignment priority (lower = assigned earlier).
  const sorted = units
    .map((u, i) => ({ i, p: damageAssignmentPriorityOf(u, chooseRequirement), u }))
    .toSorted((a, b) => (a.p === b.p ? a.i - b.i : a.p - b.p))
    .map((x) => x.u);

  for (const unit of sorted) {
    if (remaining <= 0) {
      break;
    }
    // Rule 460.2.c.9 — a unit that cannot be dealt damage gets no mandatory
    // Lethal assignment (it can't die to damage), so skip it in this pass.
    // Rule 437.5.b — same for a Prevent Value of "all".
    // Barrier (hasBarrier) — the first hit is absorbed entirely so no amount
    // Is lethal during this combat step; treat like preventValue === "all".
    if (unit.cannotTakeDamage || unit.preventValue === "all" || unit.hasBarrier) {
      continue;
    }

    // How much damage to make this unit lethal (accounting for existing damage
    // And any numeric Prevent Value tracked on it — rule 437.5.a).
    // Tough units require 2× Might damage to die, so the mandatory-lethal
    // Threshold is doubled.
    const hasTough = unit.keywords.includes("Tough");
    const lethalMight = hasTough ? unit.baseMight * 2 : unit.baseMight;
    const effectiveHealth = lethalMight - unit.currentDamage;
    const lethal = lethalAssignmentThreshold(effectiveHealth, unit.preventValue);
    const toAssign = Math.min(remaining, lethal);

    assignment[unit.id] = toAssign;
    remaining -= toAssign;
  }

  // Rule 460.2.c.4 — leftover damage (every assignable unit already has
  // Lethal) may be dumped onto any unit; prefer one that can actually take
  // It (not `cannotTakeDamage`), else the first.
  if (remaining > 0) {
    const dumpTarget =
      sorted.find((u) => !u.cannotTakeDamage && u.preventValue !== "all" && !u.hasBarrier) ??
      sorted[0];
    if (dumpTarget) {
      assignment[dumpTarget.id] = (assignment[dumpTarget.id] ?? 0) + remaining;
      remaining = 0;
    }
  }

  return assignment;
}

/**
 * Resolve combat between attackers and defenders.
 *
 * Uses MUTUAL SIMULTANEOUS DAMAGE (rule 626):
 * Both sides deal their full Might as damage to the opposing side.
 *
 * @param attackers - Units on the attacking side
 * @param defenders - Units on the defending side
 * @returns CombatResult with damage, kills, and outcome
 */
export function resolveCombat(
  attackers: CombatUnit[],
  defenders: CombatUnit[],
  chooseRequirement?: ChooseRequirementHook,
): CombatResult {
  // Step 1: Calculate total Might for each side
  const attackerTotal = calculateSideMight(attackers, true);
  const defenderTotal = calculateSideMight(defenders, false);

  // `assigned` is what each side assigned (before Prevent reduction);
  // `damageAssignment` is what is actually *dealt* after rule 437 Prevent.
  const assigned: Record<string, number> = {};
  const damageAssignment: Record<string, number> = {};
  const preventRemaining: Record<string, number | "all" | undefined> = {};
  // Barrier — units whose one-shot Barrier keyword was consumed this combat.
  const barrierConsumed: string[] = [];

  // Step 2: Attackers deal their total Might to defenders (rule 626.1.b)
  const attackerDamageToDefenders = distributeDamage(defenders, attackerTotal, chooseRequirement);
  Object.assign(assigned, attackerDamageToDefenders);

  // Step 3: Defenders deal their total Might to attackers (rule 626.1.c)
  const defenderDamageToAttackers = distributeDamage(attackers, defenderTotal, chooseRequirement);
  for (const [id, dmg] of Object.entries(defenderDamageToAttackers)) {
    assigned[id] = (assigned[id] ?? 0) + dmg;
  }

  // Rule 437.2/.3 — apply each unit's tracked Prevent Value to the damage
  // Assigned to it: the dealt damage is reduced by the Prevent Value, then
  // The Prevent Value is reduced by the prevented amount.
  // Barrier (rule 712) — if a unit has the Barrier keyword and would take
  // Damage > 0, that damage is absorbed (dealt = 0) and Barrier is consumed.
  const allUnits = [...attackers, ...defenders];
  for (const unit of allUnits) {
    const assignedDmg = assigned[unit.id] ?? 0;
    // Barrier takes priority: absorb the first real hit, mark it consumed.
    if (unit.hasBarrier && assignedDmg > 0) {
      // Barrier absorbs the hit; unit takes 0 damage this combat step.
      barrierConsumed.push(unit.id);
      continue; // Dealt = 0, no preventValue mutation needed
    }
    if (assignedDmg <= 0 && unit.preventValue === undefined) {
      continue;
    }
    const { dealt, remaining } = applyPrevent(assignedDmg, unit.preventValue);
    if (dealt > 0) {
      damageAssignment[unit.id] = dealt;
    }
    if (unit.preventValue !== undefined && remaining !== unit.preventValue) {
      preventRemaining[unit.id] = remaining;
    }
  }

  // Step 4: Determine kills (units where total *dealt* damage >= base Might).
  // Rule 460.2.c.9 — a unit that cannot be dealt damage can never have
  // Lethal damage. Rule 437.5.b — likewise a unit with a Prevent Value of
  // "all" is never killed by combat damage.
  // Barrier — a unit whose Barrier was just consumed took 0 damage this step;
  // It can still die only if pre-existing damage already reached lethal.
  // Tough — a unit with [Tough] requires damage >= Might × 2 to die.
  const killed: string[] = [];
  for (const unit of allUnits) {
    if (unit.cannotTakeDamage || unit.preventValue === "all") {
      continue;
    }
    const combatDamage = damageAssignment[unit.id] ?? 0;
    const totalDamage = unit.currentDamage + combatDamage;
    const hasTough = unit.keywords.includes("Tough");
    const lethalThreshold = hasTough ? unit.baseMight * 2 : unit.baseMight;
    if (totalDamage >= lethalThreshold) {
      killed.push(unit.id);
    }
  }

  // Step 5: Determine outcome (rule 461.3 — Resolution Step).
  //
  // The Combat Cleanup that precedes result determination (rule 461.1.a.2)
  // Recalls all surviving Attackers from the battlefield IF any Defenders are
  // Still present. So when both sides survive, the attackers are gone and
  // Only the defenders remain → the defender Establishes Control / holds
  // (rule 461.3.a — "the only player that has units remaining"). A true
  // "No Result" with a re-staged combat (rule 461.3.d.1) only arises if some
  // Surviving attacker *cannot* be recalled, which the resolver surfaces via
  // An explicit `recalledAttackers` set the caller can override; by default we
  // Recall every surviving attacker.
  const attackerSurvivors = attackers.filter((u) => !killed.includes(u.id));
  const defenderSurvivors = defenders.filter((u) => !killed.includes(u.id));

  let winner: CombatOutcome;
  if (defenderSurvivors.length === 0 && attackerSurvivors.length > 0) {
    // All defenders killed, some attackers survive → attacker conquers (rule 461.3.a)
    winner = "attacker";
  } else if (attackerSurvivors.length === 0 && defenderSurvivors.length > 0) {
    // All attackers killed → defender holds (rule 461.3.a)
    winner = "defender";
  } else if (attackerSurvivors.length === 0 && defenderSurvivors.length === 0) {
    // Neither player has units remaining → "No Result", battlefield Uncontrolled (rule 461.3.d)
    winner = "tie";
  } else {
    // Both sides survive → Combat Cleanup recalls the surviving Attackers
    // (rule 461.1.a.2), leaving only the Defenders → defender holds (rule 461.3.a).
    winner = "defender";
  }

  const winningSurvivors =
    winner === "attacker"
      ? attackerSurvivors.map((u) => u.id)
      : (winner === "defender"
        ? defenderSurvivors.map((u) => u.id)
        : []);

  const losingSurvivors =
    winner === "attacker"
      ? defenderSurvivors.map((u) => u.id)
      : (winner === "defender"
        ? attackerSurvivors.map((u) => u.id)
        : attackerSurvivors.map((u) => u.id));

  return {
    attackerTotal,
    barrierConsumed,
    damageAssignment,
    defenderTotal,
    killed,
    losingSurvivors,
    preventRemaining,
    winner,
    winningSurvivors,
  };
}
