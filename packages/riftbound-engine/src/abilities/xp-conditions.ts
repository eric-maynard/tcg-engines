/**
 * Riftbound XP Conditions
 *
 * Condition evaluators for XP-based static ability conditions.
 * These check player XP state for "while-level" and "xp-gained-this-turn" conditions.
 */

import type { PlayerId, RiftboundGameState } from "../types";

/**
 * Evaluate a "while-level" condition
 *
 * Returns true when the player's XP is at or above the given threshold.
 * Used by static abilities that activate at certain XP levels
 * (e.g., level 3, 6, 11, 16).
 *
 * @param state - Current game state
 * @param playerId - Player to evaluate
 * @param threshold - XP threshold to check against
 * @returns true if player's XP >= threshold
 */
export function evaluateWhileLevel(
  state: RiftboundGameState,
  playerId: PlayerId,
  threshold: number,
): boolean {
  const player = state.players[playerId];
  return (player?.xp ?? 0) >= threshold;
}

/**
 * Evaluate an "xp-gained-this-turn" condition
 *
 * Returns true when the player has gained any XP during the current turn.
 * Used by static abilities that activate when XP was gained.
 *
 * @param state - Current game state
 * @param playerId - Player to evaluate
 * @returns true if player gained XP this turn
 */
export function evaluateXpGainedThisTurn(state: RiftboundGameState, playerId: PlayerId): boolean {
  const gained = state.xpGainedThisTurn[playerId] ?? 0;
  return gained > 0;
}
