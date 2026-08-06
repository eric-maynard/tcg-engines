// Effect handler: "detach"
import type { CardId as CoreCardId } from "@tcg/core";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, getTargetIds } from "./_helpers";

export function handle_detach(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  const detachTargets = getTargetIds(
    { ...effect, target: effect.equipment } as ExecutableEffect,
    ctx,
  );
  if (detachTargets[0]) {
    ctx.counters.setFlag(detachTargets[0] as CoreCardId, "attachedTo", false);
  }
}
