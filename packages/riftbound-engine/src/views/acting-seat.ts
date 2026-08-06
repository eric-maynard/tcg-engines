/**
 * Acting-seat cursor.
 *
 * One authoritative answer to "which player must decide something right
 * now", shared by the agent harness, the playtest tracer and (eventually)
 * the server. Precedence follows the engine's own gating: a pendingChoice
 * blocks every other move, a chain gives priority to `chain.activePlayer`,
 * an active showdown gives Focus, otherwise the turn player acts.
 */

import type { PendingChoice, PlayerId, RiftboundGameState } from "../types/game-state";

/**
 * The player who must answer a pending choice. Normalises the two field
 * spellings used by the `PendingChoice` variants (`playerId` vs `prompter`)
 * without changing the state shape.
 */
export function getPendingChoiceChooser(choice: PendingChoice): PlayerId {
  if ("playerId" in choice && typeof choice.playerId === "string") {
    return choice.playerId;
  }
  return (choice as { prompter: PlayerId }).prompter;
}

/**
 * Who acts next: pendingChoice chooser > chain priority holder > showdown
 * focus holder > turn player. Returns `undefined` only for a finished game
 * with no turn player recorded.
 */
export function getActingSeat(state: RiftboundGameState): PlayerId | undefined {
  if (state.pendingChoice) {
    return getPendingChoiceChooser(state.pendingChoice);
  }
  const chain = state.interaction?.chain;
  if (chain?.active && chain.activePlayer) {
    return chain.activePlayer;
  }
  const stack = state.interaction?.showdownStack ?? [];
  const top = stack.length > 0 ? stack[stack.length - 1] : undefined;
  if (top?.active && top.focusPlayer) {
    return top.focusPlayer;
  }
  return state.turn?.activePlayer || undefined;
}
