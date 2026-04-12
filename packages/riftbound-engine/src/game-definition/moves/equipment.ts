/**
 * Riftbound Equipment Moves
 *
 * Moves for equipping and unequipping equipment cards to/from units.
 * Equipment grants a Might bonus while attached.
 */

import type { CardId as CoreCardId, GameMoveDefinitions } from "@tcg/core";
import type { RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "../../types";
import { getGlobalCardRegistry } from "../../operations/card-lookup";

/**
 * Equipment move definitions
 */
export const equipmentMoves: Partial<
  GameMoveDefinitions<RiftboundGameState, RiftboundMoves, RiftboundCardMeta, unknown>
> = {
  /**
   * Attach equipment to a unit.
   *
   * Validates: equipment is on board, unit is on board, same controller,
   * equipment is not already attached to another unit.
   */
  equipCard: {
    condition: (state, context) => {
      if (state.status !== "playing") {
        return false;
      }
      if (state.turn.activePlayer !== context.params.playerId) {
        return false;
      }

      const registry = getGlobalCardRegistry();
      const equipDef = registry.get(context.params.equipmentId);
      if (!equipDef || equipDef.cardType !== "equipment") {
        return false;
      }

      const unitDef = registry.get(context.params.unitId);
      if (!unitDef || unitDef.cardType !== "unit") {
        return false;
      }

      // Both must be on board (base or battlefield)
      const equipZone = context.zones.getCardZone(context.params.equipmentId as CoreCardId);
      const unitZone = context.zones.getCardZone(context.params.unitId as CoreCardId);
      if (!equipZone || !unitZone) {
        return false;
      }
      const onBoard = (zone: string) => zone === "base" || zone.startsWith("battlefield");
      if (!onBoard(equipZone) || !onBoard(unitZone)) {
        return false;
      }

      // Same controller
      const equipOwner = context.cards.getCardOwner(context.params.equipmentId as CoreCardId);
      const unitOwner = context.cards.getCardOwner(context.params.unitId as CoreCardId);
      if (equipOwner !== unitOwner) {
        return false;
      }

      // Equipment must not already be attached
      const meta = context.cards.getCardMeta(context.params.equipmentId as CoreCardId) as
        | Partial<RiftboundCardMeta>
        | undefined;
      if (meta?.attachedTo) {
        return false;
      }

      return true;
    },
    reducer: (_draft, context) => {
      const { equipmentId, unitId } = context.params;

      // Mark equipment as attached to the unit. Equipment flagged with
      // `copyAttachedUnitText` (Svellsongur) also records `copiedFromCardId`
      // So its activated abilities enumerator exposes the unit's abilities.
      const registry = getGlobalCardRegistry();
      const equipDef = registry.get(equipmentId);
      const meta: Partial<RiftboundCardMeta> = { attachedTo: unitId };
      if (equipDef?.copyAttachedUnitText) {
        meta.copiedFromCardId = unitId;
      }
      context.cards.updateCardMeta(equipmentId as CoreCardId, meta);

      // Add equipment to unit's equippedWith list
      const unitMeta = context.cards.getCardMeta(unitId as CoreCardId) as
        | Partial<RiftboundCardMeta>
        | undefined;
      const currentEquipped = unitMeta?.equippedWith ?? [];
      context.cards.updateCardMeta(
        unitId as CoreCardId,
        { equippedWith: [...currentEquipped, equipmentId] } as Partial<RiftboundCardMeta>,
      );
    },
  },

  /**
   * Detach equipment from a unit and return it to the owner's base.
   *
   * Validates: equipment is attached to a unit.
   */
  unequipCard: {
    condition: (state, context) => {
      if (state.status !== "playing") {
        return false;
      }

      const meta = context.cards.getCardMeta(context.params.equipmentId as CoreCardId) as
        | Partial<RiftboundCardMeta>
        | undefined;
      if (!meta?.attachedTo) {
        return false;
      }

      return true;
    },
    reducer: (_draft, context) => {
      const { equipmentId } = context.params;

      // Get the unit it's attached to
      const equipMeta = context.cards.getCardMeta(equipmentId as CoreCardId) as
        | Partial<RiftboundCardMeta>
        | undefined;
      const unitId = equipMeta?.attachedTo;

      // Clear attachment on equipment. Also clears `copiedFromCardId` so
      // Svellsongur stops exposing the detached unit's abilities.
      context.cards.updateCardMeta(
        equipmentId as CoreCardId,
        {
          attachedTo: undefined,
          copiedFromCardId: undefined,
        } as Partial<RiftboundCardMeta>,
      );

      // Remove from unit's equippedWith list
      if (unitId) {
        const unitMeta = context.cards.getCardMeta(unitId as CoreCardId) as
          | Partial<RiftboundCardMeta>
          | undefined;
        const currentEquipped = unitMeta?.equippedWith ?? [];
        context.cards.updateCardMeta(
          unitId as CoreCardId,
          {
            equippedWith: currentEquipped.filter((id) => id !== equipmentId),
          } as Partial<RiftboundCardMeta>,
        );
      }

      // Move equipment back to base
      context.zones.moveCard({
        cardId: equipmentId as CoreCardId,
        targetZoneId: "base" as import("@tcg/core").ZoneId,
      });
    },
  },
};
