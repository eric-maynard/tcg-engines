/**
 * Riftbound Card Play Moves
 *
 * Moves for playing cards: units, gear, spells, and hidden cards.
 * Each move validates game rules before executing.
 */

import type {
  CardId as CoreCardId,
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
  GameMoveDefinitions,
} from "@tcg/core";
import type { RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "../../types";
import { fireTriggers } from "../../abilities/trigger-runner";
import { resolveTarget } from "../../abilities/target-resolver";
import { addToChain, createInteractionState, getTurnState, isLegalTiming } from "../../chain";
import { getGlobalCardRegistry } from "../../operations/card-lookup";
import { getBattlefieldZoneId, getFacedownZoneId } from "../../zones/zone-configs";

/**
 * Calculate the Deflect surcharge for targeting a card (rule 721).
 */
function getDeflectSurcharge(
  _state: RiftboundGameState,
  _playerId: string,
  _targets?: string[],
): number {
  if (!_targets || _targets.length === 0) {
    return 0;
  }
  const registry = getGlobalCardRegistry();
  let surcharge = 0;
  for (const targetId of _targets) {
    if (registry.hasKeyword(targetId, "Deflect")) {
      surcharge += 1;
    }
  }
  return surcharge;
}

/**
 * Create a typed getCardMeta accessor from the move context's cards API.
 */
function createMetaAccessor(cards: {
  getCardMeta: (cardId: CoreCardId) => unknown;
}): (cardId: CoreCardId) => Partial<RiftboundCardMeta> | undefined {
  return (cardId: CoreCardId) =>
    cards.getCardMeta(cardId) as Partial<RiftboundCardMeta> | undefined;
}

/**
 * Get the cost modifier for a card from its metadata.
 */
function getCostModifier(
  cardId: string,
  getCardMeta?: (cardId: CoreCardId) => Partial<RiftboundCardMeta> | undefined,
): number {
  if (!getCardMeta) {
    return 0;
  }
  const meta = getCardMeta(cardId as CoreCardId);
  return meta?.costModifier ?? 0;
}

/**
 * Check if player can afford a card's cost from their rune pool.
 */
function canAffordCard(
  state: RiftboundGameState,
  playerId: string,
  cardId: string,
  targets?: string[],
  getCardMeta?: (cardId: CoreCardId) => Partial<RiftboundCardMeta> | undefined,
): boolean {
  const registry = getGlobalCardRegistry();
  const pool = state.runePools[playerId];
  if (!pool) {
    return false;
  }

  const modifier = getCostModifier(cardId, getCardMeta);
  const baseCost = registry.getCostToDeduct(cardId);
  const adjustedEnergy = Math.max(0, baseCost.energy + modifier);

  if (pool.energy < adjustedEnergy) {
    return false;
  }

  // Check power (domain requirements are not affected by cost modifiers)
  for (const [domain, amount] of Object.entries(baseCost.power)) {
    const available = pool.power[domain as keyof typeof pool.power] ?? 0;
    if (available < (amount ?? 0)) {
      return false;
    }
  }

  const deflectCost = getDeflectSurcharge(state, playerId, targets);
  if (deflectCost > 0) {
    const remainingEnergy = pool.energy - adjustedEnergy;
    if (remainingEnergy < deflectCost) {
      return false;
    }
  }
  return true;
}

/**
 * Deduct a card's cost from the player's rune pool.
 */
function deductCost(
  draft: RiftboundGameState,
  playerId: string,
  cardId: string,
  targets?: string[],
  getCardMeta?: (cardId: CoreCardId) => Partial<RiftboundCardMeta> | undefined,
): void {
  const registry = getGlobalCardRegistry();
  const cost = registry.getCostToDeduct(cardId);
  const pool = draft.runePools[playerId];
  if (!pool) {
    return;
  }

  const modifier = getCostModifier(cardId, getCardMeta);
  const adjustedEnergy = Math.max(0, cost.energy + modifier);

  pool.energy = Math.max(0, pool.energy - adjustedEnergy);
  for (const [domain, amount] of Object.entries(cost.power)) {
    if (amount && amount > 0) {
      const key = domain as keyof typeof pool.power;
      pool.power[key] = Math.max(0, (pool.power[key] ?? 0) - amount);
    }
  }

  const deflectCost = getDeflectSurcharge(draft, playerId, targets);
  if (deflectCost > 0) {
    pool.energy = Math.max(0, pool.energy - deflectCost);
  }
}

/**
 * Card play move definitions
 */
export const cardPlayMoves: Partial<
  GameMoveDefinitions<RiftboundGameState, RiftboundMoves, RiftboundCardMeta, unknown>
> = {
  /**
   * Play a unit to Base (rule 554)
   */
  playUnit: {
    condition: (state, context) => {
      if (state.status !== "playing") {
        return false;
      }
      if (state.turn.activePlayer !== context.params.playerId) {
        return false;
      }
      if (state.turn.phase !== "main") {
        return false;
      }

      const zone = context.zones.getCardZone(context.params.cardId as CoreCardId);
      if (zone !== "hand") {
        return false;
      }

      if (
        !canAffordCard(
          state,
          context.params.playerId,
          context.params.cardId,
          undefined,
          createMetaAccessor(context.cards),
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
      if (state.turn.activePlayer !== (context.playerId as string)) {
        return [];
      }
      if (state.turn.phase !== "main") {
        return [];
      }

      const registry = getGlobalCardRegistry();
      const pool = state.runePools[context.playerId as string];
      if (!pool) {
        return [];
      }

      const handCards = context.zones.getCardsInZone(
        "hand" as CoreZoneId,
        context.playerId as CorePlayerId,
      );

      const results: { playerId: string; cardId: string; location: string }[] = [];
      for (const cardId of handCards) {
        const def = registry.get(cardId as string);
        if (!def || def.cardType !== "unit") {
          continue;
        }
        if (!registry.canAfford(cardId as string, pool)) {
          continue;
        }

        results.push({
          cardId: cardId as string,
          location: "base",
          playerId: context.playerId as string,
        });
      }
      return results;
    },
    reducer: (draft, context) => {
      const { cardId, playerId, location } = context.params;
      const { zones, counters } = context;

      deductCost(draft, playerId, cardId, undefined, createMetaAccessor(context.cards));

      zones.moveCard({
        cardId: cardId as CoreCardId,
        targetZoneId: location as CoreZoneId,
      });

      counters.setFlag(cardId as CoreCardId, "exhausted", true);

      // Fire "play-self" and "play-card" triggers
      fireTriggers(
        { cardId, playerId, type: "play-self" },
        { cards: context.cards, counters, draft, zones },
      );
      fireTriggers(
        { cardId, cardType: "unit", playerId, type: "play-card" },
        { cards: context.cards, counters, draft, zones },
      );
    },
  },

  /**
   * Play gear to Base (rule 143.1.a.1)
   */
  playGear: {
    condition: (state, context) => {
      if (state.status !== "playing") {
        return false;
      }
      if (state.turn.activePlayer !== context.params.playerId) {
        return false;
      }
      if (state.turn.phase !== "main") {
        return false;
      }

      const zone = context.zones.getCardZone(context.params.cardId as CoreCardId);
      if (zone !== "hand") {
        return false;
      }

      if (
        !canAffordCard(
          state,
          context.params.playerId,
          context.params.cardId,
          undefined,
          createMetaAccessor(context.cards),
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
      if (state.turn.activePlayer !== (context.playerId as string)) {
        return [];
      }
      if (state.turn.phase !== "main") {
        return [];
      }

      const registry = getGlobalCardRegistry();
      const pool = state.runePools[context.playerId as string];
      if (!pool) {
        return [];
      }

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
        if (!registry.canAfford(cardId as string, pool)) {
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
      const { cardId, playerId } = context.params;
      const { zones } = context;

      deductCost(draft, playerId, cardId, undefined, createMetaAccessor(context.cards));

      zones.moveCard({
        cardId: cardId as CoreCardId,
        targetZoneId: "base" as CoreZoneId,
      });

      fireTriggers(
        { cardId, playerId, type: "play-self" },
        { cards: context.cards, counters: context.counters, draft, zones },
      );
      fireTriggers(
        { cardId, cardType: "gear", playerId, type: "play-card" },
        { cards: context.cards, counters: context.counters, draft, zones },
      );
    },
  },

  /**
   * Play a spell (rule 146-151)
   */
  playSpell: {
    condition: (state, context) => {
      if (state.status !== "playing") {
        return false;
      }

      const zone = context.zones.getCardZone(context.params.cardId as CoreCardId);
      if (zone !== "hand") {
        return false;
      }

      if (
        !canAffordCard(
          state,
          context.params.playerId,
          context.params.cardId,
          context.params.targets,
          createMetaAccessor(context.cards),
        )
      ) {
        return false;
      }

      const interaction = state.interaction ?? createInteractionState();
      const turnState = getTurnState(interaction);
      const registry = getGlobalCardRegistry();
      const timing = (registry.getSpellTiming(context.params.cardId) ?? "action") as
        | "action"
        | "reaction";

      if (!isLegalTiming(timing, turnState)) {
        return false;
      }

      // Rule 537: Check that required targets exist before allowing the spell
      const abilities = registry.getAbilities(context.params.cardId) ?? [];
      const spellAbility = abilities.find((a: { type: string }) => a.type === "spell");
      const effect = spellAbility?.effect as { target?: { type: string } } | undefined;
      if (effect?.target && effect.target.type !== "self") {
        const resolved = resolveTarget(
          effect.target as {
            type: string;
            controller?: "friendly" | "enemy" | "any";
            location?: string;
            quantity?: number | "all";
          },
          {
            cards: {
              getCardOwner: (c) => context.cards.getCardOwner(c),
            },
            draft: state,
            playerId: context.params.playerId as string,
            sourceCardId: context.params.cardId as string,
            zones: {
              getCardZone: (c) => context.zones.getCardZone(c),
              getCardsInZone: (z, p) => context.zones.getCardsInZone(z, p),
            },
          },
        );
        if (resolved.length === 0) {
          return false;
        }
      }

      return true;
    },
    enumerator: (state, context) => {
      if (state.status !== "playing") {
        return [];
      }

      const registry = getGlobalCardRegistry();
      const interaction = state.interaction ?? createInteractionState();
      const turnState = getTurnState(interaction);
      const pool = state.runePools[context.playerId as string];
      if (!pool) {
        return [];
      }

      const handCards = context.zones.getCardsInZone(
        "hand" as CoreZoneId,
        context.playerId as CorePlayerId,
      );

      const results: { playerId: string; cardId: string; targets?: string[] }[] = [];
      for (const cardId of handCards) {
        const def = registry.get(cardId as string);
        if (!def || def.cardType !== "spell") {
          continue;
        }
        if (!registry.canAfford(cardId as string, pool)) {
          continue;
        }

        // Check spell timing is legal in current turn state (rule 553)
        const timing = (registry.getSpellTiming(cardId as string) ?? "action") as
          | "action"
          | "reaction";
        if (!isLegalTiming(timing, turnState)) {
          continue;
        }

        // Check that the spell has at least one legal target (rule 537)
        const abilities = registry.getAbilities(cardId as string) ?? [];
        const spellAbility = abilities.find((a: { type: string }) => a.type === "spell");
        const effect = spellAbility?.effect as { target?: { type: string } } | undefined;
        if (effect?.target && effect.target.type !== "self") {
          const resolved = resolveTarget(
            effect.target as {
              type: string;
              controller?: "friendly" | "enemy" | "any";
              location?: string;
              quantity?: number | "all";
            },
            {
              cards: {
                getCardOwner: (c) => context.cards.getCardOwner(c),
              },
              draft: state,
              playerId: context.playerId as string,
              sourceCardId: cardId as string,
              zones: {
                getCardZone: (c) => context.zones.getCardZone(c),
                getCardsInZone: (z, p) => context.zones.getCardsInZone(z, p),
              },
            },
          );
          if (resolved.length === 0) {
            continue;
          }
        }

        results.push({
          cardId: cardId as string,
          playerId: context.playerId as string,
        });
      }
      return results;
    },
    reducer: (draft, context) => {
      const { cardId, playerId, targets } = context.params;
      const { zones } = context;

      deductCost(draft, playerId, cardId, targets, createMetaAccessor(context.cards));

      // Look up spell effect from card definition
      const registry = getGlobalCardRegistry();
      const abilities = registry.getAbilities(cardId) ?? [];
      const spellAbility = abilities.find((a) => a.type === "spell");
      const spellEffect = spellAbility?.effect;

      // Add spell to the chain (rule 537)
      const interaction = draft.interaction ?? createInteractionState();
      const turnOrder = Object.keys(draft.players);
      draft.interaction = addToChain(
        interaction,
        { cardId, controller: playerId, effect: spellEffect, type: "spell" },
        turnOrder,
      );

      // Fire triggers
      fireTriggers(
        { cardId, playerId, type: "play-spell" },
        { cards: context.cards, counters: context.counters, draft, zones },
      );
      fireTriggers(
        { cardId, cardType: "spell", playerId, type: "play-card" },
        { cards: context.cards, counters: context.counters, draft, zones },
      );

      // Move spell to trash (it resolves from the chain later)
      zones.moveCard({
        cardId: cardId as CoreCardId,
        targetZoneId: "trash" as CoreZoneId,
      });
    },
  },

  /**
   * Hide a card at a Battlefield (rule 723)
   */
  hideCard: {
    condition: (state, context) => {
      if (state.status !== "playing") {
        return false;
      }

      const zone = context.zones.getCardZone(context.params.cardId as CoreCardId);
      if (zone !== "hand") {
        return false;
      }

      return true;
    },
    reducer: (_draft, context) => {
      const { cardId, battlefieldId } = context.params;
      const { zones, counters, cards } = context;

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
        } as Partial<RiftboundCardMeta>,
      );

      // Fire hide event
      fireTriggers(
        { cardId, playerId: context.params.playerId, type: "hide" },
        { cards, counters, draft: _draft, zones },
      );
    },
  },

  /**
   * Reveal and play a hidden card
   */
  revealHidden: {
    condition: (state, context) => {
      if (state.status !== "playing") {
        return false;
      }
      return true;
    },
    reducer: (_draft, context) => {
      const { cardId } = context.params;
      const { zones, counters, cards } = context;

      const meta = cards.getCardMeta(cardId as CoreCardId) as Partial<RiftboundCardMeta>;
      const battlefieldId = meta.hiddenAt;

      if (battlefieldId) {
        const battlefieldZoneId = getBattlefieldZoneId(battlefieldId);
        zones.moveCard({
          cardId: cardId as CoreCardId,
          targetZoneId: battlefieldZoneId as CoreZoneId,
        });
      }

      counters.setFlag(cardId as CoreCardId, "hidden", false);
      cards.updateCardMeta(
        cardId as CoreCardId,
        {
          hidden: false,
          hiddenAt: undefined,
        } as Partial<RiftboundCardMeta>,
      );
    },
  },

  /**
   * Play Chosen Champion from Champion Zone (rule 107.2.c)
   */
  playFromChampionZone: {
    condition: (state, context) => {
      if (state.status !== "playing") {
        return false;
      }
      if (state.turn.phase !== "main") {
        return false;
      }
      if (state.turn.activePlayer !== context.params.playerId) {
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

      const championZoneCards = context.zones.getCardsInZone(
        "championZone" as CoreZoneId,
        context.playerId as CorePlayerId,
      );
      if (championZoneCards.length === 0) {
        return [];
      }

      const energy = state.runePools?.[context.playerId]?.energy ?? 0;
      const results: { playerId: PlayerId; location: string }[] = [];
      for (const cardId of championZoneCards) {
        const def = context.registry?.get(cardId);
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
          deductCost(
            draft,
            playerId,
            championId as string,
            undefined,
            createMetaAccessor(context.cards),
          );

          zones.moveCard({
            cardId: championId,
            targetZoneId: location as CoreZoneId,
          });

          counters.setFlag(championId, "exhausted", true);
        }
      }
    },
  },
};
