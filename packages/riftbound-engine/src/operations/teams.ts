/**
 * Team operations (rule 648).
 *
 * Helpers for reading and gating behavior based on team membership in
 * Magma Chamber (2v2) and any future team-based game modes.
 *
 * Team membership is stored on `RiftboundGameState.teams` as
 * `Record<PlayerId, teamNumber>`. Solo modes leave this field unset
 * (or an empty record), in which case every player is their own "team"
 * and the team-aware predicates degrade to per-player identity checks.
 */

import type { PlayerId, RiftboundGameState } from "../types/game-state";

/**
 * Return `true` if the game has any team mappings configured.
 *
 * A game is team-based if its state carries a non-empty `teams` record.
 * This is independent of `GameModeConfig.teamBased` because the engine
 * does not persist the `gameMode` identifier on `RiftboundGameState`.
 */
export function isTeamGame(state: RiftboundGameState): boolean {
  const {teams} = state;
  if (!teams) {
    return false;
  }
  return Object.keys(teams).length > 0;
}

/**
 * Return the team ID for a player, or `undefined` if the player is not
 * assigned to any team (including solo-mode games).
 */
export function getTeamId(state: RiftboundGameState, playerId: PlayerId): number | undefined {
  return state.teams?.[playerId];
}

/**
 * Return every player id on the same team as `playerId`, excluding the
 * player themselves. Returns an empty array in solo-mode games.
 */
export function getTeammates(state: RiftboundGameState, playerId: PlayerId): PlayerId[] {
  if (!isTeamGame(state)) {
    return [];
  }
  const myTeam = getTeamId(state, playerId);
  if (myTeam === undefined) {
    return [];
  }
  const result: PlayerId[] = [];
  for (const [pid, tid] of Object.entries(state.teams ?? {})) {
    if (pid !== playerId && tid === myTeam) {
      result.push(pid as PlayerId);
    }
  }
  return result;
}

/**
 * Return the single teammate for a player in a 2v2 game, or undefined
 * if the player has no teammate. For 2v2 this is a unique value; for
 * larger team configurations this returns the first matching teammate.
 */
export function getTeammate(
  state: RiftboundGameState,
  playerId: PlayerId,
): PlayerId | undefined {
  const teammates = getTeammates(state, playerId);
  return teammates[0];
}

/**
 * Return `true` if `a` and `b` are teammates (or the same player).
 *
 * In solo-mode games this is equivalent to `a === b`. In team games the
 * check compares their team IDs.
 */
export function areAllies(
  state: RiftboundGameState,
  a: PlayerId,
  b: PlayerId,
): boolean {
  if (a === b) {
    return true;
  }
  if (!isTeamGame(state)) {
    return false;
  }
  const teamA = getTeamId(state, a);
  const teamB = getTeamId(state, b);
  if (teamA === undefined || teamB === undefined) {
    return false;
  }
  return teamA === teamB;
}

/**
 * Return `true` if `other` is a teammate of `playerId` (but not the
 * player themselves). Used by 648.8.a-c to gate moves on whose turn it
 * is relative to the caller's team.
 */
export function isTeammate(
  state: RiftboundGameState,
  playerId: PlayerId,
  other: PlayerId,
): boolean {
  if (playerId === other) {
    return false;
  }
  return areAllies(state, playerId, other);
}

/**
 * Return `true` if `playerId` is on the same team as the active
 * player. In a solo game this is true only when `playerId` is the
 * active player themselves.
 */
export function isOnActiveTeam(state: RiftboundGameState, playerId: PlayerId): boolean {
  return areAllies(state, playerId, state.turn.activePlayer as PlayerId);
}

/**
 * Initialize a default 2v2 team mapping from an ordered player list.
 *
 * Matches the Magma Chamber convention: players alternate by seat so
 * `[P1, P2, P3, P4]` → `{P1: 0, P2: 1, P3: 0, P4: 1}`.
 */
export function createDefault2v2Teams(
  players: readonly PlayerId[],
): Record<PlayerId, number> {
  const teams: Record<PlayerId, number> = {};
  for (let i = 0; i < players.length; i++) {
    teams[players[i] as PlayerId] = i % 2;
  }
  return teams;
}
