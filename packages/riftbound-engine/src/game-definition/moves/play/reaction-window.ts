/**
 * Shared [Reaction] timing window (rule 813.1.c / 807), used by every play
 * move — kept in its own module so play-unit and play-champion do not import
 * each other.
 */

import type { RiftboundGameState } from "../../../types";
import { createInteractionState, getTurnState, hasShowdownPermission } from "../../../chain";

/** rule 309.1.a: with a chain open, only the priority holder may act. */
function holdsChainPriority(state: RiftboundGameState, playerId: string): boolean {
  const chain = (state.interaction ?? createInteractionState()).chain;
  return chain?.active === true && chain.activePlayer === playerId;
}

/**
 * rule 813.1.c / rule 807: [Reaction] means "play any time". The card's
 * controller may play it whenever they may act at all:
 *  - a Closed state (chain on the stack) → only the priority holder;
 *  - a Showdown Open state → only the Focus holder (rule 347);
 *  - a Neutral Open state → only the turn player (rule 316.5.b: nobody else
 *    holds priority there, so [Reaction] opens no window).
 */
export function reactionWindowOpen(state: RiftboundGameState, playerId: string): boolean {
  if (holdsChainPriority(state, playerId)) {
    return true;
  }
  const interaction = state.interaction ?? createInteractionState();
  const turnState = getTurnState(interaction);
  if (turnState === "neutral-closed" || turnState === "showdown-closed") {
    // A chain exists and this player does not hold priority.
    return false;
  }
  if (turnState === "neutral-open") {
    // rule 316.5.b: in a Neutral Open State only the turn player may take a
    // Discretionary Action.
    return state.turn.activePlayer === playerId;
  }
  return hasShowdownPermission(interaction, playerId);
}
