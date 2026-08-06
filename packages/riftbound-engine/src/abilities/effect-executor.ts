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
   * rule-id: unl-133-219 — subject card id of the event that fired this
   * triggered ability, so `{ type: "trigger-source" }` ("it") resolves.
   */
  readonly triggerSourceId?: string;
  /**
   * rule 811.1.d: zone id (`battlefield-<bfId>`) of the battlefield this
   * card was played from Hidden at — units it plays must be played there.
   */
  readonly hiddenZone?: string;
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
  const fn = EFFECT_HANDLERS[effect.type];
  if (fn) {
    fn(effect, ctx, EFFECT_HELPERS);
  } else {
    // default: no-op
  }
}
