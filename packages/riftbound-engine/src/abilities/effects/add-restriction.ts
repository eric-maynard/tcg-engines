// Effect handler: "add-restriction"
import type { CardId as CoreCardId } from "@tcg/core";
import type { RiftboundCardMeta } from "../../types";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, getTargetIds } from "./_helpers";

export function handle_addRestriction(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  const { restriction } = effect as unknown as { restriction: string };
  if (!restriction) {
    return;
  }
  const targets = getTargetIds(effect, ctx);
  const restrictTargets = targets.length === 0 ? [ctx.sourceCardId] : targets;
  for (const targetId of restrictTargets) {
    const meta = ctx.cards.getCardMeta?.(targetId as CoreCardId) as
      | Partial<RiftboundCardMeta>
      | undefined;
    const existing = meta?.restrictions ?? [];
    if (!existing.includes(restriction)) {
      ctx.cards.updateCardMeta?.(
        targetId as CoreCardId,
        { restrictions: [...existing, restriction] } as unknown as Record<string, unknown>,
      );
    }
  }
}
