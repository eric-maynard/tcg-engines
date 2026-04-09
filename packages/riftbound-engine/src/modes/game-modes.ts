/**
 * Riftbound Game Modes
 *
 * Defines the sanctioned modes of play per rules 640-648.
 * Each mode configures player count, battlefield count, victory score,
 * team structure, and first-turn adjustments.
 */

/**
 * Sanctioned game mode identifiers
 *
 * - duel: 1v1 best-of-1 (rule 644)
 * - match: 1v1 best-of-3 with sideboard (rule 645)
 * - ffa3: 3-player free-for-all skirmish (rule 646)
 * - ffa4: 4-player free-for-all war (rule 647)
 * - magmaChamber: 2v2 team mode (rule 648)
 */
export type GameMode = "duel" | "match" | "ffa3" | "ffa4" | "magmaChamber";

/**
 * Configuration for a game mode
 *
 * Captures all the variables a mode of play must define (rule 642).
 */
export interface GameModeConfig {
  /** Mode identifier */
  readonly id: GameMode;

  /** Display name for the mode */
  readonly name: string;

  /** Number of players required (exact count or [min, max] range) */
  readonly playerCount: number | [number, number];

  /** Number of battlefields in play */
  readonly battlefieldCount: number;

  /** Victory score needed to win (rule 642.3) */
  readonly victoryScore: number;

  /** Whether this mode uses teams */
  readonly teamBased: boolean;

  /** Whether the first player skips their first draw phase (rule 642.7) */
  readonly firstPlayerSkipsDraw: boolean;
}

/**
 * All sanctioned game mode configurations
 *
 * Values are sourced from the official rules document (640-648).
 */
export const GAME_MODES: Record<GameMode, GameModeConfig> = {
  /**
   * 1v1 Duel (rule 644)
   *
   * Standard two-player format. Each player provides one battlefield.
   * The second player channels an extra rune on their first channel phase.
   */
  duel: {
    battlefieldCount: 2,
    firstPlayerSkipsDraw: false,
    id: "duel",
    name: "1v1 Duel",
    playerCount: 2,
    teamBased: false,
    victoryScore: 8,
  },

  /**
   * 1v1 Match (rule 645)
   *
   * Best-of-3 duels with battlefield rotation.
   * Same per-game rules as duel; match structure wraps multiple games.
   */
  match: {
    battlefieldCount: 2,
    firstPlayerSkipsDraw: false,
    id: "match",
    name: "1v1 Match",
    playerCount: 2,
    teamBased: false,
    victoryScore: 8,
  },

  /**
   * FFA3 Skirmish (rule 646)
   *
   * Three-player free-for-all. Each player provides one battlefield.
   * First player skips draw; last player channels an extra rune.
   */
  ffa3: {
    battlefieldCount: 3,
    firstPlayerSkipsDraw: true,
    id: "ffa3",
    name: "FFA3 Skirmish",
    playerCount: 3,
    teamBased: false,
    victoryScore: 8,
  },

  /**
   * FFA4 War (rule 647)
   *
   * Four-player free-for-all. Three battlefields (first player contributes none).
   * First player skips draw; last player channels an extra rune.
   */
  ffa4: {
    battlefieldCount: 3,
    firstPlayerSkipsDraw: true,
    id: "ffa4",
    name: "FFA4 War",
    playerCount: 4,
    teamBased: false,
    victoryScore: 8,
  },

  /**
   * 2v2 Magma Chamber (rule 648)
   *
   * Four players in two teams of two. Three battlefields (first player contributes none).
   * Team victory score of 11 (combined points). First player skips draw.
   */
  magmaChamber: {
    battlefieldCount: 3,
    firstPlayerSkipsDraw: true,
    id: "magmaChamber",
    name: "2v2 Magma Chamber",
    playerCount: 4,
    teamBased: true,
    victoryScore: 11,
  },
} as const;

/**
 * Retrieve the configuration for a specific game mode
 *
 * @param mode - The game mode identifier
 * @returns The full configuration for the requested mode
 */
export function getGameModeConfig(mode: GameMode): GameModeConfig {
  return GAME_MODES[mode];
}
