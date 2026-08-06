// Effect handler: "gain-control-of-spell"
import type { TargetDescriptor } from "../target-resolver";
import { resolveTarget } from "../target-resolver";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers } from "./_helpers";

/**
 * rule 355.6 / rule 424 (ogn-080-298 Mystic Reversal) — "Gain control of a
 * spell. You may make new choices for it": the chosen spell stays on the chain
 * but its chain item changes controller, so it resolves for the thief. With
 * `newChoices` the thief is then offered a re-choice of that spell's targets.
 */
export function handle_gainControlOfSpell(
  effect: ExecutableEffect,
  ctx: EffectContext,
  _h: EffectHelpers,
): void {
  const items = ctx.draft.interaction?.chain?.items;
  if (!items || items.length === 0) {
    return;
  }
  const boundId = ctx.boundTargets?.[0];
  const boundOnChain = boundId !== undefined && items.some((it) => it && it.cardId === boundId);
  let stolen: (typeof items)[number] | undefined;
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (!item || item.type !== "spell" || item.countered) continue;
    if (item.cardId === ctx.sourceCardId) continue;
    if (boundOnChain && item.cardId !== boundId) continue;
    stolen = item;
    break;
  }
  if (!stolen) {
    return;
  }
  (stolen as { controller: string }).controller = ctx.playerId;

  if (!(effect as { newChoices?: boolean }).newChoices || ctx.draft.pendingChoice) {
    return;
  }
  const stolenEffect = stolen.effect as { target?: TargetDescriptor } | undefined;
  const tgt = stolenEffect?.target;
  if (!tgt || typeof tgt !== "object") {
    return;
  }
  // The re-choice is made by the new controller, so "friendly"/"enemy" on the
  // stolen spell's descriptor is re-evaluated from their seat.
  const options = resolveTarget({ ...tgt, quantity: "all" } as TargetDescriptor, {
    cards: ctx.cards,
    draft: ctx.draft,
    playerId: ctx.playerId,
    sourceCardId: stolen.cardId,
    sourceZone: ctx.sourceZone,
    zones: ctx.zones,
  }) as string[];
  if (options.length === 0) {
    return;
  }
  ctx.draft.pendingChoice = {
    effect: stolen.effect,
    options,
    playerId: ctx.playerId,
    retargetChainItemId: stolen.id,
    sourceCardId: stolen.cardId,
    type: "choose-target",
  } as typeof ctx.draft.pendingChoice;
}
