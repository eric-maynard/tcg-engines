/**
 * Pending-choice moves.
 *
 * Handles the "opponent reveals their hand, active player picks a card"
 * flow used by Sabotage, Mindsplitter, and Ashe Focused.
 *
 * A `reveal-hand` effect places a `PendingChoice` on the game state and
 * pauses play. `resolvePendingChoice` is the only legal move while the
 * choice is pending; it validates the pick against the filter, applies
 * the stored effect (recycle / banish / discard), and clears the state.
 */

import type {
  CardId as CoreCardId,
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
  GameMoveDefinitions,
} from "@tcg/core";
import { enumerateDamageAssignments, isLegalDamageAssignment } from "../../combat";
import type { DamageAssignmentPlan } from "../../combat";
import { continueKillBatch, recordDieBatchAnswer } from "../../abilities/die-replacement-batch";
import { executeEffect } from "../../abilities/effect-executor";
import type { EffectContext, ExecutableEffect } from "../../abilities/effect-executor";
import { locationKeyOf } from "../../abilities/effects/choose-per-location";
import { markContestedOnArrival } from "../../abilities/effects/move";
import { isBlockedByTwoOtherPlayers } from "./movement/helpers";
import { castSpellFromTrash } from "../../abilities/effects/play";
import { contestBattlefieldOnArrival } from "./movement/contest-arrival";
import { openPendingContestedShowdown } from "./chain/showdown";
import { hasTrashToBanishReplacement } from "../../abilities/replacement-effects";
import { resolveTarget } from "../../abilities/target-resolver";
import * as triggerRunner from "../../abilities/trigger-runner";
import { fireTriggers } from "../../abilities/trigger-runner";
import { continueRevealSlotLock } from "./play/reveal-target-lock";
import { addToChain, createInteractionState, removeChainItem } from "../../chain";
import { cleanupAndFireDeaths } from "../../cleanup/post-move-cleanup";
import type { PostMoveCleanupContext } from "../../cleanup/post-move-cleanup";
import { getGlobalCardRegistry } from "../../operations/card-lookup";
import { leaveBoard } from "../../operations/leave-board";
import type {
  OrderChoice,
  PendingChoice,
  PickManyChoice,
  RiftboundCardMeta,
  RiftboundGameState,
  RiftboundMoves,
} from "../../types";
import { buildEffectContext, executeResolvedItem } from "./chain-moves";
import { deductAbilityCost } from "./chain/activate-ability";
import { canAffordPower } from "./chain/effect-context";
import {
  flushDeferredSpellSettle,
  minDeflectSurchargeForItem,
  payAnyDomainPower,
} from "./chain/resolve";
import { completeSuspendedPlay } from "./play/play-unit";
import { offerWeaponmasterEquip } from "./play/weaponmaster";
import {
  type CostExtras,
  canPayResourceCost,
  computePlayResourceCost,
  createMetaAccessor,
  discountOptionalPlayCost,
  getCardEffectiveMight,
  getDeflectSurcharge,
  getOptionalPlayCost,
  getPotentialRuneEnergy,
  payResourceCost,
  staticEnterReadyApplies,
} from "./play/cost";
import { collectChoiceNodes, raisePlayTimeModeChoice } from "./play/play-time-modes";
import { isLegalMultiTargetSet, spellEffectHasLegalTargets } from "./play/targeting";
import type { SpellEffectTargetShape } from "./play/targeting";

const isBoardZone = (z: string): boolean => z === "base" || z.startsWith("battlefield-");

/**
 * rule 809.1.c / 809.1.c.1 (356.2.a.2) — the [Deflect] surcharge for choosing an
 * opponent's Deflect card with an ability is incurred WHEN THE TARGET IS CHOSEN.
 * `chain/resolve.ts` charges the auto-bound single candidate and flags the
 * multi-candidate prompt with `deflectTax`; this pays it at pick time.
 */
function chargePromptedDeflectTax(
  draft: RiftboundGameState,
  choice: { deflectTax?: true; playerId: string },
  pickedIds: readonly string[],
  cards: { getCardOwner?: unknown; getCardController?: unknown; getCardMeta?: unknown },
): void {
  if (choice.deflectTax !== true || pickedIds.length === 0) {
    return;
  }
  const owed = getDeflectSurcharge(
    draft,
    choice.playerId,
    [...pickedIds],
    cards as Parameters<typeof getDeflectSurcharge>[3],
  );
  payAnyDomainPower(draft, choice.playerId, owed);
}

/**
 * rule 355.10 (sfd-039-221 Royal Entourage) — a modal ability's target belongs
 * to the CHOSEN mode ("ready or exhaust a legend"), so it is declared right
 * after the mode is picked. With two or more legal candidates the controller
 * must choose; a single candidate binds itself and zero candidates fizzle.
 * Returns true when a `choose-target` prompt was raised.
 */
function liftModalTarget(
  draft: RiftboundGameState,
  choice: { sourceCardId: string; playerId: string; controllerId?: string; then?: unknown },
  effect: ExecutableEffect,
  // biome-ignore lint/suspicious/noExplicitAny: move context bag is framework-typed
  context: any,
): boolean {
  const target = (effect as { target?: unknown }).target;
  if (
    typeof target !== "object" ||
    target === null ||
    typeof (target as { type?: unknown }).type !== "string"
  ) {
    return false;
  }
  const t = target as { type: string; quantity?: unknown };
  if (
    t.type === "self" ||
    t.type === "trigger-source" ||
    t.type === "player" ||
    t.type === "battlefield" ||
    t.quantity === "all" ||
    // rule 355.10 (sfd-049-221) — only a SINGLE caster-chosen target is
    // declared through this prompt. "Ready 2 runes" names a multi-object
    // target set, not one choice; lifting it here would prompt for one rune
    // and drop the rest. Those resolve inside the handler via resolveTarget.
    (typeof t.quantity === "number" && t.quantity > 1) ||
    (typeof t.quantity === "object" && t.quantity !== null)
  ) {
    return false;
  }
  const controller = choice.controllerId ?? choice.playerId;
  const allOptions = resolveTarget({ ...t, quantity: "all" }, {
    cards: context.cards,
    choosing: true,
    draft,
    playerId: controller,
    sourceCardId: choice.sourceCardId,
    sourceZone: context.zones.getCardZone(choice.sourceCardId as CoreCardId),
    zones: context.zones,
  } as Parameters<typeof resolveTarget>[1]);
  // rule 809.1.b / 356.2.a.2 (rule-id: ven-035-166) — the [Deflect] surcharge is a
  // MANDATORY additional cost of CHOOSING that object, so a candidate whose
  // surcharge the chooser cannot cover is not a legal choice and must never be
  // offered (nor auto-bound for free). The source is already on the chain when a
  // modal target is lifted, so the whole pooled Power is the budget.
  const deflectBudget = Object.values(
    (draft as { runePools?: Record<string, { power?: Partial<Record<string, number>> }> })
      .runePools?.[controller]?.power ?? {},
  ).reduce((a: number, b) => a + (b ?? 0), 0);
  const options = allOptions.filter(
    (id) => getDeflectSurcharge(draft, controller, [id], context.cards) <= deflectBudget,
  );
  const deflectFiltered = options.length < allOptions.length;
  // rule 809.1.c.1 (rule-id: sfd-077-221) — the [Deflect] surcharge is owed
  // when the target is CHOSEN, which for a modal effect is here and not at
  // cast time. A sole auto-bound candidate is charged immediately; a real
  // prompt carries `deflectTax` and is charged at pick time.
  const deflectTax = options.some(
    (id) => getDeflectSurcharge(draft, controller, [id], context.cards) > 0,
  );
  // rule 355.8 / 442.1.a (rule-id: ven-035-166) — a mode whose descriptor
  // RESTRICTS what it may choose ("a unit that's [Empowered]") is still the
  // controller's public choice: prompt with the sole survivor rather than
  // auto-binding, so the restricted pool is visible (same reasoning as the
  // fixed-destination move prompt in `chain/resolve.ts`).
  const restrictedSole =
    options.length === 1 &&
    (deflectFiltered ||
      ((t as { filter?: unknown }).filter !== undefined &&
    resolveTarget({ ...t, filter: undefined, quantity: "all" }, {
      cards: context.cards,
      choosing: true,
      draft,
      playerId: controller,
      sourceCardId: choice.sourceCardId,
      sourceZone: context.zones.getCardZone(choice.sourceCardId as CoreCardId),
      zones: context.zones,
    } as Parameters<typeof resolveTarget>[1]).length >= 2));
  if (options.length < 2 && !restrictedSole) {
    if (deflectTax && options.length === 1) {
      payAnyDomainPower(
        draft,
        controller,
        getDeflectSurcharge(draft, controller, [...options], context.cards),
      );
    }
    return false;
  }
  draft.pendingChoice = {
    effect,
    options,
    playerId: controller,
    remaining: 1,
    sourceCardId: choice.sourceCardId,
    ...(deflectTax ? { deflectTax: true as const } : {}),
    // rule 820.2 (unl-182-219) — the suspended continuation (e.g. the later
    // [Repeat] executions) rides along on the lifted target prompt; dropping
    // it here would silently lose those executions.
    ...(choice.then !== undefined ? { then: choice.then } : {}),
    type: "choose-target",
  };
  return true;
}

/** rule 465.2.c.3 — the stored combat-damage prompt re-read as an assignment plan. */
function combatAssignmentPlan(choice: {
  options: readonly string[];
  total: number;
  lethalNeed: Readonly<Record<string, number>>;
  tier: Readonly<Record<string, number>>;
  defaultAllocation: Readonly<Record<string, number>>;
}): DamageAssignmentPlan {
  return {
    defaultAllocation: { ...choice.defaultAllocation },
    hasChoice: true,
    need: { ...choice.lethalNeed },
    order: [...choice.options],
    tier: { ...choice.tier },
    total: choice.total,
  };
}

/**
 * rule 355.14.c/f/g (ogn-041-298): a split-damage allocation is legal when
 * every keyed id is an option, each amount is a positive integer, at most
 * `total` targets are named, and the amounts sum to exactly `total` (or no
 * target is named at all — "any number of" includes zero).
 */
function isLegalSplitAllocation(
  options: readonly string[],
  total: number,
  allocation: unknown,
): allocation is Record<string, number> {
  if (!allocation || typeof allocation !== "object") return false;
  const entries = Object.entries(allocation as Record<string, unknown>).filter(
    ([, v]) => v !== 0,
  );
  let sum = 0;
  for (const [id, v] of entries) {
    if (!options.includes(id)) return false;
    if (typeof v !== "number" || !Number.isInteger(v) || v < 1) return false;
    sum += v;
  }
  if (entries.length === 0) return true;
  return entries.length <= total && sum === total;
}

/** rule 355.14 (ogn-041-298): every legal split of `total` over subsets of `options` (capped). */
function enumerateSplitAllocations(
  options: readonly string[],
  total: number,
  cap = 500,
): Record<string, number>[] {
  const out: Record<string, number>[] = [];
  const walk = (idx: number, remaining: number, acc: Record<string, number>): void => {
    if (out.length >= cap) return;
    if (idx === options.length) {
      if (remaining === 0) out.push({ ...acc });
      return;
    }
    const id = options[idx] as string;
    // skip this option
    walk(idx + 1, remaining, acc);
    for (let k = 1; k <= remaining; k++) {
      acc[id] = k;
      walk(idx + 1, remaining - k, acc);
      delete acc[id];
    }
  };
  walk(0, total, {});
  // most-concentrated splits first so a lone target taking everything leads
  out.sort((a, b) => Object.keys(a).length - Object.keys(b).length);
  out.push({});
  return out;
}

/**
 * rule-id: sfd-109-221 (rule 356.1.b.3 / 560) — a pending "play it, ignoring
 * its cost" finalized via choose-destination is still a play: the unit's
 * optional "you may pay X as an additional cost" may be paid. Returns that
 * cost when `choice` is such a play (card entering the board from off-board)
 * and its controller can pay it from their pool right now.
 */
function pendingPlayOptionalCost(
  state: RiftboundGameState,
  choice: PendingChoice,
  // biome-ignore lint/suspicious/noExplicitAny: move context bag is framework-typed
  context: any,
): { energy: number; power: readonly string[] } | undefined {
  if (choice.type !== "choose-destination" || choice.created) {
    return undefined;
  }
  const from = context.zones?.getCardZone?.(choice.cardId as CoreCardId) as string | undefined;
  if (from === undefined || isBoardZone(from)) {
    return undefined;
  }
  const optional = getOptionalPlayCost(choice.cardId as string);
  if (optional?.kind !== "pay" || (optional.cost?.xp ?? 0) > 0) {
    return undefined;
  }
  const cost = { energy: optional.cost?.energy ?? 0, power: optional.cost?.power ?? [] };
  return canPayOptInCost(state, choice.playerId, choice.cardId as string, cost, {
    counters: context.counters ?? {},
  })
    ? cost
    : undefined;
}

/**
 * rule 356.2.b.1 (rule-id: sfd-200-221-accelerate-on-free-replay) — a unit an
 * effect made someone play (Arcane Shift's "its owner plays it, ignoring its
 * cost") entered exhausted (rule 143.4); its [Accelerate] cost is an optional
 * additional cost of THAT play, so its player is offered the opt-in now and
 * paying readies it. Skipped when it is already ready, unpayable, or another
 * prompt is pending.
 */
function maybeOfferAccelerate(
  draft: RiftboundGameState,
  cardId: string,
  playerId: string,
  // biome-ignore lint/suspicious/noExplicitAny: move context bag is framework-typed
  context: any,
): void {
  if (draft.pendingChoice) {
    return;
  }
  if (getGlobalCardRegistry().get(cardId)?.cardType !== "unit") {
    return;
  }
  if (context.counters?.getFlag?.(cardId as CoreCardId, "exhausted") !== true) {
    return;
  }
  const optional = getOptionalPlayCost(cardId);
  if (optional?.kind !== "accelerate") {
    return;
  }
  const printed = { energy: optional.cost?.energy ?? 0, power: optional.cost?.power ?? [] };
  if (printed.energy === 0 && printed.power.length === 0) {
    return;
  }
  // rule 356.4.c (sfd-149-221): friendly "optional additional costs you pay
  // cost [1] or [rainbow] less" statics shave this cost before it is offered.
  const board =
    context.cards && context.zones ? { cards: context.cards, zones: context.zones } : undefined;
  const cost = discountOptionalPlayCost(draft, playerId, printed, board) ?? printed;
  if (!canPayOptInCost(draft, playerId, cardId, cost, { counters: context.counters ?? {} })) {
    return;
  }
  draft.pendingChoice = {
    playerId,
    resolved: {
      cardId,
      controller: playerId,
      effect: { type: "enter-ready" },
      optInCost: cost,
      type: "ability",
    },
    sourceCardId: cardId,
    type: "opt-in",
  } as typeof draft.pendingChoice;
}

/**
 * rule 436 / 359.3.e (unl-136-219 Scryer's Bloom) — "[Predict 2], THEN draw 1".
 * A sequence step that parked a prompt owning its own `then` chain (the next
 * Predict) leaves the sequence remainder in `deferredSequenceRest`; run it once
 * the whole prompt chain has been answered, so the draw takes whatever the
 * player chose to leave on top. A remainder that parks a prompt of its own is
 * re-deferred together with the entries behind it.
 */
function flushDeferredSequenceRest(draft: RiftboundGameState, context: unknown): void {
  const queue = draft.deferredSequenceRest;
  if (!queue || queue.length === 0 || draft.pendingChoice) {
    return;
  }
  draft.deferredSequenceRest = undefined;
  for (let i = 0; i < queue.length; i++) {
    const entry = queue[i] as NonNullable<RiftboundGameState["deferredSequenceRest"]>[number];
    executeEffect(
      entry.effect as ExecutableEffect,
      buildEffectContext(draft, entry.playerId, entry.sourceCardId ?? "", context),
    );
    if (draft.pendingChoice) {
      const rest = queue.slice(i + 1);
      if (rest.length > 0) {
        draft.deferredSequenceRest = [...(draft.deferredSequenceRest ?? []), ...rest];
      }
      return;
    }
  }
}

/**
 * rule-id: ogn-063-298 — a picked choice's effect (e.g. a buff) can change
 * what a static ability grants ("friendly buffed units have [Deflect]"), so
 * static recalc + SBA must run after it executes, same as after a chain
 * resolve. Guarded so unit-test stubs without full context bags don't crash.
 */
function postChoiceCleanup(draft: RiftboundGameState, context: unknown): void {
  flushDeferredSequenceRest(draft, context);
  const ctx = context as Partial<PostMoveCleanupContext> | undefined;
  if (ctx?.cards && ctx?.counters && ctx?.zones && typeof ctx.zones.getCardsInZone === "function") {
    // rule 357.2.a — a play suspended while its cost-kill waited on an optional
    // die replacement completes now that the payment has settled.
    if (draft.suspendedPlay && !draft.pendingChoice) {
      completeSuspendedPlay(draft, context);
    }
    // rule 359.3.d — a spell whose effect suspended on a prompt is placed in the
    // trash only now that its resolution has actually finished.
    flushDeferredSpellSettle(
      draft,
      context as Parameters<typeof flushDeferredSpellSettle>[1],
    );
    cleanupAndFireDeaths(draft, ctx as PostMoveCleanupContext);
    // rule 323.12 / 344.2 — the Cleanup after the last choice of a resolution
    // begins whatever Showdown that resolution staged (showdown-only
    // battlefields first, then a staged Combat).
    openPendingContestedShowdown(
      draft,
      ctx as unknown as Parameters<typeof openPendingContestedShowdown>[1],
    );
  }
}

/**
 * rule 354.2 / 419.4.a / 423 (unl-139-219 Bone Skewer) — the play triggers of a
 * card an effect instructed its own player to play to a fixed location, fired
 * once the (possibly zeroed) optional additional cost has been declared.
 */
function fireInstructedPlayTriggers(
  draft: RiftboundGameState,
  context: unknown,
  spec: { cardId: string; paidAdditionalCost: boolean; playStun: boolean; playerId: string },
): void {
  const { cardId, paidAdditionalCost, playStun, playerId } = spec;
  const ctx = context as { cards: unknown; counters: unknown; zones: unknown };
  const playCtx = {
    cards: ctx.cards,
    counters: ctx.counters,
    draft,
    zones: ctx.zones,
  } as unknown as Parameters<typeof fireTriggers>[1];
  fireTriggers({ cardId, paidAdditionalCost, playerId, type: "play-self" }, playCtx);
  fireTriggers({ cardId, cardType: "unit", playerId, type: "play-card" }, playCtx);
  if (playStun) {
    fireTriggers({ cardId, type: "stun" }, playCtx);
  }
  if (draft.cardsPlayedThisTurn) {
    draft.cardsPlayedThisTurn[playerId] = (draft.cardsPlayedThisTurn[playerId] ?? 0) + 1;
  }
}

/** rule-id: sfd-119-221 — the pay-cost carried on an opt-in choice's chain item. */
function optInCostOf(choice: PendingChoice): Record<string, unknown> | undefined {
  if (choice.type !== "opt-in") {
    return undefined;
  }
  const cost = (choice.resolved as { optInCost?: unknown } | undefined)?.optInCost;
  return cost && typeof cost === "object" ? (cost as Record<string, unknown>) : undefined;
}

/**
 * rule 355.10.c.1 (rule-id: sfd-026-221) — the board units that can pay a
 * "recycle another friendly unit to …" cost-within-instruction. The trash and
 * the hand are never candidates: `from: "board"` means units in play.
 */
export function recycleCostCandidates(
  state: RiftboundGameState,
  playerId: string,
  sourceCardId: string,
  spec: unknown,
  // biome-ignore lint/suspicious/noExplicitAny: move context bag is framework-typed
  context: any,
): string[] {
  if (typeof context?.zones?.getCardsInZone !== "function" || !context?.cards) {
    return [];
  }
  const target = (spec as { target?: Record<string, unknown> } | undefined)?.target ?? {};
  const zoneIds = [
    "base",
    ...Object.keys((state as { battlefields?: Record<string, unknown> }).battlefields ?? {}).map(
      (bf) => `battlefield-${bf}`,
    ),
  ];
  const registry = getGlobalCardRegistry();
  const out: string[] = [];
  for (const zoneId of zoneIds) {
    for (const raw of context.zones.getCardsInZone(zoneId as CoreZoneId, playerId as CorePlayerId)) {
      const id = raw as string;
      if (target.excludeSelf === true && id === sourceCardId) {
        continue;
      }
      const controller =
        context.cards.getCardController?.(id as CoreCardId) ??
        context.cards.getCardOwner?.(id as CoreCardId);
      const friendly = controller === playerId;
      if (target.controller === "enemy" ? friendly : !friendly) {
        continue;
      }
      if (typeof target.type === "string" && registry.getCardType(id) !== target.type) {
        continue;
      }
      out.push(id);
    }
  }
  return out;
}

/**
 * rule 357.2 (rule-id: ven-067-166) — the board permanents that can pay a
 * "kill N [other] friendly units and/or gear to …" cost: `spec` is either a
 * Target descriptor or `{ amount, target }`; `types` / `type` restrict the card
 * types, `excludeSelf` drops the source, `controller` defaults to friendly.
 */
export function killCostCandidates(
  state: RiftboundGameState,
  playerId: string,
  sourceCardId: string,
  spec: unknown,
  // biome-ignore lint/suspicious/noExplicitAny: move context bag is framework-typed
  context: any,
): string[] {
  if (typeof context?.zones?.getCardsInZone !== "function") {
    return [];
  }
  const raw = spec as { target?: Record<string, unknown> } & Record<string, unknown>;
  const target = (raw.target ?? raw) as {
    controller?: string;
    excludeSelf?: boolean;
    type?: string;
    types?: readonly string[];
  };
  const types =
    target.types && target.types.length > 0
      ? target.types
      : typeof target.type === "string" && target.type !== "permanent" && target.type !== "card"
        ? [target.type]
        : ["unit", "gear", "equipment"];
  const wantTypes = new Set(types.flatMap((t) => (t === "gear" ? ["gear", "equipment"] : [t])));
  const zoneIds = [
    "base",
    ...Object.keys((state as { battlefields?: Record<string, unknown> }).battlefields ?? {}).map(
      (bf) => `battlefield-${bf}`,
    ),
  ];
  const registry = getGlobalCardRegistry();
  const out: string[] = [];
  for (const zoneId of zoneIds) {
    for (const seat of Object.keys(state.players ?? {})) {
      for (const rawId of context.zones.getCardsInZone(zoneId as CoreZoneId, seat as CorePlayerId)) {
        const id = rawId as string;
        if (out.includes(id) || (target.excludeSelf === true && id === sourceCardId)) {
          continue;
        }
        const controller =
          context.cards?.getCardController?.(id as CoreCardId) ??
          context.cards?.getCardOwner?.(id as CoreCardId) ??
          seat;
        const friendly = controller === playerId;
        if (target.controller === "enemy" ? friendly : !friendly) {
          continue;
        }
        if (!wantTypes.has(registry.getCardType(id) as string)) {
          continue;
        }
        out.push(id);
      }
    }
  }
  return out;
}

/**
 * rule 355.10.c.1 (rule-id: sfd-026-221) — a cost paid WITHIN an instruction
 * ("recycle another friendly unit to play a Mech from your trash") is only
 * payable when the instruction itself has something to do: with no matching
 * card in the trash nothing is recycled and nothing is played.
 */
function payCostInstructionIsPerformable(
  playerId: string,
  effect: unknown,
  // biome-ignore lint/suspicious/noExplicitAny: move context bag is framework-typed
  context: any,
): boolean {
  const e = effect as { type?: string; from?: string; target?: Record<string, unknown> } | undefined;
  if (e?.type !== "play" || e.from !== "trash" || typeof context?.zones?.getCardsInZone !== "function") {
    return true;
  }
  const target = e.target ?? {};
  const filters = Array.isArray(target.filter)
    ? (target.filter as readonly unknown[])
    : target.filter !== undefined
      ? [target.filter]
      : [];
  const registry = getGlobalCardRegistry();
  return (
    context.zones
      .getCardsInZone("trash" as CoreZoneId, playerId as CorePlayerId)
      .map((id: unknown) => id as string)
      .filter((id: string) => {
        if (typeof target.type === "string" && target.type !== "card" && registry.getCardType(id) !== target.type) {
          return false;
        }
        const tags = (registry.get(id) as { tags?: readonly string[] } | undefined)?.tags ?? [];
        return filters.every((f) => {
          const tag = (f as { tag?: unknown } | null)?.tag;
          return typeof tag !== "string" || tags.includes(tag);
        });
      }).length > 0
  );
}

/** rule-id: sfd-026-221 — the effect an `opt-in` choice will run on accept. */
function optInEffectOf(choice: PendingChoice): unknown {
  return choice.type === "opt-in"
    ? (choice.resolved as { effect?: unknown } | undefined)?.effect
    : undefined;
}

/**
 * rule 809.1.c / 809.1.d (356.2.a.2) — [Deflect] taxes ABILITIES as well as
 * spells, and rule 404.1 puts that surcharge in the SAME cost payment as the
 * trigger's own base cost ("you may kill me to move an attacking unit …").
 * A controller who cannot cover both may only decline (404.2) — there is no
 * partial payment that spends the base cost alone. This folds the unavoidable
 * any-domain pips into the cost used for the payability GATE only; the
 * surcharge itself is charged when the finalized item picks its target.
 */
function optInCostForPayability(
  state: RiftboundGameState,
  choice: PendingChoice,
  // biome-ignore lint/suspicious/noExplicitAny: move context bag is framework-typed
  context: any,
): Record<string, unknown> | undefined {
  const cost = optInCostOf(choice);
  if (choice.type !== "opt-in" || !context?.cards || !context?.zones) {
    return cost;
  }
  const resolved = choice.resolved as
    | { cardId: string; controller: string; effect?: unknown; targets?: readonly string[] }
    | undefined;
  if (!resolved) {
    return cost;
  }
  const pips = minDeflectSurchargeForItem(resolved, state, context);
  if (pips <= 0) {
    return cost;
  }
  return {
    ...(cost ?? {}),
    power: [
      ...((cost?.power as readonly string[] | undefined) ?? []),
      ...Array.from({ length: pips }, () => "rainbow"),
    ],
  };
}

/**
 * rule-id: sfd-119-221 — whether `playerId` can pay a "you may pay [N] to …"
 * trigger's cost right now (energy, power pips, and [Exhaust] on the source).
 */
function canPayOptInCost(
  state: RiftboundGameState,
  playerId: string,
  sourceCardId: string,
  cost: Record<string, unknown>,
  context: {
    counters: { getFlag?: (cardId: CoreCardId, flag: string) => boolean | undefined };
    zones?: { getCardsInZone: (zone: never, player: never) => readonly CoreCardId[] };
  },
  effect?: unknown,
): boolean {
  // rule 355.10.c.1 (rule-id: sfd-026-221) — "recycle another friendly unit to
  // …" is a cost within the instruction: with nothing to recycle (or nothing
  // for the instruction to do) it cannot be paid, so the whole instruction is
  // unavailable — never free, and never a recycle for no payoff.
  const recycle = cost.recycle as { amount?: number } | undefined;
  if (recycle && typeof recycle === "object") {
    const needed = recycle.amount ?? 1;
    if (recycleCostCandidates(state, playerId, sourceCardId, recycle, context).length < needed) {
      return false;
    }
    if (!payCostInstructionIsPerformable(playerId, effect, context)) {
      return false;
    }
  }
  // rule 203 / 357.2 (rule-id: ven-067-166 Bottled Constellation) — "you may
  // kill 3 other friendly units and/or gear to …": an object cost naming N Game
  // Objects is payable only with at least N legal candidates on the board
  // ("other" never counts the source; enemy permanents are never friendly).
  const killSpec = cost.kill;
  if (killSpec !== undefined && killSpec !== "self" && typeof killSpec === "object" && killSpec !== null) {
    const needed = (killSpec as { amount?: number }).amount ?? 1;
    if (killCostCandidates(state, playerId, sourceCardId, killSpec, context).length < needed) {
      return false;
    }
  }
  const pool = state.runePools[playerId];
  if (!pool) {
    return false;
  }
  const energyCost = (cost.energy as number) ?? 0;
  // rule 429.3 (ogs-014-024 Lux, Crownguard): Energy earmarked "use only to
  // play spells/gear" can never fund a payment demanded while a spell or
  // ability RESOLVES (a counter's ransom, a "you may pay [N] to …") — that is
  // not playing a card, so every earmarked point is unavailable here.
  const earmarked = Object.values(
    (state as { restrictedEnergy?: Record<string, Partial<Record<string, number>>> })
      .restrictedEnergy?.[playerId] ?? {},
  ).reduce<number>((sum, amount) => sum + (amount ?? 0), 0);
  // rule 444.2.c / 357.1.a: a Pay demanded while an ability resolves is still
  // a Pay, so the payer may exhaust ready runes to fund it — credit their
  // yield here (deductAbilityCost taps them when the cost is actually paid).
  const runeEnergy =
    context.zones && energyCost > 0
      ? getPotentialRuneEnergy(
          context.zones as unknown as Parameters<typeof getPotentialRuneEnergy>[0],
          context.counters as unknown as Parameters<typeof getPotentialRuneEnergy>[1],
          playerId,
        )
      : 0;
  if (pool.energy - Math.min(earmarked, pool.energy) + runeEnergy < energyCost) {
    return false;
  }
  const powerCost = cost.power as string[] | undefined;
  if (powerCost && powerCost.length > 0) {
    const needed: Record<string, number> = {};
    for (const d of powerCost) {
      needed[d] = (needed[d] ?? 0) + 1;
    }
    if (!canAffordPower(pool.power, needed)) {
      return false;
    }
  }
  // rule 440.1 / 383.3.b (rule-id: ven-095-166) — "[Burn N] to …" is a cost
  // within instructions: it needs N cards in the payer's own Main Deck. An
  // empty Main Deck cannot pay it (Burn Out is never a way to fund a cost), so
  // the opt-in is not offered at all.
  const burnCost = (cost.burn as number) ?? 0;
  if (burnCost > 0) {
    const deck =
      typeof context.zones?.getCardsInZone === "function"
        ? context.zones.getCardsInZone("mainDeck" as never, playerId as never)
        : [];
    if (deck.length < burnCost) {
      return false;
    }
  }
  if (cost.exhaust === true && context.counters.getFlag?.(sourceCardId as CoreCardId, "exhausted")) {
    return false;
  }
  // rule 512.2 / rule-id: unl-135-219 — an XP cost is only payable out of the
  // paying player's own XP pool.
  const xpCost = (cost.xp as number) ?? 0;
  if (xpCost > 0 && (state.players[playerId]?.xp ?? 0) < xpCost) {
    return false;
  }
  return true;
}

/**
 * rule-id: sfd-119-221-weaponmaster-pays-reduced-equip-cost
 * Rule 821.1.c: Weaponmaster pays the chosen Equipment's Equip cost reduced
 * by [A] (one power of any domain); the non-power portion is still paid
 * (821.1.c.3). No Equip ability → the cost can't be paid (821.1.c.4).
 */
export function weaponmasterEquipCost(equipmentId: string): Record<string, unknown> | undefined {
  const abilities = getGlobalCardRegistry().getAbilities(equipmentId) ?? [];
  const equipAbility = abilities.find(
    (a) => a.type === "keyword" && (a as { keyword?: string }).keyword === "Equip",
  ) as
    | { cost?: { energy?: number; power?: readonly string[]; recycle?: number } }
    | undefined;
  if (!equipAbility) {
    return undefined;
  }
  const power = [...(equipAbility.cost?.power ?? [])];
  if (power.length > 0) {
    const rainbowIdx = power.indexOf("rainbow");
    power.splice(rainbowIdx === -1 ? 0 : rainbowIdx, 1);
  }
  // rule 821.1.c.3 (sfd-150-221 Last Rites): [A] only shaves a power pip — a
  // "Recycle N cards from your trash" portion of the Equip cost survives it
  // and is still paid in full.
  const recycle = equipAbility.cost?.recycle;
  return {
    energy: equipAbility.cost?.energy ?? 0,
    power,
    ...(typeof recycle === "number" && recycle > 0 ? { recycleFromTrash: recycle } : {}),
  };
}

/** Cards currently in `playerId`'s trash, when the zone bag is available. */
// biome-ignore lint/suspicious/noExplicitAny: move context bag is framework-typed
function trashSize(zones: any, playerId: string): number {
  if (typeof zones?.getCardsInZone !== "function") {
    return 0;
  }
  return zones.getCardsInZone("trash", playerId).length as number;
}

/** rule-id: sfd-119-221-weaponmaster-pays-reduced-equip-cost — 821.1.c.5 payability gate. */
function canPayWeaponmasterEquip(
  state: RiftboundGameState,
  playerId: string,
  equipmentId: string,
  context: Parameters<typeof canPayOptInCost>[4],
): boolean {
  const cost = weaponmasterEquipCost(equipmentId);
  if (cost === undefined) {
    return false;
  }
  // rule 821.1.c.5 (sfd-150-221): too few cards in the trash → the Equip cost
  // cannot be paid, so the Equipment is never offered and stays where it is.
  const needRecycle = cost.recycleFromTrash as number | undefined;
  if (needRecycle !== undefined && trashSize(context.zones, playerId) < needRecycle) {
    return false;
  }
  return canPayOptInCost(state, playerId, equipmentId, cost, context);
}

/**
 * All orderings of `items`. Callers only ever pass a handful of cards — the
 * largest printed Predict is 5 (rule 436.1.a: "put the rest back in any
 * order"), so enumerate every arrangement up to that size; longer lists fall
 * back to the current order plus its reverse to keep the move list finite.
 * The move condition still accepts ANY permutation, so a caller-supplied
 * order beyond this bound remains legal even when it isn't enumerated.
 */
const MAX_ENUMERATED_ORDER = 5;

function permutationsOf(items: readonly string[]): string[][] {
  if (items.length > MAX_ENUMERATED_ORDER) {
    return [[...items], [...items].reverse()];
  }
  if (items.length <= 1) {
    return [[...items]];
  }
  const out: string[][] = [];
  for (let i = 0; i < items.length; i++) {
    const head = items[i] as string;
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const tail of permutationsOf(rest)) {
      out.push([head, ...tail]);
    }
  }
  return out;
}


// ---------------------------------------------------------------------------
// Generic `order` / `pick-many` prompts (rule 372 / 373 / 383.3.d / 355.11.b)
// ---------------------------------------------------------------------------

/**
 * A legal `orderedKeys` answer: a permutation of the prompt's item keys — or,
 * for a `defaultable` prompt, absent / empty (keep the listed order).
 */
export function isValidOrderAnswer(choice: OrderChoice, orderedKeys: unknown): boolean {
  if (orderedKeys === undefined || (Array.isArray(orderedKeys) && orderedKeys.length === 0)) {
    return choice.defaultable === true;
  }
  if (!Array.isArray(orderedKeys)) {
    return false;
  }
  const keys = choice.items.map((i) => i.key);
  return (
    orderedKeys.length === keys.length &&
    new Set(orderedKeys).size === orderedKeys.length &&
    orderedKeys.every((k) => typeof k === "string" && keys.includes(k))
  );
}

/** A legal `pickedKeys` answer: `min ≤ n ≤ max` distinct option keys meeting the prompt's constraint. */
export function isValidPickManyAnswer(
  choice: PickManyChoice,
  pickedKeys: unknown,
  mightOf?: (cardId: string) => number,
  zoneOf?: (cardId: string) => string | undefined,
): boolean {
  const picked = pickedKeys === undefined ? [] : pickedKeys;
  if (!Array.isArray(picked)) {
    return false;
  }
  const keys = choice.options.map((o) => o.key);
  if (
    picked.length < choice.min ||
    picked.length > choice.max ||
    new Set(picked).size !== picked.length ||
    !picked.every((k) => typeof k === "string" && keys.includes(k))
  ) {
    return false;
  }
  // rule 355.11.b — the subset must itself fulfil the aggregate requirement.
  const cap = choice.constraint?.totalMightAtMost;
  if (cap !== undefined && mightOf) {
    const total = (picked as string[]).reduce((sum, key) => {
      const cardId = choice.options.find((o) => o.key === key)?.cardId ?? key;
      return sum + mightOf(cardId);
    }, 0);
    if (total > cap) {
      return false;
    }
  }
  // rule 355.11.b — an "at the same location" group requirement: the subset
  // itself must sit at one location.
  if (choice.constraint?.sameLocation === true && zoneOf) {
    const locations = new Set(
      (picked as string[]).map((key) =>
        zoneOf(choice.options.find((o) => o.key === key)?.cardId ?? key),
      ),
    );
    if (locations.size > 1) {
      return false;
    }
  }
  return true;
}

/** All subsets of `keys` (bounded producer lists only). */
function subsetsOf(keys: readonly string[]): string[][] {
  let out: string[][] = [[]];
  for (const k of keys) {
    out = [...out, ...out.map((s) => [...s, k])];
  }
  return out;
}

/**
 * rule 383.3.d — rearrange the listed trigger items on the Chain: `orderedKeys`
 * lists chain item ids first-appended first (so the LAST key ends on top and
 * resolves first). Only the slots those items already occupy are permuted.
 */
function reorderChainItems(draft: RiftboundGameState, itemIds: readonly string[], orderedKeys: readonly string[]): void {
  const chain = draft.interaction?.chain;
  if (!chain) {
    return;
  }
  const items = [...chain.items];
  const slots = items
    .map((it, idx) => ({ idx, it }))
    .filter((e) => itemIds.includes(e.it.id));
  const byId = new Map(slots.map((e) => [e.it.id, e.it]));
  const wanted = orderedKeys.filter((k) => byId.has(k));
  if (wanted.length !== slots.length) {
    return;
  }
  wanted.forEach((id, i) => {
    items[(slots[i] as { idx: number }).idx] = byId.get(id) as (typeof items)[number];
  });
  (draft as { interaction?: RiftboundGameState["interaction"] }).interaction = {
    ...(draft.interaction as NonNullable<RiftboundGameState["interaction"]>),
    chain: { ...chain, items },
  };
}

/**
 * Continue whatever raised a generic prompt, from its pure-data `resume` tag.
 * (No effect-VM: each producer re-detects or re-executes from the recorded
 * answer.)
 */
function resumePending(
  draft: RiftboundGameState,
  choice: OrderChoice | PickManyChoice,
  answer: { orderedKeys?: readonly string[]; pickedKeys?: readonly string[] },
  // biome-ignore lint/suspicious/noExplicitAny: engine move context is framework-typed
  context: any,
): void {
  const resume = choice.resume;
  switch (resume.kind) {
    case "die-order":
    case "die-assign": {
      recordDieBatchAnswer(draft, resume, {
        ...answer,
        defaultOrder: choice.type === "order" ? choice.items.map((i) => i.key) : undefined,
      });
      // A Kill instruction / cost / [Temporary] batch is finished here; a
      // lethal-damage batch re-detects itself in the cleanup below.
      continueKillBatch(
        { cards: context.cards, counters: context.counters, draft, zones: context.zones },
        (event) => fireTriggers(event, { cards: context.cards, counters: context.counters, draft, zones: context.zones }),
      );
      if (!draft.pendingChoice) {
        postChoiceCleanup(draft, context);
      }
      return;
    }
    case "trigger-batch": {
      const order = answer.orderedKeys && answer.orderedKeys.length > 0 ? answer.orderedKeys : resume.itemIds;
      reorderChainItems(draft, resume.itemIds, order);
      return;
    }
    case "subset-repick": {
      const picked = (answer.pickedKeys ?? []).map(
        (k) => (choice.type === "pick-many" ? choice.options.find((o) => o.key === k)?.cardId : undefined) ?? k,
      );
      if (picked.length > 0) {
        executeEffect(resume.effect as ExecutableEffect, {
          ...buildEffectContext(draft, resume.playerId, resume.sourceCardId, context),
          boundTargets: picked,
        });
      }
      // rule 355.13 (ogn-153-298) — the suspended remainder of the resolving
      // sequence runs after the pick, whether or not anything was picked.
      const rest = (choice as { then?: unknown }).then;
      if (rest !== undefined && !draft.pendingChoice) {
        executeEffect(
          rest as ExecutableEffect,
          buildEffectContext(draft, resume.playerId, resume.sourceCardId, context),
        );
      }
      if (!draft.pendingChoice) {
        postChoiceCleanup(draft, context);
      }
      return;
    }
    case "none": {
      (draft as { lastPendingAnswer?: unknown }).lastPendingAnswer = { ...answer, tag: resume.tag };
      return;
    }
    default: {
      return;
    }
  }
}

/**
 * Returns true when the given card ID is a valid pick for the pending
 * choice (i.e., is in the revealed snapshot and passes the filter).
 */
export function isValidPendingPick(choice: PendingChoice, cardId: string): boolean {
  if (choice.type !== "reveal-and-pick") {
    return false;
  }
  if (!choice.revealed.includes(cardId)) {
    return false;
  }
  const excluded = choice.filter?.excludeCardTypes;
  if (excluded && excluded.length > 0) {
    const def = getGlobalCardRegistry().get(cardId);
    const cardType = def?.cardType;
    if (cardType && excluded.includes(cardType)) {
      return false;
    }
  }
  // rule-id: unl-139-219 — "You may choose a UNIT from it": an allow-list of
  // card types on the pick.
  const allowedTypes = choice.filter?.cardTypes;
  if (allowedTypes && allowedTypes.length > 0) {
    const cardType = getGlobalCardRegistry().get(cardId)?.cardType;
    if (cardType && !allowedTypes.includes(cardType)) {
      return false;
    }
  }
  // rule 135.2 (ven-085-166 Decree of Strength) — "choose a Mind card from
  // it": the filter is a DOMAIN allow-list; a multi-domain card qualifies when
  // any of its domains is listed.
  const allowedDomains = choice.filter?.domains;
  if (allowedDomains && allowedDomains.length > 0) {
    const d = getGlobalCardRegistry().get(cardId)?.domain;
    const ds = d === undefined ? [] : Array.isArray(d) ? d : [d];
    if (!ds.some((x) => allowedDomains.includes(x))) {
      return false;
    }
  }
  // rule-id: ogn-242-298 — "a unit … that has Might up to 1 more than the
  // killed unit": a Might ceiling on the pick, read from printed Might.
  const maxMight = choice.filter?.maxMight;
  if (typeof maxMight === "number") {
    if (getGlobalCardRegistry().getMight(cardId) > maxMight) {
      return false;
    }
  }
  // rule 206 (unl-064-219 Fate Weaver) — "a spell with Energy cost [4] or
  // more": the floor reads the card's PRINTED Energy cost; Power pips never
  // count toward it.
  const minEnergyCost = choice.filter?.minEnergyCost;
  if (typeof minEnergyCost === "number") {
    if (getGlobalCardRegistry().getEnergyCost(cardId) < minEnergyCost) {
      return false;
    }
  }
  return true;
}

/**
 * rule 419.2.a / 356.4 — a card an effect would PLAY (from banishment / deck /
 * trash, "reducing its cost by [N]") must still have its remaining cost paid;
 * one the prompter cannot pay right now cannot be chosen (it would strand in
 * banishment). "Ignoring any and all costs" (a fixed `playTo`) or "ignoring
 * its cost" plays are always affordable. Priced through the shared
 * `computePlayResourceCost` with the instruction's modifications folded in.
 */
export function isAffordablePlayPick(
  state: RiftboundGameState,
  choice: PendingChoice,
  cardId: string,
  context?: { cards: unknown; zones: unknown },
): boolean {
  if (choice.type !== "reveal-and-pick" || choice.onPicked !== "play" || choice.playTo !== undefined) {
    return true;
  }
  if (choice.playIgnoreCost || state.runePools[choice.prompter] === undefined) {
    return true;
  }
  // A spell "played" from the trash is cast through its own path (castSpellFromTrash).
  if (choice.playFrom === "trash" && getGlobalCardRegistry().getCardType(cardId) === "spell") {
    return true;
  }
  const cards = context?.cards as
    | { getCardOwner?: unknown; getCardMeta?: (id: CoreCardId) => unknown }
    | undefined;
  const zones = context?.zones as { getCardsInZone?: unknown } | undefined;
  const hasBoard = typeof zones?.getCardsInZone === "function" && typeof cards?.getCardOwner === "function";
  const extras: CostExtras = {
    ...(hasBoard ? { board: { cards: context?.cards, zones: context?.zones } as CostExtras["board"] } : {}),
    ...(choice.playIgnoreEnergy ? { ignoreEnergyCost: true } : {}),
    ...((choice.playEnergyReduction ?? 0) > 0
      ? { additionalCost: { energy: -(choice.playEnergyReduction ?? 0) } }
      : {}),
  };
  const meta =
    typeof cards?.getCardMeta === "function"
      ? createMetaAccessor(cards as { getCardMeta: (id: CoreCardId) => unknown })
      : undefined;
  return canPayResourceCost(
    state,
    choice.prompter,
    cardId,
    computePlayResourceCost(state, choice.prompter, cardId, extras, meta, false),
  );
}

/**
 * Pick a default (goldfish) card for the choice: the first revealed card
 * that passes the filter. Returns undefined if no valid pick exists.
 */
export function pickDefaultForChoice(choice: PendingChoice): string | number | undefined {
  if (choice.type === "name-card") {
    return choice.options[0];
  }
  if (choice.type === "choose-target" || choice.type === "choose-destination") {
    return choice.options[0];
  }
  if (choice.type === "choose-mode") {
    return choice.options[0];
  }
  if (choice.type === "choose-player") {
    return choice.options[0];
  }
  if (choice.type === "order-cards" || choice.type === "order" || choice.type === "pick-many") {
    return undefined;
  }
  if (choice.type === "opt-in") {
    return undefined;
  }
  // rule 444.2 (ogn-268-298): paying 0 is always legal, so goldfish pays nothing.
  if (choice.type === "pay-x") {
    return 0;
  }
  if (choice.type === "weaponmaster-equip") {
    return undefined;
  }
  return choice.revealed.find((id) => isValidPendingPick(choice, id));
}

/**
 * rule 337.1.b / 337.2 / 354.3 (ogn-242-298 Baited Hook) — finalize a pending
 * play an effect created ("banish a unit from among them and play it"): the
 * card's player picks its location and the unit enters the board immediately,
 * firing its play triggers on top of the chain. Returns true when a location
 * prompt was parked (the caller must stop and wait for the answer).
 */
function finalizePendingPlay(
  draft: RiftboundGameState,
  // biome-ignore lint/suspicious/noExplicitAny: move context bag is framework-typed
  context: any,
  play: { cardId: string; playerId: string; sourceCardId?: string; then?: unknown },
): boolean {
  // rule 355.2 / 355.4: base, or any battlefield this player controls.
  const destOptions = [
    "base",
    ...Object.entries(draft.battlefields)
      .filter(([, bf]) => bf.controller === play.playerId)
      .map(([bfId]) => `battlefield-${bfId}`),
  ];
  if (destOptions.length > 1) {
    draft.pendingChoice = {
      cardId: play.cardId,
      options: destOptions,
      playerId: play.playerId,
      sourceCardId: play.sourceCardId,
      ...(play.then !== undefined ? { then: play.then } : {}),
      type: "choose-destination",
    } as RiftboundGameState["pendingChoice"];
    return true;
  }
  context.zones.moveCard({
    cardId: play.cardId as CoreCardId,
    targetZoneId: "base" as CoreZoneId,
  });
  // rule 143.4: a unit entering the board is exhausted however it was played.
  if (
    getGlobalCardRegistry().get(play.cardId)?.cardType === "unit" &&
    !staticEnterReadyApplies(play.cardId, draft, play.playerId, context.zones)
  ) {
    context.counters?.setFlag?.(play.cardId as CoreCardId, "exhausted", true);
  }
  // Guarded so unit-test stubs that omit the full context bags don't crash.
  if (!context.cards || !context.counters || typeof context.zones.getCardsInZone !== "function") {
    return false;
  }
  const trigCtx = {
    cards: context.cards,
    counters: context.counters,
    draft,
    zones: context.zones,
  };
  // rule 419.4.a: a card played by an effect is still played.
  fireTriggers(
    { cardId: play.cardId, paidAdditionalCost: false, playerId: play.playerId, type: "play-self" },
    trigCtx,
  );
  fireTriggers(
    {
      cardId: play.cardId,
      cardType: getGlobalCardRegistry().get(play.cardId)?.cardType ?? "unit",
      playerId: play.playerId,
      type: "play-card",
    },
    trigCtx,
  );
  if (draft.cardsPlayedThisTurn) {
    draft.cardsPlayedThisTurn[play.playerId] = (draft.cardsPlayedThisTurn[play.playerId] ?? 0) + 1;
  }
  return false;
}

/**
 * Returns the target zone a picked card is moved to based on the stored
 * `onPicked` action.
 */
function onPickedTargetZone(
  action: "recycle" | "banish" | "discard" | "draw" | "play",
): CoreZoneId {
  switch (action) {
    case "recycle": {
      return "mainDeck" as CoreZoneId;
    }
    // rule-id: ogn-062-298-look-banish-play — "banish … then play it": the
    // pick goes to banishment first; the play is added to the chain after.
    case "play":
    case "banish": {
      return "banishment" as CoreZoneId;
    }
    case "discard": {
      return "trash" as CoreZoneId;
    }
    case "draw": {
      return "hand" as CoreZoneId;
    }
  }
}

/**
 * rule-id: ogn-235-298 — emit one `recycle` event per batch of cards a player
 * recycles to the Main Deck so "When you recycle one or more cards to your
 * Main Deck" triggers (Karma, Channeler) fire. Guarded so unit-test stubs that
 * omit the full zone bag don't crash.
 */
function fireRecycleEvent(
  draft: RiftboundGameState,
  // biome-ignore lint/suspicious/noExplicitAny: move context bag is framework-typed
  context: any,
  playerId: string,
  cardIds: readonly string[],
): void {
  if (typeof context.zones?.getCardsInZone !== "function" || !context.cards) {
    return;
  }
  // "to YOUR Main Deck": only cards that went to the recycler's own deck count.
  const own = cardIds.filter(
    (id) => (context.cards.getCardOwner?.(id as CoreCardId) ?? playerId) === playerId,
  );
  if (own.length === 0) {
    return;
  }
  fireTriggers(
    { cardIds: own, playerId, type: "recycle" },
    { cards: context.cards, counters: context.counters, draft, zones: context.zones },
  );
}

export const pendingChoiceMoves: Partial<
  GameMoveDefinitions<RiftboundGameState, RiftboundMoves, RiftboundCardMeta, unknown>
> = {
  resolvePendingChoice: {
    condition: (state, context) => {
      // rule 383.3.d — the soft trigger-order offer is answerable while no real
      // prompt is open (any other move simply accepts the listed order).
      const choice = state.pendingChoice ?? state.pendingTriggerOrder;
      if (!choice) {
        return false;
      }
      // rule 372 / 383.3.d / 416.5.a — generic ordering prompt.
      if (choice.type === "order") {
        return (
          choice.playerId === context.params.playerId &&
          isValidOrderAnswer(choice, context.params.orderedKeys)
        );
      }
      // rule 355.13 / 373 / 355.11.b — generic min..max multi-pick.
      if (choice.type === "pick-many") {
        return (
          choice.playerId === context.params.playerId &&
          isValidPickManyAnswer(
            choice,
            context.params.pickedKeys,
            (id) => getCardEffectiveMight(id, (m) => context.cards.getCardMeta(m as CoreCardId)),
            (id) => context.zones.getCardZone(id as CoreCardId),
          )
        );
      }
      // rule 465.2.c.3 / 465.2.c.7 — the assigning player answers with one
      // allocation of this side's whole combat damage.
      if (choice.type === "combat-damage") {
        if (choice.playerId !== context.params.playerId) {
          return false;
        }
        return isLegalDamageAssignment(
          combatAssignmentPlan(choice),
          context.params.allocation,
        );
      }
      if (choice.type === "weaponmaster-equip") {
        // rule-id: ven-041-166-weaponmaster-on-play-equip
        if (choice.playerId !== context.params.playerId) {
          return false;
        }
        if (context.params.accept === false) {
          return true;
        }
        const pickedEquip = context.params.pickedCardId as string;
        // rule-id: sfd-119-221-weaponmaster-pays-reduced-equip-cost (821.1.c.5)
        return (
          choice.options.includes(pickedEquip) &&
          canPayWeaponmasterEquip(state, choice.playerId, pickedEquip, context)
        );
      }
      if (choice.type === "pay-x") {
        // rule 204.3.b / 444.1 (ogn-268-298): X is Power paid at resolution.
        if (choice.playerId !== context.params.playerId) {
          return false;
        }
        const x = context.params.xAmount;
        if (typeof x !== "number" || !Number.isInteger(x) || x < 0) {
          return false;
        }
        return canAffordPower(state.runePools[choice.playerId]?.power ?? {}, { rainbow: x });
      }
      if (choice.type === "opt-in") {
        // Rule 583 (unl-021-219): controller may accept or decline.
        if (choice.playerId !== context.params.playerId) {
          return false;
        }
        if (typeof context.params.accept !== "boolean") {
          return false;
        }
        // rule-id: sfd-119-221 — accepting a "you may pay [N] to …" trigger
        // is only legal when the cost is payable.
        if (context.params.accept === true) {
          const cost = optInCostForPayability(state, choice, context);
          if (
            cost &&
            !canPayOptInCost(state, choice.playerId, choice.sourceCardId, cost, context, optInEffectOf(choice))
          ) {
            return false;
          }
        }
        return true;
      }
      if (choice.type === "confirm") {
        // rule 355.13 (ogn-153-298): a bare "you may …" — both answers legal.
        if (choice.playerId !== context.params.playerId) {
          return false;
        }
        return typeof context.params.accept === "boolean";
      }
      if (choice.type === "choose-mode") {
        if (choice.playerId !== context.params.playerId) {
          return false;
        }
        // rule 752.1 (ven-152-166) — "you MAY make new choices": declining the
        // re-choice menu keeps the previous controller's mode and targets.
        if (choice.optional && context.params.accept === false) {
          return true;
        }
        return choice.options.includes(context.params.pickedMode as number);
      }
      // rule-id: unl-130-219 (rules 182–185) — only the chooser may name a
      // seat, and only one of the offered seats.
      if (choice.type === "choose-player") {
        if (choice.playerId !== context.params.playerId) {
          return false;
        }
        return choice.options.includes(context.params.pickedPlayerId as never);
      }
      if (choice.type === "choose-target") {
        if (choice.playerId !== context.params.playerId) {
          return false;
        }
        // rule-id: ogn-256-298 (rule 355.13) — "any number of": declining
        // further picks is always legal.
        // rule-id: ogn-080-298 — "You MAY make new choices for it": declining
        // keeps the choices the item's previous controller made.
        if ((choice.anyNumber || choice.optional) && context.params.accept === false) {
          return true;
        }
        // rule 106 (unl-118-219): "up to one at EACH location" — a pick whose
        // location is already spoken for is illegal, not a silently-dropped
        // answer that still burns the pick budget.
        if ((choice as { onePerLocation?: boolean }).onePerLocation === true) {
          const acc = context as unknown as Parameters<typeof locationKeyOf>[1];
          const taken = new Set((choice.picked ?? []).map((id) => locationKeyOf(id, acc)));
          const answered = (context.params.pickedCardIds as string[] | undefined) ?? [
            context.params.pickedCardId as string,
          ];
          for (const id of answered) {
            if (typeof id !== "string") {
              continue;
            }
            const key = locationKeyOf(id, acc);
            if (taken.has(key)) {
              return false;
            }
            taken.add(key);
          }
        }
        // rule 355.13 (ogn-141-298): "up to N" / "any number of" targets may
        // be answered with several distinct picks at once, capped at N.
        const multiTargets = context.params.pickedCardIds as string[] | undefined;
        if (Array.isArray(multiTargets)) {
          if (!choice.anyNumber || multiTargets.length === 0) {
            return false;
          }
          if (new Set(multiTargets).size !== multiTargets.length) {
            return false;
          }
          const cap = choice.maxPicks ?? choice.options.length;
          if (multiTargets.length + (choice.picked?.length ?? 0) > cap) {
            return false;
          }
          return multiTargets.every((id) => choice.options.includes(id));
        }
        // rule 355.14.e (ogn-041-298): fixed-total split is answered with one allocation.
        if (choice.assign && typeof choice.total === "number") {
          return isLegalSplitAllocation(choice.options, choice.total, context.params.allocation);
        }
        return choice.options.includes(context.params.pickedCardId as string);
      }
      if (choice.type === "choose-destination") {
        if (choice.playerId !== context.params.playerId) {
          return false;
        }
        // rule-id: sfd-109-221 (rule 356.1.b.3) — paying the optional
        // additional cost on a pending play is only legal when payable.
        if (
          context.params.paidAdditionalCost === true &&
          !pendingPlayOptionalCost(state, choice, context)
        ) {
          return false;
        }
        // rule-id: ogn-262-298 (rule 355.13) — "You may move …": declining the
        // move is always legal.
        if (choice.optional && context.params.accept === false) {
          return true;
        }
        return choice.options.includes(context.params.pickedZoneId as string);
      }
      if (choice.prompter !== context.params.playerId) {
        return false;
      }
      // rule 386.2 (unl-062-219) — any permutation of the arranged cards is a
      // legal answer.
      if (choice.type === "order-cards") {
        const order = context.params.orderedCardIds as string[] | undefined;
        if (!Array.isArray(order)) {
          return false;
        }
        const known = new Set(choice.cards as readonly string[]);
        return (
          order.length === known.size &&
          new Set(order).size === order.length &&
          order.every((id) => known.has(id))
        );
      }
      if (choice.type === "name-card") {
        // Rule 762: any legal card name is valid; the enumerated `options`
        // are the names known to this game's registry.
        const name = context.params.pickedName;
        return typeof name === "string" && choice.options.includes(name);
      }
      // rule-id: ogn-235-298-vision-optional-recycle
      if (choice.optional && context.params.accept === false) {
        return true;
      }
      // rule 356.1 (unl-135-219) — "You may pay 2 XP to choose a card from
      // their hand": a prompter who cannot pay may only decline.
      if (
        choice.pickCost &&
        !canPayOptInCost(
          state,
          choice.prompter,
          choice.sourceCardId ?? "",
          choice.pickCost as Record<string, unknown>,
          context,
        )
      ) {
        return false;
      }
      // rule 422.1.a (ogn-030-298): a multi-pick prompt may be answered with
      // up to `remaining` distinct valid picks at once.
      const multi = context.params.pickedCardIds as string[] | undefined;
      if (Array.isArray(multi)) {
        if (choice.onPicked === "play" || multi.length === 0 || multi.length > (choice.remaining ?? 1)) {
          return false;
        }
        if (new Set(multi).size !== multi.length) {
          return false;
        }
        return multi.every((id) => isValidPendingPick(choice, id));
      }
      return (
        isValidPendingPick(choice, context.params.pickedCardId as string) &&
        // rule 419.2.a — an unaffordable "play it" pick is not a legal choice.
        isAffordablePlayPick(state, choice, context.params.pickedCardId as string, context)
      );
    },
    enumerator: (state, context) => {
      const choice = state.pendingChoice ?? state.pendingTriggerOrder;
      if (!choice) {
        return [];
      }
      // rule 372 / 383.3.d — one move per arrangement for short lists; longer
      // lists offer the listed order (+ reverse) and accept any permutation.
      if (choice.type === "order") {
        if (choice.playerId !== (context.playerId as string)) {
          return [];
        }
        const keys = choice.items.map((i) => i.key);
        const perms = keys.length <= 4 ? permutationsOf(keys) : [[...keys], [...keys].reverse()];
        const nameOf = (key: string): string => {
          const item = choice.items.find((i) => i.key === key);
          return item?.label ?? (item?.cardId ? (getGlobalCardRegistry().get(item.cardId)?.name ?? item.cardId) : key);
        };
        // `label` is display-only (the app's choice modal prints it).
        return perms.map((orderedKeys) => ({
          label: orderedKeys.map(nameOf).join(" → "),
          orderedKeys,
          playerId: context.playerId as string,
        }));
      }
      // rule 355.13 / 373 / 355.11.b — singles (and every subset for short
      // lists); any other legal `pickedKeys` list is accepted too.
      if (choice.type === "pick-many") {
        if (choice.playerId !== (context.playerId as string)) {
          return [];
        }
        const keys = choice.options.map((o) => o.key);
        const candidates =
          keys.length <= 4 ? subsetsOf(keys) : [[], ...keys.map((k) => [k]), [...keys]];
        const mightOf = (id: string): number =>
          getCardEffectiveMight(id, (m) => context.cards.getCardMeta(m as CoreCardId));
        const nameOf = (key: string): string => {
          const opt = choice.options.find((o) => o.key === key);
          return opt?.label ?? (opt?.cardId ? (getGlobalCardRegistry().get(opt.cardId)?.name ?? opt.cardId) : key);
        };
        return candidates
          .filter((pickedKeys) =>
            isValidPickManyAnswer(choice, pickedKeys, mightOf, (id) =>
              context.zones.getCardZone(id as CoreCardId),
            ),
          )
          .map((pickedKeys) => ({
            label: pickedKeys.length > 0 ? pickedKeys.map(nameOf).join(" + ") : "None",
            pickedKeys,
            playerId: context.playerId as string,
          }));
      }
      if (choice.type === "combat-damage") {
        if (choice.playerId !== (context.playerId as string)) {
          return [];
        }
        return enumerateDamageAssignments(combatAssignmentPlan(choice)).map((allocation) => ({
          allocation,
          playerId: context.playerId as string,
        }));
      }
      if (choice.type === "weaponmaster-equip") {
        if (choice.playerId !== (context.playerId as string)) {
          return [];
        }
        // rule-id: sfd-119-221-weaponmaster-pays-reduced-equip-cost — only
        // offer equipment whose reduced Equip cost is payable (821.1.c.5).
        return [
          ...choice.options
            .filter((eq) => canPayWeaponmasterEquip(state, choice.playerId, eq, context))
            .map((eq) => ({
              pickedCardId: eq,
              playerId: context.playerId as string,
            })),
          { accept: false, playerId: context.playerId as string },
        ];
      }
      if (choice.type === "pay-x") {
        if (choice.playerId !== (context.playerId as string)) {
          return [];
        }
        const pool = choice.playerId ? (state.runePools[choice.playerId]?.power ?? {}) : {};
        const max = Object.values(pool).reduce<number>((a, b) => a + (b ?? 0), 0);
        return Array.from({ length: max + 1 }, (_, x) => ({
          playerId: context.playerId as string,
          xAmount: x,
        }));
      }
      if (choice.type === "opt-in") {
        if (choice.playerId !== (context.playerId as string)) {
          return [];
        }
        // rule-id: sfd-119-221 — only offer "accept" when the pay-cost is payable.
        const cost = optInCostForPayability(state, choice, context);
        const canAccept =
          !cost ||
          canPayOptInCost(state, choice.playerId, choice.sourceCardId, cost, context, optInEffectOf(choice));
        return [
          ...(canAccept ? [{ accept: true, playerId: context.playerId as string }] : []),
          { accept: false, playerId: context.playerId as string },
        ];
      }
      if (choice.type === "confirm") {
        if (choice.playerId !== (context.playerId as string)) {
          return [];
        }
        return [
          { accept: true, playerId: context.playerId as string },
          { accept: false, playerId: context.playerId as string },
        ];
      }
      if (choice.type === "choose-mode") {
        if (choice.playerId !== (context.playerId as string)) {
          return [];
        }
        return [
          ...choice.options.map((idx) => ({
            pickedMode: idx,
            playerId: context.playerId as string,
          })),
          // rule 752.1 (ven-152-166) — declining leaves the stolen item as it was.
          ...(choice.optional ? [{ accept: false, playerId: context.playerId as string }] : []),
        ];
      }
      if (choice.type === "choose-player") {
        if (choice.playerId !== (context.playerId as string)) {
          return [];
        }
        return choice.options.map((seat) => ({
          pickedPlayerId: seat,
          playerId: context.playerId as string,
        }));
      }
      if (choice.type === "choose-target") {
        if (choice.playerId !== (context.playerId as string)) {
          return [];
        }
        // rule 355.14.e (ogn-041-298): fixed-total split → one move per legal allocation.
        if (choice.assign && typeof choice.total === "number") {
          return enumerateSplitAllocations(choice.options, choice.total).map((allocation) => ({
            allocation,
            playerId: context.playerId as string,
          }));
        }
        const picks: { playerId: string; pickedCardId?: string; accept?: boolean }[] =
          choice.options.map((cardId) => ({
            pickedCardId: cardId,
            playerId: context.playerId as string,
          }));
        // rule-id: ogn-256-298 (rule 355.13) — "any number of": offer "done".
        // rule-id: ogn-080-298 — "You MAY make new choices for it": declining
        // keeps the choices the item's previous controller made.
        if (choice.anyNumber || choice.optional) {
          picks.push({ accept: false, playerId: context.playerId as string });
        }
        return picks;
      }
      if (choice.type === "choose-destination") {
        if (choice.playerId !== (context.playerId as string)) {
          return [];
        }
        // rule-id: sfd-109-221 (rule 356.1.b.3 / 560) — a pending "play it,
        // ignoring its cost" still offers the unit's optional additional cost.
        const payable = pendingPlayOptionalCost(state, choice, context) !== undefined;
        // rule-id: ogn-262-298 (rule 355.13) — "You may move …": declining is
        // one of the answers, so the prompt is never auto-taken.
        const declineVariants = choice.optional
          ? [{ accept: false, playerId: context.playerId as string }]
          : [];
        return [...declineVariants, ...choice.options.flatMap((zoneId) => [
          { pickedZoneId: zoneId, playerId: context.playerId as string },
          ...(payable
            ? [{ paidAdditionalCost: true, pickedZoneId: zoneId, playerId: context.playerId as string }]
            : []),
        ])];
      }
      if (choice.prompter !== (context.playerId as string)) {
        return [];
      }
      if (choice.type === "name-card") {
        return choice.options.map((name) => ({
          pickedName: name,
          playerId: context.playerId as string,
        }));
      }
      // rule 386.2 (unl-062-219) — "put the rest back in any order": one move
      // per arrangement. Bounded because Predict looks at a handful of cards.
      if (choice.type === "order-cards") {
        const perms = permutationsOf(choice.cards as readonly string[]);
        return perms.map((order) => ({
          orderedCardIds: order,
          playerId: context.playerId as string,
        }));
      }
      const results: { playerId: string; pickedCardId?: string; accept?: boolean }[] = [];
      for (const cardId of choice.revealed) {
        if (isValidPendingPick(choice, cardId) && isAffordablePlayPick(state, choice, cardId, context)) {
          results.push({
            pickedCardId: cardId,
            playerId: context.playerId as string,
          });
        }
      }
      // rule-id: ogn-235-298-vision-optional-recycle — "You may recycle it"
      // must offer a decline path that leaves the card on top.
      if (choice.optional) {
        results.push({ accept: false, playerId: context.playerId as string });
      }
      return results;
    },
    reducer: (draft, context) => {
      // rule 383.3.d — the soft trigger-order offer (no real prompt open).
      if (!draft.pendingChoice && draft.pendingTriggerOrder) {
        const soft = draft.pendingTriggerOrder;
        if (!isValidOrderAnswer(soft, context.params.orderedKeys)) {
          return;
        }
        draft.pendingTriggerOrder = undefined;
        resumePending(draft, soft, { orderedKeys: context.params.orderedKeys as string[] | undefined }, context);
        return;
      }
      const choice = draft.pendingChoice;
      if (!choice) {
        return;
      }

      if (choice.type === "order") {
        const orderedKeys = context.params.orderedKeys as string[] | undefined;
        if (!isValidOrderAnswer(choice, orderedKeys)) {
          return;
        }
        draft.pendingChoice = undefined;
        resumePending(draft, choice, { orderedKeys }, context);
        return;
      }
      if (choice.type === "pick-many") {
        const pickedKeys = (context.params.pickedKeys as string[] | undefined) ?? [];
        if (
          !isValidPickManyAnswer(
            choice,
            pickedKeys,
            (id) => getCardEffectiveMight(id, (m) => context.cards.getCardMeta(m as CoreCardId)),
            (id) => context.zones.getCardZone(id as CoreCardId),
          )
        ) {
          return;
        }
        draft.pendingChoice = undefined;
        resumePending(draft, choice, { pickedKeys }, context);
        return;
      }

      // rule 465.2.c.3 — record the assignment; `resolveFullCombat` re-runs
      // (its condition is blocked while a pendingChoice exists) and applies it.
      if (choice.type === "combat-damage") {
        const allocation = context.params.allocation;
        if (!isLegalDamageAssignment(combatAssignmentPlan(choice), allocation)) {
          return;
        }
        draft.pendingChoice = undefined;
        const bf = draft.battlefields[choice.battlefieldId];
        if (bf) {
          // rule 465.2.c.3 — both sides assign simultaneously and each answer
          // has its own slot: writing the DEFENDING player's assignment into
          // the attacker's slot re-opens the same prompt forever.
          if (choice.side === "defender") {
            bf.combatDefenderDamageAllocation = { ...allocation };
          } else {
            bf.combatDamageAllocation = { ...allocation };
          }
        }
        return;
      }

      if (choice.type === "weaponmaster-equip") {
        // rule-id: ven-041-166-weaponmaster-on-play-equip
        // "You may Equip one of your Equipment to me … even if it's already
        // attached." Decline (`accept:false`) clears the prompt; a pick
        // detaches from any prior holder and re-attaches to the Weaponmaster.
        draft.pendingChoice = undefined;
        const picked = context.params.pickedCardId as string | undefined;
        if (context.params.accept === false || !picked || !choice.options.includes(picked)) {
          return;
        }
        // rule-id: sfd-119-221-weaponmaster-pays-reduced-equip-cost
        // Rule 821.1.c: pay the Equip cost reduced by [A]; if it can't be
        // paid the Equipment stays where it is (821.1.c.5).
        const equipCost = weaponmasterEquipCost(picked);
        if (!equipCost || !canPayWeaponmasterEquip(draft, choice.playerId, picked, context)) {
          return;
        }
        deductAbilityCost(draft, choice.playerId, equipCost, context.zones, context.counters);
        const registry = getGlobalCardRegistry();
        const priorMeta = context.cards.getCardMeta(picked as CoreCardId) as
          | Partial<RiftboundCardMeta>
          | undefined;
        const priorHolder = priorMeta?.attachedTo;
        if (priorHolder && priorHolder !== choice.unitId) {
          const holderMeta = context.cards.getCardMeta(priorHolder as CoreCardId) as
            | Partial<RiftboundCardMeta>
            | undefined;
          context.cards.updateCardMeta(priorHolder as CoreCardId, {
            equippedWith: (holderMeta?.equippedWith ?? []).filter((id) => id !== picked),
          } as Partial<RiftboundCardMeta>);
        }
        const equipDef = registry.get(picked);
        const newEquipMeta: Partial<RiftboundCardMeta> = { attachedTo: choice.unitId };
        if (equipDef?.copyAttachedUnitText) {
          newEquipMeta.copiedFromCardId = choice.unitId;
        }
        context.cards.updateCardMeta(picked as CoreCardId, newEquipMeta);
        const unitMeta = context.cards.getCardMeta(choice.unitId as CoreCardId) as
          | Partial<RiftboundCardMeta>
          | undefined;
        const already = unitMeta?.equippedWith ?? [];
        if (!already.includes(picked)) {
          context.cards.updateCardMeta(choice.unitId as CoreCardId, {
            equippedWith: [...already, picked],
          } as Partial<RiftboundCardMeta>);
        }
        fireTriggers(
          {
            cardId: choice.unitId,
            equipmentId: picked,
            playerId: choice.playerId,
            type: "attach-equipment",
          },
          { cards: context.cards, counters: context.counters, draft, zones: context.zones },
        );
        // rule 821.1.c / 476.1 (sfd-150-221 Last Rites): the non-resource part
        // of the Equip cost — "Recycle N cards from your trash" — is paid by
        // its payer choosing which cards leave the trash.
        const recycleCount = equipCost.recycleFromTrash as number | undefined;
        if (recycleCount !== undefined && recycleCount > 0 && !draft.pendingChoice) {
          const trash = context.zones
            .getCardsInZone("trash" as CoreZoneId, choice.playerId as CorePlayerId)
            .map((id: unknown) => id as string);
          draft.pendingChoice = {
            onPicked: "recycle",
            prompter: choice.playerId,
            remaining: recycleCount,
            revealed: trash,
            revealer: choice.playerId,
            type: "reveal-and-pick",
          } as RiftboundGameState["pendingChoice"];
        }
        return;
      }

      if (choice.type === "pay-x") {
        // rule 204.3.b / 444.1-2 (ogn-268-298): remove X Power from the pool
        // (any Domain pays a [rainbow] pip) and resume the resolution with
        // `x` bound for `{ variable: "x" }` amounts.
        const x = Math.max(0, (context.params.xAmount as number) ?? 0);
        if (!canAffordPower(draft.runePools[choice.playerId]?.power ?? {}, { rainbow: x })) {
          return;
        }
        draft.pendingChoice = undefined;
        if (x > 0) {
          deductAbilityCost(
            draft,
            choice.playerId,
            { power: Array.from({ length: x }, () => "rainbow") },
            context.zones,
            context.counters,
          );
        }
        const resolved = choice.resolved as {
          cardId: string;
          effect?: unknown;
        };
        const registry = getGlobalCardRegistry();
        const baseEffect =
          resolved.effect ??
          (registry.getAbilities(resolved.cardId) ?? []).find((ab) => ab.type === "spell")?.effect;
        executeResolvedItem(
          {
            ...resolved,
            effect: baseEffect
              ? { ...(baseEffect as Record<string, unknown>), _variables: { x } }
              : baseEffect,
          } as Parameters<typeof executeResolvedItem>[0],
          draft,
          context,
        );
        if (!draft.pendingChoice) {
          postChoiceCleanup(draft, context);
        }
        return;
      }

      if (choice.type === "choose-player") {
        // rule-id: unl-130-219 (rules 182–185, 411.4) — "choose an opponent.
        // THEY play …": the named seat owns/controls whatever the effect makes.
        draft.pendingChoice = undefined;
        const picked = context.params.pickedPlayerId as string;
        const playerCtx = buildEffectContext(
          draft,
          choice.playerId,
          choice.sourceCardId as CardId,
          context,
        );
        executeEffect(
          { ...(choice.effect as Record<string, unknown>), ownerId: picked } as ExecutableEffect,
          playerCtx,
        );
        if (!draft.pendingChoice) {
          postChoiceCleanup(draft, context);
        }
        return;
      }

      if (choice.type === "confirm") {
        // rule 355.13 (ogn-153-298): "you may …" inside a resolving effect —
        // yes runs the effect, and the suspended remainder of the sequence
        // runs either way.
        draft.pendingChoice = undefined;
        const confirmCtx = buildEffectContext(
          draft,
          choice.playerId,
          choice.sourceCardId,
          context,
        );
        if (context.params.accept === true) {
          executeEffect(choice.effect as ExecutableEffect, {
            ...confirmCtx,
            ...(choice.boundTargets ? { boundTargets: choice.boundTargets } : {}),
          });
        }
        if (choice.then && !draft.pendingChoice) {
          executeEffect(choice.then as ExecutableEffect, confirmCtx);
        }
        if (!draft.pendingChoice) {
          postChoiceCleanup(draft, context);
        }
        return;
      }

      if (choice.type === "opt-in") {
        // Rule 583 (unl-021-219): on accept, resume executeResolvedItem with
        // the optional flag cleared so target selection etc. proceeds normally;
        // on decline the trigger fizzles.
        draft.pendingChoice = undefined;
        // rule 383.3.a.2 / 402.1.a: this answer was asked while the trigger was
        // being FINALIZED. Accepting leaves a non-optional item on the chain
        // (it resolves without asking again); declining removes the item, so
        // nobody ever receives Priority over a trigger that will do nothing.
        const finalizeId = (choice as { finalizationChainItemId?: string })
          .finalizationChainItemId;
        if (finalizeId !== undefined) {
          let accepted = context.params.accept === true;
          // rule 383.3.b.1 / 404.1 — a base cost ("you may pay [N] to …") is
          // paid NOW, as part of finalizing; unpayable ⇒ the item cannot be
          // finalized and leaves the Chain (404.2).
          const cost = optInCostOf(choice);
          // rule 404.1 — the gate also carries the [Deflect] pips this item's
          // own choice will owe; only the base cost is deducted here.
          const gateCost = optInCostForPayability(draft, choice, context);
          if (
            accepted &&
            gateCost &&
            !canPayOptInCost(draft, choice.playerId, choice.sourceCardId, gateCost, context, optInEffectOf(choice))
          ) {
            accepted = false;
          }
          if (accepted && cost) {
            deductAbilityCost(draft, choice.playerId, cost, context.zones, context.counters);
            if (cost.exhaust === true) {
              context.counters.setFlag(choice.sourceCardId as CoreCardId, "exhausted", true);
            }
            // rule 204.3.a / 383.3.b.1 (rule-id: sfd-128-221) — "you may kill
            // me to …": the kill is the COST, so the source is already in the
            // trash while its ability still sits on the Chain awaiting
            // priority; it can no longer be removed in response.
            if (cost.kill === "self") {
              executeEffect(
                { target: { type: "self" }, type: "kill" } as unknown as ExecutableEffect,
                buildEffectContext(draft, choice.playerId, choice.sourceCardId, context),
              );
            }
            // rule 383.3.b / 427.1 (rule-id: ven-102-166) — "you may banish me
            // to …": same shape, but the source is banished rather than killed
            // (no Deathknell), and it is already gone while the ability waits.
            if (cost.banish === "self") {
              executeEffect(
                { target: { type: "self" }, type: "banish" } as unknown as ExecutableEffect,
                buildEffectContext(draft, choice.playerId, choice.sourceCardId, context),
              );
            }
          }
          const interaction = draft.interaction;
          if (accepted && interaction?.chain) {
            draft.interaction = {
              ...interaction,
              chain: {
                ...interaction.chain,
                items: interaction.chain.items.map((it) =>
                  it.id === finalizeId ? { ...it, optInCost: undefined, optional: false } : it,
                ),
              },
            };
          } else if (!accepted) {
            // rule 383.3.a.2 / 383.3.e.2 — considered to have not triggered.
            triggerRunner.removeUnfinalizedItem(draft, finalizeId);
          }
          if (!draft.pendingChoice) {
            postChoiceCleanup(draft, context);
          }
          return;
        }
        // rule 356.5.a / 356.4.f.1 (unl-139-219 Bone Skewer): the instructed
        // play already happened — the answer only records whether the (zeroed)
        // optional additional cost counts as paid.
        const instructed = (
          choice as {
            instructedPlay?: { cardId: string; playStun: boolean };
          }
        ).instructedPlay;
        // rule 158.1 (sfd-136-221) — "Counter a spell unless its controller pays
        // [N]": accepting charges the ransom in full and the counter does
        // nothing; declining re-runs the counter with the `unless` stripped.
        const ransom = (
          choice as {
            counterRansom?: {
              boundTargets?: readonly string[];
              effect: unknown;
              sourcePlayerId: string;
            };
          }
        ).counterRansom;
        if (ransom) {
          const ransomCost = optInCostOf(choice);
          const paid =
            context.params.accept === true &&
            (!ransomCost ||
              canPayOptInCost(draft, choice.playerId, choice.sourceCardId, ransomCost, context));
          if (paid && ransomCost) {
            deductAbilityCost(draft, choice.playerId, ransomCost, context.zones, context.counters);
          }
          if (!paid) {
            executeEffect(ransom.effect as ExecutableEffect, {
              ...buildEffectContext(draft, ransom.sourcePlayerId, choice.sourceCardId, context),
              ...(ransom.boundTargets ? { boundTargets: ransom.boundTargets } : {}),
            });
          }
          if (!draft.pendingChoice) {
            postChoiceCleanup(draft, context);
          }
          return;
        }
        // rule 356.1 (ven-152-166 Rebuttal) — "You may pay [rainbow]. If you
        // do, …. Otherwise, …": accepting charges the cost and runs `then`;
        // declining runs `else`.
        const payChoice = (
          choice as {
            payChoice?: {
              boundTargets?: readonly string[];
              else?: unknown;
              sourcePlayerId: string;
              then?: unknown;
            };
          }
        ).payChoice;
        if (payChoice) {
          const payCost = optInCostOf(choice);
          const paid =
            context.params.accept === true &&
            (!payCost ||
              canPayOptInCost(draft, choice.playerId, choice.sourceCardId, payCost, context));
          if (paid && payCost) {
            deductAbilityCost(draft, choice.playerId, payCost, context.zones, context.counters);
          }
          const branch = paid ? payChoice.then : payChoice.else;
          if (branch) {
            executeEffect(branch as ExecutableEffect, {
              ...buildEffectContext(draft, payChoice.sourcePlayerId, choice.sourceCardId, context),
              ...(payChoice.boundTargets ? { boundTargets: payChoice.boundTargets } : {}),
            });
          }
          if (!draft.pendingChoice) {
            postChoiceCleanup(draft, context);
          }
          return;
        }
        if (instructed) {
          // rule 717 / 356.5.a (unl-139-219 Bone Skewer × ogn-010-298) — the
          // folded-in optional cost had its AMOUNT zeroed by "ignoring any and
          // all costs", but electing it still buys its benefit: an accepted
          // [Accelerate] readies the unit that already entered exhausted.
          if (
            context.params.accept === true &&
            getOptionalPlayCost(instructed.cardId)?.kind === "accelerate"
          ) {
            context.counters.setFlag(instructed.cardId as CoreCardId, "exhausted", false);
          }
          fireInstructedPlayTriggers(draft, context, {
            cardId: instructed.cardId,
            paidAdditionalCost: context.params.accept === true,
            playStun: instructed.playStun,
            playerId: choice.playerId,
          });
          if (!draft.pendingChoice) {
            postChoiceCleanup(draft, context);
          }
          return;
        }
        if (context.params.accept === true) {
          // rule-id: sfd-119-221 — "you may pay [N] to …": charge the cost
          // before the effect; if it became unpayable, the trigger fizzles.
          const cost = optInCostOf(choice);
          if (cost) {
            if (
              !canPayOptInCost(draft, choice.playerId, choice.sourceCardId, cost, context, optInEffectOf(choice))
            ) {
              if (choice.suspendedDeathCardId) {
                postChoiceCleanup(draft, context);
              }
              return;
            }
            deductAbilityCost(draft, choice.playerId, cost, context.zones, context.counters);
            if (cost.exhaust === true) {
              context.counters.setFlag(choice.sourceCardId as CoreCardId, "exhausted", true);
            }
            // rule 440.1 (rule-id: ven-095-166): "[Burn N] to …" — the burn is
            // the cost, so it is paid here, before the instruction's own
            // effect runs. No choice is involved (the top N cards are fixed).
            const burnCount = typeof cost.burn === "number" ? cost.burn : 0;
            if (burnCount > 0) {
              executeEffect(
                { amount: burnCount, player: "self", type: "mill" } as ExecutableEffect,
                buildEffectContext(draft, choice.playerId, choice.sourceCardId, context),
              );
            }
            // rule 422.1.a (ogn-252-298): "you may discard N to …" — the
            // paying player chooses the cards, so route the cost through the
            // discard effect and hang the trigger's own effect off its `then`.
            // rule 355.10.c.1 (rule-id: sfd-026-221): "recycle another friendly
            // unit to play a Mech …" — the paying player chooses the unit, so
            // park the pick and hang the trigger's own effect off its `then`
            // (which re-enters with the recycled card as the trigger source).
            const recycleCost = cost.recycle as { amount?: number } | undefined;
            if (recycleCost && typeof recycleCost === "object") {
              const candidates = recycleCostCandidates(
                draft,
                choice.playerId,
                choice.sourceCardId,
                recycleCost,
                context,
              );
              const want = recycleCost.amount ?? 1;
              if (candidates.length < want) {
                return;
              }
              draft.pendingChoice = {
                onPicked: "recycle",
                prompter: choice.playerId,
                remaining: want,
                revealed: candidates,
                revealer: choice.playerId,
                sourceCardId: choice.sourceCardId,
                then: (choice.resolved as { effect?: unknown } | undefined)?.effect,
                type: "reveal-and-pick",
              } as typeof draft.pendingChoice;
              return;
            }
            const discardCount = typeof cost.discard === "number" ? cost.discard : 0;
            if (discardCount > 0) {
              executeEffect(
                {
                  amount: discardCount,
                  then: (choice.resolved as { effect?: unknown } | undefined)?.effect,
                  type: "discard",
                } as ExecutableEffect,
                buildEffectContext(draft, choice.playerId, choice.sourceCardId, context),
              );
              if (!draft.pendingChoice) {
                postChoiceCleanup(draft, context);
              }
              return;
            }
          }
          executeResolvedItem(
            choice.resolved as Parameters<typeof executeResolvedItem>[0],
            draft,
            context,
          );
          // rule-id: ogn-125-298 — an accepted "you may spend a buff" changes
          // "while I'm buffed" static grants (e.g. [Ganking]); recalc statics
          // now, unless the resumed item parked a follow-up prompt.
          if (!draft.pendingChoice) {
            postChoiceCleanup(draft, context);
          }
        } else if (choice.suspendedDeathCardId) {
          // rule 371.2.b / 372 (ogn-023-298): a declined "you may pay … instead"
          // death replacement. A death the cleanup pass found re-runs by itself;
          // a suspended KILL instruction (or kill cost — rule 428.1.a.1) has no
          // lethal damage to re-detect, so run it now with the shield spent.
          const suspendedKill = (choice as { suspendedKill?: { by?: string; source?: string } })
            .suspendedKill;
          if (suspendedKill) {
            executeEffect(
              { target: { type: "unit" }, type: "kill" } as unknown as ExecutableEffect,
              {
                ...buildEffectContext(
                  draft,
                  suspendedKill.by ?? choice.playerId,
                  suspendedKill.source ?? choice.sourceCardId,
                  context,
                ),
                boundTargets: [choice.suspendedDeathCardId as string],
              },
            );
          }
          postChoiceCleanup(draft, context);
        }
        return;
      }

      if (choice.type === "choose-mode") {
        // Rule 355.8 (unl-182-219): execute the picked modal option; when
        // `notChosenThisTurn` is set, record the index on the source card's
        // meta so subsequent Repeat casts exclude it.
        // rule 752.1 (ven-152-166) — the new controller declines to re-choose.
        if (choice.optional && context.params.accept === false) {
          draft.pendingChoice = undefined;
          postChoiceCleanup(draft, context);
          return;
        }
        const idx = context.params.pickedMode as number;
        if (!choice.options.includes(idx)) {
          return;
        }
        // rule 349 / 820.2 (unl-182-219) — a mode chosen while PLAYING the
        // card: lock it onto the pending chain item (the effect runs later,
        // when that item resolves) and ask for the next execution's mode.
        if (choice.bindToChainItemId !== undefined) {
          const items = draft.interaction?.chain?.items ?? [];
          const item = items.find((it) => it && it.id === choice.bindToChainItemId);
          draft.pendingChoice = undefined;
          if (!item) {
            return;
          }
          const nodes = collectChoiceNodes(item.effect);
          // rule 751.1 / 752.1 (ven-152-166) — new choices for a stolen item
          // REPLACE the locked ones: drop the old mode and its bound targets so
          // the new controller re-chooses both from their own seat.
          if (choice.reChoose === true) {
            for (const n of nodes) {
              n._chosenIndex = undefined;
              n._chosenTargets = undefined;
            }
            (item as { targets?: readonly string[] }).targets = undefined;
          }
          const node = nodes.find((n) => n._chosenIndex === undefined);
          if (node) {
            node._chosenIndex = idx;
          }
          raisePlayTimeModeChoice(
            draft,
            choice.bindToChainItemId,
            item.effect,
            choice.playerId,
            choice.sourceCardId as string,
            buildEffectContext(draft, choice.playerId, choice.sourceCardId, context),
          );
          return;
        }
        const modalOptions =
          (choice.effect as { options?: { effect: unknown }[] } | undefined)?.options ?? [];
        const picked = modalOptions[idx]?.effect;
        draft.pendingChoice = undefined;
        if (choice.notChosenThisTurn) {
          const prior =
            (
              context.cards.getCardMeta(choice.sourceCardId as CoreCardId) as
                | Partial<RiftboundCardMeta>
                | undefined
            )?.modesChosenThisTurn ?? [];
          context.cards.updateCardMeta(choice.sourceCardId as CoreCardId, {
            modesChosenThisTurn: [...prior, idx],
          } as Partial<RiftboundCardMeta>);
        }
        if (picked) {
          // rule 355.10 (sfd-039-221) — the picked mode's own caster-chosen
          // target ("ready or exhaust A LEGEND") is declared now, by the
          // ability's controller: with several candidates and nothing already
          // bound, prompt instead of letting the handler take the first one.
          if (
            !choice.boundTargets &&
            liftModalTarget(draft, choice, picked as ExecutableEffect, context)
          ) {
            return;
          }
          // rule-id: sfd-091-221 — keep chain-bound targets for the picked mode.
          // rule 355.10.e (ogn-071-298): an opponent-picked mode resolves for the controller.
          const effectCtx = {
            ...buildEffectContext(
              draft,
              choice.controllerId ?? choice.playerId,
              choice.sourceCardId,
              context,
            ),
            ...(choice.boundTargets ? { boundTargets: choice.boundTargets } : {}),
          };
          executeEffect(picked as ExecutableEffect, effectCtx);
          // rule 820.2 (unl-182-219) — resume the suspended [Repeat] executions
          // once this mode has resolved (each re-prompts for its own mode). If
          // the picked mode parked its own prompt, hand the continuation to it.
          if (choice.then) {
            const nested = draft.pendingChoice as { then?: unknown } | undefined;
            if (!nested) {
              executeEffect(choice.then as ExecutableEffect, effectCtx);
            } else if (nested.then === undefined) {
              draft.pendingChoice = { ...(nested as object), then: choice.then } as typeof draft.pendingChoice;
            }
          }
          postChoiceCleanup(draft, context);
        }
        return;
      }

      if (choice.type === "choose-target") {
        const picked = context.params.pickedCardId as string;
        // rule 355.8 / 820.2 (unl-182-219) — the target of a mode chosen while
        // PLAYING the card: lock it onto that mode inside the chain item's
        // effect, then move on to the next execution's choices.
        if (choice.choiceNodeIndex !== undefined && choice.bindToChainItemId !== undefined) {
          if (!choice.options.includes(picked)) {
            return;
          }
          const items = draft.interaction?.chain?.items ?? [];
          const item = items.find((it) => it && it.id === choice.bindToChainItemId);
          draft.pendingChoice = undefined;
          if (!item) {
            return;
          }
          const node = collectChoiceNodes(item.effect)[choice.choiceNodeIndex as number];
          if (node) {
            node._chosenTargets = [picked];
          }
          fireTriggers(
            {
              cardId: picked,
              chooserId: choice.playerId,
              sourceType: item.triggered === true ? "ability" : "spell",
              type: "choose",
            },
            { cards: context.cards, counters: context.counters, draft, zones: context.zones },
          );
          raisePlayTimeModeChoice(
            draft,
            choice.bindToChainItemId,
            item.effect,
            choice.playerId,
            choice.sourceCardId as string,
            buildEffectContext(draft, choice.playerId, choice.sourceCardId, context),
          );
          return;
        }
        // rule 355.5 / 811.1.b (ogn-213-298): a play-time target choice — lock
        // the pick onto the pending chain item and let priority proceed; the
        // effect runs (or mistargets) later, when that item resolves.
        if (choice.bindToChainItemId !== undefined) {
          if (!choice.options.includes(picked)) {
            return;
          }
          const items = draft.interaction?.chain?.items;
          const idx = items?.findIndex((it) => it.id === choice.bindToChainItemId) ?? -1;
          let triggeredItem = false;
          if (items && idx >= 0) {
            triggeredItem = items[idx]?.triggered === true;
            // rule 402.2 (sfd-132-221) — slot N of a multi-slot trigger keeps
            // the earlier slots' picks in front of it.
            const slot = choice.bindSlotIndex;
            const targets =
              slot !== undefined
                ? [...(items[idx]?.targets ?? []).slice(0, slot), picked]
                : [picked];
            items[idx] = { ...items[idx], targets };
          }
          draft.pendingChoice = undefined;
          // rule 809.1.c.1 — the [Deflect] surcharge is owed as the target is chosen.
          chargePromptedDeflectTax(draft, choice, [picked], context.cards);
          fireTriggers(
            {
              cardId: picked,
              chooserId: choice.playerId,
              // rule-id: sfd-142-221 — a finalized trigger choosing a unit is
              // an ability-sourced choice, not a spell one.
              sourceType: triggeredItem ? "ability" : "spell",
              type: "choose",
            },
            { cards: context.cards, counters: context.counters, draft, zones: context.zones },
          );
          // rule 355.5 / 811.1.b (ogn-220-298): the next slot of a multi-target
          // card played from [Hidden] is asked right away.
          if (!draft.pendingChoice) {
            continueRevealSlotLock(draft, { cards: context.cards, zones: context.zones });
          }
          postChoiceCleanup(draft, context);
          return;
        }
        // rule 372: ordering two replacement effects on the same death. The
        // pick names a replacement SOURCE card, not a target — record it and
        // let the next state-based check apply that replacement.
        if (choice.replacementOrderFor !== undefined) {
          if (!choice.options.includes(picked)) {
            return;
          }
          (draft as { replacementOrderChoices?: Record<string, string> }).replacementOrderChoices = {
            ...((draft as { replacementOrderChoices?: Record<string, string> })
              .replacementOrderChoices ?? {}),
            [choice.replacementOrderFor as string]: picked,
          };
          draft.pendingChoice = undefined;
          postChoiceCleanup(draft, context);
          return;
        }
        // rule-id: ogn-080-298 (rule 355.9) — "You may make new choices for
        // it": the pick RE-TARGETS a chain item the chooser just gained
        // control of; rewrite that item's locked targets instead of executing
        // anything now (the stolen spell resolves later, on its own).
        if (choice.retargetChainItemId !== undefined) {
          // Declining leaves the item's existing targets in place.
          if (context.params.accept === false) {
            draft.pendingChoice = undefined;
            postChoiceCleanup(draft, context);
            return;
          }
          if (!choice.options.includes(picked)) {
            return;
          }
          const items = draft.interaction?.chain?.items ?? [];
          const item = items.find((it) => it && it.id === choice.retargetChainItemId);
          if (item) {
            (item as { targets?: readonly string[] }).targets = [picked];
          }
          draft.pendingChoice = undefined;
          postChoiceCleanup(draft, context);
          return;
        }
        // rule-id: ogn-256-298 (rule 355.13) — "any number of <units>": each
        // pick accumulates; remaining options are re-pruned against the
        // target's aggregate constraints (one battlefield, `totalMight` cap)
        // and the prompt repeats until the chooser declines or none remain.
        if (choice.anyNumber) {
          const declined = context.params.accept === false;
          // rule 355.13 (ogn-141-298): several "up to N" picks in one answer.
          const multiPicked = context.params.pickedCardIds as string[] | undefined;
          const newPicks = declined ? [] : (multiPicked ?? [picked]);
          if (!declined && newPicks.some((id) => !choice.options.includes(id))) {
            return;
          }
          const pickedSoFar = [...(choice.picked ?? []), ...newPicks];
          // rule 355.13 (ogn-073-298): "up to N" caps the accumulated picks.
          const capped = typeof choice.maxPicks === "number" && pickedSoFar.length >= choice.maxPicks;
          // rule-id: sfd-079-221 (rule 355.13) — "move ANY NUMBER of your
          // units" is one simultaneous choice: an answer that names the whole
          // set (`pickedCardIds`) IS the chooser's answer, so it finalizes
          // instead of re-prompting for more. Single `pickedCardId` answers
          // keep the accumulate-until-declined flow.
          const answeredAsSet =
            Array.isArray(multiPicked) && (choice as { answerAsSet?: boolean }).answerAsSet === true;
          if (!declined && !capped && !answeredAsSet) {
            const tgt = (choice.effect as { target?: unknown }).target as
              | Parameters<typeof isLegalMultiTargetSet>[0]
              | undefined;
            const legalityCtx = {
              getCardZone: (c: string) => context.zones.getCardZone(c as CoreCardId),
              getMight: (c: string) =>
                getCardEffectiveMight(c, (m) =>
                  context.cards.getCardMeta(m) as Partial<RiftboundCardMeta> | undefined,
                ),
            };
            // rule 106 (unl-118-219): "up to one at each location" — a location
            // already named is exhausted, so its other candidates drop out.
            const acc = context as unknown as Parameters<typeof locationKeyOf>[1];
            const takenLocations = (choice as { onePerLocation?: boolean }).onePerLocation
              ? new Set(pickedSoFar.map((id) => locationKeyOf(id, acc)))
              : undefined;
            const remainingOptions = choice.options.filter(
              (id) =>
                !newPicks.includes(id) &&
                !takenLocations?.has(locationKeyOf(id, acc)) &&
                isLegalMultiTargetSet(tgt, [...pickedSoFar, id], legalityCtx),
            );
            if (remainingOptions.length > 0) {
              draft.pendingChoice = {
                ...choice,
                options: remainingOptions,
                picked: pickedSoFar,
                remaining: remainingOptions.length,
              };
              return;
            }
          }
          draft.pendingChoice = undefined;
          // rule 355.2 (ogn-187-298): a chained prompt ("starting with the next
          // player, each player may …") continues whether or not this chooser
          // declined, and the next prompt belongs to the SPELL's controller
          // chain, not this chooser.
          const chainedThen = (choice as { then?: unknown }).then as ExecutableEffect | undefined;
          // rule 355.4 (unl-198-219) — the zone the parked effect had already
          // chosen ("…to THAT battlefield … enemy units there") outlives the
          // prompt; without it "here" falls back to the source card's own zone,
          // which for a resolving spell is the trash.
          const declineCarriedZone = (choice as { sourceZone?: string }).sourceZone;
          const declineZoneCarry =
            typeof declineCarriedZone === "string" ? { sourceZone: declineCarriedZone } : {};
          if (pickedSoFar.length === 0) {
            if (chainedThen) {
              // rule 355.13 (unl-198-219) — "you may move UP TO ONE …": zero is
              // a legal answer and the REST of the sequence still resolves, at
              // the battlefield the effect already chose.
              executeEffect(chainedThen, {
                ...buildEffectContext(draft, choice.playerId, choice.sourceCardId, context),
                ...declineZoneCarry,
              });
            }
            // rule 319 / 323.12–13 — declining was the last word of this
            // resolution: its Cleanup (and any Showdown it staged) follows.
            if (!draft.pendingChoice) {
              postChoiceCleanup(draft, context);
            }
            return;
          }
          chargePromptedDeflectTax(draft, choice, pickedSoFar, context.cards);
          // Rule 359.2: "when you choose me" fires for each chosen target.
          const trigCtx = { cards: context.cards, counters: context.counters, draft, zones: context.zones };
          // rule-id: sfd-142-221 — tag spell- vs ability-sourced choices.
          const sourceType =
            getGlobalCardRegistry().get(choice.sourceCardId as string)?.cardType === "spell"
              ? "spell"
              : "ability";
          for (const id of pickedSoFar) {
            fireTriggers({ cardId: id, chooserId: choice.playerId, sourceType, type: "choose" }, trigCtx);
          }
          // rule 355.4 (unl-198-219) — the battlefield the effect had already
          // chosen ("…move a unit to THAT battlefield. Then … units there")
          // outlives the prompt; without it "here" falls back to the source
          // card's own zone, which for a resolving spell is the trash.
          const carriedZone = (choice as { sourceZone?: string }).sourceZone;
          const zoneCarry = typeof carriedZone === "string" ? { sourceZone: carriedZone } : {};
          executeEffect(choice.effect as ExecutableEffect, {
            ...buildEffectContext(draft, choice.playerId, choice.sourceCardId, context),
            ...zoneCarry,
            boundTargets: pickedSoFar,
          });
          if (chainedThen) {
            executeEffect(chainedThen, {
              ...buildEffectContext(draft, choice.playerId, choice.sourceCardId, context),
              ...zoneCarry,
            });
          }
          postChoiceCleanup(draft, context);
          return;
        }
        // rule 355.14.e/f (ogn-041-298): fixed-total split — the allocation is
        // encoded as one boundTargets occurrence per point of damage; every
        // allocated unit is a target (355.14.a → "when you choose me" fires).
        if (choice.assign && typeof choice.total === "number") {
          const allocation = context.params.allocation;
          if (!isLegalSplitAllocation(choice.options, choice.total, allocation)) {
            return;
          }
          draft.pendingChoice = undefined;
          const encoded: string[] = [];
          for (const [id, n] of Object.entries(allocation)) {
            for (let i = 0; i < n; i++) encoded.push(id);
          }
          if (encoded.length > 0) {
            chargePromptedDeflectTax(draft, choice, [...new Set(encoded)], context.cards);
            const trigCtx = { cards: context.cards, counters: context.counters, draft, zones: context.zones };
            const sourceType =
              getGlobalCardRegistry().get(choice.sourceCardId as string)?.cardType === "spell"
                ? "spell"
                : "ability";
            for (const id of new Set(encoded)) {
              fireTriggers({ cardId: id, chooserId: choice.playerId, sourceType, type: "choose" }, trigCtx);
            }
            executeEffect(choice.effect as ExecutableEffect, {
              ...buildEffectContext(draft, choice.playerId, choice.sourceCardId, context),
              boundTargets: encoded,
            });
          }
          postChoiceCleanup(draft, context);
          return;
        }
        if (!choice.options.includes(picked)) {
          return;
        }
        // Rule 355.14.h (unl-192-219): a choose-target carrying boundTargets is
        // a split-target DROP prompt — remove the picked id and re-execute so
        // the split handler re-evaluates might vs remaining-target count.
        // Rule 355.14.e/f/g: with `assign` set it is instead a resolution-time
        // damage-distribution pick — APPEND the picked id (one occurrence per
        // surplus point) so the split handler credits it +1.
        const boundTargets = choice.assign
          ? [...(choice.boundTargets ?? []), picked]
          : choice.boundTargets
            ? choice.boundTargets.filter((id) => id !== picked)
            : [picked];
        // A drop prompt (`boundTargets` without `assign`) UN-chooses the pick, so
        // nothing new is chosen and no surcharge is owed.
        chargePromptedDeflectTax(
          draft,
          choice,
          choice.boundTargets && !choice.assign ? [] : [picked],
          context.cards,
        );
        draft.pendingChoice = undefined;
        // rule 359.3.f.3 (unl-112-219) — "…to THAT battlefield": information
        // read from the trigger condition survives the target prompt, so the
        // triggering move's destination must reach the effect context.
        const promptTriggerToZone = (choice as { triggerToZone?: string }).triggerToZone;
        // rule 355.4 (unl-198-219) — "…to THAT battlefield … enemy units
        // there": a zone the parked effect had already chosen outlives the
        // prompt; without it "here" would fall back to the source card's zone.
        const promptSourceZone = (choice as { sourceZone?: string }).sourceZone;
        const effectCtx = {
          ...buildEffectContext(draft, choice.playerId, choice.sourceCardId, context),
          boundTargets,
          ...(typeof promptTriggerToZone === "string" ? { triggerToZone: promptTriggerToZone } : {}),
          ...(typeof promptSourceZone === "string" ? { sourceZone: promptSourceZone } : {}),
        };
        executeEffect(choice.effect as ExecutableEffect, effectCtx);
        // rule 820.2 (unl-182-219) — resume a suspended continuation carried on
        // this prompt (the remaining [Repeat] executions); if the picked effect
        // parked its own prompt, hand the continuation to that one instead.
        const carried = (choice as { then?: unknown }).then;
        if (carried !== undefined) {
          const nested = draft.pendingChoice as { then?: unknown } | undefined;
          if (!nested) {
            executeEffect(carried as ExecutableEffect, effectCtx);
          } else if (nested.then === undefined) {
            draft.pendingChoice = {
              ...(nested as object),
              then: carried,
            } as typeof draft.pendingChoice;
          }
        }
        // rule-id: ogn-063-298 — recalc statics after the picked effect so a
        // just-buffed unit picks up "friendly buffed units have [Deflect]".
        // Skip while a re-prompt (split/assign) is still pending.
        if (!draft.pendingChoice) {
          postChoiceCleanup(draft, context);
        }
        return;
      }

      if (choice.type === "choose-destination") {
        const zoneId = context.params.pickedZoneId as string;
        // rule-id: ogn-262-298 (rule 355.13) — the declined "you may move"
        // simply does nothing.
        if (choice.optional && context.params.accept === false) {
          draft.pendingChoice = undefined;
          postChoiceCleanup(draft, context);
          return;
        }
        if (!choice.options.includes(zoneId)) {
          return;
        }
        // rule-id: unl-204-219-owner-chooses-top-or-bottom — owner-choice
        // recycle surfaces mainDeck-top / mainDeck-bottom as destinations.
        if (zoneId === "mainDeck-top" || zoneId === "mainDeck-bottom") {
          // rule 124.1 / 186.1 / 457.1 — recycling off the board runs through
          // the leave-board choke point: new object, Equipment detached, and a
          // token ceases to exist instead of entering the deck (185.2.e).
          leaveBoard(
            { cards: context.cards, counters: context.counters, draft, zones: context.zones },
            choice.cardId as string,
            zoneId === "mainDeck-top" ? "deck-top" : "deck-bottom",
            { by: choice.playerId, kind: "recycle" },
          );
          draft.pendingChoice = undefined;
          // rule-id: ogn-235-298 — the owner recycled a card to their Main Deck.
          fireRecycleEvent(draft, context, choice.playerId, [choice.cardId as string]);
          // rule 190.4.c (unl-204-219) — the deferred owner choice is the tail of
          // the resolution: the Cleanup that follows it is what drops control of a
          // battlefield the recycled unit was the last occupant of.
          if (!draft.pendingChoice) {
            postChoiceCleanup(draft, context);
          }
          return;
        }
        // Rule 323.6 / 355.2 / 355.4 (rule-id: unl-184-219-choose-destination-zone-id,
        // sfd-200-221-choose-destination-battlefield):
        // the move/to:"choose" executor already emits ZONE ids (base /
        // battlefield-<bfId>); only prefix a bare battlefield id so we never
        // produce battlefield-battlefield-<bfId>.
        const targetZoneId =
          zoneId === "base" || zoneId.startsWith("battlefield-")
            ? zoneId
            : `battlefield-${zoneId}`;
        const fromZone =
          (context.zones.getCardZone?.(choice.cardId as CoreCardId) as string | undefined) ?? "";
        // rule-id: sfd-109-221 (rule 354.2 / 356.1.b.3 / 560) — finalizing a
        // pending "play it, ignoring its cost": the card enters the board from
        // off-board, so this is a play. Charge the optional additional cost if
        // elected (and still payable) before the card moves.
        const enteringPlay =
          !choice.created &&
          context.cards &&
          typeof context.zones.getCardsInZone === "function" &&
          fromZone !== "" &&
          !isBoardZone(fromZone);
        let paidAdditionalCost = false;
        if (enteringPlay && context.params.paidAdditionalCost === true) {
          const extra = pendingPlayOptionalCost(draft, choice, context);
          if (extra) {
            deductAbilityCost(draft, choice.playerId, extra, context.zones, context.counters);
            paidAdditionalCost = true;
          }
        }
        // rule 449.2 / 447.2.c / 456.1 — no unit may become present at a
        // battlefield already holding units of two OTHER players. A named
        // destination that has become illegal by the time the move executes
        // turns the required Move into a Recall to base, and a Recall is not a
        // Move: no `move` event and no Contested from the arrival.
        const recalledToBase = (cardId: string): boolean => {
          if (
            !targetZoneId.startsWith("battlefield-") ||
            choice.created === true ||
            !isBoardZone(fromZone) ||
            !context.cards ||
            typeof context.zones.getCardsInZone !== "function" ||
            getGlobalCardRegistry().get(cardId)?.cardType !== "unit"
          ) {
            return false;
          }
          const controller =
            ((context.cards as { getCardController?: (id: CoreCardId) => string | undefined })
              .getCardController?.(cardId as CoreCardId) ??
              (context.cards.getCardOwner(cardId as CoreCardId) as string | undefined)) ??
            choice.playerId;
          return isBlockedByTwoOtherPlayers(
            targetZoneId,
            controller,
            (zoneId) => context.zones.getCardsInZone(zoneId),
            (id) =>
              (context.cards as { getCardController?: (c: CoreCardId) => string | undefined })
                .getCardController?.(id as CoreCardId) ??
              (context.cards.getCardOwner(id as CoreCardId) as string | undefined),
          );
        };
        const mainRecalled = recalledToBase(choice.cardId as string);
        if (!(choice.created && fromZone === targetZoneId)) {
          context.zones.moveCard({
            cardId: choice.cardId as CoreCardId,
            targetZoneId: (mainRecalled ? "base" : targetZoneId) as CoreZoneId,
          });
        }
        // rule-id: sfd-079-221 (rule 449) — "move any number of your units to an
        // open battlefield" is ONE move of a group: every other unit in the
        // group travels to the destination its controller just picked.
        const movedGroup: string[] = mainRecalled ? [] : [choice.cardId as string];
        // rule 446.1 — each member of the group is moved, so each one's own
        // "When I move" trigger is owed a `move` event keyed to ITS from-zone.
        const movedFrom: { cardId: string; from: string }[] = mainRecalled
          ? []
          : [{ cardId: choice.cardId as string, from: fromZone }];
        for (const extraId of ((choice as { alsoMoveCardIds?: readonly string[] })
          .alsoMoveCardIds ?? []) as readonly string[]) {
          const extraFrom =
            (context.zones.getCardZone?.(extraId as CoreCardId) as string | undefined) ?? "";
          if (extraFrom === targetZoneId) {
            continue;
          }
          if (recalledToBase(extraId)) {
            context.zones.moveCard({
              cardId: extraId as CoreCardId,
              targetZoneId: "base" as CoreZoneId,
            });
            continue;
          }
          context.zones.moveCard({
            cardId: extraId as CoreCardId,
            targetZoneId: targetZoneId as CoreZoneId,
          });
          movedGroup.push(extraId);
          movedFrom.push({ cardId: extraId, from: extraFrom });
        }
        draft.pendingChoice = undefined;
        // rule-id: ogs-015-024 (rule 439.2.a/.b.1) — a created token is placed,
        // not moved: skip the `move` event and prompt for the next queued token.
        if (choice.created) {
          const [next, ...rest] = choice.queue ?? [];
          if (next !== undefined) {
            draft.pendingChoice = { ...choice, cardId: next, queue: rest };
          }
          return;
        }
        // rule-id: unl-133-219 — a chosen-destination effect move is still a
        // move: emit the `move` event (owner / movedBy) so "When I move" /
        // "When you move an enemy unit" triggers fire. Guarded so unit-test
        // stubs that omit the full context bags don't crash.
        if (context.cards && typeof context.zones.getCardsInZone === "function") {
          for (const moved of movedFrom) {
            if (
              !(moved.from === "base" || moved.from.startsWith("battlefield-")) ||
              moved.from === targetZoneId
            ) {
              continue;
            }
            const owner =
              (context.cards as { getCardController?: (id: CoreCardId) => string | undefined })
                .getCardController?.(moved.cardId as CoreCardId) ??
              (context.cards.getCardOwner(moved.cardId as CoreCardId) as string | undefined);
            fireTriggers(
              {
                cardId: moved.cardId,
                from: moved.from,
                movedBy: choice.playerId,
                owner,
                to: targetZoneId,
                type: "move",
              },
              { cards: context.cards, counters: context.counters, draft, zones: context.zones },
            );
          }
        }
        // rule-id: ogn-173-298 — Rule 450 / 323.9 / 460: a unit arriving at a
        // battlefield its controller doesn't control contests it AND stages the
        // showdown (combat when opposing units stand there), exactly as a
        // Standard Move does. Fall back to the bare Contested mark when the
        // caller's context bags are stubbed (unit tests) or the card is no unit.
        // rule 450: Contested is attributed to the CONTROLLER of the unit that
        // arrived, never to the player who chose the destination (ogn-043-298
        // Charm moves an ENEMY unit).
        const arrivingController =
          (context.cards?.getCardController?.(choice.cardId as never) as string | undefined) ??
          (context.cards?.getCardOwner?.(choice.cardId as never) as string | undefined) ??
          choice.playerId;
        if (mainRecalled && movedGroup.length === 0) {
          // rule 456 — the Recall relocated the unit to base; nothing arrived,
          // so no Contested mark and no Showdown is staged at the destination.
        } else if (
          targetZoneId.startsWith("battlefield-") &&
          context.cards &&
          context.counters &&
          typeof context.zones.getCardsInZone === "function" &&
          getGlobalCardRegistry().get(choice.cardId as string)?.cardType === "unit"
        ) {
          contestBattlefieldOnArrival({
            arrivingUnitIds: movedGroup,
            // rule 344.2 — this Showdown is begun by the Cleanup that follows the
            // resolution, not by a player choosing to start it.
            autoBegun: true,
            battlefieldId: targetZoneId.slice("battlefield-".length),
            cards: context.cards,
            counters: context.counters,
            deferToCleanup: true,
            draft,
            playerId: arrivingController,
            // rule 323.13 (unl-202-219) — the caster dragged this unit here.
            stagedBy: choice.playerId as string,
            zones: context.zones,
          });
        } else {
          markContestedOnArrival(draft, targetZoneId, arrivingController, choice.playerId as string);
        }
        draft.pendingChoice = undefined;
        // rule-id: ogn-258-298 (rule 387) — "Move an enemy unit. Then do this:
        // …at its destination": the follow-up carried on the prompt resolves
        // now, with the moved unit bound and its new zone as `same`.
        if (choice.then && context.cards && context.counters) {
          const thenCtx = {
            ...buildEffectContext(
              draft,
              choice.playerId,
              (choice.sourceCardId ?? choice.cardId) as string,
              context,
            ),
            boundTargets: [choice.cardId as string],
            sameZone: targetZoneId,
          };
          executeEffect(choice.then as ExecutableEffect, thenCtx);
          if (!draft.pendingChoice) {
            postChoiceCleanup(draft, context);
          }
        }
        // rule-id: sfd-109-221 (rule 354.2 / 419.4.a) — a card played by an
        // effect is still played: fire "When you play me" (carrying whether
        // the optional additional cost was paid) and "when you play a card",
        // and count it toward this turn's plays (rule 724), mirroring playUnit.
        if (enteringPlay) {
          const trigCtx = { cards: context.cards, counters: context.counters, draft, zones: context.zones };
          const cardId = choice.cardId as string;
          // rule 143.4: a unit entering the board is exhausted, however it was
          // played — unless a static "enters ready" ability applies.
          if (
            getGlobalCardRegistry().get(cardId)?.cardType === "unit" &&
            !staticEnterReadyApplies(cardId, draft, choice.playerId, context.zones)
          ) {
            context.counters.setFlag(cardId as CoreCardId, "exhausted", true);
          }
          fireTriggers(
            { cardId, paidAdditionalCost, playerId: choice.playerId, type: "play-self" },
            trigCtx,
          );
          const cardType = getGlobalCardRegistry().get(cardId)?.cardType ?? "unit";
          fireTriggers({ cardId, cardType, playerId: choice.playerId, type: "play-card" }, trigCtx);
          if (draft.cardsPlayedThisTurn) {
            draft.cardsPlayedThisTurn[choice.playerId] =
              (draft.cardsPlayedThisTurn[choice.playerId] ?? 0) + 1;
          }
          // rule 356.2.b.1 — [Accelerate] is an optional additional cost of the
          // play, so the player who PLAYS the card (here: the one who chose the
          // destination, even on a free "its owner plays it" replay) may pay it
          // to have the unit enter ready. Offered only when they can pay it and
          // no other prompt is already parked.
          maybeOfferAccelerate(draft, choice.cardId as string, choice.playerId, context);
          // rule 821.1.c / 356.1.b (rule-id: sfd-127-221) — a play finalized by
          // this destination prompt is still a play, so [Weaponmaster] offers
          // its discounted Equip here exactly as the playUnit move does.
          if (getGlobalCardRegistry().get(cardId)?.cardType === "unit") {
            offerWeaponmasterEquip(
              draft as unknown as Parameters<typeof offerWeaponmasterEquip>[0],
              context.zones as unknown as Parameters<typeof offerWeaponmasterEquip>[1],
              choice.playerId as string,
              cardId,
              context.cards as unknown as Parameters<typeof offerWeaponmasterEquip>[4],
            );
          }
        }
        // rule 323.6 (rule-id: sfd-165-221) — answering the destination prompt
        // ends the resolution: run the Cleanup so a battlefield left with no
        // units (the one the dying unit vacated) stops being controlled once
        // the turn is Open again. Skipped while another prompt is parked.
        if (!draft.pendingChoice) {
          postChoiceCleanup(draft, context);
        }
        return;
      }

      if (choice.type === "name-card") {
        // Rule 762 / 383.2.b: record the chosen name on the source card so
        // linked abilities ("cards with that name") can read it.
        const name = context.params.pickedName;
        if (typeof name !== "string" || !choice.options.includes(name)) {
          return;
        }
        context.cards.updateCardMeta(
          choice.sourceCardId as CoreCardId,
          (choice.cardType === "tag"
            ? { namedTag: name }
            : { namedCard: name }) as Partial<RiftboundCardMeta>,
        );
        draft.pendingChoice = undefined;
        return;
      }

      // rule 386.2 (unl-062-219) — arrange the looked-at cards back on top of
      // the Main Deck: index 0 of the answer ends up topmost.
      if (choice.type === "order-cards") {
        const order = context.params.orderedCardIds as string[] | undefined;
        const wanted = Array.isArray(order) ? order : [...choice.cards];
        const known = new Set(choice.cards as readonly string[]);
        if (wanted.length !== known.size || !wanted.every((id) => known.has(id))) {
          return;
        }
        for (const cardId of [...wanted].reverse()) {
          context.zones.moveCard({
            cardId: cardId as CoreCardId,
            position: "top",
            targetZoneId: "mainDeck" as CoreZoneId,
          });
        }
        draft.pendingChoice = undefined;
        postChoiceCleanup(draft, context);
        return;
      }

      // rule-id: ogn-235-298-vision-optional-recycle — declining leaves the
      // revealed card(s) where they are (on top of the deck for Vision).
      if (choice.optional && context.params.accept === false) {
        // rule-id: ogn-062-298-look-decline-recycle — a declined look that
        // says "Recycle the remaining cards" still recycles every revealed
        // card; only Vision-like looks (no onRest) leave them on top.
        if (choice.onRest === "recycle") {
          for (const restId of choice.revealed) {
            context.zones.moveCard({
              cardId: restId as CoreCardId,
              position: "bottom",
              targetZoneId: "mainDeck" as CoreZoneId,
            });
          }
        }
        // rule 416.1 (ven-156-166) — "Put the rest into your trash": declining
        // the optional pick still trashes every looked-at card.
        if (choice.onRest === "trash") {
          for (const restId of choice.revealed) {
            context.zones.moveCard({
              cardId: restId as CoreCardId,
              targetZoneId: "trash" as CoreZoneId,
            });
          }
        }
        // rule-id: sfd-188-221 — "Draw any you didn't banish": declining the
        // optional banish draws every revealed card.
        if (choice.onRest === "draw") {
          for (const restId of choice.revealed) {
            context.zones.moveCard({
              cardId: restId as CoreCardId,
              targetZoneId: "hand" as CoreZoneId,
            });
          }
        }
        draft.pendingChoice = undefined;
        // rule-id: ogn-235-298 — declined pick still recycled the rest.
        if (choice.onRest === "recycle") {
          fireRecycleEvent(draft, context, choice.prompter, choice.revealed as readonly string[]);
        }
        // rule 359.3.e — declining an optional prompt does not cancel the rest
        // of the instruction it interrupted ("you may [Predict], THEN reveal
        // the top card"); resume the suspended sequence remainder.
        // rule 386.2 (unl-062-219) — a declined Predict still puts the cards
        // that stayed on top back "in any order".
        if (choice.onDecline) {
          executeEffect(
            choice.onDecline as ExecutableEffect,
            buildEffectContext(draft, choice.prompter, choice.sourceCardId ?? "", context),
          );
          if (!draft.pendingChoice) {
            postChoiceCleanup(draft, context);
          }
        }
        if ((choice as { thenIsSequenceRest?: boolean }).thenIsSequenceRest && choice.then) {
          executeEffect(
            choice.then as ExecutableEffect,
            buildEffectContext(draft, choice.prompter, choice.sourceCardId ?? "", context),
          );
          if (!draft.pendingChoice) {
            postChoiceCleanup(draft, context);
          }
        }
        return;
      }

      // rule 422.1.a (ogn-030-298): a multi-pick prompt ("discard 2") takes
      // one pick per move or several via `pickedCardIds`; every pick is
      // applied here, and the prompt re-parks until `remaining` is spent.
      const multi = context.params.pickedCardIds as string[] | undefined;
      const picks: string[] =
        Array.isArray(multi) && multi.length > 0 ? [...multi] : [context.params.pickedCardId as string];
      if (!picks.every((id) => isValidPendingPick(choice, id))) {
        return;
      }
      // rule 356.1 (unl-135-219) — charge the pick's cost before applying it;
      // if it became unpayable the pick simply does not happen.
      if (choice.pickCost) {
        const pickCost = choice.pickCost as Record<string, unknown>;
        if (
          !canPayOptInCost(draft, choice.prompter, choice.sourceCardId ?? "", pickCost, context)
        ) {
          return;
        }
        deductAbilityCost(draft, choice.prompter, pickCost, context.zones, context.counters);
      }
      const pickedCardId = picks[picks.length - 1] as string;
      /** rule 337.1.b (ogn-242-298) — a "banish it and play it" pick, finalized below. */
      let pendingPlayFinalize: string | undefined;
      // Set when the pick's `then` follow-up rides the play's chain item instead
      // of running inline (rule-id: ven-089-166-look-then-empower).
      let followUpOnChain = false;
      /**
       * rule 355.1.a / 356.1.b.3 (ogn-226-298 × ogn-010-298) — a unit an effect
       * played from the trash "ignoring its cost" still gets its own optional
       * additional costs: [Accelerate] is offered once the pick has settled.
       */
      let accelerateAfterPick: { cardId: string; playerId: string } | undefined;
      let remaining = choice.remaining ?? 1;
      let taken = choice.taken ?? 0;
      let revealed = choice.revealed as readonly string[];

      const targetZoneId = onPickedTargetZone(choice.onPicked);
      // rule-id: sfd-169-221 — "on the top or bottom of your Main Deck": the
      // picked cards are held back here and placed by a follow-up
      // choose-destination prompt answered by their owner.
      const ownerChoiceRecycle =
        choice.onPicked === "recycle" &&
        (choice as { position?: string }).position === "owner-choice";
      for (const id of picks) {
        const moveParams: {
          cardId: CoreCardId;
          targetZoneId: CoreZoneId;
          position?: "top" | "bottom";
        } = {
          cardId: id as CoreCardId,
          targetZoneId,
        };
        // Recycle → bottom of main deck (rule: recycle places at bottom).
        if (choice.onPicked === "recycle") {
          moveParams.position = "bottom";
          // rule 424.4.a — recycling puts a card on the bottom of the
          // CORRESPONDING deck; a rune goes to its owner's Rune Deck.
          if (getGlobalCardRegistry().get(id)?.cardType === "rune") {
            moveParams.targetZoneId = "runeDeck" as CoreZoneId;
          }
        }
        // rule 571 (rule-id: ven-022-166) — "if a card would go to your trash
        // from anywhere other than your Main Deck, banish it instead". A
        // discard chosen through a prompt moves hand → trash directly here
        // (the board departures go through `leaveBoard`, which already asks),
        // so the destination replacement has to be applied at this hop too.
        if (choice.onPicked === "discard" && typeof context.zones.getCardsInZone === "function") {
          const getCardsInZone = context.zones.getCardsInZone.bind(context.zones);
          const getCardOwner = (c: CoreCardId) => context.cards.getCardOwner?.(c);
          const owner = getCardOwner(id as CoreCardId) ?? choice.revealer;
          if (hasTrashToBanishReplacement(draft, { getCardOwner, getCardsInZone }, owner)) {
            moveParams.targetZoneId = "banishment" as CoreZoneId;
          }
        }
        context.counters.clearAllCounters(id as CoreCardId);
        // rule 359.2.c (ogn-196-298 / ogn-226-298): a unit played FROM the
        // trash never passes through banishment — it goes straight onto the
        // board below, so leave it where it is for now.
        // rule 419.3 (unl-139-219): a forced play to a fixed battlefield goes
        // straight there too.
        if (choice.playFrom !== "trash" && choice.playTo === undefined && !ownerChoiceRecycle) {
          context.zones.moveCard(moveParams);
        }
        revealed = revealed.filter((r) => r !== id);

        // Rule ogn-006-298: emit the discard event so "When you discard me…"
        // self-triggers (Flame Chompers) can fire. Guarded so unit-test stubs
        // that omit the full zone bag don't crash. Rule ogn-202-298: tag the
        // batch position so "discard one or more" fires once per instruction.
        if (choice.onPicked === "discard" && typeof context.zones.getCardsInZone === "function") {
          // rule 422 (unl-080-219) — remember what this discard instruction
          // put in the trash so a follow-up clause can branch on its type.
          const log = draft as { lastDiscardedCardIds?: Record<string, string[]> };
          const prior = taken === 0 ? [] : (log.lastDiscardedCardIds?.[choice.revealer] ?? []);
          log.lastDiscardedCardIds = {
            ...log.lastDiscardedCardIds,
            [choice.revealer]: [...prior, id as string],
          };
          fireTriggers(
            { batchIndex: taken, cardId: id, playerId: choice.revealer, type: "discard" },
            { cards: context.cards, counters: context.counters, draft, zones: context.zones },
          );
        }
        taken += 1;
        remaining -= 1;
      }
      if (remaining > 0) {
        const rest = { ...choice, revealed: [...revealed] } as typeof choice;
        if (revealed.some((id) => isValidPendingPick(rest, id))) {
          draft.pendingChoice = { ...rest, remaining, taken };
          return;
        }
      }

      // rule 416.1.a / rule-id: sfd-169-221 — the pick is made; its owner now
      // chooses the top or the bottom of their Main Deck for it.
      if (ownerChoiceRecycle && picks.length > 0) {
        const held = picks[0] as string;
        draft.pendingChoice = {
          cardId: held,
          options: ["mainDeck-top", "mainDeck-bottom"],
          playerId: context.cards.getCardOwner(held as CoreCardId) ?? choice.prompter,
          type: "choose-destination",
        };
        return;
      }

      // rule 337.1.b (ogn-115-298) — "each player … banishes one of them …
      // [then] each player plays those cards": the banish pass is public and
      // finishes before any play, so record the picks in order for a later
      // `play-banished-pass` step to replay.
      if (choice.onPicked === "banish") {
        // rule 392 (rule-id: unl-169-219, Ashe Focused) — "When they hold,
        // return it to their hand (even if I'm no longer on the board)": the
        // delayed ability is player-scoped and permanent, so it survives its
        // source leaving the board and fires on the revealer's next hold.
        if (choice.returnOnHold === true) {
          const pdtDraft = draft as unknown as {
            playerDelayedTriggers?: {
              playerId: string;
              sourceCardId: string;
              trigger: { event: string; on?: string };
              effect: unknown;
              duration: "turn" | "permanent";
            }[];
          };
          pdtDraft.playerDelayedTriggers ??= [];
          for (const id of picks) {
            pdtDraft.playerDelayedTriggers.push({
              duration: "permanent",
              effect: { cardId: id as string, type: "return-banished-to-hand" },
              playerId: choice.prompter,
              sourceCardId: choice.sourceCardId ?? (id as string),
              trigger: { event: "hold", on: "opponent" },
            });
          }
        }
        const banishLog = draft as unknown as {
          lookBanishedCards?: { cardId: string; playerId: string; sourceCardId?: string }[];
        };
        for (const id of picks) {
          banishLog.lookBanishedCards = [
            ...(banishLog.lookBanishedCards ?? []),
            {
              cardId: id as string,
              playerId: context.cards.getCardOwner(id as CoreCardId) ?? choice.revealer,
              ...(choice.sourceCardId !== undefined ? { sourceCardId: choice.sourceCardId } : {}),
            },
          ];
        }
      }

      // rule-id: ogn-062-298-look-banish-play — "banish a unit from among
      // them, then play it, reducing its cost by [N]": pay the discounted
      // cost from the prompter's pool and add the play to the chain (rule
      // 354.2/354.3) so its owner chooses a location when it finalizes.
      // rule 419.3 / 811.1.c.1 (unl-139-219 Bone Skewer): "They play that unit
      // to that battlefield, ignoring any and all costs." The card's OWNER
      // plays it — control stays with them, nothing is paid, the destination
      // is fixed, and Hide is never an alternative (Hide is not a subset of
      // Play). rule 143.4: it enters exhausted; rule 423: stunned if asked.
      if (choice.onPicked === "play" && choice.playTo !== undefined) {
        const playedOwner = context.cards.getCardOwner(pickedCardId as CoreCardId) ?? choice.revealer;
        context.zones.moveCard({
          cardId: pickedCardId as CoreCardId,
          targetZoneId: choice.playTo as CoreZoneId,
        });
        context.counters.setFlag(pickedCardId as CoreCardId, "exhausted", true);
        // rule 190.3.a.1 (unl-139-219) — a unit ARRIVING at a battlefield its
        // controller does not control applies Contested by itself, however it
        // got there; the Cleanup after this resolution opens the showdown.
        if ((choice.playTo as string).startsWith("battlefield-")) {
          contestBattlefieldOnArrival({
            arrivingUnitIds: [pickedCardId as string],
            autoBegun: true,
            battlefieldId: (choice.playTo as string).slice("battlefield-".length),
            cards: context.cards,
            counters: context.counters,
            deferToCleanup: true,
            draft,
            playerId: playedOwner,
            stagedBy: choice.prompter ?? choice.revealer,
            zones: context.zones,
          });
        }
        if (choice.playStun === true) {
          context.counters.setFlag(pickedCardId as CoreCardId, "stunned", true);
          context.cards.updateCardMeta(pickedCardId as CoreCardId, {
            stunned: true,
          } as Partial<RiftboundCardMeta>);
        }
        // rule 356.4.f.1 / 356.2 (unl-139-219 × unl-052-219) — "ignoring any and
        // all costs" zeroes the AMOUNT of a folded-in optional additional cost,
        // but the decision to pay is still the playing player's and is made
        // before costs are determined; an optional cost counts as paid by that
        // decision. Ask them now, then fire the play triggers with the answer so
        // "if you paid the additional cost" riders see it.
        if (getOptionalPlayCost(pickedCardId as string) !== undefined) {
          draft.pendingChoice = {
            instructedPlay: {
              cardId: pickedCardId as string,
              playStun: choice.playStun === true,
              playTo: choice.playTo,
              revealer: choice.revealer,
            },
            playerId: playedOwner,
            resolved: {},
            sourceCardId: choice.sourceCardId,
            type: "opt-in",
          } as NonNullable<typeof draft.pendingChoice>;
          return;
        }
        fireInstructedPlayTriggers(draft, context, {
          cardId: pickedCardId as string,
          paidAdditionalCost: false,
          playStun: choice.playStun === true,
          playerId: playedOwner,
        });
      } else if (
        choice.onPicked === "play" &&
        // rule 358.3.a (ogn-115-298 × ogn-026-298) — an instruction to play a
        // card is skipped as impossible when that player can't play cards this
        // turn; the card simply stays where the pick put it (banishment).
        draft.cannotPlayCardsThisTurn?.[choice.prompter] !== true
      ) {
        const pool = draft.runePools[choice.prompter];
        // rule 356 / 357 — price and pay the instructed play through the ONE
        // shared cost computation (board discounts/increases, pooled [rainbow]
        // covering a named pip — 135.2.e.5.b, restricted Energy), with the
        // instruction's own modifications folded in:
        // rule 356.1.b.1 (ogn-025-298): "ignoring its cost" zeroes the base
        // cost (increases still apply, 356.1.b.3); rule-id ogn-115-298:
        // "ignoring Energy costs" waives only the energy — Power pips are still
        // paid; "for [N] less" is a flat discount. rule 356.4 (sfd-010-221) —
        // the picked card is played from banishment / trash / deck, never from
        // a hand, so its own "costs less from anywhere other than your hand"
        // static stacks (the board-aware computation sees the origin zone).
        // (Minimal mock contexts in unit tests lack the board accessors.)
        const hasBoard =
          typeof context.zones.getCardsInZone === "function" &&
          typeof context.cards.getCardOwner === "function";
        const costExtras: CostExtras = {
          ...(hasBoard ? { board: { cards: context.cards, zones: context.zones } as CostExtras["board"] } : {}),
          ...(choice.playIgnoreCost ? { altCost: { energy: 0, power: [] } } : {}),
          ...(choice.playIgnoreEnergy ? { ignoreEnergyCost: true } : {}),
          ...((choice.playEnergyReduction ?? 0) > 0
            ? { additionalCost: { energy: -(choice.playEnergyReduction ?? 0) } }
            : {}),
        };
        const metaForCost =
          typeof context.cards.getCardMeta === "function" ? createMetaAccessor(context.cards) : undefined;
        // rule 356.4 / 419.2.a: a discount reduces the cost, it does not waive
        // it — the reduced cost must still be payable in full, otherwise the
        // card cannot be played and simply stays where the pick put it.
        const affordable =
          pool === undefined ||
          canPayResourceCost(
            draft,
            choice.prompter,
            pickedCardId as string,
            computePlayResourceCost(draft, choice.prompter, pickedCardId as string, costExtras, metaForCost, false),
          );
        // rule 354.2 (ogn-115-298 × ogn-095-298) — "play" a spell puts it on
        // the chain; it is never placed on the board like a permanent.
        const isSpell =
          choice.playFrom !== "trash" &&
          getGlobalCardRegistry().getCardType(pickedCardId as string) === "spell";
        // rule 355.8 / 358.5 (ogn-115-298 × ogn-064-298) — a spell with no
        // legal target cannot be finalized: the play attempt is undone, so the
        // card stays where it is and nothing is paid.
        const spellPlayable =
          !isSpell ||
          spellEffectHasLegalTargets(
            (getGlobalCardRegistry().getAbilities(pickedCardId as string) ?? []).find(
              (a: { type: string }) => a.type === "spell",
            )?.effect as SpellEffectTargetShape | undefined,
            {
              cards: {
                getCardController: (c: CoreCardId) => context.cards.getCardController?.(c),
                getCardMeta: (c: CoreCardId) => context.cards.getCardMeta?.(c),
                getCardOwner: (c: CoreCardId) => context.cards.getCardOwner(c),
              },
              choosing: true,
              draft,
              playerId: choice.prompter,
              sourceCardId: pickedCardId as string,
              zones: {
                getCardZone: (c: CoreCardId) => context.zones.getCardZone(c),
                getCardsInZone: (z: CoreZoneId, p?: CorePlayerId) =>
                  context.zones.getCardsInZone(z, p),
              },
            } as Parameters<typeof spellEffectHasLegalTargets>[1],
          );
        if (affordable && spellPlayable) {
          if (pool) {
            payResourceCost(
              draft,
              choice.prompter,
              pickedCardId as string,
              computePlayResourceCost(draft, choice.prompter, pickedCardId as string, costExtras, metaForCost, true),
            );
          }
          // rule 359.2.c / 143.4 (ogn-196-298, ogn-226-298): "play a unit from
          // your trash" completes as part of the enclosing effect — the unit
          // enters its owner's base exhausted and fires its own play triggers.
          if (choice.playFrom === "trash") {
            // rule 354.2 / 594 (rule-id: ogn-112-298) — a SPELL played from the
            // trash goes on the chain, never to a board location; "Then recycle
            // it" sends it to the bottom of the Main Deck when it leaves.
            if (getGlobalCardRegistry().getCardType(pickedCardId as string) === "spell") {
              castSpellFromTrash(
                pickedCardId as string,
                choice.prompter,
                choice.playRecycleAfter === true,
                { draft, zones: context.zones },
              );
              draft.pendingChoice = undefined;
              postChoiceCleanup(draft, context);
              return;
            }
            // rule 355.2 / 355.4 (rule-id: sfd-165-221-glasc-mixologist-deathknell-destination):
            // a card entering play from off-board may be placed at its player's base OR
            // any battlefield they control — the choice is theirs. The
            // choose-destination handler finalizes the play (exhaust, play triggers,
            // play count, contest) exactly as the base path below does.
            const destOptions = [
              "base",
              ...Object.entries(draft.battlefields)
                .filter(([, bf]) => bf.controller === choice.prompter)
                .map(([bfId]) => `battlefield-${bfId}`),
            ];
            if (destOptions.length > 1) {
              draft.pendingChoice = {
                cardId: pickedCardId as string,
                options: destOptions,
                playerId: choice.prompter,
                sourceCardId: choice.sourceCardId,
                type: "choose-destination",
              } as RiftboundGameState["pendingChoice"];
              return;
            }
            const playedOwner =
              context.cards.getCardOwner(pickedCardId as CoreCardId) ?? choice.prompter;
            context.zones.moveCard({
              cardId: pickedCardId as CoreCardId,
              targetZoneId: "base" as CoreZoneId,
            });
            // rule 108.2 (rule-id: ven-114-166 Kharox) — a card played out of
            // an OPPONENT's trash keeps its owner but is controlled by the
            // player who played it.
            if (playedOwner !== choice.prompter) {
              context.cards.setCardController?.(
                pickedCardId as CoreCardId,
                choice.prompter as CorePlayerId,
              );
            }
            context.counters.setFlag(pickedCardId as CoreCardId, "exhausted", true);
            const playCtx = {
              cards: context.cards,
              counters: context.counters,
              draft,
              zones: context.zones,
            };
            fireTriggers(
              {
                cardId: pickedCardId as string,
                paidAdditionalCost: false,
                playerId: playedOwner,
                type: "play-self",
              },
              playCtx,
            );
            fireTriggers(
              {
                cardId: pickedCardId as string,
                cardType: "unit",
                playerId: playedOwner,
                type: "play-card",
              },
              playCtx,
            );
            if (draft.cardsPlayedThisTurn) {
              draft.cardsPlayedThisTurn[playedOwner] =
                (draft.cardsPlayedThisTurn[playedOwner] ?? 0) + 1;
            }
            // rule 356.2.b.1 / 805.2.b — the play's [Accelerate] is still the
            // playing player's to elect; paying it readies the unit.
            accelerateAfterPick = { cardId: pickedCardId as string, playerId: playedOwner };
          } else if (isSpell) {
            // rule 354.2 / 419.1 (ogn-115-298) — the instructed spell play puts
            // it on the chain under the instructed player; it resolves there and
            // ends in its owner's trash like any other spell.
            castSpellFromTrash(pickedCardId as string, choice.prompter, false, {
              draft,
              zones: context.zones,
            });
          } else if (choice.playImmediate) {
            // rule 337.1.b / 337.2 (ogn-242-298) — "banish a unit from among
            // them … and play it" is ONE instruction: the banished card is a
            // PENDING PLAY, not a chain item that waits its turn. It finalizes
            // as soon as the resolving ability finishes its instructions, its
            // player picks the location, and the unit enters the board at once.
            // Deferred to after "then recycle the rest" so the rest of the
            // instruction happens before the location prompt.
            pendingPlayFinalize = pickedCardId as string;
          } else {
            const placeEffect = {
              // rule 355.2.b (sfd-170-221) — "you may play it here" adds the
              // instructing card's battlefield to the valid locations.
              ...(choice.playHere !== undefined ? { extraDestinations: [choice.playHere] } : {}),
              target: pickedCardId as string,
              to: "choose",
              type: "move",
            };
            // rule-id: ven-089-166-look-then-empower — "…play it. Then you may
            // do this: Empower it": the follow-up is about the card once it is
            // ON the board, so it becomes its own optional chain item resolving
            // after the play (and after the play's own triggers).
            const followUp = choice.then as { type?: string; effect?: unknown } | undefined;
            if (followUp?.type === "optional" && followUp.effect !== undefined) {
              followUpOnChain = true;
              draft.interaction = addToChain(
                draft.interaction ?? createInteractionState(),
                {
                  cardId: choice.sourceCardId ?? (pickedCardId as string),
                  controller: choice.prompter,
                  effect: {
                    ...((followUp as { effect: object }).effect as object),
                    target: pickedCardId as string,
                  },
                  optional: true,
                  triggered: true,
                  type: "ability",
                },
                Object.keys(draft.players),
              );
            }
            draft.interaction = addToChain(
              draft.interaction,
              {
                cardId: pickedCardId as string,
                controller: choice.prompter,
                effect: placeEffect,
                triggered: true,
                type: "ability",
              },
              Object.keys(draft.players),
            );
          }
          // rule 356.1 / 145.2 (ogn-025-298 Blind Fury): the player who PLAYS
          // a card controls it, even when another player owns it.
          const owner = context.cards.getCardOwner(pickedCardId as CoreCardId);
          if (owner !== undefined && owner !== choice.prompter) {
            const metaNow = context.cards.getCardMeta(pickedCardId as CoreCardId) as
              | Partial<RiftboundCardMeta>
              | undefined;
            context.cards.updateCardMeta(pickedCardId as CoreCardId, {
              controlEffects: [
                ...(metaNow?.controlEffects ?? []),
                { controllerId: choice.prompter },
              ],
            } as Partial<RiftboundCardMeta>);
            (
              context.cards as {
                setCardController?: (cardId: CoreCardId, controllerId: string) => void;
              }
            ).setCardController?.(pickedCardId as CoreCardId, choice.prompter);
          }
        }
      }

      // Rule 435 (ogn-174-298): look/Vision recycles the unpicked cards.
      const recycledIds: string[] = choice.onPicked === "recycle" ? [...picks] : [];
      if (choice.onRest === "recycle") {
        for (const restId of revealed) {
          if (restId === pickedCardId) continue;
          context.zones.moveCard({
            cardId: restId as CoreCardId,
            position: "bottom",
            targetZoneId: "mainDeck" as CoreZoneId,
          });
          recycledIds.push(restId as string);
        }
      }
      // rule 416.1 (ven-156-166) — "Put the rest into your trash."
      if (choice.onRest === "trash") {
        for (const restId of revealed) {
          if (restId === pickedCardId) continue;
          context.zones.moveCard({
            cardId: restId as CoreCardId,
            targetZoneId: "trash" as CoreZoneId,
          });
        }
      }
      // rule-id: sfd-188-221 — "Draw any you didn't banish."
      if (choice.onRest === "draw") {
        for (const restId of revealed) {
          if (restId === pickedCardId) continue;
          context.zones.moveCard({
            cardId: restId as CoreCardId,
            targetZoneId: "hand" as CoreZoneId,
          });
        }
      }

      // Clear the pending choice so play can resume.
      draft.pendingChoice = undefined;

      // rule-id: ogn-235-298 — one `recycle` event for the whole batch
      // (picked-to-recycle and/or recycled rest) so Karma's buff fires once.
      fireRecycleEvent(draft, context, choice.prompter, recycledIds);

      // rule 337.1.b / 337.2 / 354.3 (ogn-242-298) — finalize the pending play:
      // its player chooses the location and the unit enters the board now, so
      // its play trigger lands ABOVE anything already on the chain (a Deathknell
      // queued earlier by the same ability resolves last).
      if (pendingPlayFinalize !== undefined) {
        if (
          finalizePendingPlay(draft, context, {
            cardId: pendingPlayFinalize,
            playerId: choice.prompter,
            sourceCardId: choice.sourceCardId,
            then: choice.then,
          })
        ) {
          return;
        }
      }

      // Resume the originating effect's `then` clause (e.g. discard 1 → draw 1).
      if (choice.then) {
        // rule-id: ven-089-166-look-then-empower — "…play it. Then you may do
        // this: Empower it": the follow-up's "it" is the picked card.
        const effectCtx: EffectContext = {
          ...buildEffectContext(draft, choice.prompter, choice.sourceCardId ?? "", context),
          // rule 355.8 (ogn-008-298): the caster's play-time target survives the prompt.
          ...(choice.thenBoundTargets ? { boundTargets: [...choice.thenBoundTargets] } : {}),
          triggerSourceId: pickedCardId as string,
        };
        if (!followUpOnChain) {
          executeEffect(choice.then as ExecutableEffect, effectCtx);
        }
      }
      if (accelerateAfterPick) {
        maybeOfferAccelerate(
          draft,
          accelerateAfterPick.cardId,
          accelerateAfterPick.playerId,
          context,
        );
      }
      // rule 319.7 / rule-id: ogn-019-298 — the pick changed game state (a
      // discard, recycle, banish…), so refresh statics + SBA like the other
      // choice kinds do, unless a follow-up prompt is still parked.
      if (!draft.pendingChoice) {
        postChoiceCleanup(draft, context);
      }
    },
  },
};
