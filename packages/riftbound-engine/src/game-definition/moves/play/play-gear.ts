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
import { isLegalTiming } from "../../../chain/chain-state";
import { attachEquipment } from "../../../abilities/effects/_attachment";
import { hasKeyword } from "../movement/helpers";
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
    // rule-id: ogn-026-298 — "opponents can't play cards this turn".
    if (state.cannotPlayCardsThisTurn?.[context.params.playerId as string]) {
      return false;
    }
    // rule 819.1.b (sfd-054-221) — [Quick-Draw] gives the Equipment [Reaction],
    // so it may be played at Reaction speed: any open state, on either player's
    // turn. Everything else is a Discretionary Action (140.1.b/c + 508.1.a),
    // legal only in a Neutral Open state on your own Main Phase.
    const interaction = state.interaction ?? createInteractionState();
    const quickDraw = hasKeyword(context.params.cardId as string, "Quick-Draw", (id) =>
      context.cards.getCardMeta(id),
    );
    if (quickDraw) {
      if (!isLegalTiming("reaction", getTurnState(interaction))) {
        return false;
      }
    } else {
      if (state.turn.activePlayer !== context.params.playerId) {
        return false;
      }
      if (state.turn.phase !== "main") {
        return false;
      }
      if (getTurnState(interaction) !== "neutral-open") {
        return false;
      }
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
    const interaction = state.interaction ?? createInteractionState();
    // rule 819.1.b — Quick-Draw Equipment is enumerated at Reaction speed; see
    // the condition above. Everything else needs your own open Main Phase.
    const openTurn =
      state.turn.activePlayer === (context.playerId as string) &&
      state.turn.phase === "main" &&
      getTurnState(interaction) === "neutral-open";
    if (!openTurn && !isLegalTiming("reaction", getTurnState(interaction))) {
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
      if (
        !openTurn &&
        !hasKeyword(cardId as string, "Quick-Draw", (id) => context.cards.getCardMeta(id))
      ) {
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

    // rule 357.1.a: tap ready runes for any Energy shortfall at Pay time.
    deductCost(draft, playerId, cardId, { chosenTargetId }, createMetaAccessor(context.cards), {
      counters: context.counters,
      zones: context.zones,
    });

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

    // rule 819.1.d (sfd-054-221) — [Quick-Draw]: "When you play it, attach it
    // to a unit you control." With exactly one friendly unit the attachment is
    // forced, so it happens right here; with several the controller would be
    // prompted (not modelled yet).
    if (hasKeyword(cardId, "Quick-Draw", (id) => context.cards.getCardMeta(id))) {
      const zoneIds = ["base", ...Object.keys(draft.battlefields ?? {}).map((bf) => `battlefield-${bf}`)];
      const registry = getGlobalCardRegistry();
      const units: string[] = [];
      for (const zoneId of zoneIds) {
        for (const id of zones.getCardsInZone(zoneId as CoreZoneId, playerId as CorePlayerId)) {
          if (registry.get(id as string)?.cardType === "unit") {
            units.push(id as string);
          }
        }
      }
      if (units.length === 1) {
        attachEquipment(
          {
            cards: context.cards,
            counters: context.counters,
            draft,
            playerId,
            zones,
          } as never,
          cardId,
          units[0] as string,
        );
      }
    }

    // Rule 724 (Legion) tracker: count this gear/equipment play.
    if (draft.cardsPlayedThisTurn) {
      draft.cardsPlayedThisTurn[playerId] = (draft.cardsPlayedThisTurn[playerId] ?? 0) + 1;
    }
  },
};
