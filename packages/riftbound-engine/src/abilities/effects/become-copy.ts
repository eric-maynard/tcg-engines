// Effect handler: "become-copy"
import { getGlobalCardRegistry } from "../../operations/card-lookup";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import type { EffectHelpers } from "./_helpers";

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
  if (!holderId || !sourceId || holderId === sourceId) {
    return;
  }
  getGlobalCardRegistry().becomeCopyOf(holderId, sourceId);
}
