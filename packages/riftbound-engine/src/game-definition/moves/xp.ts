/**
 * Riftbound XP Moves
 *
 * Moves for XP (Experience Points) management: gaining and spending XP.
 * Introduced by the Unleashed (UNL) card set.
 */

import type { GameMoveDefinitions } from "@tcg/core";
import type { RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "../../types";

/**
 * XP move definitions
 */
export const xpMoves: Partial<
  GameMoveDefinitions<RiftboundGameState, RiftboundMoves, RiftboundCardMeta, unknown>
> = {
  /**
   * Gain XP
   *
   * Add XP to a player's total. Tracks XP gained this turn.
   * Triggered by Hunt keyword, card effects, or other game mechanics.
   */
  gainXp: {
    reducer: (draft, context) => {
      const { playerId, amount } = context.params;

      const player = draft.players[playerId];
      if (player) {
        player.xp += amount;
      }

      // Track XP gained this turn
      if (draft.xpGainedThisTurn[playerId] !== undefined) {
        draft.xpGainedThisTurn[playerId] = (draft.xpGainedThisTurn[playerId] ?? 0) + amount;
      }
    },
  },

  /**
   * Spend XP
   *
   * Spend XP from a player's total. Used for leveled abilities
   * and other XP costs. Does not allow overspending.
   */
  spendXp: {
    reducer: (draft, context) => {
      const { playerId, amount } = context.params;

      const player = draft.players[playerId];
      if (player && player.xp >= amount) {
        player.xp -= amount;
      }
    },
  },
};
