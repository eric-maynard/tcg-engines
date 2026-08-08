/**
 * Riftbound Moves
 *
 * All move definitions for the Riftbound tabletop simulator.
 */

import type { GameMoveDefinitions } from "@tcg/core";
import {
  finalizePendingItems,
  withTriggerFinalization,
  withinMoveReducer,
} from "../../abilities/trigger-finalization";
import { withDeferredSpellSettle } from "./chain/resolve";
import { openPendingContestedShowdown } from "./chain/showdown";
import type { ArrivalIO } from "../../operations/arrive-at-battlefield";
import type { RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "../../types";

// Import all move categories
import { cardActionMoves } from "./card-actions";
import { cardPlayMoves } from "./cards";
import { chainMoves } from "./chain-moves";
import { combatMoves } from "./combat";
import { counterMoves } from "./counters";
import { deckActionMoves } from "./deck-actions";
import { discardMoves } from "./discard";
import { equipmentMoves } from "./equipment";
import { movementMoves } from "./movement";
import { pendingChoiceMoves } from "./pending-choice";
import { resourceMoves } from "./resources";
import { setupMoves } from "./setup";
import { tokenMoves } from "./token";
import { turnMoves } from "./turn";
import { xpMoves } from "./xp";

/**
 * All Riftbound move definitions combined
 */
/**
 * rule 319.8 / 323.12 / 323.13 — every action ends with a Cleanup, and a
 * Cleanup that finds the turn in a Neutral Open State begins whatever Showdown
 * or Combat is staged. Wrapping every move keeps that one step from depending
 * on which reducer happened to remember it (a Combat staged by a move whose
 * trigger was answered through a pending choice used to stay staged forever).
 * Outermost wrapper: it runs after the move's own triggers were finalized, so a
 * Standard Move whose mover queued "When I move" finds a Closed State and stays
 * Staged (401.1); the "attack" / "defend" / "showdown-begin" triggers a begun
 * Showdown queues are finalized here in turn (337.1), before anyone gets Focus.
 */
function withStagedShowdownOpening<
  // biome-ignore lint/suspicious/noExplicitAny: structural pass-through wrapper
  TMoves extends Record<string, { reducer: (draft: any, context: any) => void } | undefined>,
>(moves: TMoves): TMoves {
  const wrapped = {} as Record<string, unknown>;
  for (const [name, move] of Object.entries(moves)) {
    if (!move) {
      wrapped[name] = move;
      continue;
    }
    const originalReducer = move.reducer;
    wrapped[name] = {
      ...move,
      // biome-ignore lint/suspicious/noExplicitAny: structural pass-through wrapper
      reducer: (draft: any, context: any) => {
        originalReducer(draft, context);
        if (!(context?.cards && context?.zones)) {
          return;
        }
        const began = withinMoveReducer(() =>
          openPendingContestedShowdown(draft, context as Omit<ArrivalIO, "draft">),
        );
        if (began && !draft.pendingChoice) {
          finalizePendingItems(draft, context);
        }
      },
    };
  }
  return wrapped as TMoves;
}

export const riftboundMoves: GameMoveDefinitions<
  RiftboundGameState,
  RiftboundMoves,
  RiftboundCardMeta,
  unknown
> = withStagedShowdownOpening(withDeferredSpellSettle(
  withTriggerFinalization({
  // Setup moves
  ...setupMoves,

  // Turn structure moves
  ...turnMoves,

  // Card play moves
  ...cardPlayMoves,

  // Movement moves
  ...movementMoves,

  // Resource moves
  ...resourceMoves,

  // Combat moves
  ...combatMoves,

  // Counter/token moves
  ...counterMoves,

  // Equipment moves
  ...equipmentMoves,

  // Chain & showdown moves
  ...chainMoves,

  // Discard/trash moves
  ...discardMoves,

  // Pending-choice moves (reveal-hand flows)
  ...pendingChoiceMoves,

  // XP moves
  ...xpMoves,

  // W10 sandbox / token moves
  ...tokenMoves,
  ...cardActionMoves,

  // W12 deck-peek moves
  ...deckActionMoves,
  } as GameMoveDefinitions<RiftboundGameState, RiftboundMoves, RiftboundCardMeta, unknown>),
));

export { cardActionMoves } from "./card-actions";
export { cardPlayMoves } from "./cards";
export { chainMoves } from "./chain-moves";
export { combatMoves } from "./combat";
export { counterMoves } from "./counters";
export { deckActionMoves } from "./deck-actions";
export { discardMoves } from "./discard";
export { equipmentMoves } from "./equipment";
export { movementMoves } from "./movement";
export { pendingChoiceMoves } from "./pending-choice";
export { resourceMoves } from "./resources";
// Re-export individual move categories for selective imports
export { setupMoves } from "./setup";
export { tokenMoves } from "./token";
export { turnMoves } from "./turn";
export { xpMoves } from "./xp";
