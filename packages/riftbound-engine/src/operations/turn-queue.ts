/**
 * Turn Queue — Additional Turns (rule 734)
 *
 * Riftbound's turn structure is a repeating queue of players in seat order.
 * Rule 734: "An additional turn is owned by the player who was told to take
 * it and is inserted directly after the current turn in the repeating turn
 * queue. The turn *order* is unaffected; after the additional turn finishes
 * it is removed from the queue."
 *
 * The engine models the queue as `state.pendingExtraTurns: PlayerId[]` (a
 * FIFO list of pending additional turns). When a turn ends, the flow layer
 * calls `dequeueExtraTurn` — if there is a pending additional turn, that
 * player becomes the next turn player; otherwise normal seat-order rotation
 * applies.
 *
 * Note: full active-player rotation in the flow layer is still a separate,
 * larger refactor (the core flow manager does not rotate `currentPlayer`
 * automatically — see the import-progress log). This module is the
 * additional-turn primitive that rotation will consult once it lands.
 */

import type { PlayerId, RiftboundGameState } from "../types";

/**
 * Enqueue an additional turn for `playerId` (rule 734). FIFO.
 *
 * Mutates `state.pendingExtraTurns`, creating it if absent.
 */
export function enqueueExtraTurn(state: RiftboundGameState, playerId: PlayerId): void {
  const s = state as RiftboundGameState & { pendingExtraTurns?: PlayerId[] };
  if (!s.pendingExtraTurns) {
    s.pendingExtraTurns = [];
  }
  s.pendingExtraTurns.push(playerId);
}

/**
 * Peek at the next pending additional turn without removing it.
 *
 * @returns the player who owns the next additional turn, or `undefined` if
 *   the queue is empty.
 */
export function peekExtraTurn(state: RiftboundGameState): PlayerId | undefined {
  const s = state as RiftboundGameState & { pendingExtraTurns?: PlayerId[] };
  // rule 738: each additional turn is inserted directly after the CURRENT
  // turn, so a later-created one sits in front of an earlier one — the queue
  // is drained last-in-first-out.
  return s.pendingExtraTurns?.[s.pendingExtraTurns.length - 1];
}

/**
 * Dequeue and return the next pending additional turn (rule 734).
 *
 * @returns the player who should take the next turn (an additional turn), or
 *   `undefined` if no additional turn is pending — in which case the caller
 *   should advance the turn player normally in seat order.
 */
export function dequeueExtraTurn(state: RiftboundGameState): PlayerId | undefined {
  const s = state as RiftboundGameState & { pendingExtraTurns?: PlayerId[] };
  if (!s.pendingExtraTurns || s.pendingExtraTurns.length === 0) {
    return undefined;
  }
  // rule 738: last-in-first-out — see peekExtraTurn.
  return s.pendingExtraTurns.pop();
}

/**
 * Additional-turn bookkeeping for rule 737.
 *
 * An additional turn is INSERTED into the repeating queue rather than
 * replacing the queued turns: after it finishes the queue "proceeds with its
 * previously queued turns". A run of back-to-back additional turns displaces
 * exactly one queued turn, so only the first one records it.
 */
interface TurnQueueBookkeeping {
  displacedTurn?: PlayerId;
  inAdditionalTurn?: boolean;
}

/**
 * Record that an additional turn is starting, displacing `queuedNext` (the
 * player who would have taken the next turn under normal rotation).
 */
export function beginAdditionalTurn(state: RiftboundGameState, queuedNext: PlayerId): void {
  const s = state as RiftboundGameState & TurnQueueBookkeeping;
  if (!s.inAdditionalTurn) {
    s.displacedTurn = queuedNext;
  }
  s.inAdditionalTurn = true;
}

/**
 * The run of additional turns is over — return the previously queued turn
 * they displaced (rule 737), or `undefined` for normal seat rotation.
 */
export function resumeQueuedTurn(state: RiftboundGameState): PlayerId | undefined {
  const s = state as RiftboundGameState & TurnQueueBookkeeping;
  const wasAdditional = s.inAdditionalTurn === true;
  s.inAdditionalTurn = false;
  if (!wasAdditional) {
    return undefined;
  }
  const displaced = s.displacedTurn;
  s.displacedTurn = undefined;
  return displaced;
}

/**
 * Compute who takes the next turn, given the normal seat-order successor.
 *
 * Rule 734: an additional turn is inserted directly after the current turn,
 * so if any are pending the first one is taken next; otherwise the normal
 * successor takes their turn. Dequeues the additional turn (if used).
 *
 * @param state - current game state (its `pendingExtraTurns` queue is consulted/mutated)
 * @param normalNextPlayer - the player who would take the next turn under
 *   normal seat-order rotation
 * @returns the player who actually takes the next turn
 */
export function nextTurnPlayer(
  state: RiftboundGameState,
  normalNextPlayer: PlayerId,
): PlayerId {
  const extra = dequeueExtraTurn(state);
  return extra ?? normalNextPlayer;
}

/**
 * Compute the normal seat-order successor of `currentPlayer`.
 *
 * Riftbound's repeating turn queue cycles players in seat order: the first
 * player, then each subsequent player, then back to the first (rule 510 /
 * 734). The seat order is anchored on `state.setup?.firstPlayer` when known;
 * otherwise the natural key order of `state.players` is used.
 *
 * @param state - current game state
 * @param currentPlayer - the player whose turn is ending
 * @returns the player who takes the next turn under normal rotation (or the
 *   same player if there is only one)
 */
export function seatOrderSuccessor(
  state: RiftboundGameState,
  currentPlayer: PlayerId,
): PlayerId {
  const playerIds = Object.keys(state.players) as PlayerId[];
  if (playerIds.length === 0) {
    return currentPlayer;
  }
  const firstPlayer = state.setup?.firstPlayer;
  const seatOrder =
    firstPlayer && playerIds.includes(firstPlayer)
      ? [firstPlayer, ...playerIds.filter((p) => p !== firstPlayer)]
      : playerIds;
  const idx = seatOrder.indexOf(currentPlayer);
  if (idx === -1) {
    return seatOrder[0] ?? currentPlayer;
  }
  return seatOrder[(idx + 1) % seatOrder.length] ?? currentPlayer;
}
