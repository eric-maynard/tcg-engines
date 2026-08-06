/**
 * gankingMove move (split from movement.ts).
 */

import type { CardId as CoreCardId, ZoneId as CoreZoneId, GameMoveDefinitions } from "@tcg/core";
import { createInteractionState, startShowdown as startShowdownState } from "../../../chain";
import type { RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "../../../types";
import { fireTriggers } from "../../../abilities/trigger-runner";
import { hasKeyword } from "./helpers";

type Defs = GameMoveDefinitions<RiftboundGameState, RiftboundMoves, RiftboundCardMeta, unknown>;

/**
 * Ganking Move
 *
 * Move a unit from one Battlefield to another.
 * Requires the Ganking keyword.
 * The unit is exhausted as part of the move.
 */
export const gankingMove: Defs["gankingMove"] = {
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
    if (state.pendingChoice) {
      return [];
    }
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
  reducer: (draft, context) => {
    const { unitId, toBattlefield } = context.params;
    const { zones, counters } = context;

    // Capture source zone before moving so the fired move event
    // Reports accurate from/to locations.
    const fromZone =
      (context.zones.getCardZone(unitId as CoreCardId) as string | undefined) ?? "";
    const toZone = `battlefield-${toBattlefield}`;

    // Exhaust the unit
    counters.setFlag(unitId as CoreCardId, "exhausted", true);

    // Move unit to the target battlefield
    zones.moveCard({
      cardId: unitId as CoreCardId,
      targetZoneId: toZone as CoreZoneId,
    });

    // Fire "move" game event for triggered abilities that react to
    // Battlefield-to-battlefield Ganking moves.
    // rule-id: unl-133-219 — carry mover/owner so actor-scoped triggers match.
    fireTriggers(
      {
        cardId: unitId,
        from: fromZone,
        movedBy: context.params.playerId as string,
        owner: context.params.playerId as string,
        to: toZone,
        type: "move",
      },
      { cards: context.cards, counters, draft, zones },
    );

    // Rule 450 / 548.2 (unl-022-219): a Ganking move arriving at a
    // battlefield the mover does not control applies Contested and opens
    // a Showdown, exactly as a Standard Move does.
    const playerId = context.params.playerId as string;
    const bf = draft.battlefields?.[toBattlefield];
    if (bf && bf.controller !== playerId) {
      const allUnits = zones.getCardsInZone(toZone as CoreZoneId);
      const hasOpponentUnit = allUnits.some((cardId) => {
        const owner = context.cards.getCardOwner(cardId);
        return owner !== undefined && (owner as string) !== playerId;
      });

      if (!bf.contested) {
        bf.contested = true;
        bf.contestedBy = playerId;
        bf.showdownComplete = false;
      }

      const playerIds = Object.keys(draft.players);
      const defender = bf.controller ?? playerIds.find((p) => p !== playerId) ?? playerId;
      const interaction = draft.interaction ?? createInteractionState();
      draft.interaction = startShowdownState(
        interaction,
        toBattlefield,
        playerId,
        hasOpponentUnit ? [...new Set([playerId, defender])] : playerIds,
        hasOpponentUnit,
        playerId,
        defender,
      );

      // Rule 625.1.c.1 / 625.1.c.2: combat showdown assigns roles and fires
      // attack/defend triggers.
      if (hasOpponentUnit) {
        const triggerCtx = { cards: context.cards, counters, draft, zones };
        context.cards.updateCardMeta(
          unitId as CoreCardId,
          { combatRole: "attacker" } as Partial<RiftboundCardMeta>,
        );
        fireTriggers({ battlefieldId: toBattlefield, cardId: unitId, type: "attack" }, triggerCtx);
        for (const cardId of allUnits) {
          const owner = context.cards.getCardOwner(cardId);
          if (owner !== undefined && (owner as string) !== playerId) {
            context.cards.updateCardMeta(
              cardId,
              { combatRole: "defender" } as Partial<RiftboundCardMeta>,
            );
            fireTriggers(
              { battlefieldId: toBattlefield, cardId: cardId as string, type: "defend" },
              triggerCtx,
            );
          }
        }
      }
    }
  },
};
