// Effect handler: "choice"
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers } from "./_helpers";

export function handle_choice(effect: ExecutableEffect, ctx: EffectContext, h: EffectHelpers): void {
  const executeEffect = h.executeEffect;
  // Player chooses one option — pick the first option for now (needs UI input)
  const { options } = effect as unknown as { options?: { effect: ExecutableEffect }[] };
  if (options && options.length > 0 && options[0]?.effect) {
    executeEffect(options[0].effect, ctx);
  }
}
