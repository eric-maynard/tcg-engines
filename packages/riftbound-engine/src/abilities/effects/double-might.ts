// Effect handler: "double-might"
import type { CardId as CoreCardId } from "@tcg/core";
import type { RiftboundCardMeta } from "../../types";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, getTargetIds, getEffectiveMight, checkBecomesMighty } from "./_helpers";

export function handle_doubleMight(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  // rule-id: ven-142-166 — "double a unit's Might this turn": add the
  // unit's current effective Might to its turn-scoped mightModifier
  // (reset at Ending Step alongside other modify-might buffs).
  const targets = getTargetIds(effect, ctx);
  const dmTargets = targets.length === 0 ? [ctx.sourceCardId] : targets;
  for (const targetId of dmTargets) {
    const mightBefore = getEffectiveMight(targetId, ctx);
    const meta = ctx.cards.getCardMeta?.(targetId as CoreCardId) as
      | Partial<RiftboundCardMeta>
      | undefined;
    ctx.cards.updateCardMeta?.(
      targetId as CoreCardId,
      {
        mightModifier: (meta?.mightModifier ?? 0) + mightBefore,
      } as unknown as Record<string, unknown>,
    );
    checkBecomesMighty(targetId, mightBefore, ctx);
  }
}
