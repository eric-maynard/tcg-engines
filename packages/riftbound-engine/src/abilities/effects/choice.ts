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
    // rule 355.10.e (ogn-071-298): "each other player chooses" — the opponent
    // picks the mode as the spell resolves, but it still resolves for "you".
    // rule-id: ogn-033-298 (rule 355.10.e) — "Deal 6 to it unless its
    // controller has you draw 2": the chosen unit's CONTROLLER decides.
    const targetController = (): string | undefined => {
      const targetId = ctx.boundTargets?.[0] ?? h.getTargetIds(effect, ctx)[0];
      if (!targetId) {
        return undefined;
      }
      const id = targetId as Parameters<typeof ctx.cards.getCardOwner>[0];
      return ctx.cards.getCardController?.(id) ?? ctx.cards.getCardOwner(id);
    };
    const anyOpponent = (): string =>
      Object.keys(ctx.draft.players).find((p) => p !== ctx.playerId) ?? ctx.playerId;
    const chooser =
      effect.player === "opponent"
        ? anyOpponent()
        : (effect.player === "target-controller"
          ? (targetController() ?? anyOpponent())
          : ctx.playerId);
    ctx.draft.pendingChoice = {
      effect,
      options: options.map((_, i) => i),
      playerId: chooser,
      sourceCardId: ctx.sourceCardId,
      type: "choose-mode",
      ...(chooser !== ctx.playerId ? { controllerId: ctx.playerId } : {}),
      ...(ctx.boundTargets ? { boundTargets: ctx.boundTargets } : {}),
    };
    return;
  }
  if (options[0]?.effect) {
    executeEffect(options[0].effect, ctx);
  }
}
