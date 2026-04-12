/**
 * Abilities module exports
 */

export type { GameEvent } from "./game-events";
export { executeEffect } from "./effect-executor";
export type { EffectContext, ExecutableEffect } from "./effect-executor";
export { findMatchingTriggers } from "./trigger-matcher";
export type { CardWithAbilities, MatchedTrigger, TriggerableAbility } from "./trigger-matcher";
export { resolveTarget } from "./target-resolver";
export type { TargetDescriptor, TargetResolverContext } from "./target-resolver";
export { fireTriggers } from "./trigger-runner";
export type { TriggerRunnerContext } from "./trigger-runner";
export {
  checkReplacement,
  clearConsumedReplacements,
  markReplacementConsumed,
} from "./replacement-effects";
export type {
  ReplacementEvent,
  MatchedReplacement,
  ReplacementContext,
} from "./replacement-effects";
export { recalculateStaticEffects } from "./static-abilities";
export type { StaticAbilityContext } from "./static-abilities";
