// Effect handler: "optional"
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers } from "./_helpers";

export function handle_optional(effect: ExecutableEffect, ctx: EffectContext, h: EffectHelpers): void {
  const executeEffect = h.executeEffect;
  // "You may..." — execute the inner effect (auto-apply for now)
  const innerEffect = (effect as unknown as { effect?: ExecutableEffect }).effect;
  if (innerEffect) {
    executeEffect(innerEffect, ctx);
  }
}
