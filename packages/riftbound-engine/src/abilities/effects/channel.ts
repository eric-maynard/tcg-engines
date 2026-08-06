// Effect handler: "channel"
import type { PlayerId as CorePlayerId, ZoneId as CoreZoneId } from "@tcg/core";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, resolveAmount } from "./_helpers";

export function handle_channel(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  const count = resolveAmount(effect.amount ?? 1, ctx);
  for (let i = 0; i < count; i++) {
    const runes = ctx.zones.getCardsInZone(
      "runeDeck" as CoreZoneId,
      ctx.playerId as CorePlayerId,
    );
    if (runes[0]) {
      ctx.zones.moveCard({
        cardId: runes[0],
        targetZoneId: "base" as CoreZoneId,
      });
    }
  }
}
