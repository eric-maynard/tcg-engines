// Effect handler: "gain-control-of-spell"
import { reseatPriorityAfterResolution } from "../../chain/chain-state";
import type { RiftboundGameState } from "../../types";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { offerNewChoices } from "../new-choices";
import { type EffectHelpers } from "./_helpers";

/**
 * rule 355.6 / rule 424 (ogn-080-298 Mystic Reversal, ven-152-166 Rebuttal) —
 * "Gain control of a spell[. You may make new choices for it]": the chosen
 * spell stays on the chain but its chain item changes controller, so it
 * resolves for the thief ("friendly" / "enemy" then read from THEIR seat —
 * 359.3.e.4). With `newChoices` the thief is offered the item's NEW CHOICES
 * dialog (rules 751–755, `abilities/new-choices.ts`): every finalization
 * choice — modes, targets, a Might-reference source and its split set, move
 * destinations — may be individually kept or remade from their perspective.
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
  // The play-time pick names the chain item by card id, or by chain-item id
  // when two items share a card (rule 425.1).
  const boundOnChain =
    boundId !== undefined && items.some((it) => it && (it.cardId === boundId || it.id === boundId));
  let stolen: (typeof items)[number] | undefined;
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (!item || item.type !== "spell" || item.countered) continue;
    if (item.cardId === ctx.sourceCardId) continue;
    if (boundOnChain && item.cardId !== boundId && item.id !== boundId) continue;
    stolen = item;
    break;
  }
  if (!stolen) {
    return;
  }
  // rule 359.3.e.2 / 359.3.e.4 — remember who chose the existing targets so
  // resolution re-checks relative descriptors ("an enemy unit") against the
  // new controller instead of the original caster.
  const prevController = stolen.controller;
  if (prevController !== ctx.playerId) {
    (stolen as { originalController?: string }).originalController ??= prevController;
  }
  (stolen as { controller: string }).controller = ctx.playerId;
  // rule 340.4 — once this resolution finishes, Priority belongs to the
  // controller of the newest item still on the Chain: read AFTER the control
  // change (the resolver seated it beforehand, with the former controller).
  if (ctx.draft.interaction) {
    (ctx.draft as { interaction: RiftboundGameState["interaction"] }).interaction = reseatPriorityAfterResolution(
      ctx.draft.interaction,
    );
  }

  if (!(effect as { newChoices?: boolean }).newChoices || ctx.draft.pendingChoice) {
    return;
  }
  // "You MAY make new choices for it" — every slot is keepable.
  offerNewChoices(ctx.draft, stolen.id, ctx.playerId, ctx, { grantedBy: ctx.sourceCardId, optional: true });
}
