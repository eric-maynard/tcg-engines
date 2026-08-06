// Effect handler: "recall"
import type { CardId as CoreCardId, ZoneId as CoreZoneId } from "@tcg/core";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, getTargetIds } from "./_helpers";

export function handle_recall(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  const targets = getTargetIds(effect, ctx);
  if (targets.length === 0) {
    ctx.zones.moveCard({
      cardId: ctx.sourceCardId as CoreCardId,
      targetZoneId: "base" as CoreZoneId,
    });
  } else {
    for (const targetId of targets) {
      ctx.zones.moveCard({
        cardId: targetId as CoreCardId,
        targetZoneId: "base" as CoreZoneId,
      });
    }
  }
}
