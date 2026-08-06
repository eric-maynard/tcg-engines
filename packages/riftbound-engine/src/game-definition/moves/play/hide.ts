/**
 * hideCard / revealHidden moves (split from cards.ts).
 */

import type {
  CardId as CoreCardId,
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
  GameMoveDefinitions,
} from "@tcg/core";
import type { RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "../../../types";
import { fireTriggers } from "../../../abilities/trigger-runner";
import { addToChain, createInteractionState, getTurnState } from "../../../chain";
import { getGlobalCardRegistry } from "../../../operations/card-lookup";
import { getBattlefieldZoneId, getFacedownZoneId } from "../../../zones/zone-configs";
import { hasStaticEffect, consumeEntersReadyReplacement } from "./cost";

type Defs = GameMoveDefinitions<RiftboundGameState, RiftboundMoves, RiftboundCardMeta, unknown>;

/**
 * Rule 723.1.b / 723.1.b.1: the Hide action costs [C] — one Power of any
 * domain in the player's Domain Identity. Power in the pool is produced by
 * the player's own runes, so any domain with Power available qualifies.
 */
const HIDE_POWER_COST = 1;

function canAffordHide(state: RiftboundGameState, playerId: string): boolean {
  const pool = state.runePools[playerId];
  if (!pool) {
    return false;
  }
  let total = 0;
  for (const v of Object.values(pool.power)) {
    total += typeof v === "number" && v > 0 ? v : 0;
  }
  return total >= HIDE_POWER_COST;
}

function deductHideCost(draft: RiftboundGameState, playerId: string): void {
  const pool = draft.runePools[playerId];
  if (!pool) {
    return;
  }
  // Pay from whichever domain has the most Power left (mirrors [rainbow]
  // payment in chain-moves).
  const key = Object.entries(pool.power)
    .filter(([, v]) => (v ?? 0) > 0)
    .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))[0]?.[0] as keyof typeof pool.power | undefined;
  if (key !== undefined) {
    pool.power[key] = Math.max(0, (pool.power[key] ?? 0) - HIDE_POWER_COST);
  }
}

/**
 * Hide a card at a Battlefield (rule 723)
 */
export const hideCard: Defs["hideCard"] = {
  condition: (state, context) => {
    if (state.status !== "playing") {
      return false;
    }
    if (state.pendingChoice) {
      return false;
    }
    // Rule 597.2: Hide is a Discretionary Action → Neutral Open only.
    const interaction = state.interaction ?? createInteractionState();
    if (getTurnState(interaction) !== "neutral-open") {
      return false;
    }

    const zone = context.zones.getCardZone(context.params.cardId as CoreCardId);
    if (zone !== "hand") {
      return false;
    }

    // Rule 723.1: only cards with the Hidden keyword may be Hidden.
    const registry = getGlobalCardRegistry();
    if (!registry.hasKeyword(context.params.cardId as string, "Hidden")) {
      return false;
    }

    // Rule 597.1 / 723.1.b: must be a battlefield the player controls.
    const bfId = context.params.battlefieldId;
    const bf = state.battlefields[bfId];
    if (!bf || bf.controller !== context.params.playerId) {
      return false;
    }

    // Enforce per-player hidden-card capacity at the target battlefield.
    // Default capacity is 1; battlefields like Bandle Tree bump
    // `hiddenCapacityBonus` to permit additional hidden cards.
    const capacity = 1 + (bf.hiddenCapacityBonus ?? 0);
    const facedownZoneId = getFacedownZoneId(bfId);
    const hiddenCards = context.zones.getCardsInZone(facedownZoneId as CoreZoneId);
    let ownedHidden = 0;
    for (const hiddenId of hiddenCards) {
      if (context.cards.getCardOwner(hiddenId) === context.params.playerId) {
        ownedHidden++;
      }
    }
    if (ownedHidden >= capacity) {
      return false;
    }

    // rule-id: ogn-121-298 — Rule 723.1.b: hiding costs [C] (1 Power).
    if (!canAffordHide(state, context.params.playerId)) {
      return false;
    }

    return true;
  },
  enumerator: (state, context) => {
    if (state.status !== "playing" || state.pendingChoice) {
      return [];
    }
    const interaction = state.interaction ?? createInteractionState();
    if (getTurnState(interaction) !== "neutral-open") {
      return [];
    }
    // rule-id: ogn-121-298 — Rule 723.1.b: hiding costs [C] (1 Power).
    if (!canAffordHide(state, context.playerId as string)) {
      return [];
    }
    const registry = getGlobalCardRegistry();
    const hand = context.zones.getCardsInZone(
      "hand" as CoreZoneId,
      context.playerId as CorePlayerId,
    );
    const hiddenCards = hand.filter((id) => registry.hasKeyword(id as string, "Hidden"));
    if (hiddenCards.length === 0) {
      return [];
    }
    const results: { playerId: string; cardId: string; battlefieldId: string }[] = [];
    for (const [bfId, bf] of Object.entries(state.battlefields)) {
      if (bf.controller !== (context.playerId as string)) {
        continue;
      }
      const capacity = 1 + (bf.hiddenCapacityBonus ?? 0);
      const facedown = context.zones.getCardsInZone(getFacedownZoneId(bfId) as CoreZoneId);
      let owned = 0;
      for (const hid of facedown) {
        if (context.cards.getCardOwner(hid) === (context.playerId as string)) {
          owned++;
        }
      }
      if (owned >= capacity) {
        continue;
      }
      for (const cid of hiddenCards) {
        results.push({
          battlefieldId: bfId,
          cardId: cid as string,
          playerId: context.playerId as string,
        });
      }
    }
    return results;
  },
  reducer: (_draft, context) => {
    const { cardId, battlefieldId } = context.params;
    const { zones, counters, cards } = context;

    // rule-id: ogn-121-298 — Rule 723.1.b: pay [C] (1 Power) to hide.
    deductHideCost(_draft, context.params.playerId);

    const facedownZoneId = getFacedownZoneId(battlefieldId);

    zones.moveCard({
      cardId: cardId as CoreCardId,
      targetZoneId: facedownZoneId as CoreZoneId,
    });

    counters.setFlag(cardId as CoreCardId, "hidden", true);
    cards.updateCardMeta(
      cardId as CoreCardId,
      {
        hidden: true,
        hiddenAt: battlefieldId,
        // rule-id: ogn-121-298 — Rule 723.1.b: stamp the hide turn so the
        // card cannot be revealed until a later turn.
        hiddenOnTurn: _draft.turn?.number,
      } as Partial<RiftboundCardMeta>,
    );

    // Fire hide event
    fireTriggers(
      { cardId, playerId: context.params.playerId, type: "hide" },
      { cards, counters, draft: _draft, zones },
    );
  },
};

/**
 * Reveal and play a hidden card (rule 723.1.c.3).
 *
 * Playing a card from facedown OPENS a chain. For spell cards this
 * means we add a chain item (same as playSpell). For unit/gear cards
 * we move them to the appropriate zone (battlefield / base).
 */
export const revealHidden: Defs["revealHidden"] = {
  condition: (state, context) => {
    if (state.status !== "playing") {
      return false;
    }
    if (state.pendingChoice) {
      return false;
    }
    const meta = context.cards.getCardMeta(context.params.cardId as CoreCardId) as
      | Partial<RiftboundCardMeta>
      | undefined;
    if (!meta?.hidden) {
      return false;
    }
    const owner = context.cards.getCardOwner(context.params.cardId as CoreCardId);
    if (owner !== context.params.playerId) {
      return false;
    }
    // rule-id: ogn-121-298 — Rule 723.1.b: "Beginning on the next player's
    // turn" — a hidden card cannot be revealed on the turn it was hidden.
    if (meta.hiddenOnTurn !== undefined && state.turn?.number !== undefined) {
      if (state.turn.number <= meta.hiddenOnTurn) {
        return false;
      }
    }
    return true;
  },
  reducer: (draft, context) => {
    const { cardId, playerId } = context.params;
    const { zones, counters, cards } = context;

    const meta = cards.getCardMeta(cardId as CoreCardId) as Partial<RiftboundCardMeta>;
    const battlefieldId = meta.hiddenAt;
    const hiddenOnTurn = meta.hiddenOnTurn;

    // rule-id: ogn-121-298 — Rule 723.1.b: defensive guard mirroring the
    // condition — never reveal on the same turn the card was hidden.
    if (
      hiddenOnTurn !== undefined &&
      draft.turn?.number !== undefined &&
      draft.turn.number <= hiddenOnTurn
    ) {
      return;
    }

    const registry = getGlobalCardRegistry();
    const def = registry.get(cardId);
    const cardType = def?.cardType;

    // Clear hidden state — the card is no longer facedown regardless
    // Of its eventual destination.
    counters.setFlag(cardId as CoreCardId, "hidden", false);
    cards.updateCardMeta(
      cardId as CoreCardId,
      {
        hidden: false,
        hiddenAt: undefined,
        hiddenOnTurn: undefined,
      } as Partial<RiftboundCardMeta>,
    );

    if (cardType === "spell") {
      // Rule 723.1.c.3: playing a card from facedown opens a chain.
      // Push the spell onto the chain and move the physical card to
      // Trash (where resolved spells live).
      const abilities = registry.getAbilities(cardId) ?? [];
      const spellAbility = abilities.find((a) => a.type === "spell");
      const spellEffect = spellAbility?.effect;
      const interaction = draft.interaction ?? createInteractionState();
      const turnOrder = Object.keys(draft.players);
      draft.interaction = addToChain(
        interaction,
        { cardId, controller: playerId, effect: spellEffect, resolveTo: "trash", type: "spell" },
        turnOrder,
      );
      // rule-id: unl-007-219 — card sits on the chain until it resolves.
      zones.moveCard({
        cardId: cardId as CoreCardId,
        targetZoneId: "chain" as CoreZoneId,
      });
      fireTriggers({ cardId, playerId, type: "play-spell" }, { cards, counters, draft, zones });
      fireTriggers(
        { cardId, cardType: "spell", playerId, type: "play-card" },
        { cards, counters, draft, zones },
      );
      return;
    }

    // Unit / gear / equipment: move to the associated battlefield's
    // Physical zone. The card becomes face-up and "in play" without
    // Going through the chain.
    if (battlefieldId) {
      const battlefieldZoneId = getBattlefieldZoneId(battlefieldId);
      zones.moveCard({
        cardId: cardId as CoreCardId,
        targetZoneId: battlefieldZoneId as CoreZoneId,
      });
    }

    if (cardType === "unit") {
      // rule-id: ogn-121-298 — Rule 143.4: units enter exhausted unless a
      // static enter-ready effect or an enters-ready replacement applies
      // (mirrors the normal playCard path).
      const entersReady =
        hasStaticEffect(cardId, "enter-ready") ||
        consumeEntersReadyReplacement(draft, playerId);
      if (!entersReady) {
        counters.setFlag(cardId as CoreCardId, "exhausted", true);
      }
      fireTriggers({ cardId, playerId, type: "play-self" }, { cards, counters, draft, zones });
      fireTriggers(
        { cardId, cardType: "unit", playerId, type: "play-card" },
        { cards, counters, draft, zones },
      );
    }
  },
};
