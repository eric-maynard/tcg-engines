/**
 * recallUnit move (split from movement.ts).
 */

import type { CardId as CoreCardId, ZoneId as CoreZoneId, GameMoveDefinitions } from "@tcg/core";
import type { RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "../../../types";

type Defs = GameMoveDefinitions<RiftboundGameState, RiftboundMoves, RiftboundCardMeta, unknown>;

/**
 * Recall Unit
 *
 * Return a unit to its owner's Base.
 * This is NOT a Move (doesn't trigger move abilities).
 *
 * Per rules 616-619: Recalls are NOT discretionary player actions.
 * They occur only as consequences of game effects:
 *   - Combat resolution (rule 627.2: attackers recalled when both sides survive)
 *   - Cleanup (corrective recalls for illegal positions)
 *   - Card abilities (e.g., "recall a unit")
 *
 * The condition and enumerator always return false/empty to prevent
 * this from appearing as an available player move. The reducer is
 * retained for engine-internal use when effects trigger recalls.
 */
export const recallUnit: Defs["recallUnit"] = {
  condition: () => false,
  enumerator: () => [],
  reducer: (_draft, context) => {
    const { unitId } = context.params;
    const { zones } = context;

    // Move unit back to base
    // Note: This uses moveCard but represents a Recall, not a Move
    zones.moveCard({
      cardId: unitId as CoreCardId,
      targetZoneId: "base" as CoreZoneId,
    });
  },
};
