// Effect handler: "kill"
import type { CardId as CoreCardId, ZoneId as CoreZoneId } from "@tcg/core";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, getTargetIds } from "./_helpers";

export function handle_kill(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  const targets = getTargetIds(effect, ctx);
  for (const targetId of targets) {
    ctx.zones.moveCard({
      cardId: targetId as CoreCardId,
      targetZoneId: "trash" as CoreZoneId,
    });
  }
}
