// Effect handler: "for-each"
import type { TargetDescriptor } from "../target-resolver";
import { resolveTarget } from "../target-resolver";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers } from "./_helpers";

export function handle_forEach(effect: ExecutableEffect, ctx: EffectContext, h: EffectHelpers): void {
  const executeEffect = h.executeEffect;
  // Repeat effect for each matching target
  const forEachTarget = (effect as unknown as { target?: TargetDescriptor }).target;
  const forEachEffect = (effect as unknown as { effect?: ExecutableEffect }).effect;
  if (forEachTarget && forEachEffect) {
    // rule-id: sfd-198-221 — "for each Equipment you control" counts EVERY
    // match, so the descriptor is resolved as an exhaustive pool; the default
    // quantity of 1 would repeat the effect only once.
    const targets = resolveTarget({ ...forEachTarget, quantity: "all" }, {
      cards: ctx.cards,
      draft: ctx.draft,
      playerId: ctx.playerId,
      sourceCardId: ctx.sourceCardId,
      sourceZone: ctx.sourceZone,
      zones: ctx.zones,
    });
    for (const targetId of targets) {
      // Execute the effect with target overridden to this specific card
      executeEffect(
        { ...forEachEffect, target: { type: "self" } },
        {
          ...ctx,
          sourceCardId: targetId,
        },
      );
    }
  }
}
