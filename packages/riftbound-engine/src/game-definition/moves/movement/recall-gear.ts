/**
 * recallGear move (split from movement.ts).
 */

import type { CardId as CoreCardId, ZoneId as CoreZoneId, GameMoveDefinitions } from "@tcg/core";
import type { RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "../../../types";

type Defs = GameMoveDefinitions<RiftboundGameState, RiftboundMoves, RiftboundCardMeta, unknown>;

/**
 * Recall Gear
 *
 * Return gear to its owner's Base.
 * Gear at a Battlefield is Recalled to Base during Cleanup.
 */
export const recallGear: Defs["recallGear"] = {
  reducer: (_draft, context) => {
    const { gearId } = context.params;
    const { zones } = context;

    // Move gear back to base
    zones.moveCard({
      cardId: gearId as CoreCardId,
      targetZoneId: "base" as CoreZoneId,
    });
  },
};
