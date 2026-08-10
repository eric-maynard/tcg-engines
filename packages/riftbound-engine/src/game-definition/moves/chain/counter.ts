/**
 * counterSpell move (split from chain-moves.ts).
 */

import type { CardId as CoreCardId, ZoneId as CoreZoneId, GameMoveDefinitions } from "@tcg/core";
import { removeChainItem } from "../../../chain";
import { itemIsUncounterable } from "../../../chain/uncounterable";
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
    // rule-id: ogn-064-298 — "Counter a spell" targets spells only; a
    // triggered/activated ability on the chain is never a legal target.
    if (target.type !== "spell") {
      return false;
    }
    // rule-id: ven-015-166 — "This can't be countered." (rule 544); rule
    // 727.1.c.2 — a board static shield (ven-069-166) is sampled right now.
    if (
      itemIsUncounterable(target, {
        cards: context.cards as never,
        draft: state as never,
        zones: context.zones as never,
      })
    ) {
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
      // rule-id: ven-015-166 — uncounterable items are never marked countered.
      if (
        item &&
        item.id === targetChainItemId &&
        !item.countered &&
        !itemIsUncounterable(item, {
          cards: context.cards as never,
          draft: draft as never,
          zones: context.zones as never,
        })
      ) {
        (chain.items[i] as { countered: boolean }).countered = true;
        // rule-id: ogn-064-298 (rule 425.1.a / 425.1.a.1) — a countered card
        // is cleared from the chain and trashed as part of being countered.
        if (
          item.type === "spell" &&
          context.zones.getCardZone(item.cardId as CoreCardId) === ("chain" as CoreZoneId)
        ) {
          context.zones.moveCard({
            cardId: item.cardId as CoreCardId,
            targetZoneId: (item.resolveTo ?? "trash") as CoreZoneId,
          });
        }
        if (draft.interaction) {
          draft.interaction = removeChainItem(draft.interaction, item.id);
        }
        break;
      }
    }
  },
};
