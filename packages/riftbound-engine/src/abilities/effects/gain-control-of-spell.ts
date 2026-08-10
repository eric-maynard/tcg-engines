// Effect handler: "gain-control-of-spell"
import type { TargetDescriptor } from "../target-resolver";
import { resolveTarget } from "../target-resolver";
import {
  collectSequenceTargetSlots,
  findAmountReferenceTarget,
  findSequenceLeadTarget,
  findSplitDamageEffect,
  hiddenChoiceIsPulledIn,
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
  // rule 752 / 752.1 with rule 811.1.d.2 (ogn-053-298 hidden Stand United) — the
  // re-choosable choices ARE the finalization choices, so a from-Hidden play's
  // "only at that battlefield" restriction rides along to the new controller:
  // an object elsewhere is an illegal new choice (753.1), and when none remain
  // no new choice may be made at all (753.2) — the old target is simply kept.
  const trigEvt = stolen.triggerEvent as { cardId?: string; fromHiddenAt?: string } | undefined;
  const stolenHiddenZone =
    typeof trigEvt?.fromHiddenAt === "string" &&
    (trigEvt.cardId === undefined || trigEvt.cardId === stolen.cardId)
      ? `battlefield-${trigEvt.fromHiddenAt}`
      : undefined;
  // rule 811.1.d.2.a — except when the effect pulls its chosen object in.
  const hiddenZone =
    stolenHiddenZone !== undefined &&
    !hiddenChoiceIsPulledIn(stolen.effect as SpellEffectTargetShape)
      ? stolenHiddenZone
      : undefined;
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
  // rule 355.14.a/b/c + 752.1 (unl-192-219 Alpha Strike) — a split-damage spell
  // locks TWO kinds of finalization choice: the Might-reference SOURCE ("Choose
  // a friendly unit") and the SET of split recipients. Both are re-makeable, so
  // the offer opens on the source — resolved from the new controller's seat —
  // and the recipient set is asked straight after it (pending-choice.ts). rule
  // 355.14.e keeps the per-target amounts out of it: they are decided at
  // resolution, never here.
  const shape = stolen.effect as SpellEffectTargetShape | undefined;
  const refTgt = findAmountReferenceTarget(shape);
  const splitEffect = refTgt !== undefined ? findSplitDamageEffect(shape) : undefined;
  const splitDesc =
    splitEffect?.target !== undefined && typeof splitEffect.target !== "string"
      ? splitEffect.target
      : undefined;
  if (refTgt !== undefined && typeof refTgt !== "string" && splitDesc !== undefined) {
    const sourceOptions = resolveTarget({ ...refTgt, quantity: "all" } as TargetDescriptor, {
      cards: ctx.cards,
      draft: ctx.draft,
      ...(hiddenZone ? { hiddenZone } : {}),
      playerId: ctx.playerId,
      sourceCardId: stolen.cardId,
      sourceZone: ctx.sourceZone,
      zones: ctx.zones,
    }) as string[];
    if (sourceOptions.length === 0) {
      return;
    }
    ctx.draft.pendingChoice = {
      effect: stolen.effect,
      optional: true,
      options: sourceOptions,
      playerId: ctx.playerId,
      retargetChainItemId: stolen.id,
      retargetSplitTarget: splitDesc,
      sourceCardId: stolen.cardId,
      type: "choose-target",
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
    // rule 752.1 / 753 (rule-id: unl-128-219 Star-Crossed) — a spell with
    // SEVERAL caster-chosen slots ("Return a friendly unit and an enemy unit")
    // is re-chosen as one group, so any legal subset of the slots may be
    // remade in a single answer.
    raiseMultiSlotReChoice(stolen, ctx, hiddenZone);
    return;
  }
  // The re-choice is made by the new controller, so "friendly"/"enemy" on the
  // stolen spell's descriptor is re-evaluated from their seat.
  const options = resolveTarget({ ...tgt, quantity: "all" } as TargetDescriptor, {
    cards: ctx.cards,
    draft: ctx.draft,
    ...(hiddenZone ? { hiddenZone } : {}),
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

/**
 * rule 752.1 / 753 / 753.1 (rule-id: unl-128-219 Star-Crossed) — a stolen spell
 * that locked SEVERAL caster-chosen slots ("Return a friendly unit and an enemy
 * unit …") offers them as ONE group re-choice from the new controller's seat:
 * every slot's candidates are pooled, and an answer is legal only when its cards
 * match the slots one-to-one (`assignToSlots`). Any subset may be remade — a
 * kept card is simply named again — and an empty answer keeps every choice.
 * rule 755: a [Deflect] surcharge such a new choice incurs is ignored, so the
 * candidates are not filtered by what the chooser could pay.
 */
function raiseMultiSlotReChoice(
  stolen: { id: string; cardId: string; effect?: unknown },
  ctx: EffectContext,
  hiddenZone: string | undefined,
): void {
  const slots = collectSequenceTargetSlots(stolen.effect as SpellEffectTargetShape);
  if (!slots || slots.length < 2) {
    return;
  }
  const slotOptions: string[][] = [];
  for (const slot of slots) {
    const options = resolveTarget({ ...slot, quantity: "all" } as TargetDescriptor, {
      cards: ctx.cards,
      draft: ctx.draft,
      ...(hiddenZone ? { hiddenZone } : {}),
      playerId: ctx.playerId,
      sourceCardId: stolen.cardId,
      sourceZone: ctx.sourceZone,
      zones: ctx.zones,
    }) as string[];
    // rule 753.1 — with a slot that nothing could legally fill there is no
    // legal group to offer, so the locked choices simply stand.
    if (options.length === 0) {
      return;
    }
    slotOptions.push(options);
  }
  const pool = [...new Set(slotOptions.flat())];
  ctx.draft.pendingChoice = {
    max: slots.length,
    // "You MAY make new choices" — an empty answer keeps the originals.
    min: 0,
    options: pool.map((id) => ({ cardId: id, key: id })),
    playerId: ctx.playerId,
    prompt: "Choose new targets for the spell you gained control of",
    // rule 359.3.d / 752.1 — this prompt belongs to the STOLEN item, not to the
    // resolution that handed it over, so the thieving spell settles right away.
    reChoose: true,
    resume: { itemId: stolen.id, kind: "retarget-slots" },
    semantics: "target",
    slotOptions,
    sourceCardId: stolen.cardId,
    type: "pick-many",
  } as typeof ctx.draft.pendingChoice;
}
