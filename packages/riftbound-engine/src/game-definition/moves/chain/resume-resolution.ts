/**
 * Resume a Chain Item whose resolution stopped at a resume point.
 *
 * DESIGN.md §"Pausing inside a resolving item". Rules 321 / 321.1 say a Cleanup
 * cannot occur while a Chain Item is Resolving and that the Cleanup it defers
 * runs the moment that resolution ENDS. Everything the engine parks mid-item —
 * a costed "you may pay … instead" die shield (371.2), a destination, a mode —
 * used to be un-parked inside the very reducer that answered it, so the board
 * between the answer and the next instruction never existed as a position.
 * That is fine for most parks (nothing observes the gap between "kill it" and
 * "draw 2"), but not for a MULTI-INSTANCE item: paying a shield can spend a
 * buff, a static recounts at once (703), and the instances still to come are
 * dealt against the recounted board.
 *
 * So a remainder tagged with a `gate` (see `SuspendedResolutionReason`) is left
 * on `deferredSequenceRest` and `suspendedResolution` is recorded instead. This
 * move is the only way past it. It is deliberately NOT one of the harness'
 * `PROCEDURE_MOVES`: those are fired inside the same `applyMove` as the move
 * that produced them, which would collapse the pause again. Drivers reach it
 * the ordinary way — the acting seat's action decision, whose context is
 * `"procedure"`, which `passivePolicy` (and therefore `settle()`) takes.
 *
 * What resuming is NOT: it is not a Cleanup point (no death check, no control
 * lapse, no staged showdown opens — rule 321 still holds, the item has not left
 * the Chain) and it is not a priority window (rule 340: nobody gets priority
 * inside a resolution; while `suspendedResolution` is set every other move is
 * illegal, exactly as `pendingChoice` blocks everything but its answer).
 */

import type { GameMoveDefinitions } from "@tcg/core";
import type { RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "../../../types";
import { postChoiceCleanup } from "../pending-choice";

type Defs = GameMoveDefinitions<RiftboundGameState, RiftboundMoves, RiftboundCardMeta, unknown>;

/** The seat that resumes: the player resolving the item (rule 359.1). */
function resumer(state: RiftboundGameState): string | undefined {
  if (state.pendingChoice || state.suspendedResolution === undefined) {
    return undefined;
  }
  return state.suspendedResolution.playerId;
}

export const resumeResolution: Defs["resumeResolution"] = {
  condition: (state) => resumer(state) !== undefined,
  enumerator: (state, context) =>
    resumer(state) === (context.playerId as string) ? [{}] : [],
  reducer: (draft, context) => {
    if (draft.suspendedResolution === undefined || draft.pendingChoice) {
      return;
    }
    // The remaining instructions of the item run now, against the board the
    // answer left. Anything they park (another shield, another destination)
    // re-suspends through the same gate; once nothing is parked any more the
    // shared tail settles the spell (359.3.d) and performs the Cleanup this
    // resolution has been deferring (321.1).
    postChoiceCleanup(draft, context, { resumed: true });
  },
};
