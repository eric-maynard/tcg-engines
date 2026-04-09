/**
 * Riftbound Turn Structure Moves
 *
 * Moves for turn management: advancing phases, ending turns,
 * conceding, and readying cards.
 */

import type { PlayerId as CorePlayerId, GameMoveDefinitions } from "@tcg/core";
import { createInteractionState, getTurnState } from "../../chain";
import type { RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "../../types";

/**
 * Turn structure move definitions
 */
export const turnMoves: Partial<
  GameMoveDefinitions<RiftboundGameState, RiftboundMoves, RiftboundCardMeta, unknown>
> = {
  /**
   * Advance to next phase
   *
   * Moves the game to the next phase in the turn sequence.
   * Uses the flow system to handle phase transitions.
   */
  advancePhase: {
    condition: (state, context) =>
      state.status === "playing" && state.turn.activePlayer === context.params.playerId,
    reducer: (_draft, context) => {
      // Use the flow system to advance phase
      context.flow?.endPhase();
    },
  },

  /**
   * End current turn
   *
   * Ends the action phase, which triggers the ending phase (via flow),
   * then cleanup, then the turn ends and next player starts.
   * Turn-based tracking is cleared in the ending phase hook.
   */
  endTurn: {
    condition: (state, context) => {
      if (state.status !== "playing") {return false;}
      if (state.turn.activePlayer !== context.params.playerId) {return false;}
      // Cannot end turn while chain or showdown is active (rule 510)
      const interaction = state.interaction ?? createInteractionState();
      const turnState = getTurnState(interaction);
      if (turnState !== "neutral-open") {return false;}
      return true;
    },
    enumerator: (state, context) => {
      if (state.status !== "playing") {return [];}
      if (state.turn.activePlayer !== (context.playerId as string)) {return [];}
      // Cannot end turn while chain or showdown is active
      const interaction = state.interaction ?? createInteractionState();
      const turnState = getTurnState(interaction);
      if (turnState !== "neutral-open") {return [];}
      return [{ playerId: context.playerId as string }];
    },
    reducer: (_draft, context) => {
      // Ending the action phase triggers ending -> cleanup -> next turn via flow
      context.flow?.endPhase();
    },
  },

  /**
   * Concede the game
   *
   * Player forfeits the game. The opponent wins.
   */
  concede: {
    condition: (state) => state.status === "playing",
    enumerator: (state, context) => {
      if (state.status !== "playing") {
        return [];
      }
      return [{ playerId: context.playerId as string }];
    },
    reducer: (draft, context) => {
      const { playerId } = context.params;

      // Find the opponent
      const playerIds = Object.keys(draft.players);
      const opponentId = playerIds.find((id) => id !== playerId);

      // Set game as finished with opponent as winner
      draft.status = "finished";
      draft.winner = opponentId;

      // Also use the endGame function if available
      context.endGame?.({
        metadata: { concededBy: playerId },
        reason: "concede",
        winner: opponentId as CorePlayerId,
      });
    },
  },

  /**
   * Ready all game objects (Awaken phase)
   *
   * Readies all exhausted game objects controlled by the player.
   * This happens automatically at the start of each turn.
   */
  readyAll: {
    condition: (state, context) =>
      state.status === "playing" && state.turn.activePlayer === context.params.playerId,
    reducer: (_draft, context) => {
      const { playerId } = context.params;
      const { counters } = context;

      // Get all exhausted cards owned by this player
      const exhaustedCards = counters.getCardsWithFlag("exhausted", true);

      // Ready each card owned by this player
      for (const cardId of exhaustedCards) {
        const owner = context.cards.getCardOwner(cardId);
        if ((owner as string) === playerId) {
          counters.setFlag(cardId, "exhausted", false);
        }
      }
    },
  },

  /**
   * Empty rune pool
   *
   * Clears all energy and power from the player's rune pool.
   * This happens at the end of Draw Phase and end of turn.
   */
  emptyRunePool: {
    condition: (state, context) =>
      state.status === "playing" && state.turn.activePlayer === context.params.playerId,
    reducer: (draft, context) => {
      const { playerId } = context.params;

      const pool = draft.runePools[playerId];
      if (pool) {
        pool.energy = 0;
        pool.power = {};
      }
    },
  },
};
