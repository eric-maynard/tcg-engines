/**
 * assignDamage move (split from combat.ts).
 */

import type { GameMoveDefinitions } from "@tcg/core";
import { dealDamage } from "../../../operations/deal-damage";
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
  reducer: (draft, context) => {
    const { targetId, amount } = context.params;
    // rule 417 / 465.2.d — dealt through the damage choke point (Prevent /
    // Double / immunity apply; one damage store underneath).
    dealDamage({ cards: context.cards, counters: context.counters, draft, zones: context.zones }, {
      amount,
      source: { kind: "combat", player: context.playerId as string },
      target: targetId as string,
    });
  },
};
