// Effect handler: "buff"
import type { CardId as CoreCardId } from "@tcg/core";
import type { RiftboundCardMeta } from "../../types";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, getTargetIds, getEffectiveMight, checkBecomesMighty } from "./_helpers";

export function handle_buff(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  const targets = getTargetIds(effect, ctx);
  const buffTargets = targets.length === 0 ? [ctx.sourceCardId] : targets;
  for (const targetId of buffTargets) {
    // Enforce max 1 buff per unit (rule)
    const meta = ctx.cards.getCardMeta?.(targetId as CoreCardId) as
      | Partial<RiftboundCardMeta>
      | undefined;
    if (meta?.buffed) {
      continue; // Already buffed — skip
    }
    const mightBefore = getEffectiveMight(targetId, ctx);
    ctx.counters.setFlag(targetId as CoreCardId, "buffed", true);
    // rule-id: unl-043-219 — setFlag writes meta.__flags.buffed but every Might
    // reader (getEffectiveMight, static-abilities, cards.ts) checks top-level
    // meta.buffed; mirror it there so the +1 Might buff is actually observed.
    ctx.cards.updateCardMeta?.(
      targetId as CoreCardId,
      { buffed: true } as unknown as Record<string, unknown>,
    );
    checkBecomesMighty(targetId, mightBefore, ctx);
  }
}
