// Effect handler: "choice"
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers } from "./_helpers";

export function handle_choice(effect: ExecutableEffect, ctx: EffectContext, h: EffectHelpers): void {
  const executeEffect = h.executeEffect;
  const { options } = effect as unknown as { options?: { effect: ExecutableEffect }[] };
  if (!options || options.length === 0) {
    return;
  }
  // rule-id: sfd-091-221 (rule 355.8) — "draw 1 or buff me": the controller
  // picks which mode resolves. With ≥2 modes and no other prompt in flight,
  // pause via a `choose-mode` pending choice; `resolvePendingChoice` runs the
  // picked option. A single mode (or a nested prompt) resolves inline.
  if (options.length >= 2 && !ctx.draft.pendingChoice) {
    ctx.draft.pendingChoice = {
      effect,
      options: options.map((_, i) => i),
      playerId: ctx.playerId,
      sourceCardId: ctx.sourceCardId,
      type: "choose-mode",
      ...(ctx.boundTargets ? { boundTargets: ctx.boundTargets } : {}),
    };
    return;
  }
  if (options[0]?.effect) {
    executeEffect(options[0].effect, ctx);
  }
}
