/**
 * Riftbound XP Operations
 *
 * Helper operations for manipulating XP (Experience Points) state.
 * These are convenience functions that wrap common XP state mutations.
 *
 * Introduced by the Unleashed (UNL) card set.
 */

import { produce } from "immer";
import type { PlayerId, RiftboundGameState } from "../types";

/**
 * Gain XP for a player
 *
 * Increases the player's total XP and tracks XP gained this turn.
 *
 * @param state - Current game state
 * @param playerId - Player gaining XP
 * @param amount - Amount of XP to gain
 * @returns Updated game state
 */
export function gainXp(
  state: RiftboundGameState,
  playerId: PlayerId,
  amount: number,
): RiftboundGameState {
  return produce(state, (draft) => {
    const player = draft.players[playerId];
    if (player) {
      player.xp += amount;
    }

    // Track XP gained this turn
    if (draft.xpGainedThisTurn[playerId] !== undefined) {
      draft.xpGainedThisTurn[playerId] = (draft.xpGainedThisTurn[playerId] ?? 0) + amount;
    }
  });
}

/**
 * Spend XP for a player
 *
 * Decreases the player's total XP. Returns null if the player does
 * not have enough XP or does not exist.
 *
 * @param state - Current game state
 * @param playerId - Player spending XP
 * @param amount - Amount of XP to spend
 * @returns Updated game state, or null if insufficient XP
 */
export function spendXp(
  state: RiftboundGameState,
  playerId: PlayerId,
  amount: number,
): RiftboundGameState | null {
  const player = state.players[playerId];
  if (!player || player.xp < amount) {
    return null;
  }

  return produce(state, (draft) => {
    const draftPlayer = draft.players[playerId];
    if (draftPlayer) {
      draftPlayer.xp -= amount;
    }
  });
}

/**
 * Get a player's current XP total
 *
 * @param state - Current game state
 * @param playerId - Player to check
 * @returns Player's current XP, or 0 if player does not exist
 */
export function getPlayerXp(state: RiftboundGameState, playerId: PlayerId): number {
  return state.players[playerId]?.xp ?? 0;
}

/**
 * Get the amount of XP a player has gained this turn
 *
 * @param state - Current game state
 * @param playerId - Player to check
 * @returns XP gained this turn, or 0 if none
 */
export function getXpGainedThisTurn(state: RiftboundGameState, playerId: PlayerId): number {
  return state.xpGainedThisTurn[playerId] ?? 0;
}

/**
 * Reset XP gained this turn for a specific player
 *
 * Called at end of turn to clear per-turn XP tracking.
 * Does not affect the player's total XP.
 *
 * @param state - Current game state
 * @param playerId - Player whose turn tracking to reset
 * @returns Updated game state
 */
export function resetXpGainedThisTurn(
  state: RiftboundGameState,
  playerId: PlayerId,
): RiftboundGameState {
  return produce(state, (draft) => {
    draft.xpGainedThisTurn[playerId] = 0;
  });
}
