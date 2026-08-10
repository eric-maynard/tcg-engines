/**
 * rule 317.2 — the Expiration Step of the Ending Phase.
 *
 * An Ending Special Cleanup (317.2.a / 318) with three inserted tasks, in order:
 *   3c. Heal all Units.                                   (317.2.b)
 *   3d. All "this turn" effects expire simultaneously.    (317.2.c, 423.1.a.2 stun)
 *   3e. Each player's Rune Pool empties.                  (317.2.d, 167)
 * then (317.2.e–f): if any item underwent the FEPR process during the step,
 * return to the START of the Expiration Step; only a pass that processed no
 * item lets 317.3 make the next player the Turn Player.
 *
 * rule 320 / 320.1 — while the cleanup runs, Pending Items may be ADDED (a unit
 * whose -Might penalty lapses BECOMES [Mighty], 709/710) but nothing is
 * finalized: 3c–3e run inside `withinMoveReducer`, and the finalization dialog
 * (opt-in, costs — payable only by adding runes now, the pool being empty)
 * opens once 3e is done.
 *
 * Every pass is recorded on `state.turnTrace.expiration` (harness
 * `game.trace().expiration`).
 */

import type {
  CardId as CoreCardId,
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
} from "@tcg/core";
import { checkBecomesMighty, getEffectiveMight } from "../../abilities/effects/_helpers";
import { recalculateStaticEffects } from "../../abilities/static-abilities";
import { finalizePendingItems, withinMoveReducer } from "../../abilities/trigger-finalization";
import { getGlobalCardRegistry } from "../../operations/card-lookup";
import { clearDamage, getDamage } from "../../operations/damage-store";
import { orderBatchTriggersByTurnOrder } from "../../operations/leave-board";
import { clearPointsGainedThisTurn } from "../../operations/points";
import { emptyRunePoolInPlace } from "../../operations/riftbound-operations";
import type { RiftboundCardMeta, RiftboundGameState } from "../../types";
import { relocateAttachedEquipment } from "../moves/movement/helpers";
import {
  type FlowStepContext,
  buildFlowEffectContext,
  buildFlowTriggerContext,
  collectBoardCards,
  gameHasEnded,
  stepMustWaitForChain,
} from "./flow-context";

/** rule 317.2.f — re-loop guard: a chain that keeps re-arming itself every pass. */
export const MAX_EXPIRATION_PASSES = 8;

export type ExpirationStepName = "heal" | "expire" | "empty-pools";

export interface ExpirationPassTrace {
  pass: number;
  steps: ExpirationStepName[];
  /** 3c — units whose damage was removed. */
  healed: string[];
  /** 3d — one `<what>:<cardId>` (or `<what>` for player/game-scoped) entry per lapsed effect. */
  expired: string[];
  /** State-change events the expiry published (`become-mighty:<cardId>`). */
  events: string[];
  /** 3e — what each player LOST when the pool emptied (players with an empty pool omitted). */
  poolsEmptied: Record<string, { energy: number; power: Record<string, number> }>;
  /** Chain items added (and put through finalization) by this pass — 317.2.f re-loops when > 0. */
  itemsProcessed: number;
  /** Set on the last pass when MAX_EXPIRATION_PASSES stopped the loop. */
  guardTripped?: boolean;
}

export interface TurnTrace {
  expiration: ExpirationPassTrace[];
}

type TraceState = { turnTrace?: TurnTrace };

/** Read the current turn's step trace (empty until the Ending Phase begins). */
export function readTurnTrace(state: RiftboundGameState): TurnTrace {
  return (state as RiftboundGameState & TraceState).turnTrace ?? { expiration: [] };
}

/** rule 317 — a fresh Ending Phase: forget last turn's Expiration passes. */
export function resetTurnTrace(state: RiftboundGameState): void {
  (state as RiftboundGameState & TraceState).turnTrace = { expiration: [] };
}

/**
 * rule 317.2.e / 460 — the step cannot continue while a chain item, a prompt,
 * or a showdown an expiration-created effect staged is outstanding.
 */
function expirationMustWait(state: RiftboundGameState): boolean {
  return (
    stepMustWaitForChain(state) ||
    Object.values(state.battlefields ?? {}).some((bf) => bf.contested === true)
  );
}

function traceOf(state: RiftboundGameState): TurnTrace {
  const s = state as RiftboundGameState & TraceState;
  if (!s.turnTrace) {
    s.turnTrace = { expiration: [] };
  }
  return s.turnTrace;
}

/**
 * rule 317.2 / 317.2.f — run Expiration passes until one processes no item.
 * Returns "waiting" when a pass put items on the Chain (or opened a prompt)
 * that players must now see through; the caller re-enters once the Chain is
 * gone and the loop resumes with the NEXT pass (heal again, expire again — a
 * "this turn" effect created during that chain lapses there). Idempotent once
 * "done": the trace remembers the closing empty pass.
 */
export function runExpirationStep(context: FlowStepContext): "done" | "waiting" {
  const state = context.state;
  const trace = traceOf(state);
  for (;;) {
    if (gameHasEnded(state)) {
      return "done";
    }
    if (expirationMustWait(state)) {
      return "waiting";
    }
    const last = trace.expiration[trace.expiration.length - 1];
    if (last && (last.itemsProcessed === 0 || last.guardTripped === true)) {
      return "done";
    }
    if (trace.expiration.length >= MAX_EXPIRATION_PASSES) {
      if (last) {
        last.guardTripped = true;
      }
      return "done";
    }
    const record = runExpirationPass(context, trace.expiration.length + 1);
    trace.expiration.push(record);
    if (record.itemsProcessed === 0) {
      return "done";
    }
    // Items were added: normally they wait on the Chain / behind a prompt.
    // If they are already gone (immediate Add, removed unasked) loop at once.
  }
}

/**
 * One pass of the Expiration Step: 3c → 3d → 3e as ONE cleanup (nothing is
 * finalized in between, 320.1), then the finalization dialog for whatever the
 * pass queued (337.1 / 402 — opt-ins, costs, targets) before anyone gets
 * Priority.
 */
export function runExpirationPass(context: FlowStepContext, pass: number): ExpirationPassTrace {
  const state = context.state;
  const record: ExpirationPassTrace = {
    events: [],
    expired: [],
    healed: [],
    itemsProcessed: 0,
    pass,
    poolsEmptied: {},
    steps: [],
  };
  const chainLenBefore = state.interaction?.chain?.items.length ?? 0;
  const nextIdBefore = state.interaction?.nextChainItemId ?? 0;

  withinMoveReducer(() => {
    record.steps.push("heal");
    healAllUnits(context, record);
    record.steps.push("expire");
    expireThisTurnEffects(context, record);
    record.steps.push("empty-pools");
    emptyAllRunePools(context, record);
  });

  // rule 317.2.e / 320.1 → 337.1: the cleanup is over — the items it added are
  // one simultaneous batch (turn order across controllers, 383.3.d within) and
  // are finalized now, oldest first, before anyone receives Priority.
  orderBatchTriggersByTurnOrder(state, chainLenBefore);
  if (state.pendingChoice === undefined) {
    finalizePendingItems(state, buildFlowTriggerContext(context));
  }
  const nextIdAfter = state.interaction?.nextChainItemId ?? 0;
  record.itemsProcessed = Math.max(0, nextIdAfter - nextIdBefore);
  if (record.itemsProcessed === 0 && expirationMustWait(state)) {
    record.itemsProcessed = 1;
  }
  return record;
}

// ---------------------------------------------------------------------------
// 3c. Heal all Units (317.2.b)
// ---------------------------------------------------------------------------

function healAllUnits(context: FlowStepContext, record: ExpirationPassTrace): void {
  const flowCards = context.cards as unknown as {
    getCardMeta(cardId: CoreCardId): object | undefined;
    updateCardMeta(cardId: CoreCardId, meta: Record<string, unknown>): void;
  };
  for (const cardId of collectBoardCards(context)) {
    // One damage store (counter bag + meta mirror in one write; the flow has
    // no counter ops, so the store patches the bag via meta).
    if (getDamage({ cards: flowCards }, cardId as string) > 0) {
      clearDamage({ cards: flowCards }, cardId as string);
      record.healed.push(cardId as string);
    }
  }
}

// ---------------------------------------------------------------------------
// 3d. All "this turn" effects expire simultaneously (317.2.c)
// ---------------------------------------------------------------------------

function expireThisTurnEffects(context: FlowStepContext, record: ExpirationPassTrace): void {
  const state = context.state;
  const boardCards = collectBoardCards(context);
  const registry = getGlobalCardRegistry();
  const isUnit = (id: CoreCardId): boolean => registry.getCardType(id as string) === "unit";

  // rule 710 / 709 — [Mighty] reads CURRENT Might. The expiries are
  // simultaneous, so snapshot every unit first and evaluate the crossing once
  // everything has lapsed (a +2 and a -3 ending together never "pass through"
  // an intermediate value).
  const effectCtx = buildFlowEffectContext(context);
  const mightBefore = new Map<CoreCardId, number>();
  for (const cardId of boardCards) {
    if (isUnit(cardId)) {
      mightBefore.set(cardId, getEffectiveMight(cardId as string, effectCtx));
    }
  }

  for (const cardId of boardCards) {
    expireCardTurnEffects(context, cardId, record);
  }
  expireControlEffects(context, boardCards, record);
  expireOffBoardTurnEffects(context, record);
  expireGameTurnEffects(context, record);

  // rule 364 — statics that depended on anything above ([Empowered] counts,
  // "this turn" continuous effects in `turnStatics`, conditions on turn
  // ledgers) are re-layered before Might is read again.
  recalculateStaticEffects({
    cards: {
      // rule 108.2 — "friendly"/"your" reads CONTROL, not ownership.
      getCardController: context.cards.getCardController,
      getCardMeta: context.cards.getCardMeta,
      getCardOwner: context.cards.getCardOwner ?? (() => undefined),
      updateCardMeta: context.cards.updateCardMeta,
    },
    draft: state,
    zones: context.zones,
  });

  // rule 320.1 / 334.2 — publish the Might change through the SAME choke the
  // mid-turn modifier writes use (`checkBecomesMighty`: become-mighty +
  // "might-becomes" thresholds), so "When a unit becomes [Mighty]" (Grand
  // Duelist, Fiora Worthy) is queued as a Pending Item from inside the step.
  for (const [cardId, before] of mightBefore) {
    if (checkBecomesMighty(cardId as string, before, effectCtx)) {
      record.events.push(`become-mighty:${cardId as string}`);
    }
  }
}

/** Per-permanent "this turn" state on a board card. */
function expireCardTurnEffects(
  context: FlowStepContext,
  cardId: CoreCardId,
  record: ExpirationPassTrace,
): void {
  const meta = context.cards.getCardMeta(cardId) as
    | (Partial<RiftboundCardMeta> & Record<string, unknown>)
    | undefined;
  if (!meta) {
    return;
  }
  const id = cardId as string;
  const update = (patch: Record<string, unknown>): void =>
    context.cards.updateCardMeta(cardId, patch as Partial<RiftboundCardMeta>);

  // rule 423.1.a.2 — Stunned status ends at 3d. The stun effect writes
  // counters.setFlag → __flags.stunned; seeds/mirrors use top-level stunned.
  const flags = meta.__flags as Record<string, boolean> | undefined;
  if (meta.stunned === true || flags?.stunned === true) {
    update({ __flags: { ...(flags ?? {}), stunned: false }, stunned: false });
    record.expired.push(`stun:${id}`);
  }

  // Turn-scoped granted keywords (incl. NoMove-style markers) / abilities /
  // delayed triggers.
  if (meta.grantedKeywords && meta.grantedKeywords.length > 0) {
    const remaining = meta.grantedKeywords.filter((gk) => gk.duration !== "turn");
    if (remaining.length !== meta.grantedKeywords.length) {
      update({ grantedKeywords: remaining.length > 0 ? remaining : undefined });
      record.expired.push(`grantedKeywords:${id}`);
    }
  }
  // rule-id: ven-142-166
  if (meta.grantedAbilities && meta.grantedAbilities.length > 0) {
    const remaining = meta.grantedAbilities.filter(
      (ga: { duration: string }) => ga.duration !== "turn",
    );
    if (remaining.length !== meta.grantedAbilities.length) {
      update({ grantedAbilities: remaining.length > 0 ? remaining : undefined });
      record.expired.push(`grantedAbilities:${id}`);
    }
  }
  // rule-id: unl-095-219
  if (meta.delayedTriggers && meta.delayedTriggers.length > 0) {
    const remaining = meta.delayedTriggers.filter(
      (dt: { duration: string }) => dt.duration !== "turn",
    );
    if (remaining.length !== meta.delayedTriggers.length) {
      update({ delayedTriggers: remaining.length > 0 ? remaining : undefined });
      record.expired.push(`delayedTriggers:${id}`);
    }
  }

  // rule-id: ven-126-166 — a "this turn" numeric Prevent shield (437.1.b.1.a).
  if (meta.damagePreventionShield !== undefined) {
    update({ damagePreventionShield: undefined, damagePreventionSource: undefined });
    record.expired.push(`damagePreventionShield:${id}`);
  }
  // rule-id: sfd-194-221 — an unused "next time … this turn, prevent it" (437.7).
  if (meta.preventNextDamageInstance === true) {
    update({ preventNextDamageInstance: false });
    record.expired.push(`preventNextDamageInstance:${id}`);
  }
  // rule-id: ogn-157-298 — "you've not chosen this turn".
  if (Array.isArray(meta.modesChosenThisTurn) && meta.modesChosenThisTurn.length > 0) {
    update({ modesChosenThisTurn: [] });
    record.expired.push(`modesChosenThisTurn:${id}`);
  }
  // rule-id: ven-024-166 — "haven't been dealt damage this turn".
  if (meta.dealtDamageThisTurn === true) {
    update({ dealtDamageThisTurn: false });
    record.expired.push(`dealtDamageThisTurn:${id}`);
  }
  // rule-id: ven-099-166 — "Disempower it at end of turn"; rule 441.1.c.1
  // (ven-134-166) losing the status also zeroes the count.
  if (meta.empoweredUntilEndOfTurn === true) {
    update({ empowerCount: 0, empowered: false, empoweredUntilEndOfTurn: false });
    record.expired.push(`empowered:${id}`);
  }
  // rule-id: ven-035-166 — the mirror "Empower it at end of turn".
  if (meta.disempoweredUntilEndOfTurn === true) {
    update({
      disempoweredUntilEndOfTurn: false,
      empowerCount: Math.max(1, (meta.empowerCount as number | undefined) ?? 0),
      empowered: true,
    });
    record.expired.push(`disempowered:${id}`);
  }
  // "this turn" Might modifier; rule-id: sfd-110-221 — its combat-scoped portion too.
  if ((meta.mightModifier ?? 0) !== 0) {
    update({ mightModifier: 0 });
    record.expired.push(`mightModifier:${id}`);
  }
  if (meta.combatMightModifier) {
    update({ combatMightModifier: 0 });
  }
  // rule 323.5 (ven-116-166) — "its base Might becomes N this turn".
  if (meta.baseMightOverride !== undefined) {
    update({ baseMightOverride: undefined });
    record.expired.push(`baseMightOverride:${id}`);
  }
}

/**
 * rule 455 (sfd-202-221 Hostile Takeover) — "…this turn" control changes
 * expire: the permanent re-layers to the next surviving control effect (else
 * its owner) and, when the effect said so, is recalled to its controller's
 * base. Recall is not a move (458.1), so board state is kept.
 */
function expireControlEffects(
  context: FlowStepContext,
  boardCards: readonly CoreCardId[],
  record: ExpirationPassTrace,
): void {
  for (const cardId of boardCards) {
    const meta = context.cards.getCardMeta(cardId) as Partial<RiftboundCardMeta> | undefined;
    const effects = meta?.controlEffects;
    if (!effects || effects.length === 0) {
      continue;
    }
    const expiring = effects.filter((e) => e.duration === "end-of-turn");
    if (expiring.length === 0) {
      continue;
    }
    const surviving = effects.filter((e) => e.duration !== "end-of-turn");
    context.cards.updateCardMeta(cardId, {
      controlEffects: surviving.length > 0 ? surviving : undefined,
    } as Partial<RiftboundCardMeta>);
    record.expired.push(`control:${cardId as string}`);
    const owner = context.cards.getCardOwner?.(cardId);
    const desired = surviving[surviving.length - 1]?.controllerId ?? owner;
    if (desired) {
      context.cards.setCardController?.(cardId, desired as CorePlayerId);
    }
    if (!expiring.some((e) => e.recallOnExpiry === true)) {
      continue;
    }
    const from = context.zones.getCardZone?.(cardId);
    context.zones.moveCard({ cardId, targetZoneId: "base" as CoreZoneId });
    // rule 719.3.a — attachments change location with the Top-Most card.
    relocateAttachedEquipment(cardId as string, "base", context.cards, {
      getCardZone: (id) => context.zones.getCardZone?.(id) as string | undefined,
      moveCard: (args) => context.zones.moveCard(args),
    });
    // rule 323.6 / 190.4.c — a battlefield left without a unit its controller
    // controls is lost immediately; a gear left behind never keeps it (190.3).
    if (from?.startsWith("battlefield-")) {
      const bf = context.state.battlefields[from.slice("battlefield-".length)];
      const stillThere = context.zones
        .getCardsInZone(from as CoreZoneId)
        .some(
          (id) =>
            getGlobalCardRegistry().getCardType(id as string) === "unit" &&
            (context.cards.getCardController?.(id) ?? context.cards.getCardOwner?.(id)) ===
              bf?.controller,
        );
      if (bf?.controller && !stillThere) {
        bf.controller = null;
      }
    }
  }
}

/**
 * "This turn" effects on cards that are NOT on the board still lapse (a unit
 * bounced to hand keeps no modifier for a later replay; a trash card's granted
 * [Flow] ends).
 */
function expireOffBoardTurnEffects(context: FlowStepContext, record: ExpirationPassTrace): void {
  // rule-id: ven-113-166 — turn-scoped granted [Flow] (the card sits in the trash).
  for (const cardId of context.cards.queryCards(
    (_id, m) => (m as Partial<RiftboundCardMeta>).grantedFlow?.duration === "turn",
  )) {
    context.cards.updateCardMeta(cardId, { grantedFlow: undefined } as Partial<RiftboundCardMeta>);
    record.expired.push(`grantedFlow:${cardId as string}`);
  }
  // rule-id: ogn-197-298 — a stale modifier off the board (Teemo re-hidden).
  for (const cardId of context.cards.queryCards(
    (_id, m) => ((m as Partial<RiftboundCardMeta>).mightModifier ?? 0) !== 0,
  )) {
    context.cards.updateCardMeta(cardId, { mightModifier: 0 } as Partial<RiftboundCardMeta>);
    record.expired.push(`mightModifier:${cardId as string}`);
  }
  for (const cardId of context.cards.queryCards(
    (_id, m) => (m as Partial<RiftboundCardMeta>).baseMightOverride !== undefined,
  )) {
    context.cards.updateCardMeta(cardId, {
      baseMightOverride: undefined,
    } as Partial<RiftboundCardMeta>);
    record.expired.push(`baseMightOverride:${cardId as string}`);
  }
}

/** Player- and game-scoped "this turn" effects and per-turn ledgers. */
function expireGameTurnEffects(context: FlowStepContext, record: ExpirationPassTrace): void {
  type Writable<T> = { -readonly [K in keyof T]: T[K] };
  const state = context.state as Writable<RiftboundGameState> & {
    spellPlayOrdinals?: unknown;
    consumedNextReplacements?: Record<string, true>;
    xpGainedThisTurn?: Record<string, number>;
  };
  // Per-turn scoring ledgers. The turn is over for everyone (and the flow's
  // current player may already be rotated), so clear every seat.
  for (const pid of new Set([
    ...Object.keys(state.players ?? {}),
    context.getCurrentPlayer() as string,
  ])) {
    if (!pid) {
      continue;
    }
    state.conqueredThisTurn[pid] = [];
    state.scoredThisTurn[pid] = [];
  }
  clearPointsGainedThisTurn(state);
  // rule 364.3.a (unl-108-219) — "you've gained XP this turn" resets; the XP stays.
  if (state.xpGainedThisTurn) {
    for (const pid of Object.keys(state.xpGainedThisTurn)) {
      state.xpGainedThisTurn[pid] = 0;
    }
  }
  // Turn-scoped single-fire replacement markers (Tactical Retreat, Highlander).
  if (state.consumedNextReplacements) {
    state.consumedNextReplacements = {};
  }
  // rule 127 (unl-053-219) — "look at their facedown cards THIS TURN".
  if (state.visibilityGrants) {
    const lasting = state.visibilityGrants.filter((g) => g.duration === "permanent");
    if (lasting.length !== state.visibilityGrants.length) {
      record.expired.push("visibilityGrants");
    }
    state.visibilityGrants = lasting.length > 0 ? lasting : undefined;
  }
  // rule-id: ogn-026-298 — "can't play cards this turn".
  if (state.cannotPlayCardsThisTurn) {
    state.cannotPlayCardsThisTurn = undefined;
    record.expired.push("cannotPlayCardsThisTurn");
  }
  // rule-id: sfd-078-221 — an unused "next spell has [Repeat]" grant.
  if (state.nextSpellRepeat) {
    state.nextSpellRepeat = undefined;
    record.expired.push("nextSpellRepeat");
  }
  // rule 419.4.a (ven-044-166) — per-turn play ordinals of pending spells.
  if (state.spellPlayOrdinals) {
    state.spellPlayOrdinals = undefined;
  }
  // rule-id: unl-007-219 — "this turn" runtime replacements; rule 391 / 392
  // (ven-044-166): an untargeted "your next card costs … less" prints no "this
  // turn" and waits across the turn boundary; targeted "next … this turn"
  // permissions still lapse here.
  if (state.activeReplacements) {
    const before = state.activeReplacements.length;
    state.activeReplacements = (state.activeReplacements as { duration?: string }[]).filter(
      (e) => {
        if (e?.duration !== "turn" && e?.duration !== "next") {
          return true;
        }
        const entry = e as { replaces?: string; target?: unknown };
        return e.duration === "next" && entry.replaces === "play-cost" && entry.target === undefined;
      },
    );
    if (state.activeReplacements.length !== before) {
      record.expired.push("activeReplacements");
    }
  }
  // ogn-053-298 — "this turn" continuous effects; the static pass right after
  // this drops their Might/keyword contributions.
  if (state.turnStatics) {
    state.turnStatics = undefined;
    record.expired.push("turnStatics");
  }
  // rule-id: sfd-166-221 — "this turn" player-scoped delayed triggers.
  if (state.playerDelayedTriggers) {
    const remaining = state.playerDelayedTriggers.filter((e) => e?.duration !== "turn");
    if (remaining.length !== state.playerDelayedTriggers.length) {
      record.expired.push("playerDelayedTriggers");
    }
    state.playerDelayedTriggers = remaining.length > 0 ? remaining : undefined;
  }
}

// ---------------------------------------------------------------------------
// 3e. Each player's Rune Pool empties (317.2.d / 167)
// ---------------------------------------------------------------------------

function emptyAllRunePools(context: FlowStepContext, record: ExpirationPassTrace): void {
  const state = context.state;
  for (const playerId of Object.keys(state.runePools)) {
    const pool = state.runePools[playerId as keyof typeof state.runePools];
    const power: Record<string, number> = {};
    for (const [domain, n] of Object.entries(pool?.power ?? {})) {
      if ((n ?? 0) > 0) {
        power[domain] = n as number;
      }
    }
    const energy = pool?.energy ?? 0;
    if (energy > 0 || Object.keys(power).length > 0) {
      record.poolsEmptied[playerId] = { energy, power };
    }
    // Energy AND Power, earmarked ("use only to …") portions included.
    emptyRunePoolInPlace(state, playerId);
  }
}
