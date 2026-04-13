/**
 * Riftbound Sandbox Card-Action Moves
 *
 * Moves surfaced through the W10 sandbox action panel: duplicate a
 * card into any zone, attach a free-form label, and transfer control
 * of a card to another player. All three are metadata/structural
 * mutations that bypass regular rules validation and are intended to
 * be gated behind a Sandbox Mode flag in the UI.
 */

import type {
  CardId as CoreCardId,
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
  GameMoveDefinitions,
} from "@tcg/core";
import { getGlobalCardRegistry } from "../../operations/card-lookup";
import type { RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "../../types";

/**
 * Monotonic counter appended to minted duplicate IDs to guarantee
 * uniqueness within a single process.
 */
let duplicateIdCounter = 0;
export function resetDuplicateIdCounter(): void {
  duplicateIdCounter = 0;
}

/**
 * Generate a unique synthetic card ID for a duplicated card instance.
 */
function makeDuplicateId(originalId: string): string {
  duplicateIdCounter += 1;
  return `dup-${originalId}-${duplicateIdCounter}`;
}

/**
 * Sandbox card-action move definitions.
 */
export const cardActionMoves: Partial<
  GameMoveDefinitions<RiftboundGameState, RiftboundMoves, RiftboundCardMeta, unknown>
> = {
  duplicateCard: {
    reducer: (_draft, context) => {
      const { playerId, cardId, destinationZone } = context.params;

      // Look up the source card's internal instance to copy its
      // Definition reference. Fall back to using the source cardId as
      // The definitionId if it's a synthetic token (tokens already use
      // Their ID as the registry key).
      const registry = getGlobalCardRegistry();
      const sourceDef = registry.get(cardId as string);
      if (!sourceDef) {
        return;
      }

      const zones = context.zones as unknown as {
        createCardInZone?: (params: {
          cardId: CoreCardId;
          definitionId: string;
          zoneId: CoreZoneId;
          ownerId: CorePlayerId;
          controllerId?: CorePlayerId;
          position?: "top" | "bottom" | number;
        }) => void;
      };
      const {createCardInZone} = zones;
      if (typeof createCardInZone !== "function") {
        return;
      }

      const newId = makeDuplicateId(cardId as string) as CoreCardId;
      createCardInZone({
        cardId: newId,
        controllerId: playerId as CorePlayerId,
        definitionId: sourceDef.id,
        ownerId: playerId as CorePlayerId,
        zoneId: destinationZone as CoreZoneId,
      });

      // Register the new instance in the card registry under its
      // Instance ID so downstream lookups (abilities, effects) resolve
      // The same static data as the original.
      registry.register(newId as string, sourceDef);
    },
  },

  labelCard: {
    reducer: (_draft, context) => {
      const { cardId, label } = context.params;
      context.cards.updateCardMeta(cardId as CoreCardId, {
        label,
      } as Partial<RiftboundCardMeta>);
    },
  },

  transferControl: {
    reducer: (_draft, context) => {
      const { cardId, newControllerId } = context.params;
      const cards = context.cards as unknown as {
        setCardController?: (cardId: CoreCardId, controllerId: CorePlayerId) => void;
      };
      if (typeof cards.setCardController === "function") {
        cards.setCardController(cardId as CoreCardId, newControllerId as CorePlayerId);
      }
    },
  },
};
