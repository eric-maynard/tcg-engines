/**
 * assignAttacker move (split from combat.ts).
 */

import type { CardId as CoreCardId, GameMoveDefinitions } from "@tcg/core";
import type { RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "../../../types";

type Defs = GameMoveDefinitions<RiftboundGameState, RiftboundMoves, RiftboundCardMeta, unknown>;

/**
 * Assign Attacker
 *
 * Designate a unit as an attacker in combat.
 * The attacker is the player who applied Contested status.
 */
export const assignAttacker: Defs["assignAttacker"] = {
  reducer: (_draft, context) => {
    const { unitId } = context.params;
    const { cards } = context;

    // Set combat role to attacker
    cards.updateCardMeta(
      unitId as CoreCardId,
      {
        combatRole: "attacker",
      } as Partial<RiftboundCardMeta>,
    );
  },
};
