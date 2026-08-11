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
import type { ChainItem, ChainTargetSlot } from "../chain/chain-state";
import { removeChainItem } from "../chain/chain-state";
import { legalChosenPlayers } from "./chosen-player";
import { revealHandChosenPlayerWhich } from "./reveal-hand-player";
import type { PostMoveCleanupContext } from "../cleanup/post-move-cleanup";
import { cleanupAndFireDeaths } from "../cleanup/post-move-cleanup";
import { recalculateStaticEffects } from "./static-abilities";
import { continueEffectPlay, isPendingPlayItem } from "../game-definition/moves/play/play-pipeline";
import { buildEffectContext } from "../game-definition/moves/chain/effect-context";
import {
  executeResolvedItem,
  minDeflectSurchargeForItem,
  optInIsPerformable,
  totalPooledPower,
} from "../game-definition/moves/chain/resolve";
import {
  killCostCandidates,
  recycleCostCandidates,
  returnToHandCostCandidates,
  spendBuffCostCandidates,
} from "../game-definition/moves/pending-choice";
import { raiseChainDestinationChoices } from "../game-definition/moves/play/play-time-destinations";
import { raisePlayTimeModeChoice } from "../game-definition/moves/play/play-time-modes";
import { continueRevealSlotLock, isSinglePickSlot } from "../game-definition/moves/play/reveal-target-lock";
import {
  collectSequenceTargetSlots,
  findSequenceLeadTarget,
  type SpellEffectTargetShape,
} from "../game-definition/moves/play/targeting";
import { getDeflectSurcharge } from "../game-definition/moves/play/cost";
import { getGlobalCardRegistry } from "../operations/card-lookup";
import { type LeaveBoardContext, type LKISnapshot, snapshotLKI } from "../operations/leave-board";
import type { RiftboundGameState } from "../types";
import { getBonusDamage } from "./bonus-damage";
import { executeEffect, type EffectContext, type ExecutableEffect } from "./effect-executor";
import {
  costRiderTargetIsClassFilter,
  replacementTargetIsClassFilter,
} from "./replacement-effects";
import { evaluateEffectCondition, resolveAmount } from "./effects/_helpers";
import type { TargetDescriptor } from "./target-resolver";
import { resolveTarget } from "./target-resolver";
import { bindTargetSlot, collectMultiPickSlots, slotCandidates } from "./target-slots";
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
  // rule 355.10.c — a class-filter replacement ("the next unit you play this
  // turn enters ready") names no object as it is finalized.
  if (replacementTargetIsClassFilter(effect)) {
    return undefined;
  }
  // rule 356.3 — a "your … cost [N] more to play this turn" surcharge names no
  // object as it is finalized; its target is the class of future plays it rides.
  if (costRiderTargetIsClassFilter(effect)) {
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
/**
 * rule 370.1.a.1 / 373 — has a queued "If this kills it, …" rider's stamped kill
 * been undone? The reflexive item carries the ids it was about to kill; by
 * finalization the rule 520 deaths and every `die` replacement have been
 * settled, so a still-on-board unit was saved and the rider never triggered.
 */
/**
 * rule 355.10 — open the "Choose an opponent" prompt of a `reveal-hand` item
 * that still owes one (spell or ability alike). Returns true when it prompted.
 */
function raiseRevealHandOpponentChoice(draft: {
  interaction?: { chain?: { items?: readonly ChainItem[] } };
  pendingChoice?: unknown;
  players: Record<string, unknown>;
}): boolean {
  for (const item of draft.interaction?.chain?.items ?? []) {
    if (item.countered === true) {
      continue;
    }
    const which = revealHandChosenPlayerWhich(item.effect);
    if (which === undefined) {
      continue;
    }
    const legalSeats = legalChosenPlayers(which, item.controller as string, Object.keys(draft.players));
    if (legalSeats.length < 2) {
      continue;
    }
    (draft as { pendingChoice?: unknown }).pendingChoice = {
      effect: item.effect,
      finalizationChainItemId: item.id,
      options: legalSeats,
      playerId: item.controller,
      prompt: "Choose an opponent",
      sourceCardId: item.cardId,
      type: "choose-player",
    };
    return true;
  }
  return false;
}

function killGuardAlreadyFailed(item: ChainItem, draft: unknown, context: unknown): boolean {
  const condition = (item as { effect?: { condition?: { ids?: readonly string[]; type?: string } } })
    .effect?.condition;
  if (condition?.type !== "this-kills-target" || condition.ids === undefined) {
    return false;
  }
  const ctx = buildEffectContext(
    draft as never,
    item.controller as string,
    item.cardId as string,
    context as never,
  );
  return !evaluateEffectCondition(condition as never, ctx as never);
}

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
  readonly kind: "kill" | "recycle" | "returnToHand" | "spendBuff";
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
  // rule 383.3.b / 745 (rule-id: ogn-282-298, ogn-147-298) — "you may spend a
  // buff to …": the Buff counter is removed from a unit its controller controls
  // (745.2) and NAMES — one object per buff to spend.
  if (typeof c.spendBuff === "number" && c.spendBuff > 0) {
    out.push({ kind: "spendBuff", needed: c.spendBuff, spec: { amount: c.spendBuff } });
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
    case "spendBuff":
      return spendBuffCostCandidates(draft, playerId, sourceCardId, context);
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
            : part.kind === "spendBuff"
              ? // rule 745.1 — remove ONE Buff counter from each named unit (the
                // `spend-buff` handler spends exactly its bound objects and fires
                // the "when you spend a buff" event; no payoff rides on it).
                ({ target: { type: "unit" }, type: "spend-buff" } as unknown as ExecutableEffect)
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
  const verb =
    parts.length === 1
      ? { kill: "kill", recycle: "recycle", returnToHand: "return", spendBuff: "spend the buff of" }[parts[0]!.kind]
      : "pay with";
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

/** Where a self-referential cost step would put the source card (rule 383.3.b). */
const SELF_COST_STEP_DESTINATION: Record<string, string> = {
  banish: "banishment",
  kill: "trash",
  recycle: "mainDeck",
  "return-to-hand": "hand",
};

/**
 * rule 383.3.b — "[do X to me] to [get Y]" can only be paid while the source
 * card is still somewhere the step could move it FROM. Already sitting in the
 * step's destination zone means the payment is impossible — an earlier copy of
 * the same trigger already made it.
 */
function selfCostStepState(
  ctx: FinalizationContext,
  live: ChainItem,
  step: Record<string, unknown>,
): { key: string; payable: boolean; exists: boolean } | undefined {
  if (step.target !== "self") {
    return undefined;
  }
  const destination = SELF_COST_STEP_DESTINATION[String(step.type)];
  if (destination === undefined) {
    return undefined;
  }
  const zone = ctx.zones.getCardZone?.(live.cardId as CoreCardId) as string | undefined;
  // rule 186.1 / 359.3.e.12 (unl-200-219 Reflection copy of Ekko) — a token that
  // left the board has CEASED TO EXIST: there is no "me" to recycle/banish, so
  // the cost can never be paid (no zone at all, or the harness's "gone").
  const exists = zone !== undefined && zone !== "gone";
  return { exists, key: `${live.cardId}|${String(step.type)}`, payable: exists && zone !== destination };
}

/** Is an instruction nothing but "<move> me" (banish me / recycle me / …)? */
function isSelfMoveInstruction(effect: unknown): boolean {
  if (typeof effect !== "object" || effect === null) {
    return false;
  }
  const e = effect as { type?: unknown; target?: unknown };
  if (SELF_COST_STEP_DESTINATION[String(e.type)] === undefined) {
    return false;
  }
  const t = e.target;
  return t === "self" || (typeof t === "object" && t !== null && (t as { type?: unknown }).type === "self");
}

/**
 * rule 124 / 124.1 + 383.3.b (rule-id: ogn-110-298 Ekko × sfd-090-221 The Zero
 * Drive) — a cost step just moved "me" to another zone, where the card is a NEW
 * object. Every sibling trigger of the same event that would move that same card
 * ("[Deathknell] Banish me" granted by the worn Equipment) can no longer find it,
 * so those items resolve doing nothing: a unit is recycled OR banished, never both.
 */
function neuterSelfMoveSiblings(draft: RiftboundGameState, itemId: string, cardId: string): void {
  for (const it of chainItems(draft) ?? []) {
    if (it.id !== itemId && it.cardId === cardId && isSelfMoveInstruction(it.effect)) {
      neuterItem(draft, it.id);
    }
  }
}

/** Blank a Chain Item's remaining instruction: it resolves and does nothing. */
function neuterItem(draft: RiftboundGameState, itemId: string): void {
  patchItem(draft, itemId, {
    effect: { effects: [], type: "sequence" } as never,
    targets: undefined,
  });
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
    // rule 383.3.b / 404.1 (ruling 64125a9762390e3e) — a cost step written into
    // the instruction ("Recycle me to ready your runes") is a CONDITION of the
    // effect, not a cost that can be waived: the card can only be moved once,
    // so when Karthus doubles Ekko's Deathknell exactly ONE of the two items
    // gets its payoff and the other resolves doing nothing. The payment belongs
    // to the item that RESOLVES first (the newest on the Chain), so a later
    // copy takes the payoff over from the earlier sibling that moved the card.
    const selfCost = selfCostStepState(ctx, live, step);
    // rule 383.3.b.1 / 404.2 — the object that would pay no longer exists at all:
    // the Pending item cannot be finalized and leaves the Chain (never a Chain
    // item, no priority window, no payoff).
    if (selfCost !== undefined && !selfCost.exists && paid === 0) {
      removeUnfinalizedItem(draft, itemId);
      return false;
    }
    if (selfCost !== undefined && !selfCost.payable) {
      const sibling = chainItems(draft)?.find(
        (it) =>
          it.id !== itemId &&
          (it as { selfCostPaidKey?: string }).selfCostPaidKey === selfCost.key,
      );
      if (sibling === undefined) {
        neuterItem(draft, itemId);
        return false;
      }
      patchItem(draft, sibling.id, { selfCostPaidKey: undefined } as never);
      neuterItem(draft, sibling.id);
      patchItem(draft, itemId, { selfCostPaidKey: selfCost.key } as never);
      paid += 1;
      continue;
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
    if (selfCost !== undefined) {
      patchItem(draft, itemId, { selfCostPaidKey: selfCost.key } as never);
      neuterSelfMoveSiblings(draft, itemId, live.cardId);
    }
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
    // rule 824.1.d (rule-id: unl-119-219 × unl-191-219) — a cost paid at
    // FINALIZATION can flip a resource-dependent static Inactive at once
    // ("spend 3 XP" drops the controller below a [Level 6] threshold), so the
    // board must be re-derived before anything reads Might again — the payoff
    // still waiting on the Chain resolves against the NEW value.
    recalculateStaticEffects({ cards: ctx.cards, draft, zones: ctx.zones });
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
 * The EffectContext an ability item's choices are planned from while it is
 * finalized: its controller and source, with "here" read the way resolution
 * will read it — where a dying source died (428.1.a.1.b), or the battlefield a
 * conquer/hold event names for a source that is not at one (469.1 / 469.2).
 */
function itemPlanningContext(
  draft: RiftboundGameState,
  item: ChainItem,
  context: Parameters<typeof buildEffectContext>[3],
): EffectContext {
  const base = buildEffectContext(draft, item.controller as string, item.cardId as string, context);
  const trigEvt = item.triggerEvent as
    | { cardId?: string; diedAt?: string; type?: string; battlefieldId?: string }
    | undefined;
  let sourceZone = base.sourceZone;
  if (typeof trigEvt?.diedAt === "string" && trigEvt.cardId === item.cardId) {
    sourceZone = trigEvt.diedAt;
  } else if (
    (trigEvt?.type === "conquer" || trigEvt?.type === "hold") &&
    typeof trigEvt.battlefieldId === "string" &&
    sourceZone?.startsWith("battlefield-") !== true
  ) {
    sourceZone = `battlefield-${trigEvt.battlefieldId}`;
  }
  return {
    ...base,
    ...(sourceZone !== undefined ? { sourceZone } : {}),
    ...(typeof trigEvt?.cardId === "string" ? { triggerSourceId: trigEvt.cardId } : {}),
  } as EffectContext;
}

/** Pooled Power of any Domain (rule 809.1.c.1 — a Deflect surcharge takes any). */
function pooledPower(draft: RiftboundGameState, playerId: string): number {
  return Object.values((draft.runePools?.[playerId]?.power ?? {}) as Partial<Record<string, number>>).reduce(
    (a: number, b) => a + (b ?? 0),
    0,
  );
}

/**
 * rule 164.2.b / 429.3.a — runes this player could recycle for [rainbow] while a
 * Pay window is open. Recycling has no ready requirement (rule 594), so every
 * rune in the Rune Pool counts.
 */
function recyclableRunes(ctx: FinalizationContext, playerId: string): number {
  const zones = ctx.zones as unknown as {
    getCardsInZone?: (zone: string, player: string) => readonly unknown[];
  };
  return zones.getCardsInZone?.("runePool", playerId)?.length ?? 0;
}

/**
 * rule 355.14.c — the damage a split has available "when the spell is played":
 * the instruction's amount plus Bonus Damage, which joins the pool once (715.3 —
 * the CR's own Volibear + Annie "6 damage split among up to 6 units").
 */
function splitDamageAvailable(node: Record<string, unknown>, ctx: EffectContext): number {
  const base = resolveAmount((node.amount ?? 0) as Parameters<typeof resolveAmount>[0], ctx);
  return base > 0 ? base + getBonusDamage(ctx) : 0;
}

/**
 * Step 2b — rule 402.2 / 355.13 / 355.14.b: the item's variable-count target
 * SETS ("split among any number of enemy units here", "up to two other friendly
 * units", "any number of your token units") are chosen now, one slot at a time
 * in execution order, and bound onto the item (`target-slots.ts`). Each slot is
 * ONE `pick-many` (min 0 — choosing none is legal and the item stays, 355.13;
 * max = the printed cap / the damage available for a split, 355.14.c) over the
 * objects legal right now; a candidate whose [Deflect] surcharge the controller
 * cannot cover is not offered (809.1.d) and the chosen set's total surcharge is
 * validated and charged on the answer (`pending-choice.ts` resume
 * `target-slot`). No candidate at all binds the empty set without asking.
 * Nothing about the AMOUNTS of a split is asked here (355.14.e).
 */
function finalizeTargetSlots(
  draft: RiftboundGameState,
  ctx: FinalizationContext,
  itemId: string,
  context: Parameters<typeof buildEffectContext>[3],
): "prompted" | "continue" | "done" {
  const item = chainItems(draft)?.find((it) => it.id === itemId);
  if (!item || item.effect === undefined || item.countered === true) {
    return "done";
  }
  const discovered = collectMultiPickSlots(item.effect);
  if (discovered.length === 0) {
    return "done";
  }
  const slots: ChainTargetSlot[] = item.targetSlots
    ? [...item.targetSlots]
    : discovered.map((d) => ({ max: 0, min: 0, semantics: d.semantics, slot: d.path }));
  const nextIdx = slots.findIndex((s) => s.ids === undefined);
  if (nextIdx < 0) {
    if (item.targetSlots === undefined) {
      patchItem(draft, item.id, { targetSlots: slots });
    }
    return "done";
  }
  const entry = slots[nextIdx] as ChainTargetSlot;
  const found = discovered.find((d) => d.path === entry.slot);
  if (!found) {
    // The stored effect changed shape (paid cost steps sliced off): nothing to name.
    slots[nextIdx] = { ...entry, ids: [] };
    patchItem(draft, item.id, { targetSlots: slots });
    return "continue";
  }
  const effCtx = itemPlanningContext(draft, item, context);
  const surchargeOf = (ids: readonly string[]): number =>
    getDeflectSurcharge(draft, item.controller, [...ids], ctx.cards as never, item.cardId, ctx.zones as never);
  const budget = pooledPower(draft, item.controller);
  // rule 809.1.d — an object whose own surcharge is out of reach can never be chosen.
  const candidates = slotCandidates(found, effCtx).filter((id) => surchargeOf([id]) <= budget);
  let max = candidates.length;
  if (found.cap !== undefined) {
    max = Math.min(max, found.cap);
  }
  if (found.semantics === "split") {
    max = Math.min(max, splitDamageAvailable(found.node, effCtx));
  }
  slots[nextIdx] = { ...entry, max: Math.max(0, max), min: 0 };
  patchItem(draft, item.id, { targetSlots: slots });
  if (candidates.length === 0 || max <= 0) {
    bindTargetSlot(draft, item.id, entry.slot, []);
    return "continue";
  }
  const nameOf = (cardId: string): string =>
    (ctx.cards.getCardName?.(cardId as CoreCardId) as string | undefined) ??
    (getGlobalCardRegistry().get(cardId) as { name?: string } | undefined)?.name ??
    cardId;
  const taxed = candidates.some((id) => surchargeOf([id]) > 0);
  const capText = found.cap === undefined && max >= candidates.length ? "any number of" : `up to ${max}`;
  draft.pendingChoice = {
    ...(taxed ? { constraint: { deflectAffordable: true } } : {}),
    max,
    min: 0,
    options: candidates.map((id) => {
      const deflect = surchargeOf([id]);
      return { cardId: id, key: id, label: nameOf(id), ...(deflect > 0 ? { deflect } : {}) };
    }),
    playerId: item.controller,
    prompt:
      found.semantics === "split"
        ? `Choose the targets to split ${nameOf(item.cardId)}'s damage among (${capText}; the amounts are decided when it resolves)`
        : `Choose ${capText} target${capText === "up to 1" ? "" : "s"} for ${nameOf(item.cardId)}'s ability (none is allowed)`,
    resume: { itemId: item.id, kind: "target-slot", slot: entry.slot },
    semantics: "target",
    slotSemantics: found.semantics,
    sourceCardId: item.cardId,
    type: "pick-many",
  } as RiftboundGameState["pendingChoice"];
  return "prompted";
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
  raiseTriggerOrderPrompt(draft, ctx, fresh);
}

/**
 * rule 383.3.d + 383.3.b.1 — when two simultaneous triggers of ONE controller
 * each carry a finalization (base) cost, their order is not cosmetic: the first
 * one taken up spends resources and cost objects the other may still need (the
 * Emperor's Dais returning the very Vayne whose own trigger then wants paying).
 * So the choice is offered BEFORE the sweep finalizes them, while every item is
 * still Pending. It stays the same soft `order` prompt — ignoring it keeps the
 * listed order — and the batch is marked seen so the post-finalization offer
 * does not ask a second time.
 */
function offerPendingCostTriggerOrder(draft: RiftboundGameState, ctx: FinalizationContext): boolean {
  if (draft.pendingTriggerOrder !== undefined) {
    return false;
  }
  const items = chainItems(draft) ?? [];
  const d = draft as RiftboundGameState & { triggerBatchSeen?: string[] };
  const seen = new Set(d.triggerBatchSeen ?? []);
  const costed = items.filter(
    (it) =>
      it.triggered === true &&
      it.status === "pending" &&
      it.countered !== true &&
      it.optInCost !== undefined &&
      !seen.has(it.id),
  );
  if (costed.length < 2) {
    return false;
  }
  // Two copies of ONE ability (two Icevale Archers' "you may pay [1]") pay the
  // same cost for the same effect — nothing depends on which is taken up first,
  // so the pre-finalization offer stays out of the way. Only genuinely different
  // costed abilities (Emperor's Dais vs. Vayne) are ordered up front.
  const distinct = costed.filter((it) =>
    costed.some(
      (other) =>
        other.controller === it.controller &&
        (other.triggerBatch ?? "") === (it.triggerBatch ?? "") &&
        JSON.stringify(other.effect ?? null) !== JSON.stringify(it.effect ?? null),
    ),
  );
  if (distinct.length < 2 || !raiseTriggerOrderPrompt(draft, ctx, distinct)) {
    return false;
  }
  d.triggerBatchSeen = [...(d.triggerBatchSeen ?? []), ...distinct.map((it) => it.id)];
  return true;
}

/**
 * Effect kinds whose serialized form names no target because they always act on
 * their OWN source — they are source-bound exactly as a written `"self"` is.
 * rule 816.1 — [Temporary]'s "kill me" on two permanents is two different kills.
 */
const IMPLICIT_SELF_EFFECTS: ReadonlySet<string> = new Set(["temporary-kill"]);

/** Shared 383.3.d chooser/grouping for `fresh` candidate items; true when a prompt was raised. */
function raiseTriggerOrderPrompt(
  draft: RiftboundGameState,
  ctx: FinalizationContext,
  fresh: readonly ChainItem[],
): boolean {
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
  // rule 816.1 (ruling bd1e9b90cf899340) — an effect kind that names no target
  // because it acts on its OWN source ([Temporary]'s "kill me") is source-bound
  // just as much as a written `"self"`: two [Temporary] triggers kill different
  // permanents, so their controller really does get to order them.
  const signature = (it: ChainItem): string => {
    const json = JSON.stringify(it.effect ?? null);
    const kind = (it.effect as { type?: string } | undefined)?.type;
    const sourceBound =
      /"self"|"trigger-source"|"here"|"source"|"same"/.test(json) ||
      (kind !== undefined && IMPLICIT_SELF_EFFECTS.has(kind));
    // Underscore-prefixed keys are engine bookkeeping (`_modeInstance` records WHICH
    // copy of a text produced the effect — e.g. Svellsongur's 718.3 copy of its
    // wearer's trigger). They don't change what a fixed effect DOES, so two otherwise
    // identical source-independent instances stay interchangeable (rule-id:
    // ven-046a-166 × sfd-059-221 — two "you score 1 point" triggers). Source-bound
    // effects keep the full JSON (their provenance picks their target), and so do
    // modal ones: each instance carries its own "not chosen this turn" memory and
    // may still resolve to a different mode (rule-id: sfd-049-221 Aphelios).
    const modal = (it.effect as { type?: string } | undefined)?.type === "choice";
    const identity =
      sourceBound || modal
        ? json
        : JSON.stringify(it.effect ?? null, (k, v) => (k.startsWith("_") ? undefined : v));
    // rule 383.3.d — an effect that reads the TRIGGERING object ("ready it",
    // `{type:"trigger-source"}`) does something different per instance even when
    // its JSON and its source card are identical: one Fiora item readies A, the
    // other readies B. The triggering object is part of that item's identity, so
    // two such items are NOT interchangeable and their controller orders them.
    const triggerObject = /"trigger-source"/.test(json) ? (it.triggerEvent?.cardId ?? "") : "";
    return `${sourceBound ? it.cardId : ""}|${triggerObject}|${identity}`;
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
    return false;
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
  return true;
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
    // rule 355.10 / 402.2 (ogn-156-298 Sabotage, ogn-192-298 Mindsplitter) —
    // "Choose an opponent. They reveal their hand …": the seat is one of the
    // choices made as the item is PLAYED, before anyone receives Priority. A
    // single legal player is auto-bound by the handler (402.2, every 1v1 game);
    // with two or more the item's controller is asked here and the answer rides
    // on the effect as `_chosenPlayer` (see `abilities/chosen-player.ts`).
    if (raiseRevealHandOpponentChoice(draft)) {
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
    // rule 383.3.d — two costed triggers of one controller: their controller
    // orders them BEFORE the first base cost is paid (383.3.b.1).
    if (offerPendingCostTriggerOrder(draft, ctx)) {
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

    // rule 359.3.e.14.b / 370.1.a.1 — a queued "If this kills it, do this: …"
    // rider whose kill turned out to be REPLACED (a single-use shield chose
    // that death at the Cleanup — rule 373) never triggered at all: the item is
    // removed before Priority instead of resolving to nothing.
    if (killGuardAlreadyFailed(item, draft, context)) {
      removeUnfinalizedItem(draft, item.id);
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
      if (!optInIsPerformable(item, draft, context, { atFinalization: true })) {
        removeUnfinalizedItem(draft, item.id);
        continue;
      }
      // rule 404.1 — a [Deflect] surcharge this item's own choice will owe is
      // part of THIS cost payment, so answering here is answering for it too.
      patchItem(draft, item.id, { deflectOffered: true });
      draft.pendingChoice = {
        finalizationChainItemId: item.id,
        playerId: item.controller,
        resolved: { ...item, deflectOffered: true, optional: false },
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

    // Step 1c — rule 404.2 / 809.1.c.1: a MANDATORY trigger still INCURS a cost
    // when every object it may choose has [Deflect], and a cost a triggered
    // ability incurs may always be declined — declining removes the Pending
    // Item (it never becomes a Chain Item). Only offered when the controller
    // can actually pay; otherwise the item is removed unasked by the target
    // step below (404.2), and the surcharge itself is charged there on accept.
    if (
      item.type === "ability" &&
      item.triggered === true &&
      item.targets === undefined &&
      item.deflectOffered !== true
    ) {
      const pips = minDeflectSurchargeForItem(item, draft, context);
      // rule 429.3.a (ruling cb0c9c7b9d025ad8) — the Pay this prompt opens keeps
      // the payer's rune [Add] abilities usable, so a rune it could recycle
      // right then counts towards affordability: asking is what lets them.
      if (pips > 0 && totalPooledPower(draft, item.controller) + recyclableRunes(ctx, item.controller) >= pips) {
        patchItem(draft, item.id, { deflectOffered: true });
        draft.pendingChoice = {
          deflectSurcharge: pips,
          finalizationChainItemId: item.id,
          playerId: item.controller,
          resolved: { ...item, deflectOffered: true, optional: false },
          sourceCardId: item.cardId,
          type: "opt-in",
        };
        return;
      }
    }

    // Step 1e — rule 402.2 / 411.4 (rule-id: ven-133-166 Glowstone) — "Choose a
    // player" is one of the choices made as an ability is ACTIVATED: the seat is
    // named before anyone receives Priority, not when the item resolves. The
    // answer rides on the item's effect as `ownerId`.
    if (
      item.type === "ability" &&
      item.triggered !== true &&
      (item.effect as { player?: string } | undefined)?.player === "choose" &&
      (item.effect as { ownerId?: string } | undefined)?.ownerId === undefined
    ) {
      draft.pendingChoice = {
        effect: item.effect,
        finalizationChainItemId: item.id,
        options: Object.keys(draft.players),
        playerId: item.controller,
        prompt: "Choose a player",
        sourceCardId: item.cardId,
        type: "choose-player",
      } as typeof draft.pendingChoice;
      return;
    }

    // Step 2 — rule 402.2 targets.
    // rule 355.5 — a SPELL names its targets as it is PLAYED. One played by an
    // effect mid-resolution (Promising Future) reaches the Chain without the
    // play move's enumerator having asked, so its multi-pick ("up to two
    // units") is asked here, before anyone receives Priority.
    if ((item.type === "ability" || (item.type === "spell" && item.targets === undefined)) && item.effect !== undefined) {
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
      // Step 2b — rule 402.2 / 355.13 / 355.14.b: variable-count target sets
      // ("split among any number of …", "up to N …") are chosen now as well.
      // (A DELAYED ability — rule 392, "… at the end of this turn" — keeps the
      // legacy accumulate prompt of `executeResolvedItem` for its picks.)
      if (item.type === "ability" && item.delayed !== true) {
        const r = finalizeTargetSlots(draft, ctx, item.id, context);
        if (r === "prompted") {
          return;
        }
        if (r === "continue") {
          continue;
        }
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
