// Effect handler: "do-times"
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers } from "./_helpers";

export function handle_doTimes(effect: ExecutableEffect, ctx: EffectContext, h: EffectHelpers): void {
  const executeEffect = h.executeEffect;
  const times = (effect as unknown as { times?: number }).times ?? 1;
  const repeatedEffect = (effect as unknown as { effect?: ExecutableEffect }).effect;
  if (repeatedEffect) {
    for (let i = 0; i < times; i++) {
      executeEffect(repeatedEffect, ctx);
    }
  }
}
