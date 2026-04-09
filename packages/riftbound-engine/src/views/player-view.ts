/**
 * Riftbound Player View (Information Hiding)
 *
 * Filters game state to enforce Riftbound privacy rules (rule 127):
 * - Secret: Neither player can see (deck order, rune deck order)
 * - Private: Only the owner/controller can see (hand, facedown cards)
 * - Public: All players can see (board, trash, banishment, rune pool)
 *
 * Zone-level card filtering (hand contents, deck order, facedown cards)
 * is handled by the core engine based on zone visibility configs in
 * `zone-configs.ts`. This module filters the game-specific state in
 * `RiftboundGameState`.
 *
 * Current visibility of RiftboundGameState fields:
 * - players (victory points): Public (rule 633)
 * - battlefields (control/contested): Public
 * - runePools (energy/power): Public (runes are face-up on board)
 * - turn state: Public
 * - conqueredThisTurn/scoredThisTurn: Public (tracking info)
 * - status/winner/gameId/victoryScore: Public
 */

import type { RiftboundGameState } from "../types/game-state";

/**
 * Creates a player-specific view of the Riftbound game state.
 *
 * Filters the game state to hide information that the requesting player
 * should not see, per Riftbound privacy rules (rule 127).
 *
 * Currently, all fields in RiftboundGameState are public information.
 * Zone-level privacy (hand contents, deck order, facedown cards) is
 * enforced by the core engine via zone visibility configs.
 *
 * This function exists as the integration point for game-specific
 * information hiding. As the game evolves, private state can be
 * filtered here without changing the game definition.
 *
 * @param state - Complete game state
 * @param playerId - Player requesting the view
 * @returns Filtered state visible to the requesting player
 */
export function createPlayerView(state: RiftboundGameState, playerId: string): RiftboundGameState {
  // Validate that the requesting player exists in the game
  if (!state.players[playerId]) {
    throw new Error(
      `Player ${playerId} not found in game state. Valid players: ${Object.keys(state.players).join(", ")}`,
    );
  }

  // All fields in RiftboundGameState are currently public.
  // Return the state as-is. The core engine handles zone-level
  // Filtering (hand, deck, facedown zones) based on zone configs.
  //
  // Public fields (no filtering needed):
  // - gameId: Game identifier (public)
  // - players: Victory points are public (rule 633)
  // - victoryScore: Win threshold (public)
  // - battlefields: Control/contested status (public)
  // - runePools: Runes are face-up on board (public)
  // - conqueredThisTurn: Scoring tracker (public)
  // - scoredThisTurn: Scoring tracker (public)
  // - turn: Phase/active player (public)
  // - status: Game status (public)
  // - winner: Game result (public)
  return state;
}
