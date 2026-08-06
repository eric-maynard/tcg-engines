/**
 * clearCombatState move (split from combat.ts).
 */

import type { ZoneId as CoreZoneId, GameMoveDefinitions } from "@tcg/core";
import type { RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "../../../types";

type Defs = GameMoveDefinitions<RiftboundGameState, RiftboundMoves, RiftboundCardMeta, unknown>;

/**
 * Clear Combat State
 *
 * Reset combat designations for all units at a battlefield.
 * Called after combat resolution.
 */
export const clearCombatState: Defs["clearCombatState"] = {
  reducer: (_draft, context) => {
    const { battlefieldId } = context.params;
    const { zones, cards } = context;

    // Get all cards at this battlefield
    const battlefieldZoneId = `battlefield-${battlefieldId}`;
    const unitsAtBattlefield = zones.getCardsInZone(battlefieldZoneId as CoreZoneId);

    // Clear combat role for each unit
    for (const unitId of unitsAtBattlefield) {
      cards.updateCardMeta(unitId, {
        combatRole: null,
      } as Partial<RiftboundCardMeta>);
    }
  },
};
