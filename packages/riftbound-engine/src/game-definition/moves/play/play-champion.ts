/**
 * playFromChampionZone move (split from cards.ts).
 */

import type {
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
  GameMoveDefinitions,
} from "@tcg/core";
import type { RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "../../../types";
import { createInteractionState, getTurnState } from "../../../chain";
import { getGlobalCardRegistry } from "../../../operations/card-lookup";
import {
  hasStaticEffect,
  consumeEntersReadyReplacement,
  createMetaAccessor,
  getPotentialRuneEnergy,
  deductCost,
} from "./cost";

type Defs = GameMoveDefinitions<RiftboundGameState, RiftboundMoves, RiftboundCardMeta, unknown>;

/**
 * Play Chosen Champion from Champion Zone (rule 107.2.c)
 */
export const playFromChampionZone: Defs["playFromChampionZone"] = {
  condition: (state, context) => {
    if (state.status !== "playing") {
      return false;
    }
    if (state.pendingChoice) {
      return false;
    }
    if (state.turn.phase !== "main") {
      return false;
    }
    if (state.turn.activePlayer !== context.params.playerId) {
      return false;
    }

    // Rule 309.1.a: Closed State (chain open) admits only Reaction plays;
    // champion units are non-Reaction, so require neutral-open.
    const interaction = state.interaction ?? createInteractionState();
    if (getTurnState(interaction) !== "neutral-open") {
      return false;
    }

    const championZoneCards = context.zones.getCardsInZone(
      "championZone" as CoreZoneId,
      context.params.playerId as CorePlayerId,
    );
    if (championZoneCards.length === 0) {
      return false;
    }

    return true;
  },
  enumerator: (state, context) => {
    if (state.status !== "playing" || state.turn.phase !== "main") {
      return [];
    }
    if (state.turn.activePlayer !== context.playerId) {
      return [];
    }

    // Rule 309.1.a: no champion-zone plays while a chain exists.
    const interaction = state.interaction ?? createInteractionState();
    if (getTurnState(interaction) !== "neutral-open") {
      return [];
    }

    const championZoneCards = context.zones.getCardsInZone(
      "championZone" as CoreZoneId,
      context.playerId as CorePlayerId,
    );
    if (championZoneCards.length === 0) {
      return [];
    }

    // Rule 108.3.d/419.1.a with 357.1.a: credit ready runes as available energy.
    const banked = state.runePools?.[context.playerId]?.energy ?? 0;
    const energy =
      banked +
      getPotentialRuneEnergy(
        context.zones,
        context.counters,
        context.playerId as string,
      );
    // Rule 419.1.a: use the global card registry (context.registry has no .get()).
    const registry = getGlobalCardRegistry();
    const results: { playerId: PlayerId; location: string }[] = [];
    for (const cardId of championZoneCards) {
      const def = registry.get(cardId as string);
      const cost = def?.energyCost ?? 0;
      if (cost > energy) {
        continue;
      }
      results.push({ location: "base", playerId: context.playerId as PlayerId });
    }
    return results;
  },
  reducer: (draft, context) => {
    const { playerId, location } = context.params;
    const { zones, counters } = context;

    const championZoneCards = zones.getCardsInZone(
      "championZone" as CoreZoneId,
      playerId as CorePlayerId,
    );

    if (championZoneCards.length > 0) {
      const championId = championZoneCards[0];
      if (championId) {
        deductCost(draft, playerId, championId as string, {}, createMetaAccessor(context.cards));

        zones.moveCard({
          cardId: championId,
          targetZoneId: location as CoreZoneId,
        });

        const entersReady =
          hasStaticEffect(championId as string, "enter-ready") ||
          consumeEntersReadyReplacement(draft, playerId);
        if (!entersReady) {
          counters.setFlag(championId, "exhausted", true);
        }
      }
    }
  },
};
