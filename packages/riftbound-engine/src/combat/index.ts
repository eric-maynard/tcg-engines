/**
 * Combat module exports
 */
export { calculateSideMight, distributeDamage, resolveCombat } from "./combat-resolver";
export type { ChooseRequirementHook, CombatResult, CombatUnit } from "./combat-resolver";
export {
  KEYWORD_DAMAGE_PRIORITIES,
  collectDamageRequirements,
  withDamageRequirements,
} from "./damage-requirements";
export type {
  DamageRequirementMeta,
  GrantedKeywordLike,
} from "./damage-requirements";
