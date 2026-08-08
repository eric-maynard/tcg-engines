// Effect handler: "gain-control-of-spell"
import type { TargetDescriptor } from "../target-resolver";
import { resolveTarget } from "../target-resolver";
import {
  findSequenceLeadTarget,
  type SpellEffectTargetShape,
} from "../../game-definition/moves/play/targeting";
import { collectChoiceNodes } from "../../game-definition/moves/play/play-time-modes";
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

  if (!(effect as { newChoices?: boolean }).newChoices || ctx.draft.pendingChoice) {
    return;
  }
  // rule 752.1 (ven-152-166) — MODES are re-choosable too: a stolen modal spell
  // offers its whole menu to the new controller (declining keeps the locked
  // mode and targets), and picking one re-asks that mode's target from their
  // seat, so "friendly"/"enemy" flip with the item's controller.
  const menu = collectChoiceNodes(stolen.effect).find(
    (n) => typeof (n as { _chosenIndex?: number })._chosenIndex === "number",
  ) as { options?: unknown[] } | undefined;
  if (menu && Array.isArray(menu.options) && menu.options.length > 1) {
    ctx.draft.pendingChoice = {
      bindToChainItemId: stolen.id,
      effect: menu,
      optional: true,
      options: menu.options.map((_, i) => i),
      playerId: ctx.playerId,
      reChoose: true,
      sourceCardId: stolen.cardId,
      type: "choose-mode",
    } as typeof ctx.draft.pendingChoice;
    return;
  }
  const stolenEffect = stolen.effect as { target?: TargetDescriptor } | undefined;
  // rule-id: unl-073-219 — "Deal 3 to an enemy unit. When it dies this turn …"
  // is one sequence sharing a single caster-chosen slot; the re-choice offer
  // must find that slot as well as a plain top-level target.
  const tgt =
    stolenEffect?.target ??
    (findSequenceLeadTarget(stolen.effect as SpellEffectTargetShape) as TargetDescriptor | undefined);
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
    // "You MAY make new choices" — declining keeps the original targets.
    optional: true,
    options,
    playerId: ctx.playerId,
    retargetChainItemId: stolen.id,
    sourceCardId: stolen.cardId,
    type: "choose-target",
  } as typeof ctx.draft.pendingChoice;
}
