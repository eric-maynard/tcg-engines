/**
 * contestBattlefield move (split from combat.ts).
 */

import type { ZoneId as CoreZoneId, GameMoveDefinitions } from "@tcg/core";
import { createInteractionState, getTurnState } from "../../../chain";
import type { RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "../../../types";

type Defs = GameMoveDefinitions<RiftboundGameState, RiftboundMoves, RiftboundCardMeta, unknown>;

/**
 * Contest Battlefield
 *
 * Mark a battlefield as contested when opposing units arrive.
 * Combat occurs when a Cleanup happens with opposing units at a Battlefield.
 */
export const contestBattlefield: Defs["contestBattlefield"] = {
  condition: (state, context) => {
    if (state.pendingChoice) {
      return false;
    }
    if (state.status !== "playing") {
      return false;
    }
    if (state.turn.activePlayer !== context.params.playerId) {
      return false;
    }
    // Rule 140.1.b/c + 516.2.b: Contest is a Discretionary Action,
    // legal only in a Neutral Open state (no chain, no showdown).
    const interaction = state.interaction ?? createInteractionState();
    if (getTurnState(interaction) !== "neutral-open") {
      return false;
    }

    const bf = state.battlefields[context.params.battlefieldId];
    if (!bf) {
      return false;
    }
    if (bf.contested) {
      return false;
    }

    // Check that both players have units at this battlefield
    const bfZoneId = `battlefield-${context.params.battlefieldId}` as CoreZoneId;
    const allCards = context.zones.getCardsInZone(bfZoneId);
    let hasPlayerUnit = false;
    let hasOpponentUnit = false;
    for (const cardId of allCards) {
      const owner = context.cards.getCardOwner(cardId);
      if ((owner as string) === context.params.playerId) {
        hasPlayerUnit = true;
      } else {
        hasOpponentUnit = true;
      }
    }

    return hasPlayerUnit && hasOpponentUnit;
  },
  enumerator: (state, context) => {
    if (state.pendingChoice) {
      return [];
    }
    if (state.status !== "playing") {
      return [];
    }
    if (state.turn.activePlayer !== (context.playerId as string)) {
      return [];
    }
    const interaction = state.interaction ?? createInteractionState();
    if (getTurnState(interaction) !== "neutral-open") {
      return [];
    }

    const results: { playerId: string; battlefieldId: string }[] = [];

    for (const [bfId, bf] of Object.entries(state.battlefields || {})) {
      if (bf.contested) {
        continue;
      }

      const bfZoneId = `battlefield-${bfId}` as CoreZoneId;
      const allCards = context.zones.getCardsInZone(bfZoneId);
      let hasPlayerUnit = false;
      let hasOpponentUnit = false;
      for (const cardId of allCards) {
        const owner = context.cards.getCardOwner(cardId);
        if ((owner as string) === (context.playerId as string)) {
          hasPlayerUnit = true;
        } else {
          hasOpponentUnit = true;
        }
      }

      if (hasPlayerUnit && hasOpponentUnit) {
        results.push({
          battlefieldId: bfId,
          playerId: context.playerId as string,
        });
      }
    }
    return results;
  },
  reducer: (draft, context) => {
    const { playerId, battlefieldId } = context.params;

    const battlefield = draft.battlefields[battlefieldId];
    if (battlefield) {
      battlefield.contested = true;
      battlefield.contestedBy = playerId;
      battlefield.showdownComplete = false;
    }
  },
};
