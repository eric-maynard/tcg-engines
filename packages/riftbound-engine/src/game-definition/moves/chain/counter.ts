/**
 * counterSpell move (split from chain-moves.ts).
 */

import type { GameMoveDefinitions } from "@tcg/core";
import type { RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "../../../types";

type Defs = GameMoveDefinitions<RiftboundGameState, RiftboundMoves, RiftboundCardMeta, unknown>;

/**
 * Counter a spell on the chain (rule 544.x).
 *
 * Marks the target chain item as countered so its effect is skipped
 * when it resolves. Rule 544.3: costs paid for the countered card are
 * NOT refunded — only the resolve-time effect is skipped. Rule 544.4:
 * players may only counter cards when directed by a game effect;
 * the move permits any relevant player to invoke it because game
 * effects themselves pick the target and owner, but real card text
 * will funnel through the `counter` effect type in the executor.
 */
export const counterSpell: Defs["counterSpell"] = {
  condition: (state, context) => {
    if (state.status !== "playing") {
      return false;
    }
    if (state.pendingChoice) {
      return false;
    }
    const chain = state.interaction?.chain;
    if (!chain?.active) {
      return false;
    }
    const { targetChainItemId, playerId } = context.params;
    if (!chain.relevantPlayers.includes(playerId)) {
      return false;
    }
    const target = chain.items.find((item) => item.id === targetChainItemId);
    if (!target) {
      return false;
    }
    if (target.countered) {
      return false;
    }
    return true;
  },
  // Rule 601: Counter is a card effect, not a player Discretionary Action.
  // No enumerator — this move exists for sandbox/effect-executor use only.
  reducer: (draft, context) => {
    const chain = draft.interaction?.chain;
    if (!chain) {
      return;
    }
    const { targetChainItemId } = context.params;
    for (let i = 0; i < chain.items.length; i++) {
      const item = chain.items[i];
      if (item && item.id === targetChainItemId && !item.countered) {
        (chain.items[i] as { countered: boolean }).countered = true;
        break;
      }
    }
  },
};
