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
  RiftboundCardMeta,
  RiftboundGameState,
  RiftboundMoves,
} from "../../types";
import { addToChain } from "../../chain";
import { createInteractionState, getTurnState } from "../../chain/chain-state";
import { dispatchEvent } from "../../events/dispatcher";
import { recalculateStaticEffects } from "../../abilities/static-abilities";
import { getGlobalCardRegistry } from "../../operations/card-lookup";
import { getBattlefieldZoneId } from "../../zones/zone-configs";
import { removeFromBoard } from "../../operations/leave-board";
import { survivesOwnDeath } from "../../abilities/die-replacement-batch";
import { deductAbilityCost } from "./chain/activate-ability";
import { buildEffectContext } from "./chain/effect-context";
import { canPayEquipCost, equipCostForTarget, printedEquipCost } from "./equip-cost";

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
 * "during the controlling player's Main Phase during an Open State, and not
 * during a Showdown" — i.e. standard speed. A Closed State (any chain item
 * waiting to resolve) and every Showdown state are both illegal, so [Equip] is
 * gated exactly like playing a unit or gear.
 */
function equipTimingAllowed(state: RiftboundGameState): boolean {
  if (state.turn.phase !== "main") {
    return false;
  }
  const turnState = getTurnState(state.interaction ?? createInteractionState());
  return turnState === "neutral-open";
}

/**
 * rule 818.1.c.3 (sfd-178-221 Blade of the Ruined King) — the units that can pay
 * an Equip cost's "Kill a friendly unit" half: units this player controls, on
 * board, other than the one being equipped (rule 358.1 — the holder cannot also
 * be the fodder, since sacrificing it would undo the activation).
 */
function equipSacrificeOptions(
  boardUnits: readonly { id: string; controller: string | undefined }[],
  playerId: string,
  holderUnitId: string,
  holderSurvivesOwnDeath = false,
): string[] {
  return boardUnits
    .filter(
      (u) =>
        u.controller === playerId &&
        // rule 372 / 373 (ogn-077-298 Zhonya's Hourglass, sfd-051-221 Guardian Angel) — the
        // holder MAY be its own fodder when a die replacement removes something ELSE
        // instead: the unit never leaves the board, so it is still a legal target at
        // 358.1's final check and the Equipment attaches as planned.
        (u.id !== holderUnitId || holderSurvivesOwnDeath),
    )
    .map((u) => u.id);
}

/** The context slice {@link survivesOwnDeath} reads, assembled from a move's state + context. */
function deathShieldCtx(
  state: RiftboundGameState,
  context: { cards: unknown; zones: unknown },
): Parameters<typeof survivesOwnDeath>[0] {
  return {
    cards: context.cards,
    draft: state,
    zones: context.zones,
  } as unknown as Parameters<typeof survivesOwnDeath>[0];
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
        // rule 476.1: [Equip] is an activated ability with a cost. Payability
        // is checked per target below (821.1.c.2: the cost can depend on the
        // chosen unit's Might), so here only the target-independent parts.
        return true;
      });
      if (equipment.length === 0) {
        return [];
      }

      const units = onBoard.filter((id) => {
        if (registry.get(id)?.cardType !== "unit") {
          return false;
        }
        // rule 434.1.b.1 / 818.3.b: a Top-Most card may hold "one or more"
        // Equipment — nothing limits a unit to a single piece, and 821
        // (Weaponmaster) only grants a discounted on-play Equip.
        return controllerOf(id) === playerId;
      });

      const getMeta = (id: CoreCardId) =>
        context.cards.getCardMeta(id) as Partial<RiftboundCardMeta> | undefined;

      const unitsWithController = units.map((id) => ({ controller: controllerOf(id), id }));

      const results: {
        playerId: string;
        equipmentId: string;
        unitId: string;
        sacrificeId?: string;
      }[] = [];
      for (const equipmentId of equipment) {
        for (const unitId of units) {
          // rule 821.1.c.2 / 356.6: the Equip cost is computed for THIS target —
          // a Might-based reduction makes affordability differ per unit.
          const cost = equipCostForTarget(equipmentId, unitId, getMeta);
          if (cost && !canPayEquipCost(state, playerId, cost, 0, context.zones)) {
            continue;
          }
          // rule 818.1.c.3 / 358.1 (sfd-178-221): the kill half of the Equip
          // cost needs a friendly unit that is not the one being equipped —
          // with none, the ability cannot be activated at all.
          if (cost?.killFriendlyUnit) {
            const fodder = equipSacrificeOptions(
              unitsWithController,
              playerId,
              unitId,
              survivesOwnDeath(deathShieldCtx(state, context), unitId),
            );
            for (const sacrificeId of fodder) {
              results.push({ equipmentId, playerId, sacrificeId, unitId });
            }
            continue;
          }
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

      // rule 818.1.c.2 / 740.1.a: "a unit you control" is CONTROL, not
      // ownership — a borrowed unit (owned by the opponent but controlled by
      // the activating player) is a legal holder, and a unit you own but no
      // longer control is not. Same reader as the enumerator.
      const controllerOfCard = (id: string) =>
        (context.cards.getCardController?.(id as CoreCardId) ??
          context.cards.getCardOwner(id as CoreCardId)) as string | undefined;
      if (controllerOfCard(context.params.equipmentId) !== context.params.playerId) {
        return false;
      }
      if (controllerOfCard(context.params.unitId) !== context.params.playerId) {
        return false;
      }

      // Equipment must not already be attached
      const meta = context.cards.getCardMeta(context.params.equipmentId as CoreCardId) as
        | Partial<RiftboundCardMeta>
        | undefined;
      if (meta?.attachedTo) {
        return false;
      }

      // rule 434.1.b.1 / 818.3.b: a Top-Most card may have "one or more"
      // Equipment attached; no rule caps a unit at one. 821 (Weaponmaster)
      // only grants a discounted on-play Equip, not a second-slot permission.

      // rule 476.1: the printed [Equip] cost must be payable.
      const equipCost = equipCostForTarget(
        context.params.equipmentId,
        context.params.unitId,
        (id) => context.cards.getCardMeta(id) as Partial<RiftboundCardMeta> | undefined,
      );
      if (equipCost && !canPayEquipCost(state, context.params.playerId, equipCost, 0, context.zones)) {
        return false;
      }

      // rule 818.1.c.3 / 358.1 (sfd-178-221) — "Kill a friendly unit" is part
      // of the cost: a legal, named victim you control other than the holder
      // must be supplied, or the Equip cannot be activated.
      if (equipCost?.killFriendlyUnit) {
        const sacrificeId = context.params.sacrificeId as string | undefined;
        if (!sacrificeId) {
          return false;
        }
        // rule 372 / 373 — naming the holder itself is legal only when its death is
        // replaced (Zhonya's Hourglass / Guardian Angel dies instead and the unit is
        // healed, exhausted and recalled), so the target survives the payment.
        if (
          sacrificeId === context.params.unitId &&
          !survivesOwnDeath(deathShieldCtx(state, context), sacrificeId)
        ) {
          return false;
        }
        if (getGlobalCardRegistry().get(sacrificeId)?.cardType !== "unit") {
          return false;
        }
        const sacZone = context.zones.getCardZone(sacrificeId as CoreCardId);
        if (!sacZone || !onBoard(sacZone)) {
          return false;
        }
        const sacController =
          context.cards.getCardController?.(sacrificeId as CoreCardId) ??
          context.cards.getCardOwner(sacrificeId as CoreCardId);
        if (sacController !== context.params.playerId) {
          return false;
        }
      }

      return true;
    },
    reducer: (draft, context) => {
      const { equipmentId, unitId, playerId } = context.params;

      // rule 476.1 / 821.1.c.2: pay the [Equip] cost, reduced for this target.
      const equipCost = equipCostForTarget(
        equipmentId,
        unitId,
        (id) => context.cards.getCardMeta(id) as Partial<RiftboundCardMeta> | undefined,
      );
      if (equipCost) {
        deductAbilityCost(
          draft,
          playerId,
          // rule 818.1.c.3 / 730.2 (unl-158-219) — the XP half leaves on
          // activation alongside the pips, before anyone may respond.
          { energy: equipCost.energy, power: [...equipCost.power], xp: equipCost.xp },
          context.zones,
          context.counters,
        );
      }

      // rule 476.1 / 818.1.c.3 (sfd-150-221 Last Rites) — the non-resource half
      // "Recycle N cards from your trash" is paid NOW, as the ability is
      // activated (377.3 / 357): the payer chooses which N leave the trash
      // (416.6) before anyone may respond, and nothing is refunded if the
      // attach later fizzles. Same prompt shape as the Weaponmaster on-play
      // Equip so the two payment paths cannot drift.
      const recycleCount = equipCost?.recycleFromTrash;
      if (recycleCount !== undefined && recycleCount > 0 && !draft.pendingChoice) {
        const trash = context.zones
          .getCardsInZone("trash" as CoreZoneId, playerId as CorePlayerId)
          .map((id) => id as string);
        draft.pendingChoice = {
          onPicked: "recycle",
          prompter: playerId,
          remaining: recycleCount,
          revealed: trash,
          revealer: playerId,
          type: "reveal-and-pick",
        } as RiftboundGameState["pendingChoice"];
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

      // rule 818.1.c.3 / 355.10.c (sfd-178-221) — the kill half is paid NOW,
      // as the ability is activated: it cannot be responded to and is never
      // refunded if the attach later fizzles. rule 428.1.a.1 — a cost kill is
      // an Active Kill, so a token ceases to exist (186.1) and `die` fires.
      // rule 428.1.a.1.b / 808.1.d.2 / 818.1.c.1 — the kill is resolved after
      // `addToChain` so a Deathknell it triggers becomes a Pending item ABOVE
      // the [Equip] ability and therefore resolves first (340.1 LIFO).
      const sacrificeId = context.params.sacrificeId as string | undefined;
      if (equipCost?.killFriendlyUnit && sacrificeId) {
        const costCtx = buildEffectContext(draft, playerId, equipmentId, context);
        removeFromBoard(
          costCtx,
          [sacrificeId],
          "trash",
          { by: playerId as string, kind: "cost", source: equipmentId as string, sourceKind: "ability" },
          costCtx.fireTriggers,
        );
      }

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

      // rule 818.1.b.1 / 383.4.b (rule-id: sfd-195-221) — the unit an [Equip]
      // names is a TARGET, so activating it is "choosing" that unit: a
      // Targeting Effect trigger ("when you choose a friendly unit") sees it,
      // exactly as a spell's or another activated ability's target does. Fired
      // after `addToChain` so the trigger sits above the [Equip] item.
      dispatchEvent(
        {
          cards: context.cards,
          counters: context.counters,
          draft,
          zones: context.zones,
        },
        {
          cardId: unitId,
          chooserId: playerId,
          sourceCardId: equipmentId,
          sourceType: "ability",
          type: "choose",
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
    reducer: (draft, context) => {
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

      // rule 364.3: the statics the gear conferred end the instant the link does.
      recalculateStaticEffects({
        cards: context.cards,
        draft,
        zones: context.zones,
      } as unknown as Parameters<typeof recalculateStaticEffects>[0]);
    },
  },
};
