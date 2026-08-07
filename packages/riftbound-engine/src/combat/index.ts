/**
 * Combat module exports
 */
export {
  NO_COMBAT_DAMAGE,
  PREVENT_WEAKER_ENEMY_COMBAT_DAMAGE,
  calculateSideMight,
  distributeDamage,
  enumerateDamageAssignments,
  isLegalDamageAssignment,
  planDamageAssignment,
  resolveCombat,
} from "./combat-resolver";
export type { CombatResult, CombatUnit, DamageAssignmentPlan } from "./combat-resolver";
