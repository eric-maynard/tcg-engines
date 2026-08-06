// Effect handler: "return-to-hand"
import type { CardId as CoreCardId, ZoneId as CoreZoneId } from "@tcg/core";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, getTargetIds } from "./_helpers";

export function handle_returnToHand(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  const targets = getTargetIds(effect, ctx);
  // Only fall back to the source card when the ability has NO target
  // descriptor (i.e. "return me to hand"). A targeted return that finds
  // no legal targets fizzles — otherwise Windsinger's on-play "return an
  // enemy unit" bounces itself when the board is empty.
  const hasTargetSpec = "target" in effect && effect.target != null;
  if (targets.length === 0 && !hasTargetSpec) {
    ctx.zones.moveCard({
      cardId: ctx.sourceCardId as CoreCardId,
      targetZoneId: "hand" as CoreZoneId,
    });
  } else {
    for (const targetId of targets) {
      ctx.zones.moveCard({
        cardId: targetId as CoreCardId,
        targetZoneId: "hand" as CoreZoneId,
      });
    }
  }
}
