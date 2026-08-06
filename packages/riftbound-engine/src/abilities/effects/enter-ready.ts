// Effect handler: "enter-ready"
import type { CardId as CoreCardId } from "@tcg/core";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, getTargetIds } from "./_helpers";

export function handle_enterReady(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  const targets = getTargetIds(effect, ctx);
  const enterTargets = targets.length === 0 ? [ctx.sourceCardId] : targets;
  for (const targetId of enterTargets) {
    ctx.counters.setFlag(targetId as CoreCardId, "exhausted", false);
  }
}
