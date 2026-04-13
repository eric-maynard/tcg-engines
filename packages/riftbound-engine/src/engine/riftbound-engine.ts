/**
 * Riftbound Engine
 *
 * Main engine class for the Riftbound TCG tabletop simulator.
 */

import type { RuleEngine } from "@tcg/core";
import type { PlayerId, RiftboundGameState } from "../types";

/**
 * Configuration options for creating a new game
 */
export interface RiftboundGameConfig {
  /** Player identifiers */
  readonly players: [string, string];
  /** Optional random seed for reproducibility */
  readonly seed?: number;
  /** Victory score (default: 8 for 1v1) */
  readonly victoryScore?: number;
}

/**
 * RiftboundEngine - Main game engine class
 *
 * Provides the interface for creating and managing Riftbound games.
 * This is a tabletop simulator - players enforce rules themselves.
 */
export class RiftboundEngine {
  /**
   * Create a new Riftbound game
   *
   * @param config - Game configuration
   * @returns Initial game state
   */
  createGame(config: RiftboundGameConfig): RiftboundGameState {
    const { players, victoryScore = 8 } = config;

    // Initialize player states
    const playerStates: Record<PlayerId, { id: PlayerId; victoryPoints: number; xp: number }> = {};
    const runePools: Record<PlayerId, { energy: number; power: Record<string, number> }> = {};
    const conqueredThisTurn: Record<PlayerId, string[]> = {};
    const scoredThisTurn: Record<PlayerId, string[]> = {};
    const xpGainedThisTurn: Record<PlayerId, number> = {};
    const unitsMovedThisTurn: Record<PlayerId, number> = {};
    const cardsPlayedThisTurn: Record<PlayerId, number> = {};

    for (const playerId of players) {
      playerStates[playerId as PlayerId] = {
        id: playerId as PlayerId,
        victoryPoints: 0,
        xp: 0,
      };
      runePools[playerId as PlayerId] = {
        energy: 0,
        power: {},
      };
      conqueredThisTurn[playerId as PlayerId] = [];
      scoredThisTurn[playerId as PlayerId] = [];
      xpGainedThisTurn[playerId as PlayerId] = 0;
      unitsMovedThisTurn[playerId as PlayerId] = 0;
      cardsPlayedThisTurn[playerId as PlayerId] = 0;
    }

    // Create initial game state
    const initialState: RiftboundGameState = {
      battlefields: {},
      cardsPlayedThisTurn,
      conqueredThisTurn,
      gameId: crypto.randomUUID(),
      players: playerStates,
      runePools,
      scoredThisTurn,
      status: "setup",
      turn: {
        activePlayer: players[0] as PlayerId,
        number: 1,
        phase: "setup",
      },
      unitsMovedThisTurn,
      victoryScore,
      xpGainedThisTurn,
    };

    return initialState;
  }

  /**
   * Get the rule engine for this game
   *
   * @returns RuleEngine instance (placeholder)
   */
  getRuleEngine(): RuleEngine<RiftboundGameState, Record<string, unknown>> | null {
    // Rule engine will be implemented when game rules are defined
    return null;
  }
}
