/**
 * Riftbound Legion Conditions
 *
 * Condition evaluator for rule 724 (Legion). A Legion-gated ability fires
 * only if the controller has already played another main-deck card earlier
 * this turn.
 *
 * Rule 724.1.c: "A [Legion] ability resolves only if you played another
 * card this turn."
 * Rule 724.2: Satisfaction is all-or-nothing across multiple Legion
 * instances — a single prior card-play satisfies every Legion ability
 * on every card.
 *
 * The engine tracks `state.cardsPlayedThisTurn[playerId]` which counts
 * every successful `playUnit`/`playSpell`/`playGear` reducer. Runes
 * (channel) are not main-deck plays and do not count.
 */

import type { PlayerId, RiftboundGameState } from "../types";

/**
 * Evaluate a Legion condition.
 *
 * Returns `true` when the player has played at least one main-deck card
 * earlier this turn. The triggering play itself should NOT count against
 * the threshold — callers should invoke this BEFORE incrementing
 * `cardsPlayedThisTurn` for the current play (i.e. the trigger runner
 * reads the counter that was established by prior plays).
 *
 * @param state - Current game state
 * @param playerId - Player to evaluate
 * @returns `true` if `state.cardsPlayedThisTurn[playerId] >= 1`
 */
export function evaluateLegionCondition(state: RiftboundGameState, playerId: PlayerId): boolean {
  const played = state.cardsPlayedThisTurn?.[playerId] ?? 0;
  return played >= 1;
}
