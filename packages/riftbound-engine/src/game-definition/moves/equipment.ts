/**
 * Riftbound Equipment Moves
 *
 * Moves for equipping and unequipping equipment cards to/from units.
 * Equipment grants a Might bonus while attached.
 */

import type {
  CardId as CoreCardId,
  GameMoveDefinitions,
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
} from "@tcg/core";
import type {
  GrantedKeyword,
  RiftboundCardMeta,
  RiftboundGameState,
  RiftboundMoves,
} from "../../types";
import { dispatchEvent } from "../../events/dispatcher";
import { getGlobalCardRegistry } from "../../operations/card-lookup";
import { getBattlefieldZoneId } from "../../zones/zone-configs";
import { deductAbilityCost } from "./chain/activate-ability";
import { canPayEquipCost, printedEquipCost } from "./equip-cost";

/**
 * Check whether a unit has the given keyword, considering both its printed
 * Card definition and any runtime-granted keywords on its meta.
 */
function unitHasKeyword(
  cardId: string,
  keyword: string,
  meta: Partial<RiftboundCardMeta> | undefined,
): boolean {
  const registry = getGlobalCardRegistry();
  if (registry.hasKeyword(cardId, keyword)) {
    return true;
  }
  const granted = meta?.grantedKeywords as GrantedKeyword[] | undefined;
  if (granted?.some((gk) => gk.keyword === keyword)) {
    return true;
  }
  return false;
}

/**
 * rule 476.1: only an Equipment can be attached to a unit. Hand-authored defs
 * spell the Equipment type as `cardType: "equipment"`; set-JSON cards keep the
 * printed type "gear" for every non-unit permanent, so a "gear" card counts as
 * an Equipment only when it prints an [Equip] ability. A plain Gear such as
 * Petricite Monument (sfd-104-221) therefore can never be attached.
 */
function isAttachable(cardId: string, cardType: string): boolean {
  if (cardType === "equipment") {
    return true;
  }
  if (cardType !== "gear") {
    return false;
  }
  return printedEquipCost(cardId) !== undefined;
}

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
    // rule 476.1: [Equip] is a player-facing action — an Equipment already on
    // the board can be attached to a unit you control. Without an enumerator
    // the core rule engine treats the move as an invalid NO_ENUMERATOR
    // placeholder, so no UI/menu surface ever offers it.
    // The printed Equip cost is not charged on this path yet.
    enumerator: (state, context) => {
      if (state.pendingChoice || state.status !== "playing") {
        return [];
      }
      const playerId = context.playerId as string;
      if (state.turn.activePlayer !== playerId) {
        return [];
      }

      const registry = getGlobalCardRegistry();
      const zoneIds = [
        "base",
        ...Object.keys(state.battlefields ?? {}).map(getBattlefieldZoneId),
      ];
      const onBoard: string[] = [];
      for (const pid of Object.keys(state.players)) {
        for (const zoneId of zoneIds) {
          for (const id of context.zones.getCardsInZone(
            zoneId as CoreZoneId,
            pid as CorePlayerId,
          )) {
            onBoard.push(id as string);
          }
        }
      }

      const controllerOf = (id: string) =>
        (context.cards.getCardController?.(id as CoreCardId) ??
          context.cards.getCardOwner(id as CoreCardId)) as string | undefined;

      const equipment = onBoard.filter((id) => {
        const def = registry.get(id);
        if (!def || (def.cardType !== "equipment" && def.cardType !== "gear")) {
          return false;
        }
        if (controllerOf(id) !== playerId) {
          return false;
        }
        const meta = context.cards.getCardMeta(id as CoreCardId) as
          | Partial<RiftboundCardMeta>
          | undefined;
        if (meta?.attachedTo) {
          return false;
        }
        // rule 476.1: attaching happens only through a printed [Equip] ability.
        // A card typed "gear" without [Equip] (Petricite Monument) is not an
        // Equipment and can never be attached.
        if (!isAttachable(id, def.cardType)) {
          return false;
        }
        // rule 476.1: [Equip] is an activated ability with a cost — it can only
        // be used when its printed cost is payable right now.
        const cost = printedEquipCost(id);
        return !cost || canPayEquipCost(state, playerId, cost);
      });
      if (equipment.length === 0) {
        return [];
      }

      const units = onBoard.filter((id) => {
        if (registry.get(id)?.cardType !== "unit") {
          return false;
        }
        if (controllerOf(id) !== playerId) {
          return false;
        }
        // rule 579 (Weaponmaster): only a Weaponmaster may hold a second piece.
        const meta = context.cards.getCardMeta(id as CoreCardId) as
          | Partial<RiftboundCardMeta>
          | undefined;
        const equipped = meta?.equippedWith ?? [];
        return equipped.length === 0 || unitHasKeyword(id, "Weaponmaster", meta);
      });

      const results: { playerId: string; equipmentId: string; unitId: string }[] = [];
      for (const equipmentId of equipment) {
        for (const unitId of units) {
          results.push({ equipmentId, playerId, unitId });
        }
      }
      return results;
    },
    condition: (state, context) => {
      if (state.status !== "playing") {
        return false;
      }
      if (state.turn.activePlayer !== context.params.playerId) {
        return false;
      }

      const registry = getGlobalCardRegistry();
      const equipDef = registry.get(context.params.equipmentId);
      // "Gear" is the printed type; the hand-authored .ts defs spell it
      // "equipment" while set-JSON cards (VEN) keep "gear". Both are the same
      // card type for rule 434 (attach), so accept either spelling.
      if (!equipDef || (equipDef.cardType !== "equipment" && equipDef.cardType !== "gear")) {
        return false;
      }
      if (!isAttachable(context.params.equipmentId, equipDef.cardType)) {
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

      // Rule 579 (Weaponmaster): a unit may only hold more than one piece
      // Of equipment if it has the Weaponmaster keyword. Without it, any
      // Additional attach must be rejected.
      const unitMeta = context.cards.getCardMeta(context.params.unitId as CoreCardId) as
        | Partial<RiftboundCardMeta>
        | undefined;
      const currentlyEquipped = unitMeta?.equippedWith ?? [];
      if (
        currentlyEquipped.length > 0 &&
        !unitHasKeyword(context.params.unitId, "Weaponmaster", unitMeta)
      ) {
        return false;
      }

      // rule 476.1: the printed [Equip] cost must be payable.
      const equipCost = printedEquipCost(context.params.equipmentId);
      if (equipCost && !canPayEquipCost(state, context.params.playerId, equipCost)) {
        return false;
      }

      return true;
    },
    reducer: (draft, context) => {
      const { equipmentId, unitId, playerId } = context.params;

      // rule 476.1: pay the printed [Equip] cost.
      const equipCost = printedEquipCost(equipmentId);
      if (equipCost) {
        deductAbilityCost(
          draft,
          playerId,
          { energy: equipCost.energy, power: [...equipCost.power] },
          context.zones,
          context.counters,
        );
      }

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

      // rule-id: sfd-049-221-attach-equipment-fires-once
      // Rule 383.2.c / 401.1: fire the attach-equipment event so "When you
      // Attach an Equipment to me" triggers (Aphelios, Jax) reach the chain.
      // `cardId` is the receiving unit so `on: "self"` matches the holder;
      // `copyAttachedUnitText` replacement effects (Svellsongur) do not add
      // A second attachment event, so this fires exactly once per attach.
      // rule 522: attaching changes the holder's Might, so the event goes
      // through the dispatcher (which re-runs static recalc + SBA) rather than
      // `fireTriggers` alone — otherwise "Each Equipment attached to me gives
      // double its base Might bonus" (sfd-068-221) stays unapplied until some
      // unrelated later move happens to trigger a recalc.
      dispatchEvent(
        {
          cards: context.cards,
          counters: context.counters,
          draft,
          zones: context.zones,
        },
        { cardId: unitId, equipmentId, playerId, type: "attach-equipment" },
      );

      // rule 477.1.b (ven-137-166 Shady Spectacles): "As this is attached to a
      // unit, choose another friendly unit. The equipped unit becomes a copy of
      // that unit for as long as this is attached to it." rule 401.1/401.2: the
      // attach trigger above is created BEFORE the copy, so a unit that only
      // becomes a copy now does not trigger off this attachment.
      if (equipDef?.copyChosenUnitToHolder) {
        const zoneIds = ["base", ...Object.keys(draft.battlefields ?? {}).map(getBattlefieldZoneId)];
        const candidates: string[] = [];
        for (const zoneId of zoneIds) {
          for (const id of context.zones.getCardsInZone(
            zoneId as CoreZoneId,
            playerId as CorePlayerId,
          )) {
            if (id !== unitId && registry.get(id as string)?.cardType === "unit") {
              candidates.push(id as string);
            }
          }
        }
        // With more than one legal choice the controller would be prompted; the
        // rule 355.5: the controller chooses. A sole legal candidate is
        // auto-bound (as resolution-time target choices are); two or more
        // prompt the controller.
        if (candidates.length === 1 && candidates[0] !== undefined) {
          registry.becomeCopyOf(unitId, candidates[0]);
        } else if (candidates.length > 1 && !draft.pendingChoice) {
          draft.pendingChoice = {
            effect: { holderId: unitId, type: "become-copy" },
            options: candidates as never,
            playerId: playerId as never,
            remaining: 1,
            sourceCardId: equipmentId as never,
            type: "choose-target",
          };
        }
      }
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

      // rule 477.1.b: the Shady Spectacles copy lasts only while attached.
      if (unitId) {
        getGlobalCardRegistry().revertCopy(unitId);
      }

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
