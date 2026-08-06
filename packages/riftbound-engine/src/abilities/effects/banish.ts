// Effect handler: "banish"
import type { CardId as CoreCardId, ZoneId as CoreZoneId } from "@tcg/core";
import type { RiftboundCardMeta } from "../../types";
import { getGlobalCardRegistry } from "../../operations/card-lookup";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, getTargetIds } from "./_helpers";

export function handle_banish(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  const targets = getTargetIds(effect, ctx);
  // If the source card is flagged to track exiled cards (The Zero Drive),
  // Record each banished card's instance ID in the source's
  // `exiledByThis` meta. The state-based cleanup will return those cards
  // When the source later leaves the board.
  const banishRegistry = getGlobalCardRegistry();
  const banishSourceDef = banishRegistry.get(ctx.sourceCardId);
  if (banishSourceDef?.tracksExiledCards === true && targets.length > 0) {
    const sourceMeta = ctx.cards.getCardMeta?.(ctx.sourceCardId as CoreCardId) as
      | Partial<RiftboundCardMeta>
      | undefined;
    const existing = sourceMeta?.exiledByThis ?? [];
    ctx.cards.updateCardMeta?.(
      ctx.sourceCardId as CoreCardId,
      {
        exiledByThis: [...existing, ...(targets as string[])],
      } as unknown as Record<string, unknown>,
    );
  }
  for (const targetId of targets) {
    ctx.zones.moveCard({
      cardId: targetId as CoreCardId,
      targetZoneId: "banishment" as CoreZoneId,
    });
  }
}
