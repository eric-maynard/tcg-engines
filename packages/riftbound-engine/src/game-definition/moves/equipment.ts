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
import { addToChain } from "../../chain";
import { createInteractionState, getTurnState } from "../../chain/chain-state";
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
 * rule 151.2: the activated ability of a gear (here [Equip]) may only be used
 * in a Neutral State — never while a Showdown is open, even by the Focus holder
 * on their own turn.
 */
function equipTimingAllowed(state: RiftboundGameState): boolean {
  const turnState = getTurnState(state.interaction ?? createInteractionState());
  return turnState === "neutral-open" || turnState === "neutral-closed";
}

/**
 * rule 377.3: [Equip] activations sitting on the chain have not attached yet;
 * count the ones already aimed at `unitId` so a second activation on the same
 * holder can be judged against rule 579.
 */
function pendingEquipCount(state: RiftboundGameState, unitId: string): number {
  const items = state.interaction?.chain?.items ?? [];
  return items.filter((item) => {
    const effect = (item as { effect?: { type?: string; unitId?: string } }).effect;
    return effect?.type === "equip-attach" && effect.unitId === unitId;
  }).length;
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
      // rule 151.2: not while a Showdown is open.
      if (!equipTimingAllowed(state)) {
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
        return !cost || canPayEquipCost(state, playerId, cost, 0, context.zones);
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
      // rule 151.2: not while a Showdown is open.
      if (!equipTimingAllowed(state)) {
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
      // An [Equip] already on the chain has not attached yet (377.3), but its
      // holder is spoken for: a non-Weaponmaster unit can never end up with two
      // Equipment, so the second activation is illegal rather than a fizzle.
      const pendingEquips = pendingEquipCount(state, context.params.unitId);
      if (
        currentlyEquipped.length + pendingEquips > 0 &&
        !unitHasKeyword(context.params.unitId, "Weaponmaster", unitMeta)
      ) {
        return false;
      }

      // rule 476.1: the printed [Equip] cost must be payable.
      const equipCost = printedEquipCost(context.params.equipmentId);
      if (equipCost && !canPayEquipCost(state, context.params.playerId, equipCost, 0, context.zones)) {
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

      // rule 377.3 / 818.1.c.1: [Equip] is an ACTIVATED ability — activating it
      // pays the cost and puts an ability item on the chain; the attach happens
      // only when that item resolves, after every player has had priority. The
      // resolution half lives in the "equip-attach" effect handler.
      const interaction = draft.interaction ?? createInteractionState();
      draft.interaction = addToChain(
        interaction,
        {
          cardId: equipmentId,
          controller: playerId,
          effect: { type: "equip-attach", unitId },
          type: "ability",
        },
        Object.keys(draft.players),
      );

      // rule-id: sfd-075-221 — rule 151 / 206.1: [Equip] is an activated
      // ability of a gear (Equipment is a kind of gear), so "when you use an
      // activated ability of a gear" sees it. It fires as the ability is
      // activated; firing it after the item is on the chain puts the trigger
      // above the [Equip] ability so it resolves first (rule 206.1).
      dispatchEvent(
        {
          cards: context.cards,
          counters: context.counters,
          draft,
          zones: context.zones,
        },
        {
          cardId: equipmentId,
          playerId,
          sourceType: "gear",
          type: "use-activated-ability",
        },
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
