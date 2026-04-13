/**
 * Riftbound Turn Structure Moves
 *
 * Moves for turn management: advancing phases, ending turns,
 * conceding, and readying cards.
 */

import type { PlayerId as CorePlayerId, GameMoveDefinitions } from "@tcg/core";
import { createInteractionState, getTurnState } from "../../chain";
import {
  getActivePlayers,
  isPlayerRemoved,
  removePlayer,
} from "../../operations/player-removal";
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
      state.status === "playing" &&
      !state.pendingChoice &&
      state.turn.activePlayer === context.params.playerId,
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
      if (state.status !== "playing") {
        return false;
      }
      if (state.pendingChoice) {
        return false;
      }
      if (state.turn.activePlayer !== context.params.playerId) {
        return false;
      }
      // Cannot end turn while chain or showdown is active (rule 510)
      const interaction = state.interaction ?? createInteractionState();
      const turnState = getTurnState(interaction);
      if (turnState !== "neutral-open") {
        return false;
      }
      return true;
    },
    enumerator: (state, context) => {
      if (state.status !== "playing") {
        return [];
      }
      if (state.pendingChoice) {
        return [];
      }
      if (state.turn.activePlayer !== (context.playerId as string)) {
        return [];
      }
      // Cannot end turn while chain or showdown is active
      const interaction = state.interaction ?? createInteractionState();
      const turnState = getTurnState(interaction);
      if (turnState !== "neutral-open") {
        return [];
      }
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
   * Player forfeits the game (rule 650). In a 1v1 game the opponent
   * wins immediately. In 3+ player games (rule 651.2) the conceding
   * player is removed via the rule-652 pipeline and the game continues
   * with the remaining players; only when a single player is left does
   * the game actually finish.
   */
  concede: {
    condition: (state, context) => {
      if (state.status !== "playing") {
        return false;
      }
      // An already-removed player cannot concede again.
      if (isPlayerRemoved(state, context.params.playerId)) {
        return false;
      }
      return true;
    },
    enumerator: (state, context) => {
      if (state.status !== "playing") {
        return [];
      }
      if (isPlayerRemoved(state, context.playerId as string)) {
        return [];
      }
      return [{ playerId: context.playerId as string }];
    },
    reducer: (draft, context) => {
      const { playerId } = context.params;

      const totalPlayers = Object.keys(draft.players).length;

      // 1v1: opponent wins immediately (rule 651.1). Preserve existing
      // Behavior for duels and 2-player rule-audit harnesses.
      if (totalPlayers <= 2) {
        const playerIds = Object.keys(draft.players);
        const opponentId = playerIds.find((id) => id !== playerId);

        draft.status = "finished";
        draft.winner = opponentId;
        (draft as { removedPlayers?: string[] }).removedPlayers = [playerId];

        context.endGame?.({
          metadata: { concededBy: playerId },
          reason: "concede",
          winner: opponentId as CorePlayerId,
        });
        return;
      }

      // 3+ players: run the rule-652 removal pipeline. Game continues
      // Unless only one player remains.
      removePlayer(
        {
          cards: context.cards,
          counters: context.counters,
          draft,
          zones: context.zones,
        },
        playerId,
      );

      const remaining = getActivePlayers(draft);
      if (remaining.length <= 1) {
        const winnerId = remaining[0];
        draft.status = "finished";
        draft.winner = winnerId;

        context.endGame?.({
          metadata: { concededBy: playerId },
          reason: "concede",
          winner: winnerId as CorePlayerId,
        });
      }
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
