/**
 * Riftbound Discard/Trash Moves
 *
 * Moves for discarding, killing, banishing, and recycling cards.
 */

import type {
  CardId as CoreCardId,
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
  GameMoveDefinitions,
} from "@tcg/core";
import type { RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "../../types";
import { hasPlayerWon } from "../win-conditions/victory";

/**
 * Discard/trash move definitions
 */
export const discardMoves: Partial<
  GameMoveDefinitions<RiftboundGameState, RiftboundMoves, RiftboundCardMeta, unknown>
> = {
  banishCard: {
    reducer: (_draft, context) => {
      const { cardId } = context.params;
      context.counters.clearAllCounters(cardId as CoreCardId);
      context.zones.moveCard({
        cardId: cardId as CoreCardId,
        targetZoneId: "banishment" as CoreZoneId,
      });
    },
  },

  burnOut: {
    /**
     * Rule 607.4.a: Burn Out only fires when a game effect directs it
     * OR when the player has an empty main deck and is attempting a
     * draw / look / mill action. A player cannot fire burnOut as a
     * voluntary move while their main deck still has cards and the
     * caller has not identified a source action.
     *
     * `directed` callers (effect executor, replacement pipeline) bypass
     * the gating because they represent a rule-driven invocation.
     */
    condition: (state, context) => {
      if (state.status !== "playing") {
        return false;
      }
      const { playerId } = context.params;
      const source = context.params.source ?? "directed";
      if (source === "directed") {
        return true;
      }
      // Non-directed (draw/look/mill) sources only legal when the
      // Player's main deck is empty.
      const deck = context.zones.getCardsInZone(
        "mainDeck" as CoreZoneId,
        playerId as CorePlayerId,
      );
      return deck.length === 0;
    },
    reducer: (draft, context) => {
      const { playerId, opponentId } = context.params;
      const source = context.params.source ?? "directed";
      const { zones } = context;

      // Rule 607.2.a: Shuffle the player's trash into their main deck.
      const trashCards = zones.getCardsInZone("trash" as CoreZoneId, playerId as CorePlayerId);
      for (const cardId of trashCards) {
        zones.moveCard({
          cardId,
          position: "bottom",
          targetZoneId: "mainDeck" as CoreZoneId,
        });
      }
      zones.shuffleZone("mainDeck" as CoreZoneId, playerId as CorePlayerId);

      // Rule 607.2.b: The opponent of the burning-out player gains 1 point.
      const opponent = draft.players[opponentId];
      if (opponent) {
        opponent.victoryPoints += 1;

        if (hasPlayerWon(draft, opponentId)) {
          draft.status = "finished";
          draft.winner = opponentId;

          context.endGame?.({
            metadata: {
              finalScore: opponent.victoryPoints,
              method: "burn_out",
            },
            reason: "victory_points",
            winner: opponentId as CorePlayerId,
          });
        }
      }

      // Rule 607.2.c: After shuffling and scoring, the player retries
      // The original action that caused the burn-out. Only the `draw`
      // Source currently has a concrete retry path in the engine; the
      // Others (look/mill) depend on the calling effect to re-run.
      const retryCards = zones.getCardsInZone(
        "mainDeck" as CoreZoneId,
        playerId as CorePlayerId,
      );
      if (source === "draw" && retryCards.length > 0) {
        zones.drawCards({
          count: 1,
          from: "mainDeck" as CoreZoneId,
          playerId: playerId as CorePlayerId,
          to: "hand" as CoreZoneId,
        });
      }

      // Rule 651.2 / 652: Removal from the game is handled by `concede`
      // And by explicit "removed from the game" effects. `burnOut` only
      // Awards VP and reshuffles; repeated burn outs drive the opponent
      // To victoryScore, which is already checked above.
    },
  },

  discardCard: {
    reducer: (_draft, context) => {
      const { cardId } = context.params;
      context.zones.moveCard({
        cardId: cardId as CoreCardId,
        targetZoneId: "trash" as CoreZoneId,
      });
    },
  },

  drawCard: {
    reducer: (_draft, context) => {
      const { playerId, count = 1 } = context.params;
      context.zones.drawCards({
        count,
        from: "mainDeck" as CoreZoneId,
        playerId: playerId as CorePlayerId,
        to: "hand" as CoreZoneId,
      });
    },
  },

  killUnit: {
    reducer: (_draft, context) => {
      const { cardId } = context.params;
      context.counters.clearAllCounters(cardId as CoreCardId);
      context.zones.moveCard({
        cardId: cardId as CoreCardId,
        targetZoneId: "trash" as CoreZoneId,
      });
    },
  },

  recycleCard: {
    reducer: (_draft, context) => {
      const { cardId } = context.params;
      context.counters.clearAllCounters(cardId as CoreCardId);
      context.zones.moveCard({
        cardId: cardId as CoreCardId,
        position: "bottom",
        targetZoneId: "mainDeck" as CoreZoneId,
      });
    },
  },
};
