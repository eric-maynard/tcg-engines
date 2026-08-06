// Effect handler: "attach"
import type { CardId as CoreCardId } from "@tcg/core";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, getTargetIds } from "./_helpers";

export function handle_attach(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  const equipTargets = getTargetIds(
    { ...effect, target: effect.equipment } as ExecutableEffect,
    ctx,
  );
  const unitTargets = getTargetIds({ ...effect, target: effect.to } as ExecutableEffect, ctx);
  if (equipTargets[0] && unitTargets[0]) {
    ctx.counters.setFlag(equipTargets[0] as CoreCardId, "attachedTo", true);
  }
}
