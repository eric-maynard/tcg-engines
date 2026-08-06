/**
 * playGear move (split from cards.ts).
 */

import type {
  CardId as CoreCardId,
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
  GameMoveDefinitions,
} from "@tcg/core";
import type { RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "../../../types";
import { fireTriggers } from "../../../abilities/trigger-runner";
import { createInteractionState, getTurnState } from "../../../chain";
import { getGlobalCardRegistry } from "../../../operations/card-lookup";
import {
  hasStaticEffect,
  createMetaAccessor,
  getPotentialRuneEnergy,
  canAffordCard,
  deductCost,
} from "./cost";

type Defs = GameMoveDefinitions<RiftboundGameState, RiftboundMoves, RiftboundCardMeta, unknown>;

/**
 * Play gear to Base (rule 143.1.a.1)
 */
export const playGear: Defs["playGear"] = {
  condition: (state, context) => {
    if (state.status !== "playing") {
      return false;
    }
    if (state.pendingChoice) {
      return false;
    }
    if (state.turn.activePlayer !== context.params.playerId) {
      return false;
    }
    if (state.turn.phase !== "main") {
      return false;
    }
    // Rule 140.1.b/c + 508.1.a: Playing Gear is a Discretionary Action,
    // legal only in a Neutral Open state (no chain, no showdown).
    const interaction = state.interaction ?? createInteractionState();
    if (getTurnState(interaction) !== "neutral-open") {
      return false;
    }

    const zone = context.zones.getCardZone(context.params.cardId as CoreCardId);
    if (zone !== "hand") {
      return false;
    }

    // Rule 103 / 555: only the card's owner may play it.
    const owner = context.cards.getCardOwner(context.params.cardId as CoreCardId);
    if (owner !== context.params.playerId) {
      return false;
    }

    if (
      !canAffordCard(
        state,
        context.params.playerId,
        context.params.cardId,
        { chosenTargetId: context.params.chosenTargetId },
        createMetaAccessor(context.cards),
        getPotentialRuneEnergy(context.zones, context.counters, context.params.playerId),
      )
    ) {
      return false;
    }

    return true;
  },
  enumerator: (state, context) => {
    if (state.status !== "playing") {
      return [];
    }
    if (state.pendingChoice) {
      return [];
    }
    if (state.turn.activePlayer !== (context.playerId as string)) {
      return [];
    }
    if (state.turn.phase !== "main") {
      return [];
    }
    const interaction = state.interaction ?? createInteractionState();
    if (getTurnState(interaction) !== "neutral-open") {
      return [];
    }

    const registry = getGlobalCardRegistry();
    const pool = state.runePools[context.playerId as string];
    if (!pool) {
      return [];
    }

    // Rule 357.1.a: credit ready runes as available energy for enumeration.
    const potential = getPotentialRuneEnergy(
      context.zones,
      context.counters,
      context.playerId as string,
    );
    const affordPool = { energy: pool.energy + potential, power: pool.power };

    const handCards = context.zones.getCardsInZone(
      "hand" as CoreZoneId,
      context.playerId as CorePlayerId,
    );

    const results: { playerId: string; cardId: string }[] = [];
    for (const cardId of handCards) {
      const def = registry.get(cardId as string);
      if (!def || (def.cardType !== "gear" && def.cardType !== "equipment")) {
        continue;
      }
      // Cards with interactive cost reduction are enumerated against their
      // Base cost; the actual cost is computed per-target at play time.
      if (!registry.canAfford(cardId as string, affordPool)) {
        continue;
      }

      results.push({
        cardId: cardId as string,
        playerId: context.playerId as string,
      });
    }
    return results;
  },
  reducer: (draft, context) => {
    const { cardId, playerId, chosenTargetId } = context.params;
    const { zones } = context;

    deductCost(draft, playerId, cardId, { chosenTargetId }, createMetaAccessor(context.cards));

    zones.moveCard({
      cardId: cardId as CoreCardId,
      targetZoneId: "base" as CoreZoneId,
    });

    // Gear normally enters ready (rule 143.4 applies to units only), but a
    // static "This enters exhausted" effect forces it to enter tapped
    // (e.g. Honeyfruit unl-049-219).
    if (hasStaticEffect(cardId, "enters-exhausted")) {
      context.counters.setFlag(cardId as CoreCardId, "exhausted", true);
    }

    // Fire "play-self" / "play-card" triggers BEFORE incrementing the
    // Rule-724 counter (see comment in playUnit).
    fireTriggers(
      { cardId, playerId, type: "play-self" },
      { cards: context.cards, counters: context.counters, draft, zones },
    );
    fireTriggers(
      { cardId, cardType: "gear", playerId, type: "play-card" },
      { cards: context.cards, counters: context.counters, draft, zones },
    );

    // Rule 724 (Legion) tracker: count this gear/equipment play.
    if (draft.cardsPlayedThisTurn) {
      draft.cardsPlayedThisTurn[playerId] = (draft.cardsPlayedThisTurn[playerId] ?? 0) + 1;
    }
  },
};
