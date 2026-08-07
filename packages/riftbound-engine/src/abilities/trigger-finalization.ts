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
import { buildEffectContext } from "../game-definition/moves/chain/effect-context";
import { executeResolvedItem, optInIsPerformable } from "../game-definition/moves/chain/resolve";
import { raisePlayTimeModeChoice } from "../game-definition/moves/play/play-time-modes";
import { continueRevealSlotLock, isSinglePickSlot } from "../game-definition/moves/play/reveal-target-lock";
import {
  collectSequenceTargetSlots,
  findSequenceLeadTarget,
  type SpellEffectTargetShape,
} from "../game-definition/moves/play/targeting";
import type { RiftboundGameState } from "../types";
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
  const t = target as { type?: unknown; quantity?: unknown };
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

/**
 * Base costs whose payment picks a Game Object of its own ("recycle another
 * unit to …", "kill 3 friendly units to …", "discard 2 to …"). Their pay
 * step still runs at resolution through the legacy opt-in path until the
 * payment sub-step can bind the paid object onto the item.
 */
function costChoosesObjects(cost: unknown): boolean {
  if (!cost || typeof cost !== "object") {
    return false;
  }
  const c = cost as Record<string, unknown>;
  // rule 204.3.a (rule-id: sfd-128-221) — "kill me to …" names no Game Object
  // to choose, so it is a simple cost payable during finalization.
  if (c.kill === "self") {
    return false;
  }
  return (
    c.recycle !== undefined ||
    c.kill !== undefined ||
    c.discard !== undefined ||
    c.burn !== undefined ||
    c.returnToHand !== undefined
  );
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
  const steps = [...effect.effects] as Record<string, unknown>[];
  let paid = 0;
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i] as Record<string, unknown>;
    if (step?.costStep !== true) {
      break;
    }
    let bound = live.targets?.[i];
    const descriptor = step.target as TargetDescriptor | undefined;
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
          bindSlotIndex: i,
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
      patchItem(draft, itemId, { targets: [...(live.targets ?? []), bound] });
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
    const remainingTargets = (latest?.targets ?? []).slice(paid);
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
 * Finalize Pending trigger items oldest-first (rule 337.1.b) until one of them
 * needs an answer or none is left. Safe to call whenever no prompt is open.
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
    const items = chainItems(draft);
    const item = items?.find((it) => it.status === "pending");
    if (!items || !item) {
      return;
    }
    // rule 337.1.b / 354.2 — an effect-instructed play appended before this
    // trigger finalizes first (it asks its location as it leaves the Chain).
    if (item.finalizeAfter?.some((id) => items.some((it) => it.id === id))) {
      return;
    }
    if (item.countered) {
      patchItem(draft, item.id, { status: "finalized" });
      continue;
    }
    const context = toResolveContext(ctx);

    // Step 1 — rule 402.1 / 383.3.a (+ 383.3.b base cost on the same prompt).
    if (item.optional === true) {
      if (costChoosesObjects(item.optInCost)) {
        // Deferred: asked (and paid) at resolution by the legacy path.
        patchItem(draft, item.id, { status: "finalized" });
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
        moveDepth += 1;
        try {
          originalReducer(draft, context);
        } finally {
          moveDepth = Math.max(0, moveDepth - 1);
        }
        if (context?.cards && context?.zones && !draft?.pendingChoice) {
          finalizePendingItems(draft, context as FinalizationContext);
        }
      },
    };
  }
  return wrapped as TMoves;
}
