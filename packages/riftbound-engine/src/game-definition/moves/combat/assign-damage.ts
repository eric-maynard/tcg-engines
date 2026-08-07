/**
 * assignDamage move (split from combat.ts).
 */

import type { GameMoveDefinitions } from "@tcg/core";
import { addDamage } from "../../../operations/damage-store";
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
    // rule 520 / 124.1 — single damage store (counter + meta mirror together).
    addDamage(context, targetId as string, amount);
  },
};
