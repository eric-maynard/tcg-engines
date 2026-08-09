/**
 * Trigger finalization dialog (rules 337.1, 383.3.a–e, 402–404).
 *
 * `fireTriggers` appends triggered abilities to the Chain as PENDING items
 * (`status: "pending"`). Before anyone receives Priority (rule 337.4) the
 * controller of the oldest Pending Item completes the steps of playing it:
 *
 *   1. rule 402.1 / 383.3.a — a leading "you may": perform it? Declining removes
 *      the item; it is considered to have not triggered (383.3.a.2 / 383.3.e.2).
 *      A base cost ("[pay] to …", rule 383.3.b / 404) rides on the same prompt
 *      and is paid on accept; declining likewise removes the item (404.2).
 *  1b. rule 402.2 / 404.1 — the Game Objects such a cost names ("kill a unit
 *      you control here to …", "recycle another friendly unit to …") are named
 *      (forced pick) and paid at once; they ride on the item as `paidObjects`.
 *   2. rule 402.2 — every caster-chosen Game Object / mode is chosen now and
 *      bound onto the item (`targets`, `_chosenIndex`). No legal option ⇒ the
 *      item is removed (402.4). Copies of the same trigger (Karthus doubling a
 *      [Deathknell], rule 808.2) are separate items and choose independently.
 *   3. the item becomes `finalized`; resolution uses the bound choices and a
 *      target that became illegal meanwhile makes its instruction fizzle
 *      (rule 359.3.e.5) — it is never re-chosen.
 *
 * `finalizePendingItems` is re-entrant: it runs whenever no prompt is open —
 * at the end of every move reducer (see `withTriggerFinalization`) and, for
 * triggers fired outside a move (flow hooks), straight from `fireTriggers` —
 * so each answered prompt naturally leads to the next question.
 */

import type { CardId as CoreCardId } from "@tcg/core";
import type { ChainItem } from "../chain/chain-state";
import { removeChainItem } from "../chain/chain-state";
import type { PostMoveCleanupContext } from "../cleanup/post-move-cleanup";
import { cleanupAndFireDeaths } from "../cleanup/post-move-cleanup";
import { continueEffectPlay, isPendingPlayItem } from "../game-definition/moves/play/play-pipeline";
import { buildEffectContext } from "../game-definition/moves/chain/effect-context";
import { executeResolvedItem, optInIsPerformable } from "../game-definition/moves/chain/resolve";
import {
  killCostCandidates,
  recycleCostCandidates,
  returnToHandCostCandidates,
} from "../game-definition/moves/pending-choice";
import { raiseChainDestinationChoices } from "../game-definition/moves/play/play-time-destinations";
import { raisePlayTimeModeChoice } from "../game-definition/moves/play/play-time-modes";
import { continueRevealSlotLock, isSinglePickSlot } from "../game-definition/moves/play/reveal-target-lock";
import {
  collectSequenceTargetSlots,
  findSequenceLeadTarget,
  type SpellEffectTargetShape,
} from "../game-definition/moves/play/targeting";
import { getGlobalCardRegistry } from "../operations/card-lookup";
import { type LeaveBoardContext, type LKISnapshot, snapshotLKI } from "../operations/leave-board";
import type { RiftboundGameState } from "../types";
import { executeEffect, type ExecutableEffect } from "./effect-executor";
import type { TargetDescriptor } from "./target-resolver";
import { resolveTarget } from "./target-resolver";
import { fireTriggers } from "./trigger-runner";

/** The slice of a move / flow context the dialog needs. */
export interface FinalizationContext {
  // biome-ignore lint/suspicious/noExplicitAny: engine move context is framework-typed
  readonly cards: any;
  // biome-ignore lint/suspicious/noExplicitAny: engine move context is framework-typed
  readonly zones: any;
  // biome-ignore lint/suspicious/noExplicitAny: engine move context is framework-typed
  readonly counters?: any;
}

/**
 * The single target a triggered ability's controller chooses ("deal 4 to an
 * enemy unit"). `undefined` for fixed referents (self, "it", a player, a
 * battlefield), for mass effects (`quantity: "all"`), for the multi-pick
 * shapes ("any number of", "up to N", split damage) and for effects that
 * gather their own candidates from a private zone.
 */
export function casterChosenTarget(effect: unknown): TargetDescriptor | undefined {
  if (typeof effect !== "object" || effect === null) {
    return undefined;
  }
  const e = effect as {
    type?: string;
    target?: unknown;
    split?: boolean;
    from?: unknown;
    player?: unknown;
  };
  if (e.type === "play" || (e.type === "damage" && e.split === true)) {
    return undefined;
  }
  // rule 422.1.a (unl-174-219) — "each opponent must kill one of THEIR units"
  // is a per-player instruction: each chooser is asked about their own cards by
  // the effect handler, so there is no single caster-chosen Game Object here.
  if (e.player === "each" || e.player === "each-other") {
    return undefined;
  }
  const target = e.target;
  if (typeof target !== "object" || target === null) {
    return undefined;
  }
  const t = target as { type?: unknown; quantity?: unknown; controller?: unknown };
  // rule 355.10.f (unl-170-219) — "the defender must kill one of their units
  // here": an instruction another player MUST perform is not a target
  // (355.10.e). Nothing is chosen while the item is finalized; that player
  // picks among their own cards as the effect resolves (`effects/kill.ts`).
  if (e.type === "kill" && e.player === "opponent" && t.controller === "enemy") {
    return undefined;
  }
  // rule 416.6 (ogn-287-298) — "recycle one of your runes" does NOT choose
  // anything: nothing is named while the item is finalized, so no rune is
  // locked in and none can be "removed" from under the ability (416.4); the
  // rune is picked out of the pool as the effect resolves (`effects/recycle.ts`).
  if (e.type === "recycle" && t.type === "rune" && t.controller === "friendly") {
    return undefined;
  }
  if (typeof t.type !== "string") {
    return undefined;
  }
  if (
    t.type === "self" ||
    t.type === "trigger-source" ||
    t.type === "player" ||
    t.type === "battlefield"
  ) {
    return undefined;
  }
  if (t.quantity !== undefined && t.quantity !== 1) {
    return undefined;
  }
  return target as TargetDescriptor;
}

const noop = (): void => {};

/** Adapt a move / flow context to the shape `executeResolvedItem` reads. */
function toResolveContext(ctx: FinalizationContext): Parameters<typeof buildEffectContext>[3] {
  const counters = ctx.counters ?? {};
  return {
    cards: {
      ...ctx.cards,
      getCardMeta: ctx.cards.getCardMeta,
      getCardOwner: ctx.cards.getCardOwner ?? (() => undefined),
      updateCardMeta: ctx.cards.updateCardMeta ?? noop,
    },
    counters: {
      ...counters,
      addCounter: counters.addCounter ?? noop,
      clearCounter: counters.clearCounter ?? noop,
      removeCounter: counters.removeCounter ?? noop,
      setFlag: counters.setFlag ?? noop,
    },
    zones: {
      ...ctx.zones,
      getCardZone: ctx.zones.getCardZone ?? (() => undefined),
    },
  } as Parameters<typeof buildEffectContext>[3];
}

function chainItems(draft: RiftboundGameState): ChainItem[] | undefined {
  return draft.interaction?.chain?.items as ChainItem[] | undefined;
}

function patchItem(draft: RiftboundGameState, itemId: string, patch: Partial<ChainItem>): void {
  const items = chainItems(draft);
  const idx = items?.findIndex((it) => it.id === itemId) ?? -1;
  if (!items || idx < 0) {
    return;
  }
  items[idx] = { ...(items[idx] as ChainItem), ...patch };
}

/**
 * rule 402.4 / 404.2 / 383.3.a.2 — take a Pending Item off the Chain without it
 * ever becoming a Finalized Chain Item (not a counter). rule 383.3.e.2: a
 * "once each turn" trigger that was not performed has not used up its turn.
 */
export function removeUnfinalizedItem(draftLike: unknown, itemId: string): void {
  const draft = draftLike as RiftboundGameState;
  const interaction = draft.interaction;
  if (!interaction?.chain) {
    return;
  }
  const item = interaction.chain.items.find((it) => it.id === itemId) as ChainItem | undefined;
  const onceKey = item?.onceKey;
  if (typeof onceKey === "string") {
    const counts = (draft as { turnEventCounts?: Record<string, number> }).turnEventCounts;
    if (counts && (counts[onceKey] ?? 0) > 0) {
      counts[onceKey] = (counts[onceKey] ?? 1) - 1;
    }
  }
  (draft as { interaction?: RiftboundGameState["interaction"] }).interaction = removeChainItem(
    interaction,
    itemId,
  );
}

/** One Game-Object component of a trigger's base cost (rule 383.3.b / 403.1.b.1). */
export interface TriggerObjectCost {
  readonly kind: "kill" | "recycle" | "returnToHand";
  /** How many objects must be named — all of them, or the cost is not paid (404.1). */
  readonly needed: number;
  /** The raw spec as carried on `optInCost` (descriptor / `{ amount, target }`). */
  readonly spec: unknown;
}

/**
 * rule 383.3.b / 204.3.a — the parts of a trigger's base cost that are paid
 * with Game Objects its controller must NAME ("kill a unit you control here
 * to …", "recycle another friendly unit to …", "pay [1] and return a unit you
 * control here …", "kill 3 other friendly units and/or gear to …"). "Kill me" /
 * "banish me" / "discard N" / "[Burn N]" name nothing on the board and are paid
 * straight from the opt-in answer.
 */
export function objectCostsOf(cost: unknown): TriggerObjectCost[] {
  if (!cost || typeof cost !== "object") {
    return [];
  }
  const c = cost as Record<string, unknown>;
  const out: TriggerObjectCost[] = [];
  const amountOf = (spec: unknown): number =>
    typeof spec === "object" && spec !== null && typeof (spec as { amount?: unknown }).amount === "number"
      ? Math.max(1, (spec as { amount: number }).amount)
      : 1;
  if (c.kill !== undefined && c.kill !== "self" && typeof c.kill === "object" && c.kill !== null) {
    out.push({ kind: "kill", needed: amountOf(c.kill), spec: c.kill });
  }
  if (c.recycle !== undefined && typeof c.recycle === "object" && c.recycle !== null) {
    out.push({ kind: "recycle", needed: amountOf(c.recycle), spec: c.recycle });
  }
  if (c.returnToHand !== undefined && typeof c.returnToHand === "object" && c.returnToHand !== null) {
    out.push({ kind: "returnToHand", needed: amountOf(c.returnToHand), spec: c.returnToHand });
  }
  return out;
}

/** The board objects that may pay one object component right now (same filters the legacy gate used). */
export function objectCostCandidates(
  part: TriggerObjectCost,
  draft: RiftboundGameState,
  playerId: string,
  sourceCardId: string,
  // biome-ignore lint/suspicious/noExplicitAny: move context bag is framework-typed
  context: any,
): string[] {
  switch (part.kind) {
    case "kill":
      return killCostCandidates(draft, playerId, sourceCardId, part.spec, context);
    case "recycle":
      return recycleCostCandidates(draft, playerId, sourceCardId, part.spec, context);
    case "returnToHand":
      return returnToHandCostCandidates(draft, playerId, sourceCardId, part.spec, context);
    default:
      return [];
  }
}

/**
 * rule 402.4 / 404.2 (rule-id: sfd-026-221) — an object cost whose candidate set
 * is too small is not a payment question at all: there is no Game Object to
 * name, so the Pending Item is removed before it is finalized — no opt-in
 * prompt, no Chain Item, no Priority window. (A payable-in-objects but
 * unaffordable-in-resources cost still gets its prompt; DESIGN.md §Paying costs.)
 */
function optInCostObjectsExist(
  item: ChainItem,
  draft: RiftboundGameState,
  // biome-ignore lint/suspicious/noExplicitAny: move context bag is framework-typed
  context: any,
): boolean {
  return objectCostsOf(item.optInCost).every(
    (part) =>
      objectCostCandidates(part, draft, item.controller as string, item.cardId as string, context).length >=
      part.needed,
  );
}

function toLeaveContext(draft: RiftboundGameState, ctx: FinalizationContext): LeaveBoardContext {
  return { cards: ctx.cards, counters: ctx.counters, draft, zones: ctx.zones } as LeaveBoardContext;
}

/**
 * rule 404.1 / 383.3.b.1 — PAY the object part of a trigger's base cost with the
 * objects its controller named: each one is snapshotted (359.3.e.13 look-back —
 * "reduce its cost by the Might of the unit you recycled" reads the paid unit as
 * it last was on the board, buffs and all) and bound onto the item as
 * `paidObjects`, then killed / recycled / returned through the ordinary effect
 * handlers — so a die replacement still replaces a cost-kill (357.2.a: paid all
 * the same), a [Deathknell] it sets off becomes a NEWER Pending Item (finalized
 * next, resolving first — 337.3 / 340.1) and a token ceases to exist (186.1).
 * Only afterwards does anyone receive Priority (406.4). The paid objects are
 * cost objects, not targets (355.10.c.1): no "when you choose" fires for them.
 */
export function payTriggerObjectCost(
  draftLike: unknown,
  ctx: FinalizationContext,
  itemId: string,
  pickedIds: readonly string[],
): void {
  const draft = draftLike as RiftboundGameState;
  const live = chainItems(draft)?.find((it) => it.id === itemId);
  if (!live) {
    return;
  }
  const parts = objectCostsOf(live.optInCost);
  const leaveCtx = toLeaveContext(draft, ctx);
  const paid: { id: string; lki: LKISnapshot }[] = [...(live.paidObjects ?? [])];
  for (const id of pickedIds) {
    if (!paid.some((p) => p.id === id)) {
      paid.push({ id, lki: snapshotLKI(leaveCtx, id) });
    }
  }
  // The item is settled BEFORE the payment runs: whatever the payment triggers
  // re-enters the dialog and must find this item no longer owing anything.
  patchItem(draft, itemId, { objectCostOwed: undefined, optInCost: undefined, paidObjects: paid });
  const context = toResolveContext(ctx);
  const base = buildEffectContext(draft, live.controller as string, live.cardId as string, context);
  // Split the named objects over the components in order (a single component
  // — the printed case — simply takes them all).
  let cursor = 0;
  withinMoveReducer(() => {
    for (const part of parts) {
      const ids = parts.length === 1 ? [...pickedIds] : pickedIds.slice(cursor, cursor + part.needed);
      cursor += part.needed;
      if (ids.length === 0) {
        continue;
      }
      const effect: ExecutableEffect =
        part.kind === "kill"
          ? ({ target: { type: "permanent" }, type: "kill" } as unknown as ExecutableEffect)
          : part.kind === "recycle"
            ? ({ target: { type: "unit" }, type: "recycle" } as unknown as ExecutableEffect)
            : ({
                target: (part.spec as { target?: object }).target ?? (part.spec as object),
                type: "return-to-hand",
              } as unknown as ExecutableEffect);
      executeEffect(effect, { ...base, boundTargets: ids, paidObjects: paid });
    }
    // rule 319 — the payment changed the board (deaths, a vacated battlefield's
    // statics); the Cleanup's own triggers join the same finalization sweep.
    if (typeof ctx.counters?.getCounter === "function" && typeof ctx.zones.getCardsInZone === "function") {
      cleanupAndFireDeaths(draft, context as unknown as PostMoveCleanupContext);
    }
  });
}

/**
 * rule 402.2 / 402.4.b / 404.1 — the object part of an accepted opt-in's base
 * cost: name the objects (a forced `pick-many` of exactly the needed count when
 * there is anything to choose between; a lone candidate for a single object is
 * bound without asking, like a lone target) and pay them. Returns "prompted"
 * while waiting for the pick, "removed" when the objects vanished since the
 * gate (404.2 — nothing else is refunded, 425.1.c), "paid" otherwise.
 */
function settleObjectCost(
  draft: RiftboundGameState,
  ctx: FinalizationContext,
  item: ChainItem,
  // biome-ignore lint/suspicious/noExplicitAny: move context bag is framework-typed
  context: any,
): "prompted" | "removed" | "paid" {
  const parts = objectCostsOf(item.optInCost);
  if (parts.length === 0) {
    patchItem(draft, item.id, { objectCostOwed: undefined, optInCost: undefined });
    return "paid";
  }
  const pools = parts.map((part) =>
    objectCostCandidates(part, draft, item.controller as string, item.cardId as string, context),
  );
  if (pools.some((pool, i) => pool.length < (parts[i] as TriggerObjectCost).needed)) {
    removeUnfinalizedItem(draft, item.id);
    return "removed";
  }
  const needed = parts.reduce((n, p) => n + p.needed, 0);
  const options = [...new Set(pools.flat())];
  if (needed === 1 && options.length === 1) {
    payTriggerObjectCost(draft, ctx, item.id, options);
    return "paid";
  }
  const nameOf = (cardId: string): string =>
    (ctx.cards.getCardName?.(cardId as CoreCardId) as string | undefined) ??
    (getGlobalCardRegistry().get(cardId) as { name?: string } | undefined)?.name ??
    cardId;
  const verb = parts.length === 1 ? { kill: "kill", recycle: "recycle", returnToHand: "return" }[parts[0]!.kind] : "pay with";
  draft.pendingChoice = {
    max: needed,
    min: needed,
    options: options.map((id) => ({ cardId: id, key: id, label: nameOf(id) })),
    playerId: item.controller,
    prompt: `Choose ${needed === 1 ? "the card" : `${needed} cards`} to ${verb} — the cost of ${nameOf(item.cardId as string)}'s ability`,
    resume: { itemId: item.id, kind: "trigger-cost" },
    semantics: "target",
    sourceCardId: item.cardId,
    type: "pick-many",
  } as RiftboundGameState["pendingChoice"];
  return "prompted";
}

/**
 * rule 383.3.b.1 (rule-id: ven-082-166) — "disempower something you control TO
 * empower …": a cost written INSIDE the instructions is paid when the item is
 * FINALIZED, before anyone gets Priority; only the payoff waits for resolution.
 * Such a step is flagged `costStep: true` in the ability payload. The payment it
 * names is the controller's own choice, so it is asked here and performed, and
 * the paid steps then leave the stored effect: resolution runs only what is
 * left, choosing its own Game Objects (rule 402.2).
 * Returns true when it raised a prompt (the payment is made on the answer).
 */
/**
 * rule 383.3.b.1 (rule-id: ven-191-166) — paying a cost step is an ordinary
 * effect, so it can emit an event ("banish a card from a trash") whose triggers
 * re-enter finalization while the paid steps have not yet been sliced off the
 * stored effect. Items in this set are passed over by `finalizePendingItems`
 * so the same steps are never paid twice.
 */
const payingCostSteps = new Set<string>();

function payFinalizationCostSteps(
  draft: RiftboundGameState,
  ctx: FinalizationContext,
  itemId: string,
): boolean {
  const live = chainItems(draft)?.find((it) => it.id === itemId);
  const effect = live?.effect as { effects?: unknown[]; type?: string } | undefined;
  if (!live || effect?.type !== "sequence" || !Array.isArray(effect.effects)) {
    return false;
  }
  payingCostSteps.add(itemId);
  try {
    return payFinalizationCostStepsInner(draft, ctx, itemId, live, effect);
  } finally {
    payingCostSteps.delete(itemId);
  }
}

function payFinalizationCostStepsInner(
  draft: RiftboundGameState,
  ctx: FinalizationContext,
  itemId: string,
  live: ChainItem,
  effect: { effects?: unknown[]; type?: string },
): boolean {
  const steps = [...(effect.effects as unknown[])] as Record<string, unknown>[];
  let paid = 0;
  // Bound targets are one per caster-chosen SLOT, not one per step: a cost step
  // that names no board object ("spend 3 XP to …", rule-id: unl-119-219)
  // consumes none, so the payoff's own pick stays on the item.
  let consumed = 0;
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i] as Record<string, unknown>;
    if (step?.costStep !== true) {
      break;
    }
    const descriptor = step.target as TargetDescriptor | undefined;
    const ownsSlot =
      typeof descriptor === "object" && descriptor !== null && casterChosenTarget({ target: descriptor }) !== undefined;
    let bound = ownsSlot ? live.targets?.[consumed] : undefined;
    if (bound === undefined && typeof descriptor === "object" && descriptor !== null) {
      const options = resolveTarget({ ...descriptor, quantity: "all" }, {
        cards: ctx.cards,
        choosing: true,
        draft,
        playerId: live.controller,
        sourceCardId: live.cardId,
        sourceZone: ctx.zones.getCardZone?.(live.cardId as CoreCardId),
        zones: ctx.zones,
      } as Parameters<typeof resolveTarget>[1]) as string[];
      if (options.length === 0) {
        break;
      }
      if (
        options.length > 1 ||
        (descriptor as { promptWhenSingle?: boolean }).promptWhenSingle === true
      ) {
        draft.pendingChoice = {
          bindSlotIndex: consumed,
          bindToChainItemId: itemId,
          effect: step as never,
          options: options as never,
          playerId: live.controller as never,
          remaining: 1,
          sourceCardId: live.cardId as never,
          type: "choose-target",
        };
        return true;
      }
      bound = options[0] as string;
      const targetsNow = [...(live.targets ?? [])];
      targetsNow.splice(consumed, 0, bound);
      patchItem(draft, itemId, { targets: targetsNow });
    }
    if (bound !== undefined || ownsSlot) {
      consumed += 1;
    }
    // Performed through the ordinary resolution path (a one-instruction item) so
    // the payment runs through the same handlers, events and cleanup.
    executeResolvedItem(
      {
        ...live,
        effect: step as never,
        optional: false,
        targets: bound === undefined ? undefined : [bound],
      } as ChainItem,
      draft,
      toResolveContext(ctx),
    );
    paid += 1;
  }
  if (paid > 0) {
    const latest = chainItems(draft)?.find((it) => it.id === itemId);
    const remaining = steps.slice(paid);
    const remainingTargets = (latest?.targets ?? []).slice(consumed);
    patchItem(draft, itemId, {
      effect: (remaining.length === 1
        ? remaining[0]
        : { ...((latest?.effect ?? effect) as object), effects: remaining }) as never,
      targets: remainingTargets.length > 0 ? remainingTargets : undefined,
    });
  }
  return false;
}

/**
 * rule 402.2 — the distinct caster-chosen single-pick slots of a sequence that
 * names MORE than one Game Object ("return another friendly unit and an enemy
 * unit", sfd-132-221). Single-slot effects go through `executeResolvedItem`'s
 * own planning instead.
 */
function multiTargetSlots(effect: unknown): TargetDescriptor[] | undefined {
  const shape = effect as SpellEffectTargetShape | undefined;
  if (findSequenceLeadTarget(shape) !== undefined) {
    return undefined;
  }
  const slots = collectSequenceTargetSlots(shape);
  if (!slots || slots.length < 2 || !slots.every((s) => isSinglePickSlot(s))) {
    return undefined;
  }
  return slots.filter((s) => casterChosenTarget({ target: s }) !== undefined) as TargetDescriptor[];
}

function fireChooseEvents(
  draft: RiftboundGameState,
  ctx: FinalizationContext,
  item: ChainItem,
  ids: readonly string[],
): void {
  if (!ctx.counters) {
    return;
  }
  for (const cardId of ids) {
    if (draft.battlefields?.[cardId] !== undefined) {
      continue;
    }
    // rule 359.2 / 383.4.b.2 — "when you choose me" fires as the ability that
    // targets it is finalized.
    fireTriggers(
      { cardId, chooserId: item.controller, sourceType: "ability", type: "choose" },
      { cards: ctx.cards, counters: ctx.counters, draft, zones: ctx.zones },
    );
  }
}

/**
 * Walk the remaining slots of a multi-target trigger. Returns "prompted" when a
 * choice was parked, "removed" when a slot had no legal option (402.4), or
 * "done" with every slot bound onto the item.
 */
function finalizeMultiTargetSlots(
  draft: RiftboundGameState,
  ctx: FinalizationContext,
  item: ChainItem,
  slots: readonly TargetDescriptor[],
): "prompted" | "removed" | "done" {
  const bound = [...(item.targets ?? [])];
  const trigEvt = item.triggerEvent as { cardId?: string; diedAt?: string } | undefined;
  // rule 428.1.a.1.b — a dies-trigger sees the board as it was.
  const sourceZone =
    typeof trigEvt?.diedAt === "string" && trigEvt.cardId === item.cardId
      ? trigEvt.diedAt
      : ctx.zones.getCardZone?.(item.cardId as CoreCardId);
  for (let k = bound.length; k < slots.length; k++) {
    const options = (
      resolveTarget({ ...(slots[k] as TargetDescriptor), quantity: "all" }, {
        cards: ctx.cards,
        choosing: true,
        draft,
        playerId: item.controller,
        sourceCardId: item.cardId,
        sourceZone,
        zones: ctx.zones,
      } as Parameters<typeof resolveTarget>[1]) as string[]
    ).filter((id) => !bound.includes(id));
    if (options.length === 0) {
      removeUnfinalizedItem(draft, item.id);
      return "removed";
    }
    if (options.length === 1) {
      bound.push(options[0] as string);
      patchItem(draft, item.id, { targets: [...bound] });
      fireChooseEvents(draft, ctx, item, [options[0] as string]);
      continue;
    }
    patchItem(draft, item.id, { targets: [...bound] });
    draft.pendingChoice = {
      bindSlotIndex: k,
      bindToChainItemId: item.id,
      effect: item.effect as never,
      options: options as never,
      playerId: item.controller as never,
      remaining: 1,
      sourceCardId: item.cardId as never,
      type: "choose-target",
    };
    return "prompted";
  }
  return "done";
}

/**
 * rule 383.3.d — "if more than one Triggered Ability is Triggered
 * simultaneously, the player that controls them selects the order to place them
 * on the Chain". Once a batch is finalized, the triggered items it added that
 * one player controls (≥2) are offered to that player as a SOFT `order` prompt
 * on `draft.pendingTriggerOrder`: answering `resolvePendingChoice
 * { orderedKeys }` (first key = appended first, last key = top of the Chain,
 * resolves first) rearranges them; any other move keeps the listed scan order,
 * so nobody is forced to answer. Cross-controller placement stays in turn order
 * (383.3.d.1, `orderTriggers` / `orderBatchTriggersByTurnOrder`); when several
 * players qualify the earliest in turn order is offered the choice.
 */
function offerTriggerOrder(draft: RiftboundGameState, ctx: FinalizationContext): void {
  const items = chainItems(draft) ?? [];
  const d = draft as RiftboundGameState & { triggerBatchSeen?: string[] };
  const seen = new Set(d.triggerBatchSeen ?? []);
  const fresh = items.filter(
    (it) => it.triggered === true && it.status === "finalized" && it.countered !== true && !seen.has(it.id),
  );
  d.triggerBatchSeen = items.map((it) => it.id);
  if (fresh.length < 2) {
    return;
  }
  const turnOrder = Object.keys(draft.players ?? {});
  const start = Math.max(0, turnOrder.indexOf(draft.turn?.activePlayer ?? ""));
  const rank = (pid: string): number => {
    const i = turnOrder.indexOf(pid);
    return i < 0 ? Number.MAX_SAFE_INTEGER : (i - start + turnOrder.length) % turnOrder.length;
  };
  const byController = new Map<string, ChainItem[]>();
  for (const it of fresh) {
    byController.set(it.controller, [...(byController.get(it.controller) ?? []), it]);
  }
  // Interchangeable items leave nothing to order: copies of one trigger (rule
  // 808.2 — Karthus doubling a [Deathknell]) or the same source-independent
  // effect from two cards (two Watchful Sentries' "Draw 1"). An effect that
  // reads its source ("me", "here", the triggering object) stays distinct.
  const signature = (it: ChainItem): string => {
    const json = JSON.stringify(it.effect ?? null);
    const sourceBound = /"self"|"trigger-source"|"here"|"source"|"same"/.test(json);
    return `${sourceBound ? it.cardId : ""}|${json}`;
  };
  // rule 383.3.d — only abilities that triggered SIMULTANEOUSLY are ordered by
  // their controller. Items carrying different `triggerBatch` stamps entered the
  // Chain one after another (337.1.b) and their order is already fixed — a
  // [Deathknell] fired by a kill vs. the play-self trigger of the unit the same
  // effect then played (rule-id: ogn-242-298 Baited Hook).
  const orderableGroup = (owned: readonly ChainItem[]): ChainItem[] | undefined => {
    const byBatch = new Map<string, ChainItem[]>();
    for (const it of owned) {
      const key = it.triggerBatch ?? "";
      byBatch.set(key, [...(byBatch.get(key) ?? []), it]);
    }
    for (const group of byBatch.values()) {
      if (group.length >= 2 && new Set(group.map(signature)).size >= 2) {
        return group;
      }
    }
    return undefined;
  };
  const chooser = [...byController.keys()]
    .filter((pid) => orderableGroup(byController.get(pid) ?? []) !== undefined)
    .sort((a, b) => rank(a) - rank(b))[0];
  if (chooser === undefined) {
    return;
  }
  const mine = orderableGroup(byController.get(chooser) as ChainItem[]) as ChainItem[];
  const nameOf = (cardId: string): string =>
    (ctx.cards.getCardName?.(cardId as CoreCardId) as string | undefined) ??
    (getGlobalCardRegistry().get(cardId) as { name?: string } | undefined)?.name ??
    cardId;
  draft.pendingTriggerOrder = {
    defaultable: true,
    items: mine.map((it) => ({ cardId: it.cardId, key: it.id, label: `${nameOf(it.cardId)} trigger` })),
    playerId: chooser,
    prompt: "Order your simultaneous triggers on the Chain (first = bottom, last = top → resolves first)",
    resume: { itemIds: mine.map((it) => it.id), kind: "trigger-batch" },
    type: "order",
  };
}

/**
 * `draft.finalizeSweepTouched` is set once the current finalization sweep
 * (possibly spread over several prompts) has taken up a Pending Item; it is
 * consumed here when nothing is Pending any more.
 */
function reseatPriorityOnTop(draft: RiftboundGameState): void {
  if (draft.finalizeSweepTouched !== true) {
    return;
  }
  draft.finalizeSweepTouched = undefined;
  const chain = draft.interaction?.chain;
  const top = chain?.items[chain.items.length - 1];
  if (!chain || !top || chain.activePlayer === top.controller) {
    return;
  }
  (draft as { interaction?: RiftboundGameState["interaction"] }).interaction = {
    ...draft.interaction,
    chain: { ...chain, activePlayer: top.controller, passedPlayers: [] },
  } as RiftboundGameState["interaction"];
}

/**
 * Finalize Pending items (triggers AND plays an effect queued) oldest-first
 * (rule 337.1.b) until one of them needs an answer or none is left — nobody
 * receives Priority in between (337.1.a / 337.4). Safe to call whenever no
 * prompt is open.
 */
export function finalizePendingItems(draftLike: unknown, ctx: FinalizationContext): void {
  const draft = draftLike as RiftboundGameState;
  if (!ctx?.cards || !ctx?.zones || typeof ctx.zones.getCardsInZone !== "function") {
    return;
  }
  for (let guard = 0; guard < 64; guard++) {
    if (draft.pendingChoice) {
      return;
    }
    // rule-id: ogn-220-298 (rule 355.5 / 811.1.b) — an open multi-slot lock of a
    // card played from [Hidden] is itself a finalization in progress.
    continueRevealSlotLock(draft, ctx);
    if (draft.pendingChoice) {
      return;
    }
    // rule 355.4 / 349 / 402.2 — Move Destinations of every FINALIZED item
    // (a spell or activation just played, a trigger finalized on the previous
    // pass) are chosen now, mover by mover, before anyone receives priority.
    if (
      raiseChainDestinationChoices(draft, (it) =>
        buildEffectContext(draft, it.controller as string, it.cardId as string, toResolveContext(ctx)),
      )
    ) {
      return;
    }
    const items = chainItems(draft);
    // rule 337.1.b / 354.2 — oldest Pending Item first; an item that must wait
    // for an effect-instructed play appended before it (`finalizeAfter`) is
    // passed over until that play has left the Chain.
    const blocked = (it: ChainItem): boolean =>
      payingCostSteps.has(it.id) ||
      it.finalizeAfter?.some((id) => items?.some((other) => other.id === id)) === true;
    const item = items?.find((it) => it.status === "pending" && !blocked(it));
    if (!items || !item) {
      if (items?.some((it) => it.status === "pending")) {
        return;
      }
      // rule 337.4 — nothing is Pending any more: the controller of the newest
      // item on the Chain receives Priority (a spell finalized into an older
      // slot, or an item removed unfinalized, must not leave it elsewhere).
      reseatPriorityOnTop(draft);
      // rule 383.3.d — everything is finalized: offer the same-controller
      // ordering of the items this batch added (soft prompt, default = as listed).
      offerTriggerOrder(draft, ctx);
      return;
    }
    draft.finalizeSweepTouched = true;
    if (item.countered) {
      patchItem(draft, item.id, { status: "finalized" });
      continue;
    }
    const context = toResolveContext(ctx);
    // rule 354.2 / 419.3 / 337.2 — a card an effect is PLAYING: finish its play
    // (location, additional costs, payment) and let it leave the Chain — a
    // permanent enters the board at once, a spell becomes a spell item.
    if (isPendingPlayItem(item)) {
      if (continueEffectPlay({ ...context, draft } as never, item) === "prompted") {
        return;
      }
      continue;
    }

    // Step 1 — rule 402.1 / 383.3.a (+ 383.3.b base cost on the same prompt).
    if (item.optional === true) {
      // rule 402.4 / 404.2 — an object cost with nothing (or too few) to name
      // ⇒ removed silently, before any Priority.
      if (!optInCostObjectsExist(item, draft, context)) {
        removeUnfinalizedItem(draft, item.id);
        continue;
      }
      if (!optInIsPerformable(item, draft, context)) {
        removeUnfinalizedItem(draft, item.id);
        continue;
      }
      draft.pendingChoice = {
        finalizationChainItemId: item.id,
        playerId: item.controller,
        resolved: { ...item, optional: false },
        sourceCardId: item.cardId,
        type: "opt-in",
      };
      return;
    }

    // Step 1b — rule 402.2 / 404.1: the accepted opt-in still owes the Game
    // Objects of its base cost — named and paid now, before targets and before
    // anyone receives Priority (406.4).
    if (item.objectCostOwed === true) {
      const r = settleObjectCost(draft, ctx, item, context);
      if (r === "prompted") {
        return;
      }
      continue;
    }

    // Step 2 — rule 402.2 targets.
    if (item.type === "ability" && item.effect !== undefined) {
      const slots = multiTargetSlots(item.effect);
      if (slots) {
        if ((item.targets?.length ?? 0) < slots.length) {
          const r = finalizeMultiTargetSlots(draft, ctx, item, slots);
          if (r === "prompted") {
            return;
          }
          if (r === "removed") {
            continue;
          }
        }
      } else if (item.targets === undefined) {
        const outcome = executeResolvedItem(item, draft, context, { finalizeOnly: true });
        if (draft.pendingChoice) {
          return;
        }
        if (outcome?.remove) {
          removeUnfinalizedItem(draft, item.id);
          continue;
        }
        if (outcome?.targets !== undefined) {
          patchItem(draft, item.id, { targets: [...outcome.targets] });
          fireChooseEvents(draft, ctx, item, outcome.targets);
          if (draft.pendingChoice) {
            return;
          }
        }
      }
      // rule 402.2 — modes ("choose one —") are chosen now as well.
      const live = chainItems(draft)?.find((it) => it.id === item.id);
      if (
        live &&
        raisePlayTimeModeChoice(
          draft,
          item.id,
          live.effect,
          item.controller,
          item.cardId,
          buildEffectContext(draft, item.controller, item.cardId, context),
        )
      ) {
        return;
      }
    }

    // Step 3 — rule 383.3.b.1: base costs written inside the instructions are
    // paid now, with the payment the controller just chose.
    if (payFinalizationCostSteps(draft, ctx, item.id)) {
      return;
    }

    // Step 4 — rule 337.4: finalized; Priority already sits with the newest
    // item's controller (`addToChain`), or was re-seated by a removal.
    patchItem(draft, item.id, { status: "finalized" });
  }
}

let moveDepth = 0;

/** True while a move reducer is running (its wrapper finalizes at the end). */
export function insideMoveReducer(): boolean {
  return moveDepth > 0;
}

/**
 * Run a post-reducer step (the Cleanup that begins a staged Showdown) as part
 * of the move: triggers it fires are queued as ONE batch and finalized by the
 * caller afterwards (383.3.d ordering needs the whole batch), not one by one.
 */
export function withinMoveReducer<T>(step: () => T): T {
  moveDepth += 1;
  try {
    return step();
  } finally {
    moveDepth = Math.max(0, moveDepth - 1);
  }
}

/**
 * Wrap every move so that, once its reducer (and any post-move cleanup) has
 * run and no prompt is open, Pending trigger items are finalized before the
 * next player decision is derived (rule 337.1 / 337.4). Triggers fired while
 * the reducer runs are only queued; the dialog opens here, when the move's own
 * effects can no longer be interrupted by it.
 */
export function withTriggerFinalization<
  // biome-ignore lint/suspicious/noExplicitAny: structural pass-through wrapper
  TMoves extends Record<string, { reducer: (draft: any, context: any) => void } | undefined>,
>(moves: TMoves): TMoves {
  const wrapped = {} as Record<string, unknown>;
  for (const [name, move] of Object.entries(moves)) {
    if (!move) {
      wrapped[name] = move;
      continue;
    }
    const originalReducer = move.reducer;
    wrapped[name] = {
      ...move,
      // biome-ignore lint/suspicious/noExplicitAny: structural pass-through wrapper
      reducer: (draft: any, context: any) => {
        // rule 383.3.d — taking any other action accepts the listed order of a
        // pending same-controller trigger batch (only `resolvePendingChoice
        // { orderedKeys }` rearranges it).
        if (name !== "resolvePendingChoice" && draft?.pendingTriggerOrder !== undefined) {
          draft.pendingTriggerOrder = undefined;
        }
        moveDepth += 1;
        try {
          originalReducer(draft, context);
        } finally {
          moveDepth = Math.max(0, moveDepth - 1);
        }
        if (context?.cards && context?.zones && !draft?.pendingChoice) {
          const chainBefore = draft?.interaction?.chain != null;
          finalizePendingItems(draft, context as FinalizationContext);
          // rule 319.5 — a Cleanup happens whenever the chain empties. Finalization
          // can discard the last item(s) itself (an unperformable opt-in, a target-less
          // ability), and the reducer's own cleanup already ran in a Closed State, so
          // the state-based checks (e.g. rule 323.6 battlefield vacancy) must run again
          // here or they wait for an unrelated later move.
          if (chainBefore && draft?.interaction?.chain == null && !draft?.pendingChoice) {
            cleanupAndFireDeaths(draft, context as PostMoveCleanupContext);
          }
        }
      },
    };
  }
  return wrapped as TMoves;
}
