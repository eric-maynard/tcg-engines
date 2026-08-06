// Effect handler: "exhaust"
import type { CardId as CoreCardId } from "@tcg/core";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, getTargetIds } from "./_helpers";

export function handle_exhaust(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  const targets = getTargetIds(effect, ctx);
  if (targets.length === 0) {
    ctx.counters.setFlag(ctx.sourceCardId as CoreCardId, "exhausted", true);
  } else {
    for (const targetId of targets) {
      ctx.counters.setFlag(targetId as CoreCardId, "exhausted", true);
    }
  }
}
