// Effect handler: "conditional"
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, evaluateEffectCondition } from "./_helpers";

export function handle_conditional(effect: ExecutableEffect, ctx: EffectContext, h: EffectHelpers): void {
  const executeEffect = h.executeEffect;
  // If condition is met, execute "then"; otherwise execute "else"
  const { condition } = effect as unknown as { condition?: Record<string, unknown> };
  const thenEffect = (effect as unknown as { then?: ExecutableEffect }).then;
  const elseEffect = (effect as unknown as { else?: ExecutableEffect }).else;

  let conditionMet = true; // Default to true if no condition specified
  if (condition) {
    conditionMet = evaluateEffectCondition(condition, ctx);
  }

  if (conditionMet && thenEffect) {
    executeEffect(thenEffect, ctx);
  } else if (!conditionMet && elseEffect) {
    executeEffect(elseEffect, ctx);
  }
}
