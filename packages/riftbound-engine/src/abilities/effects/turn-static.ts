// Effect handler: "turn-static"
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import type { EffectHelpers } from "./_helpers";

/**
 * rule 364.3 (ogn-053-298): install a continuous, static-like effect for the
 * rest of the turn. `recalculateStaticEffects` applies it on every pass with
 * the caster as controller; the Ending Step clears it (rule 517.2.b).
 */
export function handle_turnStatic(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  const inner = (effect as { effect?: unknown }).effect;
  if (!inner || typeof inner !== "object") {
    return;
  }
  const list = (ctx.draft.turnStatics ?? []) as NonNullable<typeof ctx.draft.turnStatics>;
  list.push({ controllerId: ctx.playerId, effect: inner, sourceCardId: ctx.sourceCardId });
  ctx.draft.turnStatics = list;
}
