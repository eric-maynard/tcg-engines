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

import { sortByBacklinePriority, sortByTankPriority } from "../keywords/keyword-effects";
import { type DamageOp, applyDamageOps, minAssignedForLethal } from "../operations/damage-modifiers";

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
  /** Unit contributes no combat damage (still takes damage / can be killed). */
  readonly dealsNoCombatDamage?: boolean;
  /**
   * rule-id: ogn-254-298 — a bound "kill it the next time it takes damage"
   * replacement: any nonzero combat damage assigned to this unit kills it.
   */
  readonly diesOnAnyDamage?: boolean;
  /**
   * rule 465.2.c.10 (ogn-189-298) — "I don't take damage": the unit is skipped
   * for mandatory combat damage assignment and is never dealt lethal damage.
   */
  readonly immuneToDamage?: boolean;
  /**
   * rule 437.5.a — the unit's Prevent Value (a delayed "prevent the next N
   * damage" shield). Lethal damage for assignment purposes is computed
   * INCLUDING it, so a shielded Tank soaks Might + Prevent Value.
   */
  readonly preventValue?: number;
  /**
   * rule 437.5.b (sfd-194-221) — a delayed "prevent the next damage instance"
   * shield: its Prevent Value is All, so no assignment is ever lethal to it.
   */
  readonly preventsNextDamageInstance?: boolean;
  /**
   * rule 465.2.c.4.a / 465.2.c.5 / 437.5 — the ORDERED chain of damage
   * replacements (Double, Prevent N / All) that will apply to combat damage
   * dealt to this unit, as computed by `operations/deal-damage.ts
   * damageReplacementProfile`. Lethal assignment, the kill check and the
   * damage finally dealt all fold the same chain. Supersedes `preventValue` /
   * `preventsNextDamageInstance` when present.
   */
  readonly incomingDamageOps?: readonly DamageOp[];
  /**
   * rule 142.4.c (unl-118-219 Elder Dragon) — an opposing static lowered this
   * unit's lethal-damage value ("Any amount of your damage is enough to kill
   * enemy units"), so combat damage ASSIGNMENT (465.2.c.3) needs this much and
   * no more before moving to the next unit.
   */
  readonly lethalDamageOverride?: number;
}

/**
 * rule-id: unl-060-219 (Vilemaw) — marker keyword for "Enemy units here with
 * less Might than me don't deal combat damage."
 */
export const PREVENT_WEAKER_ENEMY_COMBAT_DAMAGE = "PreventWeakerEnemyCombatDamage";

/**
 * Marker keyword for "I don't deal combat damage." (sfd-082-221 Ezreal, Dashing).
 * Printed or granted by a static; read when building CombatUnits.
 */
export const NO_COMBAT_DAMAGE = "NoCombatDamage";

/**
 * Result of a combat between two sides.
 */
export interface CombatResult {
  readonly winner: "attacker" | "defender" | "tie";
  readonly attackerTotal: number;
  readonly defenderTotal: number;
  /** Units killed during combat (from either side) */
  readonly killed: string[];
  /** Units surviving on the winning side */
  readonly winningSurvivors: string[];
  /** Units surviving on the losing side (to be recalled) */
  readonly losingSurvivors: string[];
  /** Damage assigned to each unit */
  readonly damageAssignment: Record<string, number>;
  /**
   * rule 626.1.d.2 — attacker damage assigned to enemy units beyond what was
   * needed to make every defender lethal ("excess damage", Tryndamere).
   */
  readonly attackerExcessDamage: number;
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
 * Check if a unit has a specific keyword.
 */
function hasKeyword(unit: CombatUnit, keyword: string): boolean {
  return unit.keywords.includes(keyword);
}

/**
 * Might threshold for lethal-damage assignment and kill determination.
 * Rule 726: Shield is "+X Might while I'm a defender" — Might is the unit's
 * survival stat too, so a defending Shield unit needs base+Shield damage to die.
 * rule 719.1.c: Assault is likewise "+X Might while I'm an attacker", so an
 * attacking Assault unit needs base+Assault damage to die.
 */
export function combatLethalMight(unit: CombatUnit, role?: "attacker" | "defender"): number {
  // rule 142.4.c: an opposing "any amount of your damage is lethal" static
  // replaces this unit's lethal-damage value outright (never raises it).
  if (unit.lethalDamageOverride !== undefined) {
    return Math.max(0, Math.min(unit.lethalDamageOverride, unit.baseMight));
  }
  let might = unit.baseMight;
  if (role === "defender") {
    might += getKeywordValue(unit, "Shield");
  } else if (role === "attacker") {
    might += getKeywordValue(unit, "Assault");
  }
  return Math.max(0, might);
}

/**
 * rule 437.5 / 465.2.c.5 — the damage replacement chain applying to this
 * unit's combat damage (explicit ops, else the legacy Prevent fields).
 */
function incomingOps(unit: CombatUnit): readonly DamageOp[] {
  if (unit.incomingDamageOps !== undefined) {
    return unit.incomingDamageOps;
  }
  const ops: DamageOp[] = [];
  if (unit.preventsNextDamageInstance === true) {
    ops.push({ amount: "all", key: "prevent-next", op: "prevent" });
  }
  if ((unit.preventValue ?? 0) > 0) {
    ops.push({ amount: unit.preventValue as number, key: "prevent-shield", op: "prevent" });
  }
  return ops;
}

/** rule 465.2.d / 437.2 — damage this unit actually takes from `assigned` combat damage. */
export function combatDamageTaken(unit: CombatUnit, assigned: number): number {
  return assigned > 0 ? applyDamageOps(assigned, incomingOps(unit)).amount : 0;
}

/**
 * rule 465.2.c.3 / 465.2.c.4.a / 465.2.c.5 / 437.5.a–b / 143.2.b — the least
 * damage that must be ASSIGNED to this unit for it to have lethal damage,
 * taking every damage replacement on it into account (a doubled unit needs
 * half, a Prevent N unit N more, a Prevent All unit can never be made lethal
 * but stays assignable). Non-zero even for a 0-Might unit.
 */
export function lethalNeed(unit: CombatUnit, role?: "attacker" | "defender"): number {
  const health = Math.max(1, combatLethalMight(unit, role) - unit.currentDamage);
  return minAssignedForLethal(health, incomingOps(unit));
}

/**
 * Calculate total Might for a side.
 * Assault adds +X for attackers (rule 719).
 * Shield adds +X for defenders (rule 726: "+X Might while defending").
 */
function unitCombatMight(unit: CombatUnit, isAttacker: boolean): number {
  const bonus = isAttacker ? getKeywordValue(unit, "Assault") : getKeywordValue(unit, "Shield");
  return Math.max(0, unit.baseMight + bonus);
}

export function calculateSideMight(units: CombatUnit[], isAttacker: boolean): number {
  let total = 0;
  for (const unit of units) {
    if (unit.dealsNoCombatDamage) {
      continue;
    }
    total += unitCombatMight(unit, isAttacker);
  }
  return total;
}

/**
 * rule-id: unl-060-219 (Vilemaw) — flag every unit on `side` whose combat
 * Might is lower than that of an opposing PreventWeakerEnemyCombatDamage
 * unit so it contributes no combat damage.
 */
function applyCombatDamagePrevention(
  side: CombatUnit[],
  sideIsAttacker: boolean,
  opposing: CombatUnit[],
): CombatUnit[] {
  const thresholds = opposing
    .filter((u) => hasKeyword(u, PREVENT_WEAKER_ENEMY_COMBAT_DAMAGE))
    .map((u) => unitCombatMight(u, !sideIsAttacker));
  if (thresholds.length === 0) {
    return side;
  }
  const maxThreshold = Math.max(...thresholds);
  return side.map((u) =>
    unitCombatMight(u, sideIsAttacker) < maxThreshold ? { ...u, dealsNoCombatDamage: true } : u,
  );
}

/**
 * Distribute damage among units.
 * Tank units must receive lethal damage first (rule 727).
 * Must assign lethal damage before moving to next unit (rule 626.1.d.2).
 *
 * @param units - Target units to distribute damage to
 * @param totalDamage - Total damage to distribute
 * @param role - Combat role of the target units (defenders get Shield toward lethal, rule 726)
 * @returns Damage assigned to each unit
 */
export function distributeDamage(
  units: CombatUnit[],
  totalDamage: number,
  role?: "attacker" | "defender",
  opts?: AssignmentKeywordOptions,
): Record<string, number> {
  const assignment: Record<string, number> = {};
  let remaining = totalDamage;

  // rule 465.2.c.10 (ogn-189-298): units that can't take damage are skipped
  // entirely for damage assignment — no mandatory lethal, no leftover.
  const assignable = units.filter((u) => u.immuneToDamage !== true);

  // Sort by damage assignment priority: Tank first, then normal, then Backline last
  // rule 766 — an effect may make [Tank] INACTIVE for this one assignment.
  const withFlags = assignable.map((u) => ({
    ...u,
    hasBackline: hasKeyword(u, "Backline"),
    hasTank: opts?.ignoreTank === true ? false : hasKeyword(u, "Tank"),
  }));
  const sorted = sortByBacklinePriority(sortByTankPriority(withFlags));

  for (const unit of sorted) {
    if (remaining <= 0) {
      break;
    }

    // Must assign at least lethal damage before moving to next unit —
    // rule 465.2.c.5: computed through the unit's damage replacements; rule
    // 143.2.b: a 0-Might (debuffed) unit still costs one point to kill.
    const lethal = lethalNeed(unit, role);
    const toAssign = Math.min(remaining, lethal);

    assignment[unit.id] = toAssign;
    remaining -= toAssign;
  }

  // Any remaining damage goes to first alive unit that can take more
  if (remaining > 0) {
    for (const unit of sorted) {
      if (remaining <= 0) {
        break;
      }
      const currentlyAssigned = assignment[unit.id] ?? 0;
      assignment[unit.id] = currentlyAssigned + remaining;
      remaining = 0;
    }
  }

  return assignment;
}

/**
 * rule 465.2.c.3 / 465.2.c.7 — the player assigning combat damage chooses the
 * order in which the opposing units receive lethal damage, so an assignment is
 * only forced when a single line is legal. This describes the legal shapes of
 * one side's assignment so the move layer can surface the decision.
 *
 * Priority tiers (815.1.b Tank first, 826.4.b Backline last) are hard: a unit
 * in a later tier may receive nothing while an earlier-tier unit lacks lethal.
 */
/**
 * rule 465.2.c.8 — tier of a unit with both [Tank] and [Backline]: the
 * assigning player decides which keyword to honour, so it belongs to no tier.
 */
export const FLEXIBLE_TIER = -1;

/**
 * rule 766 / 767 — keyword-ignoring riders that apply to ONE player's combat
 * damage assignment (ven-004-166 Dune Surfer: "You ignore [Tank] while
 * assigning combat damage here"). Making the keyword inactive collapses its
 * priority tier, so splits 815.1.c.2 would otherwise refuse become legal.
 */
export interface AssignmentKeywordOptions {
  readonly ignoreTank?: boolean;
}

export interface DamageAssignmentPlan {
  /** Assignable target ids, in damage-assignment priority order. */
  readonly order: string[];
  /** Damage still needed to make each target lethal. */
  readonly need: Record<string, number>;
  /**
   * Assignment priority tier: 0 = Tank, 1 = plain, 2 = Backline, and
   * `FLEXIBLE_TIER` (-1) for a unit with BOTH Tank and Backline — rule
   * 465.2.c.8 lets the assigning player honour either keyword, so such a unit
   * constrains nothing and may be served at any point of the assignment.
   */
  readonly tier: Record<string, number>;
  readonly total: number;
  /** The engine's forced/greedy assignment — always legal. */
  readonly defaultAllocation: Record<string, number>;
  /** True when more than one legal assignment exists (a real decision). */
  readonly hasChoice: boolean;
}

export function planDamageAssignment(
  units: CombatUnit[],
  totalDamage: number,
  role?: "attacker" | "defender",
  opts?: AssignmentKeywordOptions,
): DamageAssignmentPlan {
  const ignoreTank = opts?.ignoreTank === true;
  // rule 766 — [Tank] made inactive for this assignment carries no tier at all.
  const isTank = (u: CombatUnit): boolean => !ignoreTank && hasKeyword(u, "Tank");
  const assignable = units.filter((u) => u.immuneToDamage !== true);
  const withFlags = assignable.map((u) => ({
    ...u,
    hasBackline: hasKeyword(u, "Backline"),
    hasTank: isTank(u),
  }));
  const sorted = sortByBacklinePriority(sortByTankPriority(withFlags));

  const order: string[] = [];
  const need: Record<string, number> = {};
  const tier: Record<string, number> = {};
  for (const unit of sorted) {
    order.push(unit.id);
    // rule 143.2.b / 465.2.c.5 — non-zero, replacement-aware lethal need.
    need[unit.id] = lethalNeed(unit, role);
    // rule 465.2.c.8 — Tank AND Backline on the same unit: the assigning
    // player chooses which one to honour, so neither tier is imposed on it.
    tier[unit.id] =
      isTank(unit) && hasKeyword(unit, "Backline")
        ? FLEXIBLE_TIER
        : isTank(unit)
          ? 0
          : hasKeyword(unit, "Backline")
            ? 2
            : 1;
  }

  // A choice exists only inside the first tier the damage cannot fully cover:
  // earlier tiers are forced (everything in them must reach lethal) and later
  // tiers never see a point. Two or more candidates there ⇒ the assigner picks.
  let remaining = totalDamage;
  let hasChoice = false;
  for (const t of [0, 1, 2]) {
    const group = order.filter((id) => tier[id] === t);
    if (group.length === 0) {
      continue;
    }
    const groupNeed = group.reduce((sum, id) => sum + (need[id] ?? 0), 0);
    if (remaining >= groupNeed) {
      remaining -= groupNeed;
      continue;
    }
    hasChoice = remaining > 0 && group.length > 1;
    remaining = 0;
    break;
  }
  // rule 465.2.c.8 — with a Tank+Backline unit on the receiving side the
  // assigner picks which reading to honour, so any assignment that cannot make
  // every unit lethal is a real decision (serve the dual unit first, or last).
  if (
    !hasChoice &&
    totalDamage > 0 &&
    order.length > 1 &&
    order.some((id) => tier[id] === FLEXIBLE_TIER)
  ) {
    hasChoice = totalDamage < order.reduce((sum, id) => sum + (need[id] ?? 0), 0);
  }

  return {
    defaultAllocation: distributeDamage(units, totalDamage, role, opts),
    hasChoice,
    need,
    order,
    tier,
    total: totalDamage,
  };
}

/**
 * rule 465.2.c.3 / .c.7 — every legal way for one side to assign its damage:
 * repeatedly complete lethal on some unit of the highest-priority tier that
 * still lacks it, then (only once everything is lethal) pile the excess.
 * Zero-valued buckets are omitted so allocations compare canonically.
 */
/**
 * rule 465.2.c.8 — a unit carrying BOTH [Tank] and [Backline] is not
 * unconstrained: the ASSIGNING player must honour one of the two keywords for
 * it — serve it FIRST (Tank) or LAST (Backline), never in between. Each map
 * below pins every flexible unit to one concrete tier; an assignment is legal
 * exactly when it is legal under at least one of these readings.
 */
function tierReadings(plan: DamageAssignmentPlan): Record<string, number>[] {
  const base: Record<string, number> = {};
  for (const id of plan.order) {
    base[id] = plan.tier[id] ?? 1;
  }
  let readings: Record<string, number>[] = [base];
  for (const id of plan.order) {
    if ((plan.tier[id] ?? 1) !== FLEXIBLE_TIER) {
      continue;
    }
    readings = readings.flatMap((r) => [
      { ...r, [id]: 0 },
      { ...r, [id]: 2 },
    ]);
  }
  return readings;
}

export function enumerateDamageAssignments(
  plan: DamageAssignmentPlan,
  cap = 200,
): Record<string, number>[] {
  const out: Record<string, number>[] = [];
  const seen = new Set<string>();
  const emit = (alloc: Record<string, number>): void => {
    const canonical: Record<string, number> = {};
    for (const id of plan.order) {
      if ((alloc[id] ?? 0) > 0) {
        canonical[id] = alloc[id] as number;
      }
    }
    const key = JSON.stringify(canonical);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(canonical);
    }
  };
  const walk = (
    tier: Record<string, number>,
    alloc: Record<string, number>,
    remaining: number,
  ): void => {
    if (out.length >= cap) {
      return;
    }
    if (remaining <= 0) {
      emit(alloc);
      return;
    }
    const nonLethal = plan.order.filter((id) => (alloc[id] ?? 0) < (plan.need[id] ?? 0));
    if (nonLethal.length === 0) {
      for (const id of plan.order) {
        emit({ ...alloc, [id]: (alloc[id] ?? 0) + remaining });
        if (out.length >= cap) {
          return;
        }
      }
      return;
    }
    const minTier = Math.min(...nonLethal.map((id) => tier[id] ?? 1));
    for (const id of nonLethal.filter((cand) => (tier[cand] ?? 1) === minTier)) {
      const give = Math.min(remaining, (plan.need[id] ?? 0) - (alloc[id] ?? 0));
      walk(tier, { ...alloc, [id]: (alloc[id] ?? 0) + give }, remaining - give);
    }
  };
  for (const reading of tierReadings(plan)) {
    walk(reading, {}, plan.total);
  }
  return out;
}

/**
 * rule 465.2.c.3 / .c.4 / .c.7 / 815.1.c.2 — is `allocation` a legal way for
 * one side to assign `plan.total` damage?
 */
export function isLegalDamageAssignment(
  plan: DamageAssignmentPlan,
  allocation: unknown,
): allocation is Record<string, number> {
  if (!allocation || typeof allocation !== "object") {
    return false;
  }
  const alloc = allocation as Record<string, unknown>;
  let sum = 0;
  for (const [id, v] of Object.entries(alloc)) {
    if (!plan.order.includes(id)) {
      return false;
    }
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0) {
      return false;
    }
    sum += v;
  }
  if (sum !== plan.total) {
    return false;
  }
  // rule 465.2.c.8 — legal under ANY one honoured reading of the Tank+Backline
  // units is legal; legal under none (served in the middle) is not.
  return tierReadings(plan).some((tier) => isLegalUnderTiers(plan, alloc, tier));
}

function isLegalUnderTiers(
  plan: DamageAssignmentPlan,
  alloc: Record<string, unknown>,
  tier: Record<string, number>,
): boolean {
  const got = (id: string): number => (alloc[id] as number | undefined) ?? 0;
  const lethal = (id: string): boolean => got(id) >= (plan.need[id] ?? 0);
  const everyoneLethal = plan.order.every((id) => lethal(id));
  let partials = 0;
  for (const id of plan.order) {
    const n = got(id);
    const requirement = plan.need[id] ?? 0;
    // 465.2.c.4: no overkill while any unit still lacks lethal.
    if (n > requirement && !everyoneLethal) {
      return false;
    }
    if (n > 0 && n < requirement) {
      partials++;
    }
    // 815.1.b / 826.4.b: nothing lands in a later tier while an earlier-tier
    // unit lacks lethal.
    if (n > 0) {
      const myTier = tier[id] ?? 1;
      for (const other of plan.order) {
        if ((tier[other] ?? 1) < myTier && !lethal(other)) {
          return false;
        }
      }
    }
  }
  // 465.2.c.3: lethal must be completed on one unit before the next receives
  // any, so at most one unit ends up partially damaged.
  return partials <= 1;
}

/**
 * rule 465.2.c.3 — both sides' assignment plans for one combat, computed on the
 * same prevention-adjusted units `resolveCombat` will use, so a prompt raised
 * from a plan and the damage finally dealt can never disagree.
 */
export function planCombatDamageAssignments(
  attackersIn: CombatUnit[],
  defendersIn: CombatUnit[],
  opts?: {
    /** rule 766/767 — the ATTACKING player ignores [Tank] for its assignment. */
    readonly attackerIgnoresTank?: boolean;
    /** rule 766/767 — the DEFENDING player ignores [Tank] for its assignment. */
    readonly defenderIgnoresTank?: boolean;
  },
): { attacker: DamageAssignmentPlan; defender: DamageAssignmentPlan } {
  const attackers = applyCombatDamagePrevention(attackersIn, true, defendersIn);
  const defenders = applyCombatDamagePrevention(defendersIn, false, attackersIn);
  return {
    attacker: planDamageAssignment(defenders, calculateSideMight(attackers, true), "defender", {
      ignoreTank: opts?.attackerIgnoresTank === true,
    }),
    defender: planDamageAssignment(attackers, calculateSideMight(defenders, false), "attacker", {
      ignoreTank: opts?.defenderIgnoresTank === true,
    }),
  };
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
  attackersIn: CombatUnit[],
  defendersIn: CombatUnit[],
  opts?: {
    /**
     * rule 465.2.c.3 — the attacking player's chosen assignment of its damage
     * onto the defenders. Omitted ⇒ the forced/greedy assignment is used.
     */
    readonly attackerAssignment?: Record<string, number>;
    /**
     * rule 465.2.c.3 — the defending player's chosen assignment of its damage
     * onto the attackers. Omitted ⇒ the forced/greedy assignment is used.
     */
    readonly defenderAssignment?: Record<string, number>;
    /** rule 766/767 — the ATTACKING player ignores [Tank] for its assignment. */
    readonly attackerIgnoresTank?: boolean;
    /** rule 766/767 — the DEFENDING player ignores [Tank] for its assignment. */
    readonly defenderIgnoresTank?: boolean;
  },
): CombatResult {
  // rule-id: unl-060-219 — weaker enemies of a Vilemaw-style unit deal no combat damage.
  const attackers = applyCombatDamagePrevention(attackersIn, true, defendersIn);
  const defenders = applyCombatDamagePrevention(defendersIn, false, attackersIn);

  // Step 1: Calculate total Might for each side
  const attackerTotal = calculateSideMight(attackers, true);
  const defenderTotal = calculateSideMight(defenders, false);

  const damageAssignment: Record<string, number> = {};

  // Step 2: Attackers deal their total Might to defenders (rule 626.1.b)
  const attackerDamageToDefenders =
    opts?.attackerAssignment ??
    distributeDamage(defenders, attackerTotal, "defender", {
      ignoreTank: opts?.attackerIgnoresTank === true,
    });
  Object.assign(damageAssignment, attackerDamageToDefenders);
  // rule-id: ogn-034-298 — excess = assigned beyond each defender's lethal need.
  let attackerExcessDamage = 0;
  for (const unit of defenders) {
    if (unit.immuneToDamage === true) {
      continue;
    }
    const need = lethalNeed(unit, "defender");
    attackerExcessDamage += Math.max(0, (attackerDamageToDefenders[unit.id] ?? 0) - need);
  }

  // Step 3: Defenders deal their total Might to attackers (rule 626.1.c)
  const defenderDamageToAttackers =
    opts?.defenderAssignment ??
    distributeDamage(attackers, defenderTotal, "attacker", {
      ignoreTank: opts?.defenderIgnoresTank === true,
    });
  for (const [id, dmg] of Object.entries(defenderDamageToAttackers)) {
    damageAssignment[id] = (damageAssignment[id] ?? 0) + dmg;
  }

  // Step 4: Determine kills (units where total damage >= Might; rule 726 Shield counts for defenders)
  const killed: string[] = [];
  const checkKills = (units: CombatUnit[], role: "attacker" | "defender") => {
    for (const unit of units) {
      // rule 465.2.c.10 (ogn-189-298): never dealt lethal damage.
      if (unit.immuneToDamage === true) {
        continue;
      }
      // rule 465.2.d / 437.2 — the damage TAKEN, after Double / Prevent.
      const combatDamage = combatDamageTaken(unit, damageAssignment[unit.id] ?? 0);
      const totalDamage = unit.currentDamage + combatDamage;
      // rule-id: ogn-254-298 — kill on any damage taken (bound replacement).
      // rule 142.4.b: lethal damage is NON-ZERO damage ≥ Might, so an
      // undamaged 0-Might unit survives a combat that assigned it nothing.
      if (
        (totalDamage > 0 && totalDamage >= combatLethalMight(unit, role)) ||
        (unit.diesOnAnyDamage === true && combatDamage > 0)
      ) {
        killed.push(unit.id);
      }
    }
  };
  checkKills(attackers, "attacker");
  checkKills(defenders, "defender");

  // Step 5: Determine outcome based on survivors (rule 627)
  const attackerSurvivors = attackers.filter((u) => !killed.includes(u.id));
  const defenderSurvivors = defenders.filter((u) => !killed.includes(u.id));

  let winner: "attacker" | "defender" | "tie";
  if (defenderSurvivors.length === 0 && attackerSurvivors.length > 0) {
    // All defenders killed, some attackers survive → attacker conquers (rule 627.3)
    winner = "attacker";
  } else if (attackerSurvivors.length === 0 && defenderSurvivors.length > 0) {
    // All attackers killed → defender holds (rule 627.4)
    winner = "defender";
  } else if (attackerSurvivors.length === 0 && defenderSurvivors.length === 0) {
    // Both sides wiped → tie
    winner = "tie";
  } else {
    // Both sides survive → attackers recalled (rule 627.2)
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
    attackerExcessDamage,
    attackerTotal,
    damageAssignment,
    defenderTotal,
    killed,
    losingSurvivors,
    winner,
    winningSurvivors,
  };
}
