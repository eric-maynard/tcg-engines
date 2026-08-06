/**
 * assignDefender move (split from combat.ts).
 */

import type { CardId as CoreCardId, GameMoveDefinitions } from "@tcg/core";
import type { RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "../../../types";

type Defs = GameMoveDefinitions<RiftboundGameState, RiftboundMoves, RiftboundCardMeta, unknown>;

/**
 * Assign Defender
 *
 * Designate a unit as a defender in combat.
 * The defender is the other player in combat.
 */
export const assignDefender: Defs["assignDefender"] = {
  reducer: (_draft, context) => {
    const { unitId } = context.params;
    const { cards } = context;

    // Set combat role to defender
    cards.updateCardMeta(
      unitId as CoreCardId,
      {
        combatRole: "defender",
      } as Partial<RiftboundCardMeta>,
    );
  },
};
