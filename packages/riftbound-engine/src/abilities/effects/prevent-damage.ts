// Effect handler: "prevent-damage"
import type { CardId as CoreCardId } from "@tcg/core";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, getTargetIds, resolveAmount } from "./_helpers";

export function handle_preventDamage(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  // Set a damage prevention shield — store on card meta
  const targets = getTargetIds(effect, ctx);
  const preventTargets = targets.length === 0 ? [ctx.sourceCardId] : targets;
  const preventAmount = resolveAmount(effect.amount ?? 0, ctx);
  for (const targetId of preventTargets) {
    ctx.cards.updateCardMeta?.(
      targetId as CoreCardId,
      {
        damagePreventionShield: preventAmount,
      } as unknown as Record<string, unknown>,
    );
  }
}
