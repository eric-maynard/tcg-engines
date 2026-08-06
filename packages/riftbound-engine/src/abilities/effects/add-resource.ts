// Effect handler: "add-resource"
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers } from "./_helpers";

export function handle_addResource(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  const pool = ctx.draft.runePools[ctx.playerId];
  if (pool) {
    if (effect.energy) {
      pool.energy += effect.energy;
      // rule 429.4 (ogs-014-024): "Use only to play spells" earmarks the added
      // Energy — `cost.ts` hides it from plays of any other card type.
      const restriction = (effect as { restriction?: string }).restriction;
      if (restriction) {
        const draft = ctx.draft as {
          restrictedEnergy?: Record<string, Record<string, number>>;
        };
        draft.restrictedEnergy ??= {};
        const forPlayer = (draft.restrictedEnergy[ctx.playerId] ??= {});
        forPlayer[restriction] = (forPlayer[restriction] ?? 0) + effect.energy;
      }
    }
    if (effect.power) {
      for (const domain of effect.power) {
        const key = domain as keyof typeof pool.power;
        pool.power[key] = (pool.power[key] ?? 0) + 1;
      }
    }
  }
}
