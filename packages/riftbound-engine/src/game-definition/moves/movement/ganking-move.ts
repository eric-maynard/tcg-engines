/**
 * gankingMove move (split from movement.ts).
 */

import type { CardId as CoreCardId, ZoneId as CoreZoneId, GameMoveDefinitions } from "@tcg/core";
import { createInteractionState, getTurnState } from "../../../chain";
import type { RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "../../../types";
import { fireTriggers } from "../../../abilities/trigger-runner";
import {
  type ArrivalIO,
  beginShowdownAt,
  noteArrival,
} from "../../../operations/arrive-at-battlefield";
import { hasKeyword, relocateAttachedEquipment } from "./helpers";

type Defs = GameMoveDefinitions<RiftboundGameState, RiftboundMoves, RiftboundCardMeta, unknown>;

/**
 * rule 127.1 / 350.1 — a unit is moved by its CURRENT controller, not its
 * owner: a stolen unit ganks for its new controller and no longer for the
 * player who owns the card. Mirrors `controllerOf` in standard-move.ts.
 */
function controllerOf(
  cards: {
    getCardOwner: (cardId: CoreCardId) => unknown;
    getCardController?: (cardId: CoreCardId) => string | undefined;
  },
  cardId: CoreCardId,
): string | undefined {
  return cards.getCardController?.(cardId) ?? (cards.getCardOwner(cardId) as string | undefined);
}

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
    // rule-id: ogn-125-298 — Rule 140.1.b/c + 589.1.a: a Ganking move is a
    // Standard Move (Discretionary Action), legal only in a Neutral Open
    // state (no chain, no showdown).
    const interaction = state.interaction ?? createInteractionState();
    if (getTurnState(interaction) !== "neutral-open") {
      return false;
    }

    const zone = context.zones.getCardZone(context.params.unitId as CoreCardId);
    if (!zone || !(zone as string).startsWith("battlefield-")) {
      return false;
    }

    const controller = controllerOf(context.cards, context.params.unitId as CoreCardId);
    if (controller !== context.params.playerId) {
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
    // rule 350.1 / unl-150-219 (Vex, Apathetic): "they can't move it this turn".
    if (hasKeyword(context.params.unitId, "NoMove", metaAccessor)) {
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
    // rule-id: ogn-125-298 — Neutral Open only (mirrors standardMove).
    if (getTurnState(state.interaction ?? createInteractionState()) !== "neutral-open") {
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
        if (controllerOf(context.cards, cardId) !== (context.playerId as string)) {
          continue;
        }
        if (context.counters.getFlag(cardId, "exhausted")) {
          continue;
        }

        // Rule 722: Only units with the Ganking keyword can move battlefield-to-battlefield
        if (!hasKeyword(cardId as string, "Ganking", metaAccessor)) {
          continue;
        }

        // rule 350.1 / unl-150-219: "can't move it this turn".
        if (hasKeyword(cardId as string, "NoMove", metaAccessor)) {
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

    // rule 434.4 / 152.2 — attached Equipment is located with its holder.
    relocateAttachedEquipment(unitId as string, toZone, context.cards, zones);

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
    // a Showdown, exactly as a Standard Move does (same helper).
    const playerId = context.params.playerId as string;
    const io = { cards: context.cards, counters, draft, zones } as unknown as ArrivalIO;
    if (noteArrival(io, { at: toBattlefield, cause: "move", stagedBy: playerId, unitIds: [unitId] }).staged) {
      beginShowdownAt(io, toBattlefield);
    }
  },
};
