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
}

/**
 * rule-id: unl-060-219 (Vilemaw) — marker keyword for "Enemy units here with
 * less Might than me don't deal combat damage."
 */
export const PREVENT_WEAKER_ENEMY_COMBAT_DAMAGE = "PreventWeakerEnemyCombatDamage";

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
function lethalThreshold(unit: CombatUnit, role?: "attacker" | "defender"): number {
  let might = unit.baseMight;
  if (role === "defender") {
    might += getKeywordValue(unit, "Shield");
  } else if (role === "attacker") {
    might += getKeywordValue(unit, "Assault");
  }
  return Math.max(0, might);
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
): Record<string, number> {
  const assignment: Record<string, number> = {};
  let remaining = totalDamage;

  // rule 465.2.c.10 (ogn-189-298): units that can't take damage are skipped
  // entirely for damage assignment — no mandatory lethal, no leftover.
  const assignable = units.filter((u) => u.immuneToDamage !== true);

  // Sort by damage assignment priority: Tank first, then normal, then Backline last
  const withFlags = assignable.map((u) => ({
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
    const effectiveHealth = lethalThreshold(unit, role) - unit.currentDamage;
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
export function resolveCombat(
  attackersIn: CombatUnit[],
  defendersIn: CombatUnit[],
): CombatResult {
  // rule-id: unl-060-219 — weaker enemies of a Vilemaw-style unit deal no combat damage.
  const attackers = applyCombatDamagePrevention(attackersIn, true, defendersIn);
  const defenders = applyCombatDamagePrevention(defendersIn, false, attackersIn);

  // Step 1: Calculate total Might for each side
  const attackerTotal = calculateSideMight(attackers, true);
  const defenderTotal = calculateSideMight(defenders, false);

  const damageAssignment: Record<string, number> = {};

  // Step 2: Attackers deal their total Might to defenders (rule 626.1.b)
  const attackerDamageToDefenders = distributeDamage(defenders, attackerTotal, "defender");
  Object.assign(damageAssignment, attackerDamageToDefenders);
  // rule-id: ogn-034-298 — excess = assigned beyond each defender's lethal need.
  let attackerExcessDamage = 0;
  for (const unit of defenders) {
    const need = Math.max(0, lethalThreshold(unit, "defender") - unit.currentDamage);
    attackerExcessDamage += Math.max(0, (attackerDamageToDefenders[unit.id] ?? 0) - need);
  }

  // Step 3: Defenders deal their total Might to attackers (rule 626.1.c)
  const defenderDamageToAttackers = distributeDamage(attackers, defenderTotal, "attacker");
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
      const combatDamage = damageAssignment[unit.id] ?? 0;
      const totalDamage = unit.currentDamage + combatDamage;
      // rule-id: ogn-254-298 — kill on any damage taken (bound replacement).
      if (
        totalDamage >= lethalThreshold(unit, role) ||
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
