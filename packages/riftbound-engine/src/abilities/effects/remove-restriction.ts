// Effect handler: "remove-restriction"
import type { CardId as CoreCardId } from "@tcg/core";
import type { RiftboundCardMeta } from "../../types";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, getTargetIds } from "./_helpers";

export function handle_removeRestriction(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  const { restriction } = effect as unknown as { restriction: string };
  if (!restriction) {
    return;
  }
  const targets = getTargetIds(effect, ctx);
  for (const targetId of targets) {
    const meta = ctx.cards.getCardMeta?.(targetId as CoreCardId) as
      | Partial<RiftboundCardMeta>
      | undefined;
    const existing = meta?.restrictions ?? [];
    ctx.cards.updateCardMeta?.(
      targetId as CoreCardId,
      {
        restrictions: existing.filter((r) => r !== restriction),
      } as unknown as Record<string, unknown>,
    );
  }
}
