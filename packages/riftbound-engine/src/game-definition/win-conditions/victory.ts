/**
 * Riftbound Victory Conditions
 *
 * Win condition logic for the tabletop simulator.
 * Victory is achieved by reaching the victory score (8 points for 1v1).
 */

import type { PlayerId, RiftboundGameState } from "../../types";

/**
 * Get the effective victory score threshold for a player.
 *
 * Returns `state.victoryScore + player.victoryScoreModifier`, which is the
 * number of victory points the player must reach to win. The modifier is
 * bumped by battlefields like Aspirant's Climb (via the
 * `increase-victory-score` effect).
 */
export function getEffectiveVictoryScore(state: RiftboundGameState, playerId: PlayerId): number {
  const player = state.players[playerId];
  const modifier = player?.victoryScoreModifier ?? 0;
  return state.victoryScore + modifier;
}

/**
 * Check if a given player currently meets their effective victory threshold.
 *
 * NOTE: This is the *threshold-only* check (rule 466.1 — "a player at or
 * above the Victory Score has scored the Winning Point"). The full rule 467
 * also requires that the player have *more points than any opponent* (the
 * cleanup-step tiebreaker). For that, see {@link hasPlayerWonStrict}. The
 * threshold-only predicate is preserved for the many call sites that fire
 * at the moment of a point gain (combat conquer/hold paths, discard-step
 * winning-point grants) — at those points there is no opponent at the
 * threshold *yet* (or, if there is, rule 467 says the tie is broken on
 * the *next* cleanup, so we still complete the gain bookkeeping here and
 * let the cleanup-time gate (rule 467 → {@link hasPlayerWonStrict}) decide
 * whether the game ends).
 */
export function hasPlayerWon(state: RiftboundGameState, playerId: PlayerId): boolean {
  const player = state.players[playerId];
  if (!player) {
    return false;
  }
  return player.victoryPoints >= getEffectiveVictoryScore(state, playerId);
}

/**
 * Rule 467 — full cleanup-step win check. Returns true iff the player
 * is at/above the Victory Score AND strictly outpaces EVERY opponent:
 *
 *   victoryPoints[player] >= threshold[player]
 *   AND
 *   for every opp ≠ player: victoryPoints[player] > victoryPoints[opp]
 *
 * For team modes (rule 633+), opponents are *non-allied* players: an
 * ally tied with you at threshold does NOT block your win. We consult
 * the `teams` operations module when present; without team metadata
 * every other player is treated as an opponent.
 *
 * Use this at cleanup steps (rule 467 — "when a cleanup occurs"). The
 * non-strict {@link hasPlayerWon} stays in place for instant-gain paths
 * that just want a "did we cross the threshold?" predicate (the actual
 * status:"finished" + winner write at those call sites is gated on the
 * strict check below where it matters; this function is the cleanup-step
 * authority).
 */
export function hasPlayerWonStrict(state: RiftboundGameState, playerId: PlayerId): boolean {
  if (!hasPlayerWon(state, playerId)) {
    return false;
  }
  const myPoints = getPlayerScore(state, playerId);
  for (const oppId of Object.keys(state.players)) {
    if (oppId === playerId) {
      continue;
    }
    const oppPoints = getPlayerScore(state, oppId as PlayerId);
    if (oppPoints >= myPoints) {
      // Tie (or somehow ahead) — not strictly more than this opponent.
      return false;
    }
  }
  return true;
}

/**
 * Cleanup-step win check (rule 467). Returns the winning player ID iff
 * exactly ONE player satisfies {@link hasPlayerWonStrict}. If zero or
 * more than one do, returns null — the game continues (a tie at the
 * threshold defers to a subsequent cleanup where one player has pulled
 * ahead).
 */
export function checkVictoryAtCleanup(state: RiftboundGameState): PlayerId | null {
  const winners: PlayerId[] = [];
  for (const pid of Object.keys(state.players)) {
    if (hasPlayerWonStrict(state, pid as PlayerId)) {
      winners.push(pid as PlayerId);
    }
  }
  return winners.length === 1 ? winners[0]! : null;
}

/**
 * Check if a player has won the game
 *
 * @param state - Current game state
 * @returns The winning player ID, or null if no winner
 */
export function checkVictory(state: RiftboundGameState): PlayerId | null {
  const playerIds = Object.keys(state.players) as PlayerId[];

  for (const playerId of playerIds) {
    if (hasPlayerWon(state, playerId)) {
      return playerId;
    }
  }

  return null;
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

/**
 * Rule 466.1.b — "Winning Point" gating for *Score* events.
 *
 * When a player is about to gain a point through a Score (Conquer or Hold),
 * and their current Point Total + 1 would reach (or exceed) the Victory Score
 * (i.e. this would be the WINNING POINT), additional restrictions apply:
 *
 *   - 466.1.b.1 Hold → always gain (the winning point lands).
 *   - 466.1.b.2 Conquer + scored every battlefield this turn → gain (lands).
 *   - 466.1.b.2 Conquer + has NOT scored every battlefield this turn → the
 *     player draws a card *instead* of gaining the winning point.
 *
 * For non-Score sources (ability-driven `score` effect, draws via the `draw`
 * effect, etc.), rule 466.1.a.1 explicitly carves them out — they are NOT
 * beholden to the winning-point restriction and always gain. The `score`
 * effect-executor case is responsible for those.
 *
 * Returns `"gain"` if the point should be awarded, `"draw"` if the player
 * should draw a card instead, or `"skip"` if no action should be taken
 * (currently unused — included for forward compat with other carve-outs).
 *
 * NOTE: This is the *non-mutating* policy check. The caller is responsible
 * for performing the gain (`player.victoryPoints += 1`) or the draw
 * (`zones.drawCards({ playerId, count: 1 })`) based on the answer.
 */
export type WinningPointDecision = "gain" | "draw" | "skip";

/**
 * Inspect whether a *single*-point Score-source increment lands as the
 * Winning Point. The caller has already determined that this is a Score
 * (Conquer or Hold) — for ability-driven point gains use the rule-466.1.a.1
 * carve-out (always gain).
 *
 * `bfsScoredThisTurnIncludingThis` is the count of distinct battlefields the
 * player will have Scored this turn AFTER this Score completes (i.e. if this
 * Score is a fresh battlefield not yet in `scoredThisTurn`, the count is
 * `scoredThisTurn[playerId].length + 1`; otherwise it's just `.length`).
 *
 * `totalBattlefields` is `Object.keys(state.battlefields).length` — the
 * number of battlefields in the Mode of Play.
 */
export function decideWinningPoint(
  state: RiftboundGameState,
  playerId: PlayerId,
  method: "conquer" | "hold",
  bfsScoredThisTurnIncludingThis: number,
  totalBattlefields: number,
): WinningPointDecision {
  const current = getPlayerScore(state, playerId);
  const threshold = getEffectiveVictoryScore(state, playerId);
  // Below the winning-point line: just gain — rule 466.1.b only fires at the
  // "1 point from Victory Score or higher" boundary.
  if (current + 1 < threshold) {
    return "gain";
  }
  // Hold always lands the winning point (rule 466.1.b.1).
  if (method === "hold") {
    return "gain";
  }
  // Conquer: 466.1.b.2 — must have scored every battlefield this turn
  // (including the one being scored right now).
  if (bfsScoredThisTurnIncludingThis >= totalBattlefields) {
    return "gain";
  }
  // Otherwise, draw a card instead.
  return "draw";
}
