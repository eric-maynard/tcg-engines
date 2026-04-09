/**
 * Riftbound Movement Moves
 *
 * Moves for unit movement: standard move, ganking, and recalls.
 */

import type {
  CardId as CoreCardId,
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
  GameMoveDefinitions,
} from "@tcg/core";
import type { GrantedKeyword, RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "../../types";
import { getGlobalCardRegistry } from "../../operations/card-lookup";

/**
 * Check if a card has a specific keyword, considering both the card
 * definition's keywords and any runtime-granted keywords on its meta.
 */
function hasKeyword(
  cardId: string,
  keyword: string,
  getCardMeta?: (cardId: CoreCardId) => Partial<RiftboundCardMeta> | undefined,
): boolean {
  const registry = getGlobalCardRegistry();
  if (registry.hasKeyword(cardId, keyword)) {
    return true;
  }
  // Check granted keywords from card meta
  if (getCardMeta) {
    const meta = getCardMeta(cardId as CoreCardId);
    const granted = meta?.grantedKeywords as GrantedKeyword[] | undefined;
    if (granted?.some((gk) => gk.keyword === keyword)) {
      return true;
    }
  }
  return false;
}

/**
 * Movement move definitions
 */
export const movementMoves: Partial<
  GameMoveDefinitions<RiftboundGameState, RiftboundMoves, RiftboundCardMeta, unknown>
> = {
  /**
   * Standard Move
   *
   * Exhaust unit(s) to move them to a valid destination.
   * Valid destinations:
   * - Base <-> Battlefield
   * - Battlefield -> Battlefield (requires Ganking keyword)
   *
   * Multiple units can move together to the same destination.
   */
  standardMove: {
    condition: (state, context) => {
      if (state.status !== "playing") {
        return false;
      }
      if (state.turn.activePlayer !== context.params.playerId) {
        return false;
      }
      if (state.turn.phase !== "main") {
        return false;
      }

      const { unitIds } = context.params;
      for (const unitId of unitIds) {
        const zone = context.zones.getCardZone(unitId as CoreCardId);
        if (zone !== "base") {
          return false;
        }

        const owner = context.cards.getCardOwner(unitId as CoreCardId);
        if ((owner as string) !== context.params.playerId) {
          return false;
        }

        if (context.counters.getFlag(unitId as CoreCardId, "exhausted")) {
          return false;
        }
      }

      return true;
    },
    enumerator: (state, context) => {
      if (state.status !== "playing") {
        return [];
      }
      if (state.turn.activePlayer !== (context.playerId as string)) {
        return [];
      }
      if (state.turn.phase !== "main") {
        return [];
      }

      const registry = getGlobalCardRegistry();
      const baseCards = context.zones.getCardsInZone(
        "base" as CoreZoneId,
        context.playerId as CorePlayerId,
      );

      const results: {
        playerId: string;
        unitIds: string[];
        destination: string;
      }[] = [];

      for (const cardId of baseCards) {
        const owner = context.cards.getCardOwner(cardId);
        if ((owner as string) !== (context.playerId as string)) {
          continue;
        }

        const def = registry.get(cardId as string);
        if (def?.cardType !== "unit") {
          continue;
        }

        if (context.counters.getFlag(cardId, "exhausted")) {
          continue;
        }

        for (const bfId of Object.keys(state.battlefields || {})) {
          results.push({
            destination: bfId,
            playerId: context.playerId as string,
            unitIds: [cardId as string],
          });
        }
      }
      return results;
    },
    reducer: (_draft, context) => {
      const { unitIds, destination } = context.params;
      const { zones, counters } = context;

      for (const unitId of unitIds) {
        // Exhaust the unit (cost of moving)
        counters.setFlag(unitId as CoreCardId, "exhausted", true);

        // Move unit to destination battlefield
        zones.moveCard({
          cardId: unitId as CoreCardId,
          targetZoneId: `battlefield-${destination}` as CoreZoneId,
        });
      }
    },
  },

  /**
   * Ganking Move
   *
   * Move a unit from one Battlefield to another.
   * Requires the Ganking keyword.
   * The unit is exhausted as part of the move.
   */
  gankingMove: {
    condition: (state, context) => {
      if (state.status !== "playing") {
        return false;
      }
      if (state.turn.activePlayer !== context.params.playerId) {
        return false;
      }
      if (state.turn.phase !== "main") {
        return false;
      }

      const zone = context.zones.getCardZone(context.params.unitId as CoreCardId);
      if (!zone || !(zone as string).startsWith("battlefield-")) {
        return false;
      }

      const owner = context.cards.getCardOwner(context.params.unitId as CoreCardId);
      if ((owner as string) !== context.params.playerId) {
        return false;
      }

      if (context.counters.getFlag(context.params.unitId as CoreCardId, "exhausted")) {
        return false;
      }

      // Rule 722: Only units with the Ganking keyword can move battlefield-to-battlefield
      const metaAccessor = (id: CoreCardId) =>
        context.cards.getCardMeta(id) as Partial<RiftboundCardMeta> | undefined;
      if (!hasKeyword(context.params.unitId, "Ganking", metaAccessor)) {
        return false;
      }

      return true;
    },
    enumerator: (state, context) => {
      if (state.status !== "playing") {
        return [];
      }
      if (state.turn.activePlayer !== (context.playerId as string)) {
        return [];
      }
      if (state.turn.phase !== "main") {
        return [];
      }

      const results: {
        playerId: string;
        unitId: string;
        toBattlefield: string;
      }[] = [];

      for (const bfId of Object.keys(state.battlefields || {})) {
        const bfZoneId = `battlefield-${bfId}` as CoreZoneId;
        const cardsAtBf = context.zones.getCardsInZone(bfZoneId);

        const metaAccessor = (id: CoreCardId) =>
          context.cards.getCardMeta(id) as Partial<RiftboundCardMeta> | undefined;

        for (const cardId of cardsAtBf) {
          const owner = context.cards.getCardOwner(cardId);
          if ((owner as string) !== (context.playerId as string)) {
            continue;
          }
          if (context.counters.getFlag(cardId, "exhausted")) {
            continue;
          }

          // Rule 722: Only units with the Ganking keyword can move battlefield-to-battlefield
          if (!hasKeyword(cardId as string, "Ganking", metaAccessor)) {
            continue;
          }

          // Can gank to any OTHER battlefield
          for (const otherBfId of Object.keys(state.battlefields || {})) {
            if (otherBfId === bfId) {
              continue;
            }
            results.push({
              playerId: context.playerId as string,
              toBattlefield: otherBfId,
              unitId: cardId as string,
            });
          }
        }
      }
      return results;
    },
    reducer: (_draft, context) => {
      const { unitId, toBattlefield } = context.params;
      const { zones, counters } = context;

      // Exhaust the unit
      counters.setFlag(unitId as CoreCardId, "exhausted", true);

      // Move unit to the target battlefield
      zones.moveCard({
        cardId: unitId as CoreCardId,
        targetZoneId: `battlefield-${toBattlefield}` as CoreZoneId,
      });
    },
  },

  /**
   * Recall Unit
   *
   * Return a unit to its owner's Base.
   * This is NOT a Move (doesn't trigger move abilities).
   * Used for combat resolution when attackers are recalled.
   */
  recallUnit: {
    condition: (state, context) => {
      if (state.status !== "playing") {
        return false;
      }

      const zone = context.zones.getCardZone(context.params.unitId as CoreCardId);
      if (!zone || !(zone as string).startsWith("battlefield-")) {
        return false;
      }

      const owner = context.cards.getCardOwner(context.params.unitId as CoreCardId);
      if ((owner as string) !== context.params.playerId) {
        return false;
      }

      return true;
    },
    enumerator: (state, context) => {
      if (state.status !== "playing") {
        return [];
      }

      const results: { playerId: string; unitId: string }[] = [];

      for (const bfId of Object.keys(state.battlefields || {})) {
        const bfZoneId = `battlefield-${bfId}` as CoreZoneId;
        const cardsAtBf = context.zones.getCardsInZone(bfZoneId);

        for (const cardId of cardsAtBf) {
          const owner = context.cards.getCardOwner(cardId);
          if ((owner as string) !== (context.playerId as string)) {
            continue;
          }
          results.push({
            playerId: context.playerId as string,
            unitId: cardId as string,
          });
        }
      }
      return results;
    },
    reducer: (_draft, context) => {
      const { unitId } = context.params;
      const { zones } = context;

      // Move unit back to base
      // Note: This uses moveCard but represents a Recall, not a Move
      zones.moveCard({
        cardId: unitId as CoreCardId,
        targetZoneId: "base" as CoreZoneId,
      });
    },
  },

  /**
   * Recall Gear
   *
   * Return gear to its owner's Base.
   * Gear at a Battlefield is Recalled to Base during Cleanup.
   */
  recallGear: {
    reducer: (_draft, context) => {
      const { gearId } = context.params;
      const { zones } = context;

      // Move gear back to base
      zones.moveCard({
        cardId: gearId as CoreCardId,
        targetZoneId: "base" as CoreZoneId,
      });
    },
  },
};
