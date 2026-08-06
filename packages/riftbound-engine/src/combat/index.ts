/**
 * Combat module exports
 */
export {
  PREVENT_WEAKER_ENEMY_COMBAT_DAMAGE,
  calculateSideMight,
  distributeDamage,
  resolveCombat,
} from "./combat-resolver";
export type { CombatResult, CombatUnit } from "./combat-resolver";
