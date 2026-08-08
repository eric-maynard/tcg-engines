// Effect handler: "recall"
import type { CardId as CoreCardId, ZoneId as CoreZoneId } from "@tcg/core";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, getTargetIds } from "./_helpers";

/**
 * A descriptor that can only ever name the effect's own source: "recall this",
 * "recall it" on a trigger, or no descriptor at all. Only these may fall back to
 * the source card when resolution yields nothing.
 */
function namesOwnSource(target: unknown): boolean {
  if (target === undefined || target === "self") {
    return true;
  }
  if (typeof target === "object" && target !== null) {
    const type = (target as { type?: string }).type;
    return type === "self" || type === "trigger-source";
  }
  return false;
}

export function handle_recall(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  const targets = getTargetIds(effect, ctx);
  // rule 359.3.e.4: a chosen target that is no longer legal on resolution makes
  // that instruction do nothing. Recalling the SOURCE instead would drag the
  // resolving card itself onto the board (unl-140-219 Conscription).
  if (targets.length === 0 && !namesOwnSource(effect.target)) {
    return;
  }
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
