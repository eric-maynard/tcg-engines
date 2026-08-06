// Effect handler: "heal"
import type { CardId as CoreCardId } from "@tcg/core";
import type { RiftboundCardMeta } from "../../types";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, getTargetIds, resolveAmount } from "./_helpers";

export function handle_heal(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  const healAmount = resolveAmount(effect.amount ?? 1, ctx);
  const targets = getTargetIds(effect, ctx);
  const healTargets = targets.length === 0 ? [ctx.sourceCardId] : targets;
  for (const targetId of healTargets) {
    // Read prior value BEFORE removeCounter so callers whose counter
    // store aliases meta.damage don't double-apply.
    const priorDamage =
      (
        ctx.cards.getCardMeta?.(targetId as CoreCardId) as
          | Partial<RiftboundCardMeta>
          | undefined
      )?.damage ?? 0;
    ctx.counters.removeCounter(targetId as CoreCardId, "damage", healAmount);
    ctx.cards.updateCardMeta?.(
      targetId as CoreCardId,
      {
        damage: Math.max(0, priorDamage - healAmount),
      } as unknown as Record<string, unknown>,
    );
  }
}
