// Effect handler: "modify-might"
import type { CardId as CoreCardId } from "@tcg/core";
import type { RiftboundCardMeta } from "../../types";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, getTargetIds, getEffectiveMight, resolveAmount, checkBecomesMighty } from "./_helpers";

export function handle_modifyMight(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  const targets = getTargetIds(effect, ctx);
  const amount = resolveAmount(effect.amount ?? 0, ctx);
  for (const targetId of targets) {
    const mightBefore = getEffectiveMight(targetId, ctx);
    const meta = ctx.cards.getCardMeta?.(targetId as CoreCardId) as
      | Partial<RiftboundCardMeta>
      | undefined;
    const currentMod = meta?.mightModifier ?? 0;
    ctx.cards.updateCardMeta?.(
      targetId as CoreCardId,
      {
        mightModifier: currentMod + amount,
      } as unknown as Record<string, unknown>,
    );
    checkBecomesMighty(targetId, mightBefore, ctx);
  }
}
