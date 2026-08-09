/**
 * Effect Executor
 *
 * Executes ability effects by resolving targets and applying
 * game state mutations.
 */

import type {
  CardId as CoreCardId,
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
} from "@tcg/core";
import type { RiftboundGameState } from "../types";
import type { TargetDescriptor } from "./target-resolver";
import { EFFECT_HANDLERS } from "./effects";
import { handle_delayedTrigger } from "./effects/delayed-trigger";
import type { EffectHelpers } from "./effects/_helpers";
import {
  checkBecomesMighty,
  evaluateEffectCondition,
  getEffectiveMight,
  getTargetIds,
  resolveAmount,
  tokenEntersReadyFromStaticGrant,
} from "./effects/_helpers";

/**
 * Simplified effect interface for execution.
 */
export interface ExecutableEffect {
  readonly type: string;
  readonly amount?: number | Record<string, unknown>;
  readonly target?: TargetDescriptor;
  readonly duration?: string;
  readonly token?: { name: string; type: string; might?: number; keywords?: string[] };
  readonly location?: string;
  readonly description?: string;
  readonly effects?: ExecutableEffect[];
  /** For attach effect: the equipment to attach */
  readonly equipment?: TargetDescriptor;
  /** For attach effect: the unit to attach to */
  readonly to?: TargetDescriptor;
  /** For detach: ready state override */
  readonly ready?: boolean;
  /** For grant-keyword: the keyword to grant */
  readonly keyword?: string;
  /** For grant-keywords: multiple keywords */
  readonly keywords?: string[];
  /** For grant-keyword: optional numeric value */
  readonly value?: number;
  /** For add-resource: energy amount */
  readonly energy?: number;
  /** For add-resource: power domains */
  readonly power?: string[];
  /** For heal: player specifier */
  readonly player?: string;
}

/**
 * Context for effect execution.
 */
export interface EffectContext {
  readonly playerId: string;
  readonly sourceCardId: string;
  readonly sourceZone?: string;
  readonly draft: RiftboundGameState;
  /**
   * Named variables bound at the moment this effect resolves.
   *
   * Used for X-cost spells (e.g., Bullet Time): when a player chooses an
   * X value at play time, the engine stores it here as `{ x: N }` so that
   * effects referencing `{ variable: "x" }` in their amount expression can
   * read the chosen value during resolution.
   */
  readonly variables?: Record<string, number>;
  /**
   * Targets bound when the spell/ability was placed on the chain (rule 355.8).
   * When present, {@link getTargetIds} returns these instead of re-resolving,
   * so responses that change board state between play and resolution can't
   * silently retarget the effect.
   */
  readonly boundTargets?: readonly string[];
  /** rule-id: ogn-220-298 — prior target's zone for `location: "same"`. */
  readonly sameZone?: string;
  /**
   * rule-id: sfd-024-221 (rule 354.2) — cards a step actually PLAYED out of a
   * non-board zone, written by the play handler. A hand pick is not
   * board-resolvable, so an enclosing sequence's `pendingValue` ("Attach IT to
   * me") reads the id back from here instead of re-resolving a target.
   */
  readonly playedSink?: { ids: string[] };
  /**
   * rule-id: unl-133-219 — subject card id of the event that fired this
   * triggered ability, so `{ type: "trigger-source" }` ("it") resolves.
   */
  readonly triggerSourceId?: string;
  /**
   * rule 383.3.b / 404.1 / 359.3.e.13 — the Game Objects that PAID this
   * triggered ability's base cost during finalization, with their last-known
   * board state ("reduce its cost by the Might of the unit you recycled").
   */
  readonly paidObjects?: readonly { readonly id: string; readonly lki: import("../operations/leave-board").LKISnapshot }[];
  /**
   * rule-id: ogn-177-298 — destination zone of the `move` event that fired
   * this triggered ability, so "I may be moved WITH IT" (`to: "same"`) lands
   * where the mover went.
   */
  readonly triggerToZone?: string;
  /**
   * rule 359.3.f.3 (sfd-126-221) — zone id (`battlefield-<bfId>`) of the
   * battlefield named by the firing event ("when you defend at a battlefield
   * … move me THERE"), so `to: "there"` lands at that battlefield.
   */
  readonly triggerBattlefieldZone?: string;
  /**
   * rule 811.1.d: zone id (`battlefield-<bfId>`) of the battlefield this
   * card was played from Hidden at — units it plays must be played there.
   */
  readonly hiddenZone?: string;
  /**
   * rule 359.3.f.3 — zone id the triggering `move` event's subject left. A
   * move trigger that acts "there" (the ORIGIN) reads this instead of the
   * source's current zone, so bouncing the mover in response cannot relocate
   * the effect.
   */
  readonly triggerFrom?: string;
  readonly zones: {
    moveCard: (params: {
      cardId: CoreCardId;
      targetZoneId: CoreZoneId;
      position?: "top" | "bottom" | number;
    }) => void;
    drawCards: (params: {
      count: number;
      from: CoreZoneId;
      to: CoreZoneId;
      playerId: CorePlayerId;
    }) => void;
    getCardsInZone: (zoneId: CoreZoneId, playerId?: CorePlayerId) => CoreCardId[];
    getCardZone: (cardId: CoreCardId) => string | undefined;
    // rule 186.1: tokens cease to exist the instant they leave the board, so
    // effects that move one off-board must be able to delete it right away
    // instead of waiting for the state-based token sweep.
    removeCardFromGame?: (params: { cardId: CoreCardId }) => void;
    // rule 438.7: the board can grow during play — a battlefield that arrives
    // in a new slot needs its unit/facedown zones minted before anything moves.
    createZone?: (params: { zoneId: CoreZoneId; config?: Record<string, unknown> }) => void;
  };
  readonly cards: {
    getCardOwner: (cardId: CoreCardId) => string | undefined;
    getCardController?: (cardId: CoreCardId) => string | undefined;
    setCardController?: (cardId: CoreCardId, controllerId: CorePlayerId) => void;
    getCardMeta?: (cardId: CoreCardId) => Record<string, unknown> | undefined;
    updateCardMeta?: (cardId: CoreCardId, meta: Record<string, unknown>) => void;
  };
  readonly counters: {
    setFlag: (cardId: CoreCardId, flag: string, value: boolean) => void;
    addCounter: (cardId: CoreCardId, counter: string, amount: number) => void;
    removeCounter: (cardId: CoreCardId, counter: string, amount: number) => void;
    clearCounter: (cardId: CoreCardId, counter: string) => void;
  };
  /**
   * Create a new card instance directly in a zone.
   * Used for token creation (rule 170-178).
   * If not provided, create-token effects are silently skipped.
   */
  readonly createCardInZone?: (cardId: string, zoneId: string, ownerId: string) => void;
  /**
   * Fire triggers for a game event.
   * If not provided, trigger-dependent effects (become-mighty) are silently skipped.
   */
  readonly fireTriggers?: (event: import("./game-events").GameEvent) => void;
}

export { evaluateEffectCondition } from "./effects/_helpers";

const EFFECT_HELPERS: EffectHelpers = {
  executeEffect,
  getTargetIds,
  getEffectiveMight,
  resolveAmount,
  checkBecomesMighty,
  evaluateEffectCondition,
  tokenEntersReadyFromStaticGrant,
};

/**
 * Execute a single effect.
 */
export function executeEffect(effect: ExecutableEffect, ctx: EffectContext): void {
  // rule 431.3.c.1 / 472 — a win landing MID-resolution (an unpreventable
  // repeat Burn Out point) ends the game at once: whatever the resolving card
  // still owes is never carried out.
  if (ctx.draft.status !== "playing") {
    return;
  }
  // rule 316.3 / 316.4 (rule-id: unl-087-219 Blue Sentinel) — an effect
  // printed "at the start of your next Main Phase" must not happen now: every
  // Rune Pool empties as that phase begins, so anything added earlier is lost.
  if ((effect as { delayUntil?: string }).delayUntil === "next-main-phase") {
    installNextMainPhaseEffect(effect, ctx);
    return;
  }
  // rule 411.4 (ven-002-166, unl-121-219) — "Choose a player. They …": the
  // effect's controller names ANY player, themself included. The named seat
  // arrives back as `ownerId` (set by the `choose-player` prompt answer) and
  // the effect then runs as if printed "you" for that seat.
  const chosen = effect as { player?: string; ownerId?: string };
  if (chosen.player === "choose") {
    if (chosen.ownerId === undefined) {
      if (!ctx.draft.pendingChoice) {
        ctx.draft.pendingChoice = {
          effect,
          options: Object.keys(ctx.draft.players),
          playerId: ctx.playerId,
          prompt: "Choose a player",
          sourceCardId: ctx.sourceCardId,
          type: "choose-player",
        } as typeof ctx.draft.pendingChoice;
      }
      return;
    }
    const { ownerId, ...rest } = effect as unknown as Record<string, unknown>;
    executeEffect({ ...rest, player: "self" } as ExecutableEffect, {
      ...ctx,
      playerId: ownerId as string,
    });
    return;
  }
  // rule-id: unl-095-219 — "delayed-trigger" installs a triggered ability on a
  // card for a duration; kept out of EFFECT_HANDLERS so the map stays the
  // parser-facing catalogue of printable effects.
  const fn =
    effect.type === "delayed-trigger" ? handle_delayedTrigger : EFFECT_HANDLERS[effect.type];
  if (fn) {
    if (effect.type === "counter" && !ctx.draft.pendingChoice) {
      // "That spell" always means the one THIS counter hits — a counter that
      // finds nothing must not read back an earlier counter's target.
      (ctx.draft as { lastCounterTargetId?: string }).lastCounterTargetId = undefined;
    }
    fn(effect, ctx, EFFECT_HELPERS);
    applyLinkedSpellPlayRestriction(effect, ctx);
  } else {
    // default: no-op
  }
}

/**
 * Park an effect on its controller until the start of their next Main Phase
 * (rule 316.4), reusing the player-scoped delayed-trigger channel. Each
 * install is its own entry, so a doubled trigger delays two copies.
 */
function installNextMainPhaseEffect(effect: ExecutableEffect, ctx: EffectContext): void {
  // rule 383.3.a — a "you may" on a delayed effect is asked when the delayed
  // ability resolves, not when it is installed; carry the flag on the entry.
  const {
    delayUntil: _delayUntil,
    optional,
    ...rest
  } = effect as unknown as Record<string, unknown>;
  const draft = ctx.draft as unknown as {
    playerDelayedTriggers?: {
      playerId: string;
      sourceCardId: string;
      trigger: { event: string; on?: string };
      effect: unknown;
      optional?: boolean;
      duration: "turn" | "permanent";
    }[];
  };
  draft.playerDelayedTriggers ??= [];
  draft.playerDelayedTriggers.push({
    duration: "turn",
    ...(optional === true ? { optional: true } : {}),
    // The effect arrives as an immer draft node; snapshot it as plain data.
    effect: JSON.parse(JSON.stringify(rest)) as unknown,
    playerId: ctx.playerId,
    sourceCardId: ctx.sourceCardId,
    trigger: { event: "main-phase", on: "controller" },
  });
}

/**
 * rule 359.3.e.14.a (unl-190-219 Lilting Lullaby) — "Counter a spell. Its
 * controller can't play spells this turn." The restriction is LINKED to the
 * counter: it applies only to the controller of a spell that was actually
 * countered, so a mistargeted counter imposes nothing. `lastCounterTargetId`
 * is the spell the counter just hit (undefined when it hit nothing).
 */
function applyLinkedSpellPlayRestriction(effect: ExecutableEffect, ctx: EffectContext): void {
  if (effect.type !== "counter") {
    return;
  }
  if (!(effect as { restrictsSpellPlays?: boolean }).restrictsSpellPlays) {
    return;
  }
  const draft = ctx.draft as unknown as {
    cannotPlaySpellsThisTurn?: Record<string, number>;
    lastCounterTargetId?: string;
    turn: { number: number };
  };
  // A pending ransom prompt means the counter has not happened yet; the
  // handler re-enters after the answer and the restriction lands then.
  if (ctx.draft.pendingChoice) {
    return;
  }
  const counteredId = draft.lastCounterTargetId;
  if (!counteredId) {
    return;
  }
  const victim =
    ctx.cards.getCardController?.(counteredId as CoreCardId) ??
    ctx.cards.getCardOwner(counteredId as CoreCardId);
  if (!victim) {
    return;
  }
  draft.cannotPlaySpellsThisTurn ??= {};
  draft.cannotPlaySpellsThisTurn[victim] = draft.turn.number;
}
