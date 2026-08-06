/**
 * Riftbound Movement Moves
 *
 * Moves for unit movement: standard move, ganking, and recalls.
 */

import type { GameMoveDefinitions } from "@tcg/core";
import type { RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "../../types";
import { gankingMove } from "./movement/ganking-move";
import { recallGear } from "./movement/recall-gear";
import { recallUnit } from "./movement/recall-unit";
import { standardMove } from "./movement/standard-move";

/**
 * Movement move definitions
 */
export const movementMoves: Partial<
  GameMoveDefinitions<RiftboundGameState, RiftboundMoves, RiftboundCardMeta, unknown>
> = {
  standardMove,
  gankingMove,
  recallUnit,
  recallGear,
};
