/**
 * assignDamage move (split from combat.ts).
 */

import type { CardId as CoreCardId, GameMoveDefinitions } from "@tcg/core";
import type { RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "../../../types";

type Defs = GameMoveDefinitions<RiftboundGameState, RiftboundMoves, RiftboundCardMeta, unknown>;

/**
 * Assign Damage
 *
 * Assign combat damage to a unit.
 * Damage assignment rules:
 * - Units with Tank must receive lethal damage first
 * - Must assign lethal damage before moving to next unit
 */
export const assignDamage: Defs["assignDamage"] = {
  reducer: (_draft, context) => {
    const { targetId, amount } = context.params;
    const { cards, counters } = context;

    // Mirror to meta.damage — death checks and the UI read meta.damage,
    // not the __counters bag. Read prior value before addCounter.
    const meta = cards.getCardMeta(targetId as CoreCardId) as
      | Partial<RiftboundCardMeta>
      | undefined;
    counters.addCounter(targetId as CoreCardId, "damage", amount);
    cards.updateCardMeta(
      targetId as CoreCardId,
      {
        damage: (meta?.damage ?? 0) + amount,
      } as Partial<RiftboundCardMeta>,
    );
  },
};
