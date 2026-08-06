/**
 * resolveCombat move (split from combat.ts).
 */

import type { GameMoveDefinitions } from "@tcg/core";
import type { RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "../../../types";

type Defs = GameMoveDefinitions<RiftboundGameState, RiftboundMoves, RiftboundCardMeta, unknown>;

/**
 * Resolve Combat
 *
 * End combat and determine the outcome.
 * - Both sides have units: Attackers recalled to Base
 * - Only attackers remain: Battlefield conquered
 * - Only defenders remain: Defenders keep control
 * - Neither remain: No control change
 */
export const resolveCombat: Defs["resolveCombat"] = {
  reducer: (draft, context) => {
    const { battlefieldId } = context.params;

    const battlefield = draft.battlefields[battlefieldId];
    if (battlefield) {
      // Clear contested status
      battlefield.contested = false;
      battlefield.contestedBy = undefined;
    }
  },
};
