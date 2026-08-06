/**
 * Riftbound Movement Moves
 *
 * Moves for unit movement: standard move, ganking, and recalls.
 */

import type { GameMoveDefinitions } from "@tcg/core";
import { withPostMoveCleanup } from "../../cleanup/post-move-cleanup";
import type { RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "../../types";
import { gankingMove } from "./movement/ganking-move";
import { recallGear } from "./movement/recall-gear";
import { recallUnit } from "./movement/recall-unit";
import { standardMove } from "./movement/standard-move";

/**
 * Movement move definitions.
 *
 * rule 319.8: a Cleanup follows every completed Move — re-apply location-scoped
 * passives ("other friendly units here have [X]", rule 522) and the other
 * state-based checks before the next action / the showdown the move opened.
 */
export const movementMoves: Partial<
  GameMoveDefinitions<RiftboundGameState, RiftboundMoves, RiftboundCardMeta, unknown>
> = withPostMoveCleanup({
  standardMove,
  gankingMove,
  recallUnit,
  recallGear,
});
