// Effect handler: "detach"
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { detachEquipment } from "./_attachment";
import { type EffectHelpers, getTargetIds } from "./_helpers";

export function handle_detach(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  const detachTargets = getTargetIds(
    { ...effect, target: effect.equipment } as ExecutableEffect,
    ctx,
  );
  if (detachTargets[0]) {
    // rule 435: clear both sides of the attachment link.
    detachEquipment(ctx, detachTargets[0]);
  }
}
