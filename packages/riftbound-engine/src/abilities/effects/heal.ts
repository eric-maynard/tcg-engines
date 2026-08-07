// Effect handler: "heal"
import { removeDamage } from "../../operations/damage-store";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, getTargetIds, resolveAmount } from "./_helpers";

export function handle_heal(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  const healAmount = resolveAmount(effect.amount ?? 1, ctx);
  const targets = getTargetIds(effect, ctx);
  const healTargets = targets.length === 0 ? [ctx.sourceCardId] : targets;
  for (const targetId of healTargets) {
    // rule 124.1 / 520 — one damage store: counter and meta mirror move together.
    removeDamage(ctx, targetId, healAmount);
  }
}
