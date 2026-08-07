/**
 * Riftbound Victory Conditions
 *
 * Read-only predicates over the points state. The pipeline that changes points
 * and ends the game lives in `operations/points.ts`; these stay as the
 * game-definition-facing names (`endIf`, harness, legacy tests).
 */

import {
  effectiveVictoryScore,
  findWinner,
  hasReachedVictory,
} from "../../operations/points";
import type { PlayerId, RiftboundGameState } from "../../types";

/**
 * rule 194.3 — the number of points `playerId` needs to win: the Mode of Play's
 * Victory Score + the player's setup modifier + in-play "increase the points
 * needed to win" battlefields (Aspirant's Climb).
 */
export function getEffectiveVictoryScore(state: RiftboundGameState, playerId: PlayerId): number {
  return effectiveVictoryScore(state, playerId);
}

/**
 * rule 472 / 194.2: at or above the Victory Score AND strictly ahead of every
 * opponent.
 */
export function hasPlayerWon(state: RiftboundGameState, playerId: PlayerId): boolean {
  return hasReachedVictory(state, playerId);
}

/**
 * Which player (if any) currently satisfies the win condition. Pure — the
 * state write happens in `operations/points.ts checkVictory` during Cleanup.
 *
 * @param state - Current game state
 * @returns The winning player ID, or null if no winner
 */
export function checkVictory(state: RiftboundGameState): PlayerId | null {
  return findWinner(state);
}

/**
 * Check if the game has ended
 *
 * @param state - Current game state
 * @returns true if the game has ended
 */
export function isGameOver(state: RiftboundGameState): boolean {
  return state.status === "finished" || checkVictory(state) !== null;
}

/**
 * Get the current score for a player
 *
 * @param state - Current game state
 * @param playerId - Player to check
 * @returns Victory points for the player
 */
export function getPlayerScore(state: RiftboundGameState, playerId: PlayerId): number {
  return state.players[playerId]?.victoryPoints ?? 0;
}

/**
 * Check if a player is one point away from victory
 *
 * @param state - Current game state
 * @param playerId - Player to check
 * @returns true if player needs only one more point to win
 */
export function isAtMatchPoint(state: RiftboundGameState, playerId: PlayerId): boolean {
  const score = getPlayerScore(state, playerId);
  return score === getEffectiveVictoryScore(state, playerId) - 1;
}
