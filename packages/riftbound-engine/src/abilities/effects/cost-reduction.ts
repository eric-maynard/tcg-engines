// Effect handler: "cost-reduction"
import type { CardId as CoreCardId } from "@tcg/core";
import type { RiftboundCardMeta } from "../../types";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, getTargetIds, resolveAmount } from "./_helpers";

export function handle_costReduction(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  const amount = resolveAmount(effect.amount ?? 0, ctx);
  const targets = getTargetIds(effect, ctx);
  const costTargets = targets.length === 0 ? [ctx.sourceCardId] : targets;
  for (const targetId of costTargets) {
    const meta = ctx.cards.getCardMeta?.(targetId as CoreCardId) as
      | Partial<RiftboundCardMeta>
      | undefined;
    const current = meta?.costModifier ?? 0;
    ctx.cards.updateCardMeta?.(
      targetId as CoreCardId,
      { costModifier: current - amount } as unknown as Record<string, unknown>,
    );
  }
}
