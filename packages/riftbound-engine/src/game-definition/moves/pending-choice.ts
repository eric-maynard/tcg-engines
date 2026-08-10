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
import { recordDamageReplacementOrder } from "../../operations/deal-damage";
import { executeEffect } from "../../abilities/effect-executor";
import type { EffectContext, ExecutableEffect } from "../../abilities/effect-executor";
import {
  type ChosenModesMeta,
  chosenModesPatch,
  modeInstanceKey,
  readChosenModes,
} from "../../abilities/effects/choice";
import { locationKeyOf } from "../../abilities/effects/choose-per-location";
import { markContestedOnArrival } from "../../abilities/effects/move";
import { recalculateStaticEffects } from "../../abilities/static-abilities";
import { isBlockedByTwoOtherPlayers } from "./movement/helpers";
import { contestBattlefieldOnArrival } from "./movement/contest-arrival";
import { openPendingContestedShowdown } from "./chain/showdown";
import {
  applyNewChoicesAnswer,
  enumerateNewChoicesAnswers,
  isValidNewChoicesAnswer,
} from "../../abilities/new-choices";
import { hasTrashToBanishReplacement } from "../../abilities/replacement-effects";
import { resolveTarget } from "../../abilities/target-resolver";
import { bindTargetSlot } from "../../abilities/target-slots";
import { removeUnfinalizedItem } from "../../abilities/trigger-finalization";
import * as triggerRunner from "../../abilities/trigger-runner";
import { fireTriggers } from "../../abilities/trigger-runner";
import { continueRevealSlotLock } from "./play/reveal-target-lock";
import {
  addToChain,
  createInteractionState,
  removeChainItem,
  reseatPriorityAfterResolution,
} from "../../chain";
import { cleanupAndFireDeaths } from "../../cleanup/post-move-cleanup";
import type { PostMoveCleanupContext } from "../../cleanup/post-move-cleanup";
import { getGlobalCardRegistry } from "../../operations/card-lookup";
import { matchesRevealPickFilter } from "../../operations/reveal-pick-filter";
import { recordPublicReveal } from "../../operations/public-reveal";
import {
  leaveBoard,
  orderBatchTriggersByTurnOrder,
  snapshotLKI,
} from "../../operations/leave-board";
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
  totalPooledPower,
} from "./chain/resolve";
import { equipCostForTarget } from "./equip-cost";
import { completeSuspendedPlay } from "./play/play-unit";
import {
  beginPlay,
  canPerformEffectPlay,
  type EffectPlaySpec,
  recordEffectPlayAnswer,
} from "./play/play-pipeline";
import {
  type CostExtras,
  canPayResourceCost,
  computePlayResourceCost,
  createMetaAccessor,
  getCardEffectiveMight,
  getDeflectSurcharge,
  getPotentialRuneEnergy,
  payResourceCost,
} from "./play/cost";
import { bindDestinationOnItem } from "./play/play-time-destinations";
import { collectChoiceNodes, raisePlayTimeModeChoice } from "./play/play-time-modes";
import { isLegalMultiTargetSet, spellEffectHasLegalTargets } from "./play/targeting";
import type { SpellEffectTargetShape } from "./play/targeting";

const isBoardZone = (z: string): boolean => z === "base" || z.startsWith("battlefield-");

/**
 * rule 416.5 — two or more cards recycled to a Main Deck at the same time go to
 * the bottom in a random order (no player picks or learns it).
 */
function randomizedOrder(
  ids: readonly string[],
  rng: { shuffle: <T>(array: readonly T[]) => T[] } | undefined,
): string[] {
  // The game's seeded RNG keeps a transcript replayable (same seed + same
  // answers ⇒ same deck bottom).
  return ids.length < 2 || rng === undefined ? [...ids] : rng.shuffle(ids);
}

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
/**
 * rule 355.14.e–h — the bucket rules of a split whose TARGETS were locked at
 * finalization: `minPer`/`maxPer` per named target and exactly `exactTargets`
 * of the options receiving damage (all of them while damage ≥ targets,
 * otherwise as many as there is damage — 355.14.h.1). Undefined bounds = the
 * legacy free-form shape.
 */
type SplitBounds = { readonly minPer?: number; readonly maxPer?: number; readonly exactTargets?: number };

function isLegalSplitAllocation(
  options: readonly string[],
  total: number,
  allocation: unknown,
  bounds: SplitBounds = {},
): allocation is Record<string, number> {
  if (!allocation || typeof allocation !== "object") return false;
  const entries = Object.entries(allocation as Record<string, unknown>).filter(
    ([, v]) => v !== 0,
  );
  let sum = 0;
  for (const [id, v] of entries) {
    if (!options.includes(id)) return false;
    if (typeof v !== "number" || !Number.isInteger(v) || v < 1) return false;
    if (bounds.minPer !== undefined && v < bounds.minPer) return false;
    if (bounds.maxPer !== undefined && v > bounds.maxPer) return false;
    sum += v;
  }
  // rule 355.14.f/g/h — locked targets: every still-legal one (or as many as
  // the damage allows) receives valid damage; nothing may be left over.
  if (bounds.exactTargets !== undefined) {
    return entries.length === bounds.exactTargets && sum === total;
  }
  if (entries.length === 0) return true;
  return entries.length <= total && sum === total;
}

/** rule 355.14 (ogn-041-298): every legal split of `total` over subsets of `options` (capped). */
function enumerateSplitAllocations(
  options: readonly string[],
  total: number,
  cap = 500,
  bounds: SplitBounds = {},
): Record<string, number>[] {
  const out: Record<string, number>[] = [];
  const lo = Math.max(1, bounds.minPer ?? 1);
  const walk = (idx: number, remaining: number, acc: Record<string, number>): void => {
    if (out.length >= cap) return;
    if (idx === options.length) {
      if (remaining === 0 && isLegalSplitAllocation(options, total, acc, bounds)) out.push({ ...acc });
      return;
    }
    const id = options[idx] as string;
    // skip this option
    walk(idx + 1, remaining, acc);
    const hi = Math.min(remaining, bounds.maxPer ?? remaining);
    for (let k = lo; k <= hi; k++) {
      acc[id] = k;
      walk(idx + 1, remaining - k, acc);
      delete acc[id];
    }
  };
  walk(0, total, {});
  // most-concentrated splits first so a lone target taking everything leads
  out.sort((a, b) => Object.keys(a).length - Object.keys(b).length);
  if (bounds.exactTargets === undefined) {
    out.push({});
  }
  return out;
}

function splitBoundsOf(choice: { minPer?: number; maxPer?: number; exactTargets?: number }): SplitBounds {
  return { exactTargets: choice.exactTargets, maxPer: choice.maxPer, minPer: choice.minPer };
}

/**
 * rule 436 / 359.3.e (unl-136-219 Scryer's Bloom) — "[Predict 2], THEN draw 1".
 * A sequence step that parked a prompt owning its own `then` chain (the next
 * Predict) leaves the sequence remainder in `deferredSequenceRest`; run it once
 * the whole prompt chain has been answered, so the draw takes whatever the
 * player chose to leave on top. A remainder that parks a prompt of its own is
 * re-deferred together with the entries behind it.
 */
export function flushDeferredSequenceRest(draft: RiftboundGameState, context: unknown): void {
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
  // rule 340.4 (rule-id: ven-152-166 Rebuttal) — a prompt answered as part of a
  // resolution can hand an item on the Chain to someone else (gain control of a
  // spell); Priority then belongs to the newest item's CURRENT controller.
  if (!draft.pendingChoice && draft.interaction) {
    draft.interaction = reseatPriorityAfterResolution(draft.interaction);
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
    location?: string;
    type?: string;
    types?: readonly string[];
  };
  // rule 108.2 / 355.10.c.1 (rule-id: unl-209-219 Dusk Rose Lab) — "kill a unit
  // you control HERE to …": only the source's own battlefield pays.
  const hereZone = target.location === "here" ? sourceHereZone(state, sourceCardId, context) : undefined;
  if (target.location === "here" && hereZone === undefined) {
    return [];
  }
  const types =
    target.types && target.types.length > 0
      ? target.types
      : typeof target.type === "string" && target.type !== "permanent" && target.type !== "card"
        ? [target.type]
        : ["unit", "gear", "equipment"];
  const wantTypes = new Set(types.flatMap((t) => (t === "gear" ? ["gear", "equipment"] : [t])));
  const zoneIds =
    hereZone !== undefined
      ? [hereZone]
      : [
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
 * rule 108.2 / 190.6.d (rule-id: sfd-207-221) — a Battlefield card's own
 * ability acts AT its battlefield: the card itself sits in `battlefieldRow`,
 * so "here" is the units' zone `battlefield-<id>`, never the row.
 */
function sourceHereZone(
  state: RiftboundGameState,
  sourceCardId: string,
  // biome-ignore lint/suspicious/noExplicitAny: move context bag is framework-typed
  context: any,
): string | undefined {
  if ((state as { battlefields?: Record<string, unknown> }).battlefields?.[sourceCardId]) {
    return `battlefield-${sourceCardId}`;
  }
  return context?.zones?.getCardZone?.(sourceCardId as CoreCardId) as string | undefined;
}

/**
 * rule 203 / 205 (rule-id: sfd-207-221) — the board cards that can pay a
 * "return a unit you control here to its owner's hand" cost. The descriptor is
 * an ordinary Target, so "here" is the source's own battlefield and the
 * controller side is read live (control, not ownership — rule 740.1.a).
 */
export function returnToHandCostCandidates(
  state: RiftboundGameState,
  playerId: string,
  sourceCardId: string,
  spec: unknown,
  // biome-ignore lint/suspicious/noExplicitAny: move context bag is framework-typed
  context: any,
): string[] {
  if (!context?.cards || typeof context?.zones?.getCardsInZone !== "function") {
    return [];
  }
  const descriptor = (spec as { target?: Record<string, unknown> } & Record<string, unknown>)
    .target ?? (spec as Record<string, unknown>);
  return resolveTarget({ ...(descriptor as never), quantity: "all" }, {
    cards: context.cards,
    choosing: true,
    draft: state,
    playerId,
    sourceCardId,
    sourceZone: sourceHereZone(state, sourceCardId, context),
    zones: context.zones,
  } as Parameters<typeof resolveTarget>[1]) as string[];
}

/**
 * rule 383.3.b / 745.2 (rule-id: ogn-282-298 Monastery of Hirana, ogn-147-298
 * Wildclaw Shaman) — the units whose Buff can pay a "you may spend a buff to …"
 * base cost: units the paying player CONTROLS (745.2) that carry at least one
 * Buff counter, the source itself included ("spend a buff" may be its own).
 * One entry per unit; a unit carrying several counters (702.2.b) pays one.
 */
export function spendBuffCostCandidates(
  state: RiftboundGameState,
  playerId: string,
  _sourceCardId: string,
  // biome-ignore lint/suspicious/noExplicitAny: move context bag is framework-typed
  context: any,
): string[] {
  if (typeof context?.zones?.getCardsInZone !== "function") {
    return [];
  }
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
        if (out.includes(id)) {
          continue;
        }
        const controller =
          context.cards?.getCardController?.(id as CoreCardId) ??
          context.cards?.getCardOwner?.(id as CoreCardId) ??
          seat;
        if (controller !== playerId) {
          continue;
        }
        const type = registry.getCardType(id) as string | undefined;
        if (type !== undefined && type !== "unit" && !id.startsWith("token-")) {
          continue;
        }
        const meta = context.cards?.getCardMeta?.(id as CoreCardId) as
          | { buffed?: boolean; extraBuffs?: number }
          | undefined;
        if ((meta?.buffed === true ? 1 : 0) + (meta?.extraBuffs ?? 0) > 0) {
          out.push(id);
        }
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
  // rule 355.10.c.1 — "… and return a unit you control here TO …": an object
  // half of one payment, so with no legal unit to return the option cannot be
  // taken (never the energy alone).
  const bounceSpec = cost.returnToHand;
  if (bounceSpec !== undefined && typeof bounceSpec === "object" && bounceSpec !== null) {
    if (returnToHandCostCandidates(state, playerId, sourceCardId, bounceSpec, context).length === 0) {
      return false;
    }
  }
  // rule 383.3.b / 745.2 (rule-id: ogn-282-298) — "you may spend a buff to …"
  // needs a Buff on a unit the payer controls RIGHT NOW (at finalization); a
  // buff some other trigger would grant later cannot pay it (ruling 202877fb824b2d2b).
  const spendBuff = (cost.spendBuff as number) ?? 0;
  if (spendBuff > 0 && spendBuffCostCandidates(state, playerId, sourceCardId, context).length < spendBuff) {
    return false;
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
export function weaponmasterEquipCost(
  equipmentId: string,
  // rule 821.1.c.2 / 206.1: the Equip cost is computed AS THOUGH [Equip] were
  // activated choosing the Weaponmaster unit, so a per-target reduction
  // (unl-188-219 Hextech Gauntlets: "reduced by the Might of the unit you
  // choose") applies here exactly as it does on the ordinary Equip path.
  unitId?: string,
  getCardMeta?: (cardId: CoreCardId) => Partial<RiftboundCardMeta> | undefined,
): Record<string, unknown> | undefined {
  const base = equipCostForTarget(equipmentId, unitId, getCardMeta);
  if (base === undefined) {
    return undefined;
  }
  const power = [...base.power];
  if (power.length > 0) {
    const rainbowIdx = power.indexOf("rainbow");
    power.splice(rainbowIdx === -1 ? 0 : rainbowIdx, 1);
  }
  // rule 821.1.c.3 (sfd-150-221 Last Rites): [A] only shaves a power pip — a
  // "Recycle N cards from your trash" portion of the Equip cost survives it
  // and is still paid in full.
  return {
    energy: base.energy,
    power,
    ...(base.recycleFromTrash !== undefined ? { recycleFromTrash: base.recycleFromTrash } : {}),
    // rule 821.1.c.3 / 730.2 (unl-158-219 Shepherd's Heirloom): "Spend N XP" is
    // not [A] either — it is paid in full, and below N XP the Equipment can't
    // be offered at all (821.1.c.5).
    ...(base.xp !== undefined && base.xp > 0 ? { xp: base.xp } : {}),
    // rule 821.1.c.3 (sfd-178-221 Blade of the Ruined King): the "Kill a
    // friendly unit" half is not a resource, so [A] never waives it — the
    // Weaponmaster still owes it.
    ...(base.killFriendlyUnit === true ? { killFriendlyUnit: true } : {}),
  };
}

/**
 * rule 818.1.c.3 / 358.1 (sfd-178-221) — the units that can pay an Equip cost's
 * "Kill a friendly unit" half on the Weaponmaster path: friendly board units
 * other than the one the Equipment would attach to (sacrificing the holder
 * would undo the attach).
 */
export function weaponmasterSacrificeOptions(
  state: RiftboundGameState,
  playerId: string,
  holderUnitId: string | undefined,
  // biome-ignore lint/suspicious/noExplicitAny: move context bag is framework-typed
  context: any,
): string[] {
  return killCostCandidates(
    state,
    playerId,
    holderUnitId ?? "",
    { controller: "friendly", type: "unit" },
    context,
  ).filter((id) => id !== holderUnitId);
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
export function canPayWeaponmasterEquip(
  state: RiftboundGameState,
  playerId: string,
  equipmentId: string,
  context: Parameters<typeof canPayOptInCost>[4],
  unitId?: string,
  getCardMeta?: (cardId: CoreCardId) => Partial<RiftboundCardMeta> | undefined,
): boolean {
  const cost = weaponmasterEquipCost(equipmentId, unitId, getCardMeta);
  if (cost === undefined) {
    return false;
  }
  // rule 821.1.c.5 (sfd-150-221): too few cards in the trash → the Equip cost
  // cannot be paid, so the Equipment is never offered and stays where it is.
  const needRecycle = cost.recycleFromTrash as number | undefined;
  if (needRecycle !== undefined && trashSize(context.zones, playerId) < needRecycle) {
    return false;
  }
  // rule 821.1.c.5 / 818.1.c.3 (sfd-178-221): with no friendly unit besides the
  // Weaponmaster itself the "Kill a friendly unit" half cannot be paid, so the
  // Equipment is never offered and nothing attaches.
  if (cost.killFriendlyUnit === true) {
    if (weaponmasterSacrificeOptions(state, playerId, unitId, context).length === 0) {
      return false;
    }
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
/**
 * rule 753 / 753.1 — order a multi-slot re-choice's cards onto their slots:
 * returns one card per slot (positional, as chain-item targets are stored) or
 * undefined when no one-to-one assignment exists.
 */
export function assignToSlots(
  slotOptions: readonly (readonly string[])[],
  ids: readonly string[],
): string[] | undefined {
  if (ids.length !== slotOptions.length) {
    return undefined;
  }
  const out: string[] = [];
  const used = new Set<number>();
  const walk = (slot: number): boolean => {
    if (slot === slotOptions.length) {
      return true;
    }
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i] as string;
      if (used.has(i) || !slotOptions[slot]?.includes(id)) continue;
      used.add(i);
      out[slot] = id;
      if (walk(slot + 1)) return true;
      used.delete(i);
    }
    return false;
  };
  return walk(0) ? out : undefined;
}

function hasSlotAssignment(
  slotOptions: readonly (readonly string[])[],
  ids: readonly string[],
): boolean {
  return assignToSlots(slotOptions, ids) !== undefined;
}

export function isValidPickManyAnswer(
  choice: PickManyChoice,
  pickedKeys: unknown,
  mightOf?: (cardId: string) => number,
  zoneOf?: (cardId: string) => string | undefined,
  affordable?: (cardIds: readonly string[]) => boolean,
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
  // rule 753 / 753.1 — a multi-slot re-choice must fill EVERY slot with a card
  // that slot could legally hold; a group that cannot be matched one-to-one
  // onto the slots is not a legal set of new choices.
  const slotOptions = choice.slotOptions;
  if (slotOptions && (picked as string[]).length > 0) {
    const ids = (picked as string[]).map(
      (key) => choice.options.find((o) => o.key === key)?.cardId ?? key,
    );
    if (ids.length !== slotOptions.length || !hasSlotAssignment(slotOptions, ids)) {
      return false;
    }
  }
  // rule 809.1.d / 356.2.a.2 — the set's total [Deflect] surcharge must be
  // payable now; a set the chooser cannot afford is not a legal choice.
  if (choice.constraint?.deflectAffordable === true && affordable && (picked as string[]).length > 0) {
    const ids = (picked as string[]).map((key) => choice.options.find((o) => o.key === key)?.cardId ?? key);
    if (!affordable(ids)) {
      return false;
    }
  }
  return true;
}

/** rule 809.1.d — the affordability probe `isValidPickManyAnswer` needs, from a move context. */
function deflectAffordableFor(
  state: RiftboundGameState,
  choice: PickManyChoice,
  // biome-ignore lint/suspicious/noExplicitAny: engine move context is framework-typed
  context: any,
): (cardIds: readonly string[]) => boolean {
  return (cardIds) =>
    getDeflectSurcharge(
      state,
      choice.playerId,
      [...cardIds],
      context.cards as Parameters<typeof getDeflectSurcharge>[3],
      choice.sourceCardId as string | undefined,
      context.zones as Parameters<typeof getDeflectSurcharge>[5],
    ) <= totalPooledPower(state, choice.playerId);
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
    case "die-batch-order":
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
    // rule 402.2 / 404.1 — the named objects pay the trigger's base cost now;
    // the wrapper's finalization pass then continues with the item's targets.
    case "trigger-cost": {
      const picked = (answer.pickedKeys ?? []).map(
        (k) => (choice.type === "pick-many" ? choice.options.find((o) => o.key === k)?.cardId : undefined) ?? k,
      );
      triggerRunner.payTriggerObjectCost(draft, context, resume.itemId, picked);
      if (!draft.pendingChoice) {
        postChoiceCleanup(draft, context);
      }
      return;
    }
    // rule 402.2 / 355.13 / 355.14.b — a variable-count target set named while
    // the item is finalized: charge [Deflect] for every chosen object (809.1.c —
    // kept even if the object later drops out, 355.14.i), bind the set onto the
    // item / effect node, fire "when you choose me" for each (355.14.d / 359.2).
    // The wrapper's finalization pass then continues with the next slot.
    case "target-slot": {
      const picked = (answer.pickedKeys ?? []).map(
        (k) => (choice.type === "pick-many" ? choice.options.find((o) => o.key === k)?.cardId : undefined) ?? k,
      );
      const item = draft.interaction?.chain?.items.find((it) => it.id === resume.itemId);
      if (!item) {
        return;
      }
      if (picked.length > 0) {
        const owed = getDeflectSurcharge(
          draft,
          item.controller,
          [...picked],
          context.cards as Parameters<typeof getDeflectSurcharge>[3],
          item.cardId,
          context.zones as Parameters<typeof getDeflectSurcharge>[5],
        );
        payAnyDomainPower(draft, item.controller, owed);
      }
      bindTargetSlot(draft, resume.itemId, resume.slot, picked);
      const trigCtx = { cards: context.cards, counters: context.counters, draft, zones: context.zones };
      for (const cardId of picked) {
        if (draft.battlefields?.[cardId] !== undefined) {
          continue;
        }
        fireTriggers(
          { cardId, chooserId: item.controller, sourceCardId: item.cardId, sourceType: "ability", type: "choose" },
          trigCtx,
        );
      }
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
    // rule 372 / 465.2.c.5 — the damaged unit's controller ordered its damage
    // replacements: record it for the next damage dealt to that unit, then
    // re-run the parked Deal instruction (spell/ability damage) — the combat
    // damage step re-runs on its own once the prompt is gone.
    case "damage-order": {
      const keys =
        answer.orderedKeys && answer.orderedKeys.length > 0
          ? answer.orderedKeys
          : choice.type === "order"
            ? choice.items.map((i) => i.key)
            : [];
      recordDamageReplacementOrder(draft, resume.targetCardId as string, keys);
      if (resume.effect !== undefined && resume.playerId !== undefined) {
        executeEffect(resume.effect as ExecutableEffect, {
          ...buildEffectContext(draft, resume.playerId, resume.sourceCardId ?? "", context),
          ...(resume.boundTargets ? { boundTargets: [...resume.boundTargets] } : {}),
        });
        const rest = (choice as { then?: unknown }).then;
        if (rest !== undefined && !draft.pendingChoice) {
          executeEffect(
            rest as ExecutableEffect,
            buildEffectContext(draft, resume.playerId, resume.sourceCardId ?? "", context),
          );
        }
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
  return matchesRevealPickFilter(choice.filter, cardId);
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
  if (choice.type !== "reveal-and-pick" || choice.onPicked !== "play") {
    return true;
  }
  // rule 356.4 / 359.3.e.6 (ogn-242-298 Baited Hook) — "you may BANISH a unit
  // from among them AND play it": the banish is its own instruction and lands
  // on selection, so an unplayable card is still a legal pick (it just stays
  // banished when the play cannot be performed). Only a pick whose ONLY
  // consequence is the play is filtered by playability.
  if ((choice as { playBanishFirst?: boolean }).playBanishFirst === true) {
    return true;
  }
  // Minimal unit-test contexts (no board accessors) cannot price anything.
  const zones = context?.zones as { getCardsInZone?: unknown; getCardZone?: unknown } | undefined;
  if (typeof zones?.getCardsInZone !== "function" || typeof zones?.getCardZone !== "function") {
    return true;
  }
  return canPerformEffectPlay(
    { cards: context?.cards, counters: undefined, draft: state, zones: context?.zones } as never,
    playSpecFromChoice(state, choice, cardId, context as { cards: { getCardOwner?: (id: CoreCardId) => unknown } }),
  );
}

/**
 * rule 419.3 — the play bundle a `reveal-and-pick { onPicked: "play" }` prompt
 * stands for, for the picked `cardId`: an explicit `playSpec` from the
 * producer, or the legacy fields (`playTo` = the OWNER plays it there
 * "ignoring any and all costs", stunned if `playStun` — unl-139-219;
 * `playIgnoreCost` / `playIgnoreEnergy` / `playEnergyReduction` = the cost
 * mode; `playHere` = an extra valid location — sfd-170-221; `playRecycleAfter`).
 */
export function playSpecFromChoice(
  state: RiftboundGameState,
  choice: PendingChoice,
  cardId: string,
  context?: { cards?: { getCardOwner?: (id: CoreCardId) => unknown } },
): EffectPlaySpec {
  const c = choice as PendingChoice & {
    playSpec?: Omit<EffectPlaySpec, "cardId">;
    playTo?: string;
    playStun?: boolean;
    playIgnoreCost?: boolean;
    playIgnoreEnergy?: boolean;
    playEnergyReduction?: number;
    playHere?: string;
    playRecycleAfter?: boolean;
    prompter: string;
    revealer?: string;
    sourceCardId?: string;
    then?: unknown;
  };
  const followUp = c.then as { type?: string } | undefined;
  // "…play it. Then / If you do, …" (or the rest of the sequence this pick
  // suspended) runs after the play; a "you may do this" follow-up
  // (ven-089-166) is a reflexive item of its own instead.
  const then = followUp !== undefined && followUp.type !== "optional" ? { then: c.then } : {};
  if (c.playSpec) {
    return { ...c.playSpec, cardId, ...(c.playSpec.then === undefined ? then : {}) };
  }
  if (c.playTo !== undefined) {
    const owner = (context?.cards?.getCardOwner?.(cardId as CoreCardId) as string | undefined) ?? c.revealer ?? c.prompter;
    return {
      cardId,
      costMode: { kind: "ignore-any-and-all" },
      location: { fixed: c.playTo },
      playerId: owner,
      sourceCardId: c.sourceCardId,
      stagedBy: c.prompter ?? c.revealer,
      via: "effect",
      ...(c.playStun === true ? { stun: true } : {}),
      ...then,
    };
  }
  return {
    cardId,
    costMode: c.playIgnoreCost
      ? { kind: "ignore-all" }
      : c.playIgnoreEnergy
        ? { kind: "ignore-energy" }
        : (c.playEnergyReduction ?? 0) > 0
          ? { energy: c.playEnergyReduction, kind: "reduce" }
          : { kind: "full" },
    location: c.playHere !== undefined ? { extra: [c.playHere] } : "prompt",
    playerId: c.prompter,
    sourceCardId: c.sourceCardId,
    via: "effect",
    ...(c.playRecycleAfter === true ? { recycleAfter: true } : {}),
    ...then,
  };
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
  // rule 753 — a "you may make new choices" slot nobody answers keeps its value.
  if (choice.type === "new-choices") {
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
  // rule 416.1.c (rule-id: ogn-212-298) — a card always recycles to ITS OWNER's
  // Main Deck, whoever was instructed to recycle it, and that owner is the
  // player who "recycles" it for trigger purposes. So one instruction touching
  // several players' cards is one recycle per owner: each owner's "when you
  // recycle one or more cards to your Main Deck" fires exactly once.
  const byOwner = new Map<string, string[]>();
  for (const id of cardIds) {
    const owner = String(context.cards.getCardOwner?.(id as CoreCardId) ?? playerId);
    const bucket = byOwner.get(owner);
    if (bucket) {
      bucket.push(id);
    } else {
      byOwner.set(owner, [id]);
    }
  }
  if (byOwner.size === 0) {
    return;
  }
  const chainLenBefore = draft.interaction?.chain?.items?.length ?? 0;
  for (const [owner, own] of byOwner) {
    fireTriggers(
      { cardIds: own, playerId: owner, type: "recycle" },
      { cards: context.cards, counters: context.counters, draft, zones: context.zones },
    );
  }
  // rule 383.3.d.1 — the recycle happened all at once, so the triggers it caused
  // are simultaneous: the turn player's go on the Chain first.
  orderBatchTriggersByTurnOrder(draft, chainLenBefore);
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
            deflectAffordableFor(state, choice, context),
          )
        );
      }
      // rule 751–755 — one slot of a finalized item's NEW CHOICES dialog.
      if (choice.type === "new-choices") {
        return isValidNewChoicesAnswer(
          state,
          choice,
          context.params as Record<string, unknown>,
          buildEffectContext(state, choice.playerId, choice.sourceCardId, context),
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
          canPayWeaponmasterEquip(state, choice.playerId, pickedEquip, context, choice.unitId, (m) =>
            context.cards.getCardMeta(m) as Partial<RiftboundCardMeta> | undefined,
          )
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
          return isLegalSplitAllocation(choice.options, choice.total, context.params.allocation, splitBoundsOf(choice));
        }
        return choice.options.includes(context.params.pickedCardId as string);
      }
      if (choice.type === "choose-destination") {
        if (choice.playerId !== context.params.playerId) {
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
        const affordable = deflectAffordableFor(state, choice, context);
        return candidates
          .filter((pickedKeys) =>
            isValidPickManyAnswer(
              choice,
              pickedKeys,
              mightOf,
              (id) => context.zones.getCardZone(id as CoreCardId),
              affordable,
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
      // rule 751–755 — the slot on offer: one variant per option (subsets for a
      // short set) plus keep / keep-all; any other legal `pickedKeys` is accepted too.
      if (choice.type === "new-choices") {
        if (choice.playerId !== (context.playerId as string)) {
          return [];
        }
        return enumerateNewChoicesAnswers(choice).filter((params) =>
          isValidNewChoicesAnswer(
            state,
            choice,
            params,
            buildEffectContext(state, choice.playerId, choice.sourceCardId, context),
          ),
        );
      }
      if (choice.type === "weaponmaster-equip") {
        if (choice.playerId !== (context.playerId as string)) {
          return [];
        }
        // rule-id: sfd-119-221-weaponmaster-pays-reduced-equip-cost — only
        // offer equipment whose reduced Equip cost is payable (821.1.c.5).
        return [
          ...choice.options
            .filter((eq) =>
              canPayWeaponmasterEquip(state, choice.playerId, eq, context, choice.unitId, (m) =>
                context.cards.getCardMeta(m) as Partial<RiftboundCardMeta> | undefined,
              ),
            )
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
          return enumerateSplitAllocations(choice.options, choice.total, 500, splitBoundsOf(choice)).map((allocation) => ({
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
        // rule-id: ogn-262-298 (rule 355.13) — "You may move …": declining is
        // one of the answers, so the prompt is never auto-taken.
        const declineVariants = choice.optional
          ? [{ accept: false, playerId: context.playerId as string }]
          : [];
        return [
          ...declineVariants,
          ...choice.options.map((zoneId) => ({ pickedZoneId: zoneId, playerId: context.playerId as string })),
        ];
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
            deflectAffordableFor(draft, choice, context),
          )
        ) {
          return;
        }
        draft.pendingChoice = undefined;
        resumePending(draft, choice, { pickedKeys }, context);
        return;
      }
      // rule 751–755 — answer the slot on offer; the dialog parks its next slot
      // (or ends). rule 754 triggers ride on the effect context's `fireTriggers`.
      if (choice.type === "new-choices") {
        const ncCtx = buildEffectContext(draft, choice.playerId, choice.sourceCardId, context);
        if (!isValidNewChoicesAnswer(draft, choice, context.params as Record<string, unknown>, ncCtx)) {
          return;
        }
        applyNewChoicesAnswer(draft, choice, context.params as Record<string, unknown>, ncCtx);
        if (!draft.pendingChoice) {
          // rule 340.4 — the dialog is over: Priority to the newest item's
          // CURRENT controller (postChoiceCleanup re-seats it), no re-pending.
          postChoiceCleanup(draft, context);
        }
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
        // rule 383.3.b / 204.3.b (821.1.c): "Pay the cost of its Equip ability
        // … to attach it" is a cost inside an instruction LATER in the effect,
        // so it is paid on RESOLUTION, not now. The pick finalizes the trigger
        // (383.3.a); the item goes on the Chain, every player gets priority,
        // and the "weaponmaster-attach" handler pays and attaches when it
        // resolves — exactly like the ordinary [Equip] activation (377.3).
        const wmGetMeta = (m: CoreCardId) =>
          context.cards.getCardMeta(m) as Partial<RiftboundCardMeta> | undefined;
        // rule 821.1.c.5 — an Equipment whose reduced cost can't be paid is
        // never put on the Chain; it stays where it is.
        if (
          !weaponmasterEquipCost(picked, choice.unitId, wmGetMeta) ||
          !canPayWeaponmasterEquip(draft, choice.playerId, picked, context, choice.unitId, wmGetMeta)
        ) {
          return;
        }
        draft.interaction = addToChain(
          draft.interaction ?? createInteractionState(),
          {
            cardId: choice.unitId,
            controller: choice.playerId,
            effect: { equipmentId: picked, type: "weaponmaster-attach", unitId: choice.unitId },
            // rule 337.1 / 402-404: the controller already decided the "you may"
            // and chose the Equipment, so the item enters the Chain finalized.
            status: "finalized",
            triggered: true,
            type: "ability",
          },
          Object.keys(draft.players),
        );
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
        // rule 402.2 (ven-133-166 Glowstone) — the seat was named while the
        // ability was being ACTIVATED: record it on the Pending Item and let
        // finalization carry on; the effect runs with that seat at resolution.
        const finPlayerItemId = (choice as { finalizationChainItemId?: string })
          .finalizationChainItemId;
        if (finPlayerItemId !== undefined) {
          const chainItems = draft.interaction?.chain?.items as
            | { id: string; effect?: unknown }[]
            | undefined;
          const idx = chainItems?.findIndex((it) => it.id === finPlayerItemId) ?? -1;
          if (chainItems && idx >= 0) {
            chainItems[idx] = {
              ...chainItems[idx],
              effect: { ...(chainItems[idx]?.effect as object), ownerId: picked },
            } as (typeof chainItems)[number];
          }
          return;
        }
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
        const declineEffect = (choice as { declineEffect?: ExecutableEffect }).declineEffect;
        if (context.params.accept === true) {
          executeEffect(choice.effect as ExecutableEffect, {
            ...confirmCtx,
            ...(choice.boundTargets ? { boundTargets: choice.boundTargets } : {}),
          });
        } else if (declineEffect !== undefined) {
          // rule 355.1.a — an OPTIONAL ADDITIONAL COST election (not a bare
          // "you may"): declining still performs the thing being paid for, just
          // without the cost's effect (a token still enters, exhausted).
          executeEffect(declineEffect, {
            ...confirmCtx,
            ...(choice.boundTargets ? { boundTargets: choice.boundTargets } : {}),
          });
        }
        if (choice.then) {
          // rule 359.3.e (ogn-121-298 Teemo × ogn-194-298 Nocturne) — the prompt
          // belongs to the revealed card, but the suspended remainder is the
          // ability that revealed it: it resumes under ITS own source, not the
          // card that answered.
          const thenSource =
            (choice as { thenSourceCardId?: string }).thenSourceCardId ?? choice.sourceCardId;
          if (draft.pendingChoice) {
            // rule 354.3 (ogn-062-298 x ogn-194-298) — the accepted "you may"
            // opened a prompt chain of its own (Nocturne's banish-and-play me).
            // The suspended remainder — the rest of the LOOK that offered this
            // replacement — is not cancelled by that: park it and run it once
            // the nested chain has been answered.
            draft.deferredSequenceRest = [
              ...(draft.deferredSequenceRest ?? []),
              {
                effect: choice.then,
                playerId: choice.playerId,
                ...(thenSource !== undefined ? { sourceCardId: thenSource } : {}),
              },
            ];
          } else {
            executeEffect(
              choice.then as ExecutableEffect,
              thenSource === choice.sourceCardId
                ? confirmCtx
                : buildEffectContext(draft, choice.playerId, thenSource, context),
            );
          }
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
        // rule 354.2 / 355.1.a / 128.6 — an answer for a card an effect is
        // PLAYING (decline the play / elect its optional additional cost): it is
        // written on the pending play item; the wrapper's finalization pass
        // continues that play (`play-pipeline.ts continueEffectPlay`).
        const playItemId = (choice as { playItemId?: string }).playItemId;
        if (playItemId !== undefined) {
          const accepted = context.params.accept === true;
          if ((choice as { playConfirm?: boolean }).playConfirm === true) {
            recordEffectPlayAnswer(draft, playItemId, { accept: accepted, kind: "confirm" });
          } else {
            recordEffectPlayAnswer(draft, playItemId, { accept: accepted, kind: "optional" });
          }
          return;
        }
        // rule 128.6 / "you may play it" — the player chose whether to make an
        // instructed play at all; accepting starts it (the card goes to the Chain).
        const confirmSpec = (choice as { playConfirmSpec?: EffectPlaySpec }).playConfirmSpec;
        if (confirmSpec !== undefined) {
          if (context.params.accept === true) {
            beginPlay(
              { cards: context.cards, counters: context.counters, draft, zones: context.zones },
              confirmSpec,
              // rule 354.3 — the confirm carries the immediacy `beginPlay` was
              // originally asked for; an accepted play an effect queued while
              // it was still resolving stays Pending until that effect ends.
              { immediate: (choice as { playConfirmImmediate?: boolean }).playConfirmImmediate === true },
            );
          }
          if (!draft.pendingChoice) {
            postChoiceCleanup(draft, context);
          }
          return;
        }
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
          // rule 440.1 / 383.3.b (rule-id: ven-095-166) — "[Burn N] to …": no
          // choice is involved (the top N cards are fixed), so it is paid here.
          const burnCount = accepted && typeof cost?.burn === "number" ? cost.burn : 0;
          if (burnCount > 0) {
            executeEffect(
              { amount: burnCount, player: "self", type: "mill" } as ExecutableEffect,
              buildEffectContext(draft, choice.playerId, choice.sourceCardId, context),
            );
          }
          // rule 402.2 / 404.1 — Game Objects the cost names ("kill a unit you
          // control here", "recycle another friendly unit", "return a unit you
          // control here") are chosen and paid by the finalization dialog right
          // after this answer (`trigger-finalization.ts settleObjectCost`), still
          // before anyone receives Priority (406.4); the spec rides on the item.
          const owesObjects = accepted && triggerRunner.objectCostsOf(cost).length > 0;
          const interaction = draft.interaction;
          if (accepted && interaction?.chain) {
            draft.interaction = {
              ...interaction,
              chain: {
                ...interaction.chain,
                items: interaction.chain.items.map((it) =>
                  it.id === finalizeId
                    ? {
                        ...it,
                        optInCost: owesObjects ? cost : undefined,
                        optional: false,
                        ...(owesObjects ? { objectCostOwed: true } : {}),
                      }
                    : it,
                ),
              },
            };
          } else if (!accepted) {
            // rule 383.3.a.2 / 383.3.e.2 — considered to have not triggered.
            triggerRunner.removeUnfinalizedItem(draft, finalizeId);
          }
          // rule 383.3.b.1 (rule-id: unl-199-219) — "discard N and … to <do X>":
          // the payer picks the cards NOW, while the item waits on the Chain;
          // only the payoff (the item's own effect) waits for resolution, so no
          // `then` rides on the discard.
          const discardCount = accepted && typeof cost?.discard === "number" ? cost.discard : 0;
          if (discardCount > 0) {
            executeEffect(
              { amount: discardCount, type: "discard" } as ExecutableEffect,
              buildEffectContext(draft, choice.playerId, choice.sourceCardId, context),
            );
          }
          if (!draft.pendingChoice) {
            postChoiceCleanup(draft, context);
          }
          return;
        }
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
              sourceZone?: string;
              then?: unknown;
              triggerSourceId?: string;
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
            // rule 359.3.f / 108.2 (rule-id: sfd-207-221 Emperor's Dais) — "… If you
            // do, play a … token HERE": a Battlefield card's ability acts AT its
            // battlefield, so the branch run on the answer reads "here" as the
            // units' zone there (never the battlefield row the card sits in);
            // an explicit referent carried on the prompt wins.
            const hereZone = payChoice.sourceZone ?? sourceHereZone(draft, choice.sourceCardId, context);
            executeEffect(branch as ExecutableEffect, {
              ...buildEffectContext(draft, payChoice.sourcePlayerId, choice.sourceCardId, context),
              ...(payChoice.boundTargets ? { boundTargets: payChoice.boundTargets } : {}),
              ...(hereZone !== undefined ? { sourceZone: hereZone } : {}),
              ...(payChoice.triggerSourceId !== undefined ? { triggerSourceId: payChoice.triggerSourceId } : {}),
            });
          }
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
            // rule 205 / 108.2 (rule-id: sfd-207-221) — "you may pay [1] and
            // return a unit you control HERE to its OWNER's hand. If you do,
            // …": the bounce is the other half of the cost, so the payer picks
            // which of their units here goes home and the payoff runs only
            // once it has (355.10.c.1 — never a free token).
            const bounceCost = cost.returnToHand as Record<string, unknown> | undefined;
            if (bounceCost && typeof bounceCost === "object") {
              const hereZone = sourceHereZone(draft, choice.sourceCardId, context);
              const candidates = returnToHandCostCandidates(
                draft,
                choice.playerId,
                choice.sourceCardId,
                bounceCost,
                context,
              );
              if (candidates.length === 0) {
                return;
              }
              const payoff = (choice.resolved as { effect?: unknown } | undefined)?.effect;
              const bounceEffect = { target: bounceCost, type: "return-to-hand" } as ExecutableEffect;
              const zoneCarry = typeof hereZone === "string" ? { sourceZone: hereZone } : {};
              if (candidates.length > 1) {
                draft.pendingChoice = {
                  effect: bounceEffect,
                  options: candidates,
                  playerId: choice.playerId,
                  remaining: 1,
                  sourceCardId: choice.sourceCardId,
                  then: payoff,
                  type: "choose-target",
                  ...zoneCarry,
                } as typeof draft.pendingChoice;
                return;
              }
              const bounceCtx = {
                ...buildEffectContext(draft, choice.playerId, choice.sourceCardId, context),
                ...zoneCarry,
                boundTargets: candidates,
              };
              executeEffect(bounceEffect, bounceCtx);
              if (payoff) {
                executeEffect(payoff as ExecutableEffect, bounceCtx);
              }
              if (!draft.pendingChoice) {
                postChoiceCleanup(draft, context);
              }
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
        } else if (!draft.pendingChoice) {
          // rule 359.3.f / 371.2 — a plainly DECLINED opt-in still ends a
          // resolution: deaths staged by whatever executed just before the
          // prompt (e.g. the damage whose rider offered this play) are only
          // detected by the cleanup pass, which no other branch runs here.
          postChoiceCleanup(draft, context);
        }
        return;
      }

      if (choice.type === "choose-mode") {
        // Rule 355.8 (unl-182-219): execute the picked modal option; when
        // `notChosenThisTurn` is set, record the index on the source card's
        // meta so subsequent Repeat casts exclude it.
        // rule 355.13 — an optional menu may be declined outright.
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
          // rule 370.1.b / 383.2.c (ruling d04623892609c111) — a COPIED instance
          // of the ability keeps its own "chosen this turn" record.
          const modeMeta = context.cards.getCardMeta(choice.sourceCardId as CoreCardId) as
            | ChosenModesMeta
            | undefined;
          const modeInstance = modeInstanceKey(choice.effect);
          context.cards.updateCardMeta(
            choice.sourceCardId as CoreCardId,
            chosenModesPatch(modeMeta, modeInstance, [
              ...readChosenModes(modeMeta, modeInstance),
              idx,
            ]) as Partial<RiftboundCardMeta>,
          );
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
        // rule 356.2.a.1 / 357.2 — the object paying a MANDATORY additional cost
        // of a card an effect is playing: recorded on the pending play item.
        const playItemId = (choice as { playItemId?: string }).playItemId;
        if (playItemId !== undefined) {
          if (!choice.options.includes(picked)) {
            return;
          }
          draft.pendingChoice = undefined;
          recordEffectPlayAnswer(draft, playItemId, { kind: "mandatory", objectId: picked });
          return;
        }
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
        // rule 402.2 (ogn-289-298) — an "up to N" finalization pick accumulates
        // first (below) and binds the whole set at once.
        if (choice.bindToChainItemId !== undefined && choice.anyNumber !== true) {
          // rule 402.1 (ven-114-166 Kharox) — declining the "you may" this pick
          // IS: the item never finalizes, so it leaves the Chain instead of
          // waiting to resolve into nothing.
          if (choice.optional === true && context.params.accept === false) {
            draft.pendingChoice = undefined;
            removeUnfinalizedItem(draft, choice.bindToChainItemId);
            postChoiceCleanup(draft, context);
            return;
          }
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
            continueRevealSlotLock(draft, {
              cards: context.cards,
              counters: context.counters,
              zones: context.zones,
            });
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
          // rule 402.2 (ogn-289-298) — "up to N" named while the item was
          // FINALIZED: bind the whole set (possibly empty, rule 355.13) onto the
          // chain item and let Priority proceed; the effect runs at resolution
          // with exactly these objects.
          if (choice.bindToChainItemId !== undefined) {
            const items = draft.interaction?.chain?.items;
            const idx = items?.findIndex((it) => it.id === choice.bindToChainItemId) ?? -1;
            if (items && idx >= 0) {
              items[idx] = { ...items[idx], targets: pickedSoFar } as (typeof items)[number];
            }
            if (pickedSoFar.length > 0) {
              chargePromptedDeflectTax(draft, choice, pickedSoFar, context.cards);
              const trigCtx = {
                cards: context.cards,
                counters: context.counters,
                draft,
                zones: context.zones,
              };
              for (const id of pickedSoFar) {
                fireTriggers(
                  {
                    cardId: id,
                    chooserId: choice.playerId,
                    sourceCardId: choice.sourceCardId as string,
                    sourceType: "ability",
                    type: "choose",
                  },
                  trigCtx,
                );
              }
            }
            postChoiceCleanup(draft, context);
            return;
          }
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
          // rule 355.2 / 355.10.e (ogn-187-298) — a pick the PLAYER makes at
          // resolution is not targeting, so nothing was "chosen with a spell".
          if (choice.notTargeting !== true) {
            for (const id of pickedSoFar) {
              fireTriggers(
                { cardId: id, chooserId: choice.playerId, sourceCardId: choice.sourceCardId as string, sourceType, type: "choose" },
                trigCtx,
              );
            }
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
          if (!isLegalSplitAllocation(choice.options, choice.total, allocation, splitBoundsOf(choice))) {
            return;
          }
          draft.pendingChoice = undefined;
          // rule 355.14.a (unl-192-219) — a Might-referencing split keeps its
          // reference unit in front of the per-point occurrences on re-entry.
          const encoded: string[] = [...(((choice as { boundPrefix?: readonly string[] }).boundPrefix ?? []) as string[])];
          const prefixLen = encoded.length;
          for (const [id, n] of Object.entries(allocation)) {
            for (let i = 0; i < n; i++) encoded.push(id);
          }
          if (encoded.length > prefixLen) {
            // rule 355.14.b / 359.2 — targets locked at finalization were chosen
            // (surcharge paid, "when you choose me" fired) THEN; this answer only
            // divides the damage among them.
            if (choice.targetsPreChosen !== true) {
              chargePromptedDeflectTax(draft, choice, [...new Set(encoded)], context.cards);
              const trigCtx = { cards: context.cards, counters: context.counters, draft, zones: context.zones };
              const sourceType =
                getGlobalCardRegistry().get(choice.sourceCardId as string)?.cardType === "spell"
                  ? "spell"
                  : "ability";
              for (const id of new Set(encoded)) {
                fireTriggers(
                  { cardId: id, chooserId: choice.playerId, sourceCardId: choice.sourceCardId as string, sourceType, type: "choose" },
                  trigCtx,
                );
              }
            }
            const carriedZone = (choice as { sourceZone?: string }).sourceZone;
            executeEffect(choice.effect as ExecutableEffect, {
              ...buildEffectContext(draft, choice.playerId, choice.sourceCardId, context),
              ...(typeof carriedZone === "string" ? { sourceZone: carriedZone } : {}),
              boundTargets: encoded,
            });
          }
          // rule 355.13 / 359.3.e — a split raised mid-sequence parks the rest of
          // the sequence on `then`; it runs once the damage has been dealt.
          const splitRest = (choice as { then?: unknown }).then;
          if (splitRest !== undefined && !draft.pendingChoice) {
            executeEffect(
              splitRest as ExecutableEffect,
              buildEffectContext(draft, choice.playerId, choice.sourceCardId, context),
            );
          }
          if (!draft.pendingChoice) {
            postChoiceCleanup(draft, context);
          }
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
        // rule 355.2 — the location of a card an effect is PLAYING, chosen by
        // the player performing that play: recorded on the pending play item;
        // the wrapper's finalization pass completes the play there.
        const playItemId = (choice as { playItemId?: string }).playItemId;
        if (playItemId !== undefined) {
          if (!choice.options.includes(zoneId)) {
            return;
          }
          draft.pendingChoice = undefined;
          recordEffectPlayAnswer(draft, playItemId, { kind: "location", zoneId });
          return;
        }
        // rule 355.4 / 349 — a Move Destination chosen while the card is played
        // / the ability finalized: nothing moves now; the choice rides on the
        // chain item and the wrapper's finalization pass asks the next one.
        if (choice.bindToChainItemId !== undefined) {
          const declined = choice.optional === true && context.params.accept === false;
          if (!declined && !choice.options.includes(zoneId)) {
            return;
          }
          bindDestinationOnItem(draft, choice.bindToChainItemId, choice.destinationNodeIndex, declined ? null : zoneId);
          draft.pendingChoice = undefined;
          return;
        }
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
        // rule 354.2 / 419.3 — a destination chosen for a card that is NOT on the
        // board (an effect "moving" a banished / trashed card onto it) is a PLAY
        // of that card to that location: hand it to the ONE play pipeline.
        const enteringPlay =
          !choice.created &&
          context.cards &&
          typeof context.zones.getCardsInZone === "function" &&
          fromZone !== "" &&
          !isBoardZone(fromZone);
        if (enteringPlay) {
          draft.pendingChoice = undefined;
          beginPlay(
            { cards: context.cards, counters: context.counters, draft, zones: context.zones },
            {
              cardId: choice.cardId as string,
              costMode: { kind: "ignore-all" },
              location: { fixed: targetZoneId },
              playerId: choice.playerId as string,
              sourceCardId: (choice.sourceCardId ?? choice.cardId) as string,
              via: "effect",
              ...(choice.then !== undefined ? { then: choice.then } : {}),
            },
            { immediate: true },
          );
          if (!draft.pendingChoice) {
            postChoiceCleanup(draft, context);
          }
          return;
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
          } else if (choice.thenChoice !== undefined) {
            // rule 373 (unl-086-219 Zilean) — the play-token event's own
            // replacement offer waited behind the destination prompts; every
            // token is placed now, so raise it.
            draft.pendingChoice = choice.thenChoice as typeof draft.pendingChoice;
          }
          // rule 355.1 (unl-076-219) — the token stands at its destination now:
          // re-evaluate continuous effects that count units there ("+1 [Might]
          // for each of your units with [Temporary] at my battlefield").
          if (context.cards && context.zones) {
            recalculateStaticEffects({
              cards: context.cards,
              draft,
              zones: context.zones,
            } as unknown as Parameters<typeof recalculateStaticEffects>[0]);
          }
          // rule 354.2 / 184.1 (sfd-154-221 Guards!) — the rest of the same
          // instruction ("You may pay [order] to ready it") waited behind the
          // destination prompt; every token is placed now, so run it.
          if (
            draft.pendingChoice === undefined &&
            choice.then &&
            context.cards &&
            context.counters
          ) {
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
        // rule 359.3.d (ven-056-166 Clairvoyance) — the spell's resolution is
        // NOT over while the sequence remainder ("[Predict 5]. Draw 2.") still
        // has to run, so the deferred spell settle must not fire between the
        // two: a spell already sitting in the trash is recycled into the deck
        // by a Burn Out the remainder causes and gets drawn.
        const hasSequenceRest =
          (choice as { thenIsSequenceRest?: boolean }).thenIsSequenceRest === true &&
          choice.then !== undefined;
        if (choice.onDecline) {
          executeEffect(
            choice.onDecline as ExecutableEffect,
            buildEffectContext(draft, choice.prompter, choice.sourceCardId ?? "", context),
          );
          if (!draft.pendingChoice && !hasSequenceRest) {
            postChoiceCleanup(draft, context);
          }
        }
        if (hasSequenceRest && choice.then) {
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
      // rule 424.1 (unl-064-219 Fate Weaver) — "You may REVEAL a spell … and
      // draw it": the look was private, but the card taken is shown to every
      // player, so it goes on the shared public-reveal record.
      if ((choice as { revealPick?: boolean }).revealPick) {
        recordPublicReveal({ draft }, choice.prompter as string, picks);
      }
      // Set when the pick's `then` follow-up rides the Chain as its own item
      // instead of running inline (rule-id: ven-089-166-look-then-empower).
      let followUpOnChain = false;
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
          // rule 359.3.e.13 / 428.1.a.1.b — a unit recycled off the BOARD is
          // gone by the time any follow-up reads it ("…by the Might of the unit
          // you recycled"), so record its last-known state before it moves.
          const fromZone = context.zones.getCardZone?.(id as CoreCardId) as string | undefined;
          if (typeof fromZone === "string" && isBoardZone(fromZone)) {
            snapshotLKI({ cards: context.cards, counters: context.counters, draft, zones: context.zones }, id as string);
          }
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
        if (
          choice.playFrom !== "trash" &&
          choice.playTo === undefined &&
          (choice as { playSpec?: unknown }).playSpec === undefined &&
          !ownerChoiceRecycle
        ) {
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
      // rule 355.13 (ogn-291-298) — an "up to N" prompt is answered once: the
      // unused picks are simply not taken, so it never re-parks.
      if (remaining > 0 && choice.upTo !== true) {
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

      // rule 419.3 / 354.2 — "…play it": the picked card is PLAYED through the
      // ONE play pipeline. It goes to the Chain as a Pending Item now; once this
      // instruction's remaining steps (recycle / draw / trash the rest, "then …")
      // are done (354.3) the wrapper's finalization pass has its player choose
      // the location (355.2), elect / pay any additional cost the instruction's
      // cost mode leaves (355.1.a, 356.1.b), pay, and the permanent enters the
      // board at once (337.2) — a spell becomes a spell item. rule 358.3.a: a
      // player who can't play cards this turn, or a card that cannot be played
      // right now (419.2.a), simply leaves the card where the pick put it.
      /** Plays queued by this pick (Bone Skewer, look→play, trash/hand plays). */
      const queuedPlays: string[] = [];
      if (choice.onPicked === "play") {
        for (const id of picks) {
          const spec = playSpecFromChoice(draft, choice, id as string, context);
          const begun = beginPlay(
            { cards: context.cards, counters: context.counters, draft, zones: context.zones },
            spec,
          );
          if (begun) {
            queuedPlays.push(begun.itemId);
          }
        }
        // rule-id: ven-089-166-look-then-empower — "…play it. Then you may do
        // this: Empower it": a reflexive follow-up about the card once it is ON
        // the board — its own optional item, finalized after the play (337.1.b).
        const followUp = choice.then as { type?: string; effect?: unknown } | undefined;
        if (followUp?.type === "optional" && followUp.effect !== undefined && queuedPlays.length > 0) {
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
              // rule 383.3.a / 402.1 — the leading "you may" of a reflexive
              // item (387/388) is decided while the item is FINALIZED, before
              // anyone holds priority; it waits only for the play appended
              // before it to leave the Chain (337.1.b / 354.2).
              ...(queuedPlays.length > 0 ? { finalizeAfter: [...queuedPlays] } : {}),
              status: "pending",
              triggered: true,
              type: "ability",
            } as never,
            Object.keys(draft.players),
          );
        }
      }

      // Rule 435 (ogn-174-298): look/Vision recycles the unpicked cards.
      const recycledIds: string[] = choice.onPicked === "recycle" ? [...picks] : [];
      if (choice.onRest === "recycle") {
        // rule 416.5 — the unpicked cards are recycled SIMULTANEOUSLY, so they
        // go under the deck in a RANDOM order: the looker must not learn (or
        // choose) the bottom order from the order they were revealed in.
        const rest = randomizedOrder(
          revealed.filter((id) => id !== pickedCardId),
          (context as { rng?: { shuffle: <T>(array: readonly T[]) => T[] } }).rng,
        );
        for (const restId of rest) {
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

      // Resume the originating effect's `then` clause (e.g. discard 1 → draw 1).
      // A PLAY pick carries its "then" on the play itself (it runs once the card
      // has actually been played — `playSpecFromChoice`).
      if (choice.then && choice.onPicked !== "play") {
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
      // rule 319.7 / rule-id: ogn-019-298 — the pick changed game state (a
      // discard, recycle, banish…), so refresh statics + SBA like the other
      // choice kinds do, unless a follow-up prompt is still parked.
      if (!draft.pendingChoice) {
        postChoiceCleanup(draft, context);
      }
    },
  },
};
