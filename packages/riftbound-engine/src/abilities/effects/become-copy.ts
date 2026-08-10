// Effect handler: "become-copy"
import { getGlobalCardRegistry } from "../../operations/card-lookup";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import type { EffectHelpers } from "./_helpers";
import { withMightWatch } from "./_helpers";

/**
 * rule 477.1.b / 477.2 (ven-137-166 Shady Spectacles): "the equipped unit
 * becomes a copy of that unit". The copy replaces the holder's printed traits
 * only — granted keywords (477.2, e.g. a Reflection's Temporary) are applied
 * in a later layer and are untouched by `becomeCopyOf`.
 */
export function handle_become_copy(
  effect: ExecutableEffect,
  ctx: EffectContext,
  _h: EffectHelpers,
): void {
  const holderId = (effect as { holderId?: string }).holderId;
  const sourceId = (ctx.boundTargets ?? [])[0];
  // rule 480.3 — the copy is timestamped per applying effect (the Equipment),
  // so two Spectacles on one unit are two independent layers.
  const layerKey = (effect as { layerKey?: string }).layerKey ?? ctx.sourceCardId;
  if (!holderId || !sourceId || holderId === sourceId) {
    return;
  }
  // rule 709 / 710 — copying a bigger unit's printed Might is a Might change
  // like any other, so it can be the moment the holder becomes [Mighty].
  withMightWatch([holderId], ctx, () => {
    getGlobalCardRegistry().becomeCopyOf(holderId, sourceId, layerKey);
  });
}
