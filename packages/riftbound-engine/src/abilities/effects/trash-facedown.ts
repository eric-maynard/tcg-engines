// Effect handler: "trash-facedown"
import type { CardId as CoreCardId, ZoneId as CoreZoneId } from "@tcg/core";
import type { RiftboundCardMeta } from "../../types";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, getTargetIds, recordPublicReveal } from "./_helpers";

/**
 * rule 107.3.b.2 / 421.4 — the zone's controller trashes the excess card from
 * an over-full Facedown Zone. It leaves the Facedown Zone face UP: a card in
 * the trash is public information, so its `hidden` marks are cleared.
 */
export function handle_trashFacedown(
  effect: ExecutableEffect,
  ctx: EffectContext,
  _h: EffectHelpers,
): void {
  for (const targetId of getTargetIds(effect, ctx)) {
    // rule 421.4 — its owner reveals it to all players as it leaves the zone.
    recordPublicReveal(ctx, ctx.cards.getCardOwner?.(targetId as CoreCardId) ?? "", [targetId]);
    ctx.zones.moveCard({
      cardId: targetId as CoreCardId,
      targetZoneId: "trash" as CoreZoneId,
    });
    ctx.cards.updateCardMeta?.(targetId as CoreCardId, {
      hidden: false,
      hiddenAt: undefined,
    } as Partial<RiftboundCardMeta> as unknown as Record<string, unknown>);
  }
}
