/**
 * Leave-board choke point + last-known information (LKI).
 *
 * Every path that takes a permanent off the board (kill instruction, lethal
 * damage found by a cleanup pass, the Beginning-Phase [Temporary] kill, kill /
 * discard costs, banish, recycle, bounce) runs through {@link leaveBoard}:
 *
 *   1. snapshot LKI into `draft.lki[cardId]` (rule 428.1.a.1.b / 740.2.a) —
 *      zone, controller, Might, buffs, attachments, the other units there;
 *   2. kill-family causes consult the die replacements (rules 370–373) through
 *      the existing replacement machinery — a replaced death never happens;
 *   3. attachments detach (rule 457.1 / 719.5);
 *   4. the card moves and becomes a NEW object: {@link resetObjectState}
 *      clears every temporary modification (rule 124.1);
 *   5. tokens cease to exist once their events fired (rule 186.1);
 *   6. {@link emitLeaveEvents} publishes ONE `die` (unit / gear killed),
 *      `discard`, or `leave-board` event per card, carrying the LKI payload,
 *      with the whole batch visible to the trigger runner so a doubler dying
 *      alongside another still doubles (rule 383.3.d) and "died alone/here"
 *      read the pre-event board.
 */

import type {
  CardId as CoreCardId,
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
} from "@tcg/core";
import type { EffectContext, ExecutableEffect } from "../abilities/effect-executor";
import { executeEffect } from "../abilities/effect-executor";
import type { GameEvent } from "../abilities/game-events";
import { checkReplacement, markReplacementConsumed } from "../abilities/replacement-effects";
import type { RiftboundCardMeta, RiftboundGameState } from "../types";
import { getGlobalCardRegistry } from "./card-lookup";
import { clearDamage, getDamage } from "./damage-store";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LeaveDestination = "trash" | "banishment" | "hand" | "deck-top" | "deck-bottom";

export type LeaveCauseKind =
  | "kill"
  | "sba"
  | "temporary"
  | "cost"
  | "discard"
  | "banish"
  | "recycle"
  | "bounce"
  | "replaced";

export interface LeaveCause {
  readonly kind: LeaveCauseKind;
  /** rule 428.5: the player responsible (kill instruction's controller / lethal damage dealer / discarder). */
  readonly by?: string;
  /** Card whose text caused it. */
  readonly source?: string;
  readonly sourceKind?: "spell" | "ability" | "combat";
}

/** rule 428.1.a.1.b — what the object looked like immediately before it left. */
export interface LKISnapshot {
  readonly cardId: string;
  readonly zone: string | undefined;
  readonly owner: string;
  readonly controller: string;
  readonly cardType: string | undefined;
  readonly isToken: boolean;
  readonly might: number;
  readonly damage: number;
  readonly buffed: boolean;
  readonly stunned: boolean;
  readonly exhausted: boolean;
  /** Equipment attached to it (rule 457.1). */
  readonly attachments: readonly string[];
  /** The unit it was attached to, when the leaving card is itself an Equipment. */
  readonly attachedTo?: string;
  /** Other units at the same location, with their controllers (rule 740.2.a). */
  readonly unitsHere: readonly { readonly id: string; readonly controller: string }[];
  /** rule 740.2.a: no other friendly unit shared its location. */
  readonly wasAlone: boolean;
  readonly lastDamagedBy?: string;
  readonly lastDamageSource?: "spell" | "ability" | "combat";
  /** rule 383.3.d: this card carried a "your [X] effects trigger an additional time" static. */
  readonly triggerDoubler: boolean;
}

export interface LeaveResult {
  readonly cardId: string;
  /** False when a replacement kept the card on the board (or it was not there). */
  readonly left: boolean;
  readonly to?: LeaveDestination;
  readonly cause: LeaveCause;
  readonly lki: LKISnapshot;
  /** Source of the replacement that applied instead, if any. */
  readonly replacedBy?: string;
  /** rule 186.1: a token whose removal waits for its events to fire. */
  tokenPending?: boolean;
}

/**
 * Structural slice of the engine operation bags. Cleanup, effect, move and
 * flow contexts are all supersets (methods so optional/param variance is lax).
 */
export interface LeaveBoardContext {
  readonly draft: RiftboundGameState;
  readonly zones: {
    moveCard(params: { cardId: CoreCardId; targetZoneId: CoreZoneId; position?: "top" | "bottom" | number }): void;
    getCardsInZone(zoneId: CoreZoneId, playerId?: CorePlayerId): CoreCardId[];
    getCardZone?(cardId: CoreCardId): string | undefined;
    removeCardFromGame?(params: { cardId: CoreCardId }): void;
    drawCards?(params: unknown): unknown;
  };
  readonly cards: {
    getCardMeta?(cardId: CoreCardId): object | undefined;
    getCardOwner(cardId: CoreCardId): string | undefined;
    getCardController?(cardId: CoreCardId): string | undefined;
    setCardController?(cardId: CoreCardId, controllerId: CorePlayerId): void;
    updateCardMeta?(cardId: CoreCardId, meta: Record<string, unknown>): void;
  };
  readonly counters?: {
    setFlag?(cardId: CoreCardId, flag: string, value: boolean): void;
    addCounter?(cardId: CoreCardId, counter: string, amount: number): void;
    removeCounter?(cardId: CoreCardId, counter: string, amount: number): void;
    clearCounter?(cardId: CoreCardId, counter: string): void;
    clearAllCounters?(cardId: CoreCardId): void;
  };
}

export interface LeaveOptions {
  /**
   * Kill-family causes consult board `die` replacements unless the caller has
   * already done so (the SBA pass matches/prompts them itself — rule 372).
   */
  readonly replacements?: "apply" | "skip";
  /**
   * rule 370.1.a.2 — a snapshot taken before ANY card of a simultaneous batch
   * moved (see {@link snapshotBatch}); defaults to snapshotting now.
   */
  readonly lki?: LKISnapshot;
}

interface LkiDraft {
  /** rule 428.1.a.1.b — last-known information for cards leaving the board in the current batch. */
  lki?: Record<string, LKISnapshot>;
  /** Cards whose leave events are being published right now (rule 370.1.a.2 simultaneity). */
  leavingBatch?: string[];
}

const KILL_FAMILY: ReadonlySet<LeaveCauseKind> = new Set(["kill", "sba", "temporary", "cost"]);

export function isKillCause(cause: LeaveCause): boolean {
  return KILL_FAMILY.has(cause.kind);
}

// ---------------------------------------------------------------------------
// Board helpers
// ---------------------------------------------------------------------------

function isBoardZone(zone: string | undefined): boolean {
  return zone === "base" || (zone !== undefined && zone.startsWith("battlefield-"));
}

function boardZoneIds(draft: RiftboundGameState): string[] {
  return ["base", ...Object.keys(draft.battlefields ?? {}).map((bf) => `battlefield-${bf}`)];
}

/** Zone of a card, tolerating contexts without `getCardZone` (cleanup stubs). */
export function zoneOfCard(ctx: LeaveBoardContext, cardId: string): string | undefined {
  const direct = ctx.zones.getCardZone?.(cardId as CoreCardId);
  if (direct !== undefined) {
    return direct as string;
  }
  for (const zoneId of [...boardZoneIds(ctx.draft), "hand", "trash", "banishment", "mainDeck", "legendZone", "championZone"]) {
    if (ctx.zones.getCardsInZone(zoneId as CoreZoneId).some((id) => (id as string) === cardId)) {
      return zoneId;
    }
  }
  for (const bfId of Object.keys(ctx.draft.battlefields ?? {})) {
    const z = `facedown-${bfId}`;
    if (ctx.zones.getCardsInZone(z as CoreZoneId).some((id) => (id as string) === cardId)) {
      return z;
    }
  }
  return undefined;
}

function metaOf(ctx: LeaveBoardContext, cardId: string): Partial<RiftboundCardMeta> & {
  __flags?: Record<string, boolean>;
} {
  return (ctx.cards.getCardMeta?.(cardId as CoreCardId) ?? {}) as Partial<RiftboundCardMeta> & {
    __flags?: Record<string, boolean>;
  };
}

function controllerOf(ctx: LeaveBoardContext, cardId: string): string {
  return (
    ctx.cards.getCardController?.(cardId as CoreCardId) ??
    ctx.cards.getCardOwner(cardId as CoreCardId) ??
    ""
  );
}

function hasTriggerDouble(cardId: string): boolean {
  return ((getGlobalCardRegistry().getAbilities(cardId) ?? []) as readonly {
    type?: string;
    effect?: { type?: string };
  }[]).some((a) => a.type === "static" && a.effect?.type === "trigger-double");
}

// ---------------------------------------------------------------------------
// LKI
// ---------------------------------------------------------------------------

/**
 * rule 428.1.a.1.b / 740.2.a — note the card's location, attributes and
 * neighbours before it leaves, and publish it on `draft.lki`.
 */
export function snapshotLKI(ctx: LeaveBoardContext, cardId: string): LKISnapshot {
  const registry = getGlobalCardRegistry();
  const def = registry.get(cardId);
  const meta = metaOf(ctx, cardId);
  const flags = meta.__flags ?? {};
  const zone = zoneOfCard(ctx, cardId);
  const owner = ctx.cards.getCardOwner(cardId as CoreCardId) ?? "";
  const controller = controllerOf(ctx, cardId) || owner;
  const buffed = meta.buffed === true || flags.buffed === true;
  let equipBonus = 0;
  for (const equipId of meta.equippedWith ?? []) {
    equipBonus += registry.getMightBonus(equipId as string);
  }
  const baseMight = def?.might ?? 0;
  const might =
    baseMight > 0
      ? Math.max(
          0,
          baseMight +
            (buffed ? 1 : 0) +
            (meta.extraBuffs ?? 0) +
            (meta.mightModifier ?? 0) +
            (meta.staticMightBonus ?? 0) +
            equipBonus,
        )
      : 0;
  const unitsHere: { id: string; controller: string }[] = [];
  if (isBoardZone(zone)) {
    const ids =
      zone === "base"
        ? ctx.zones.getCardsInZone("base" as CoreZoneId, controller as CorePlayerId)
        : ctx.zones.getCardsInZone(zone as CoreZoneId);
    for (const raw of ids) {
      const id = raw as string;
      if (id === cardId) {
        continue;
      }
      const t = registry.getCardType(id);
      if (t !== undefined && t !== "unit") {
        continue;
      }
      unitsHere.push({ controller: controllerOf(ctx, id), id });
    }
  }
  const snap: LKISnapshot = {
    attachedTo: meta.attachedTo as string | undefined,
    attachments: [...((meta.equippedWith ?? []) as string[])],
    buffed,
    cardId,
    cardType: def?.cardType,
    controller,
    damage: getDamage(ctx, cardId),
    exhausted: meta.exhausted === true || flags.exhausted === true,
    isToken: cardId.startsWith("token-"),
    lastDamageSource: meta.lastDamageSource,
    lastDamagedBy: meta.lastDamagedBy,
    might,
    owner,
    stunned: meta.stunned === true || flags.stunned === true,
    triggerDoubler: hasTriggerDouble(cardId),
    unitsHere,
    wasAlone: !unitsHere.some((u) => u.controller === controller),
    zone,
  };
  const draft = ctx.draft as LkiDraft;
  draft.lki ??= {};
  draft.lki[cardId] = snap;
  return snap;
}

/**
 * rule 370.1.a.2 — snapshot every card of a simultaneous batch before the
 * first one moves, so batch-mates still count as "here" for each other.
 */
export function snapshotBatch(ctx: LeaveBoardContext, cardIds: readonly string[]): Map<string, LKISnapshot> {
  const out = new Map<string, LKISnapshot>();
  for (const id of cardIds) {
    out.set(id, snapshotLKI(ctx, id));
  }
  return out;
}

/** Read a card's LKI if it left the board in the batch being processed. */
export function getLKI(draft: RiftboundGameState, cardId: string): LKISnapshot | undefined {
  return (draft as LkiDraft).lki?.[cardId];
}

/** Cards leaving in the batch whose events are being published (rule 370.1.a.2). */
export function getLeavingBatch(draft: RiftboundGameState): readonly LKISnapshot[] {
  const d = draft as LkiDraft;
  return (d.leavingBatch ?? []).map((id) => d.lki?.[id]).filter((s): s is LKISnapshot => s !== undefined);
}

/** Drop LKI entries — end of a cleanup pass / end of turn housekeeping. */
export function clearLKI(draft: RiftboundGameState, cardIds?: readonly string[]): void {
  const d = draft as LkiDraft;
  if (!d.lki) {
    return;
  }
  if (cardIds === undefined) {
    d.lki = undefined;
    return;
  }
  for (const id of cardIds) {
    delete d.lki[id];
  }
}

// ---------------------------------------------------------------------------
// Reset (rule 124.1) and detach (rule 457.1 / 719.5)
// ---------------------------------------------------------------------------

/**
 * rule 124.1 — a Game Object changing zones to/from a non-board zone stops
 * tracking every temporary modification: damage, buffs, stun, exhaustion,
 * granted keywords/abilities, Might modifiers, control changes, attachment
 * links, hidden status. Also reverts control to the owner (rule 191.1).
 */
export function resetObjectState(ctx: LeaveBoardContext, cardId: string): void {
  const id = cardId as CoreCardId;
  const counters = ctx.counters;
  counters?.setFlag?.(id, "exhausted", false);
  counters?.setFlag?.(id, "stunned", false);
  counters?.setFlag?.(id, "buffed", false);
  clearDamage(ctx, cardId);
  ctx.cards.updateCardMeta?.(id, {
    __flags: undefined,
    attachedTo: undefined,
    buffed: false,
    combatMightModifier: 0,
    combatRole: null,
    controlEffects: undefined,
    copiedFromCardId: undefined,
    damagePreventionShield: undefined,
    delayedTriggers: undefined,
    empowered: undefined,
    equippedWith: undefined,
    exhausted: false,
    extraBuffs: undefined,
    grantedAbilities: undefined,
    grantedKeywords: undefined,
    hidden: false,
    hiddenAt: undefined,
    lastDamageSource: undefined,
    lastDamagedBy: undefined,
    mightModifier: 0,
    modesChosenThisTurn: undefined,
    staticMightBonus: undefined,
    stunned: false,
  });
  const owner = ctx.cards.getCardOwner(id);
  if (owner !== undefined && ctx.cards.setCardController && controllerOf(ctx, cardId) !== owner) {
    ctx.cards.setCardController(id, owner as CorePlayerId);
  }
}

/**
 * rule 457.1 / 719.5 — sever both sides of every attachment link the leaving
 * card is part of. Equipment worn by a leaving unit stays on the board and is
 * recalled to base; a leaving Equipment drops off its holder.
 */
export function detachOnLeave(ctx: LeaveBoardContext, cardId: string): void {
  const update = ctx.cards.updateCardMeta;
  if (!update) {
    return;
  }
  const meta = metaOf(ctx, cardId);
  const holder = meta.attachedTo as string | undefined;
  if (typeof holder === "string") {
    const held = (metaOf(ctx, holder).equippedWith ?? []) as string[];
    update(holder as CoreCardId, { equippedWith: held.filter((e) => e !== cardId) });
    update(cardId as CoreCardId, { attachedTo: undefined, copiedFromCardId: undefined });
  }
  const worn = [...((meta.equippedWith ?? []) as string[])];
  for (const equipId of worn) {
    update(equipId as CoreCardId, { attachedTo: undefined, copiedFromCardId: undefined });
    ctx.zones.moveCard({ cardId: equipId as CoreCardId, targetZoneId: "base" as CoreZoneId });
  }
  if (worn.length > 0) {
    update(cardId as CoreCardId, { equippedWith: undefined });
  }
}

// ---------------------------------------------------------------------------
// Die replacements (rules 370–373) — board abilities, via the shared matcher
// ---------------------------------------------------------------------------

/**
 * rule 370.2 — a replacement applies once to an event and to whatever replaces
 * it; the kill it performs itself ("kill this instead") is not replaced again
 * by the same source while it runs.
 */
const RUNNING_DIE_REPLACEMENTS = new Set<string>();

/**
 * Adapt a leave/cleanup context into an EffectContext for running a
 * replacement's own effect, with the would-be-dying card exposed as
 * `trigger-source` ("it").
 */
export function buildReplacementEffectContext(
  ctx: LeaveBoardContext,
  match: { sourceCardId: string; sourceOwner: string },
  dyingCardId: string,
): EffectContext {
  const zonesAny = ctx.zones as unknown as Partial<EffectContext["zones"]>;
  const countersAny = (ctx.counters ?? {}) as Partial<EffectContext["counters"]>;
  const noop = () => {};
  return {
    cards: ctx.cards as unknown as EffectContext["cards"],
    counters: {
      addCounter: countersAny.addCounter ?? noop,
      clearCounter: countersAny.clearCounter ?? noop,
      removeCounter: countersAny.removeCounter ?? noop,
      setFlag: countersAny.setFlag ?? noop,
    },
    draft: ctx.draft,
    playerId: match.sourceOwner,
    sourceCardId: match.sourceCardId,
    triggerSourceId: dyingCardId,
    zones: {
      drawCards: (zonesAny.drawCards ?? noop) as EffectContext["zones"]["drawCards"],
      getCardZone: (id: CoreCardId) => zoneOfCard(ctx, id as string),
      getCardsInZone: ctx.zones.getCardsInZone,
      moveCard: ctx.zones.moveCard,
      removeCardFromGame: ctx.zones.removeCardFromGame,
    },
  };
}

/**
 * Apply a board `die` replacement (Zhonya's Hourglass ogn-077-298, Soraka,
 * Guardian Angel …) to a card about to be killed. Returns true when the death
 * was replaced — the caller must then leave the card where it is and fire no
 * `die` (rule 370.1.a.1 / 808.1.d.1).
 */
export function applyDieReplacement(ctx: LeaveBoardContext, cardId: string): boolean {
  if (RUNNING_DIE_REPLACEMENTS.has(cardId)) {
    return false;
  }
  const owner = ctx.cards.getCardOwner(cardId as CoreCardId) ?? "";
  const match = checkReplacement(
    { cardId, owner, type: "die" },
    {
      cards: {
        getCardMeta: (id: CoreCardId) => metaOf(ctx, id as string),
        getCardOwner: (id: CoreCardId) => ctx.cards.getCardOwner(id),
      },
      draft: ctx.draft,
      zones: ctx.zones,
    },
  );
  if (!match || RUNNING_DIE_REPLACEMENTS.has(match.sourceCardId)) {
    return false;
  }
  markReplacementConsumed(ctx.draft, match);
  clearDamage(ctx, cardId);
  const repl = match.replacement as ExecutableEffect | "prevent" | undefined;
  if (repl && repl !== "prevent" && typeof repl === "object" && repl.type) {
    RUNNING_DIE_REPLACEMENTS.add(match.sourceCardId);
    try {
      executeEffect(repl, buildReplacementEffectContext(ctx, match, cardId));
    } finally {
      RUNNING_DIE_REPLACEMENTS.delete(match.sourceCardId);
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// leaveBoard
// ---------------------------------------------------------------------------

function destinationZone(to: LeaveDestination): { zoneId: string; position?: "top" | "bottom" } {
  switch (to) {
    case "trash":
      return { zoneId: "trash" };
    case "banishment":
      return { zoneId: "banishment" };
    case "hand":
      return { zoneId: "hand" };
    case "deck-top":
      return { position: "top", zoneId: "mainDeck" };
    case "deck-bottom":
      return { position: "bottom", zoneId: "mainDeck" };
    default:
      return { zoneId: "trash" };
  }
}

/**
 * Take one card off the board (or discard it from hand) — see the module doc
 * for the step order. Fires NO events: collect the results of a simultaneous
 * batch and hand them to {@link emitLeaveEvents} (or use {@link removeFromBoard}).
 */
export function leaveBoard(
  ctx: LeaveBoardContext,
  cardId: string,
  to: LeaveDestination,
  cause: LeaveCause,
  opts: LeaveOptions = {},
): LeaveResult {
  const lki = opts.lki ?? snapshotLKI(ctx, cardId);
  (ctx.draft as LkiDraft).lki ??= {};
  ((ctx.draft as LkiDraft).lki as Record<string, LKISnapshot>)[cardId] = lki;
  const killing = isKillCause(cause);

  // rule 428.1 — killing is a permanent going to the trash FROM THE BOARD; a
  // card that already left (bounced / banished in response) can't be killed.
  if (killing && lki.zone !== undefined && !isBoardZone(lki.zone)) {
    clearLKI(ctx.draft, [cardId]);
    return { cardId, cause, left: false, lki };
  }

  if (killing && opts.replacements !== "skip" && isBoardZone(lki.zone)) {
    // rule 370.1.a.1 — the death never happens; the card stays (wherever the
    // replacement put it) and keeps no pending Deathknell.
    if (applyDieReplacement(ctx, cardId)) {
      clearLKI(ctx.draft, [cardId]);
      return { cardId, cause, left: false, lki, replacedBy: "replacement" };
    }
  }

  // rule 457.1 / 719.5 — attachments detach as the top-most card leaves.
  detachOnLeave(ctx, cardId);

  const dest = destinationZone(to);
  ctx.zones.moveCard({
    cardId: cardId as CoreCardId,
    targetZoneId: dest.zoneId as CoreZoneId,
    ...(dest.position ? { position: dest.position } : {}),
  });

  // rule 124.1 — the card in its new zone is a new object.
  resetObjectState(ctx, cardId);

  const result: LeaveResult = { cardId, cause, left: true, lki, to };

  // rule 186.1 — a token in a non-board zone ceases to exist. Kill-family
  // deaths keep it until their `die` event has been published (428.1.a.1.b:
  // the Deathknell is noted first); every other departure removes it now so a
  // follow-up step of the same effect finds nothing to replay.
  if (lki.isToken) {
    if (killing || cause.kind === "discard") {
      result.tokenPending = true;
    } else {
      ctx.zones.removeCardFromGame?.({ cardId: cardId as CoreCardId });
      clearLKI(ctx.draft, [cardId]);
    }
  } else if (!killing && cause.kind !== "discard") {
    // Non-death departures publish nothing later, so their LKI is done with.
    clearLKI(ctx.draft, [cardId]);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

/** Build the unified event for one leave result (payload keeps kill.ts's field names). */
export function buildLeaveEvent(result: LeaveResult, batchIndex?: number): GameEvent | undefined {
  const { cause, lki } = result;
  if (!result.left) {
    return undefined;
  }
  if (isKillCause(cause)) {
    return {
      attachments: [...lki.attachments],
      cardId: result.cardId,
      cause: cause.kind,
      controller: lki.controller,
      diedAt: lki.zone,
      killSource: cause.sourceKind ?? lki.lastDamageSource,
      killedBy: cause.by ?? lki.lastDamagedBy,
      owner: lki.owner,
      type: "die",
      wasAlone: lki.wasAlone,
      wasBuffed: lki.buffed,
      wasStunned: lki.stunned,
    } as GameEvent;
  }
  if (cause.kind === "discard") {
    return {
      cardId: result.cardId,
      playerId: cause.by ?? lki.owner,
      type: "discard",
      ...(batchIndex !== undefined ? { batchIndex } : {}),
    };
  }
  return {
    cardId: result.cardId,
    cause: cause.kind,
    controller: lki.controller,
    from: lki.zone,
    owner: lki.owner,
    to: result.to,
    type: "leave-board",
  } as GameEvent;
}

/**
 * Publish the events for a batch of simultaneous departures (rule 370.1.a.2 /
 * 808.1.d.2): the whole batch is exposed on `draft.leavingBatch` + `draft.lki`
 * before the first event fires, so the trigger runner can still see a doubler
 * or a neighbour that is dying at the same moment. Afterwards pending tokens
 * cease to exist (rule 186.1) and the batch's LKI is dropped.
 *
 * @param fire - the caller's trigger sink (`ctx.fireTriggers`, `fireTriggers`
 *   bound to a runner context, or the dispatcher).
 * @returns total listeners fired (when the sink reports it).
 */
export function emitLeaveEvents(
  ctx: LeaveBoardContext,
  results: readonly LeaveResult[],
  fire: ((event: GameEvent) => number | void) | undefined,
): number {
  const draft = ctx.draft as LkiDraft;
  const gone = results.filter((r) => r.left);
  if (gone.length === 0) {
    return 0;
  }
  const outerBatch = draft.leavingBatch;
  draft.leavingBatch = gone.map((r) => r.cardId);
  let total = 0;
  try {
    let discardIndex = 0;
    for (const r of gone) {
      const event = buildLeaveEvent(r, r.cause.kind === "discard" ? discardIndex++ : undefined);
      if (event && fire) {
        const n = fire(event);
        total += typeof n === "number" ? n : 0;
      }
    }
  } finally {
    draft.leavingBatch = outerBatch;
    for (const r of gone) {
      if (r.tokenPending) {
        ctx.zones.removeCardFromGame?.({ cardId: r.cardId as CoreCardId });
        r.tokenPending = false;
      }
    }
    clearLKI(
      ctx.draft,
      gone.map((r) => r.cardId),
    );
  }
  return total;
}

/**
 * Convenience: take every card in `ids` off the board as ONE simultaneous
 * action, then publish their events.
 */
export function removeFromBoard(
  ctx: LeaveBoardContext,
  ids: readonly string[],
  to: LeaveDestination,
  cause: LeaveCause,
  fire: ((event: GameEvent) => number | void) | undefined,
  opts: LeaveOptions = {},
): LeaveResult[] {
  const snaps = snapshotBatch(ctx, ids);
  const results = ids.map((id) => leaveBoard(ctx, id, to, cause, { ...opts, lki: snaps.get(id) }));
  emitLeaveEvents(ctx, results, fire);
  return results;
}
