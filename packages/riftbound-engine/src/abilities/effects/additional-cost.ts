// Effect handler: "additional-cost"
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers } from "./_helpers";

export function handle_additionalCost(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  if (ctx.draft.additionalCostsPaid) {
    ctx.draft.additionalCostsPaid[ctx.sourceCardId] = true;
  }
}
