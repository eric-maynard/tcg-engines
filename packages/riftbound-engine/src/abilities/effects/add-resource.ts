// Effect handler: "add-resource"
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers } from "./_helpers";

export function handle_addResource(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  const pool = ctx.draft.runePools[ctx.playerId];
  if (pool) {
    if (effect.energy) {
      pool.energy += effect.energy;
    }
    if (effect.power) {
      for (const domain of effect.power) {
        const key = domain as keyof typeof pool.power;
        pool.power[key] = (pool.power[key] ?? 0) + 1;
      }
    }
  }
}
