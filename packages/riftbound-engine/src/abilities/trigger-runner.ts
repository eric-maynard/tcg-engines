/**
 * Trigger Runner
 *
 * Executes matched triggers by running their effects.
 * Called from move reducers after game events occur.
 */

import type {
  CardId as CoreCardId,
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
} from "@tcg/core";
import { getGlobalCardRegistry } from "../operations/card-lookup";
import type { RiftboundCardMeta, RiftboundGameState } from "../types";
import type { EffectContext, ExecutableEffect } from "./effect-executor";
import { executeEffect } from "./effect-executor";
import type { GameEvent } from "./game-events";
import type { CardWithAbilities, TriggerableAbility } from "./trigger-matcher";
import { findMatchingTriggers } from "./trigger-matcher";

/**
 * Context passed from move reducers to the trigger runner.
 */
export interface TriggerRunnerContext {
  readonly draft: RiftboundGameState;
  readonly zones: {
    moveCard: (params: { cardId: CoreCardId; targetZoneId: CoreZoneId }) => void;
    drawCards: (params: {
      count: number;
      from: CoreZoneId;
      to: CoreZoneId;
      playerId: CorePlayerId;
    }) => void;
    getCardsInZone: (zoneId: CoreZoneId, playerId?: CorePlayerId) => CoreCardId[];
    getCardZone?: (cardId: CoreCardId) => string | undefined;
  };
  readonly counters: {
    setFlag: (cardId: CoreCardId, flag: string, value: boolean) => void;
    addCounter: (cardId: CoreCardId, counter: string, amount: number) => void;
    removeCounter?: (cardId: CoreCardId, counter: string, amount: number) => void;
    clearCounter?: (cardId: CoreCardId, counter: string) => void;
  };
  readonly cards: {
    getCardMeta: (cardId: CoreCardId) => Partial<RiftboundCardMeta> | undefined;
    getCardOwner: (cardId: CoreCardId) => string | undefined;
    updateCardMeta?: (cardId: CoreCardId, meta: Partial<RiftboundCardMeta>) => void;
  };
  /**
   * Create a new card instance directly in a zone.
   * Used for token creation (rule 170-178).
   */
  readonly createCardInZone?: (cardId: string, zoneId: string, ownerId: string) => void;
}

/**
 * Convert card definition abilities to TriggerableAbility format.
 */
function toTriggerableAbilities(cardId: string): TriggerableAbility[] {
  const registry = getGlobalCardRegistry();
  const abilities = registry.getAbilities(cardId);
  if (!abilities) {
    return [];
  }

  const result: TriggerableAbility[] = [];
  for (const a of abilities) {
    if (a.type === "triggered" && a.trigger) {
      result.push({
        effect: a.effect,
        optional: a.optional,
        trigger: {
          event: a.trigger.event,
          on: a.trigger.on,
        },
        type: "triggered",
      });
    }
  }
  return result;
}

/**
 * Build the list of cards on the board with their abilities.
 * Scans base, battlefield, and legendZone zones, looks up abilities from the card definition registry.
 */
function getBoardCards(ctx: TriggerRunnerContext): CardWithAbilities[] {
  const boardCards: CardWithAbilities[] = [];

  // Get cards from all players' bases and legend zones
  for (const playerId of Object.keys(ctx.draft.players)) {
    const baseCards = ctx.zones.getCardsInZone("base" as CoreZoneId, playerId as CorePlayerId);
    for (const cardId of baseCards) {
      boardCards.push({
        abilities: toTriggerableAbilities(cardId as string),
        id: cardId as string,
        owner: playerId,
        zone: "base",
      });
    }

    const legendCards = ctx.zones.getCardsInZone(
      "legendZone" as CoreZoneId,
      playerId as CorePlayerId,
    );
    for (const cardId of legendCards) {
      boardCards.push({
        abilities: toTriggerableAbilities(cardId as string),
        id: cardId as string,
        owner: playerId,
        zone: "legendZone",
      });
    }
  }

  // Get cards from battlefields
  for (const bfId of Object.keys(ctx.draft.battlefields)) {
    const bfZoneId = `battlefield-${bfId}` as CoreZoneId;
    const bfCards = ctx.zones.getCardsInZone(bfZoneId);
    for (const cardId of bfCards) {
      const owner = ctx.cards.getCardOwner(cardId) ?? "";
      boardCards.push({
        abilities: toTriggerableAbilities(cardId as string),
        id: cardId as string,
        owner,
        zone: bfZoneId as string,
      });
    }
  }

  // Get cards from battlefieldRow (battlefield cards themselves)
  const battlefieldRowCards = ctx.zones.getCardsInZone("battlefieldRow" as CoreZoneId);
  for (const cardId of battlefieldRowCards) {
    const owner = ctx.cards.getCardOwner(cardId) ?? "";
    boardCards.push({
      abilities: toTriggerableAbilities(cardId as string),
      id: cardId as string,
      owner,
      zone: "battlefieldRow",
    });
  }

  // Get cards from championZone (per player)
  for (const playerId of Object.keys(ctx.draft.players)) {
    const championCards = ctx.zones.getCardsInZone(
      "championZone" as CoreZoneId,
      playerId as CorePlayerId,
    );
    for (const cardId of championCards) {
      boardCards.push({
        abilities: toTriggerableAbilities(cardId as string),
        id: cardId as string,
        owner: playerId,
        zone: "championZone",
      });
    }
  }

  return boardCards;
}

/**
 * Fire triggers for a game event.
 *
 * Scans all cards on the board for matching triggered abilities
 * and executes their effects.
 *
 * @param event - The game event that occurred
 * @param ctx - The trigger runner context from the move reducer
 * @returns Number of triggers that fired
 */
export function fireTriggers(event: GameEvent, ctx: TriggerRunnerContext): number {
  const boardCards = getBoardCards(ctx);
  const matches = findMatchingTriggers(event, boardCards);

  for (const match of matches) {
    // Build a no-op for missing optional methods
    const noop = () => {};
    const effectCtx: EffectContext = {
      cards: {
        getCardMeta: ctx.cards.getCardMeta as EffectContext["cards"]["getCardMeta"],
        getCardOwner: ctx.cards.getCardOwner,
        updateCardMeta: (ctx.cards as { updateCardMeta?: unknown })
          .updateCardMeta as EffectContext["cards"]["updateCardMeta"],
      },
      counters: {
        addCounter: ctx.counters.addCounter,
        clearCounter: ctx.counters.clearCounter ?? noop,
        removeCounter: ctx.counters.removeCounter ?? noop,
        setFlag: ctx.counters.setFlag,
      },
      createCardInZone: ctx.createCardInZone,
      draft: ctx.draft,
      fireTriggers: (innerEvent) => fireTriggers(innerEvent, ctx),
      playerId: match.cardOwner,
      sourceCardId: match.cardId,
      zones: {
        drawCards: ctx.zones.drawCards,
        getCardZone: ctx.zones.getCardZone ?? (() => undefined),
        getCardsInZone: ctx.zones.getCardsInZone,
        moveCard: ctx.zones.moveCard,
      },
    };

    const effect = match.ability.effect as ExecutableEffect;
    if (effect) {
      executeEffect(effect, effectCtx);
    }
  }

  return matches.length;
}
