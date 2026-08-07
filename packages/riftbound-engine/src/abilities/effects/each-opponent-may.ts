// Effect handler: "each-opponent-may"
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import type { EffectHelpers } from "./_helpers";

/**
 * rule-id: sfd-081-221 (rule 115 / 355.13) — "each opponent may X. For each
 * opponent who did, you Y." Every opponent answers for themselves, in seat
 * order, one prompt at a time: the accepted effect runs with THAT opponent as
 * its controller, and the source's controller gets `bonus` for each acceptance.
 *
 * The queue of remaining opponents rides on the effect itself (`remaining`),
 * so the suspended `confirm` prompt can resume the loop through its `then`.
 */
export function handle_eachOpponentMay(
  effect: ExecutableEffect,
  ctx: EffectContext,
  _h: EffectHelpers,
): void {
  if (ctx.draft.pendingChoice) {
    return;
  }
  const spec = effect as ExecutableEffect & {
    effect?: ExecutableEffect;
    bonus?: ExecutableEffect;
    remaining?: readonly string[];
    controllerId?: string;
  };
  // `then` re-enters with the opponent as ctx.playerId, so the source's
  // controller is carried explicitly once the loop has started.
  const controllerId = spec.controllerId ?? ctx.playerId;
  const remaining =
    spec.remaining ?? Object.keys(ctx.draft.players).filter((p) => p !== controllerId);
  if (remaining.length === 0 || !spec.effect) {
    return;
  }
  const [next, ...rest] = remaining;
  // The opponent's own copy resolves for them; the controller's bonus copy
  // names its owner explicitly (the prompt resolves with the opponent as the
  // effect's controller).
  const onAccept: ExecutableEffect = spec.bonus
    ? ({
        effects: [spec.effect, { ...spec.bonus, ownerId: controllerId }],
        type: "sequence",
      } as unknown as ExecutableEffect)
    : spec.effect;
  ctx.draft.pendingChoice = {
    effect: onAccept,
    playerId: next,
    sourceCardId: ctx.sourceCardId,
    then: { ...spec, controllerId, remaining: rest },
    type: "confirm",
  } as typeof ctx.draft.pendingChoice;
}
