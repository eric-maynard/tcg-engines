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
}

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
 * Calculate total Might for a side.
 * Assault adds +X for attackers (rule 719).
 * Shield adds +X for defenders (rule 726: "+X Might while defending").
 */
export function calculateSideMight(units: CombatUnit[], isAttacker: boolean): number {
  let total = 0;
  for (const unit of units) {
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
 * Distribute damage among units.
 * Tank units must receive lethal damage first (rule 727).
 * Must assign lethal damage before moving to next unit (rule 626.1.d.2).
 *
 * @param units - Target units to distribute damage to
 * @param totalDamage - Total damage to distribute
 * @returns Damage assigned to each unit
 */
export function distributeDamage(units: CombatUnit[], totalDamage: number): Record<string, number> {
  const assignment: Record<string, number> = {};
  let remaining = totalDamage;

  // Sort by damage assignment priority: Tank first, then normal, then Backline last
  const withFlags = units.map((u) => ({
    ...u,
    hasBackline: hasKeyword(u, "Backline"),
    hasTank: hasKeyword(u, "Tank"),
  }));
  const sorted = sortByBacklinePriority(sortByTankPriority(withFlags));

  for (const unit of sorted) {
    if (remaining <= 0) {
      break;
    }

    // How much damage to make this unit lethal (accounting for existing damage)
    const effectiveHealth = unit.baseMight - unit.currentDamage;
    // Must assign at least lethal damage before moving to next unit
    const lethal = Math.max(0, effectiveHealth);
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
 * Resolve combat between attackers and defenders.
 *
 * Uses MUTUAL SIMULTANEOUS DAMAGE (rule 626):
 * Both sides deal their full Might as damage to the opposing side.
 *
 * @param attackers - Units on the attacking side
 * @param defenders - Units on the defending side
 * @returns CombatResult with damage, kills, and outcome
 */
export function resolveCombat(attackers: CombatUnit[], defenders: CombatUnit[]): CombatResult {
  // Step 1: Calculate total Might for each side
  const attackerTotal = calculateSideMight(attackers, true);
  const defenderTotal = calculateSideMight(defenders, false);

  const damageAssignment: Record<string, number> = {};

  // Step 2: Attackers deal their total Might to defenders (rule 626.1.b)
  const attackerDamageToDefenders = distributeDamage(defenders, attackerTotal);
  Object.assign(damageAssignment, attackerDamageToDefenders);

  // Step 3: Defenders deal their total Might to attackers (rule 626.1.c)
  const defenderDamageToAttackers = distributeDamage(attackers, defenderTotal);
  for (const [id, dmg] of Object.entries(defenderDamageToAttackers)) {
    damageAssignment[id] = (damageAssignment[id] ?? 0) + dmg;
  }

  // Step 4: Determine kills (units where total damage >= base Might)
  const killed: string[] = [];
  const allUnits = [...attackers, ...defenders];
  for (const unit of allUnits) {
    const combatDamage = damageAssignment[unit.id] ?? 0;
    const totalDamage = unit.currentDamage + combatDamage;
    if (totalDamage >= unit.baseMight) {
      killed.push(unit.id);
    }
  }

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
    attackerTotal,
    damageAssignment,
    defenderTotal,
    killed,
    losingSurvivors,
    winner,
    winningSurvivors,
  };
}
