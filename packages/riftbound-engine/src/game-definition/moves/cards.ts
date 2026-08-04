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
import { canPlayViaAmbush } from "../../keywords/keyword-effects";
import {
  extractBattlefieldId,
  getBattlefieldZoneId,
  getFacedownZoneId,
  isBattlefieldZone,
} from "../../zones/zone-configs";

/**
 * Calculate the Deflect surcharge for targeting a card (rule 721.1.b).
 *
 * Reads the Deflect value from each target's `keyword`-typed abilities
 * (shape: `{ type: "keyword", keyword: "Deflect", value: N }`). Multiple
 * Deflect abilities on the same target stack (rule 721.2). Falls back to
 * +1 per target if the card declares Deflect in its flat `keywords[]`
 * array but no ability carries an explicit numeric value (rule 721.1.b.3).
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
    const abilities = registry.getAbilities(targetId) ?? [];
    let targetSurcharge = 0;
    for (const ability of abilities) {
      if (ability.type === "keyword" && ability.keyword === "Deflect") {
        targetSurcharge += ability.value ?? 1;
      }
    }
    // Fallback: flat-keyword Deflect with no numeric ability entry — treat
    // As value 1 (rule 721.1.b.3).
    if (targetSurcharge === 0 && registry.hasKeyword(targetId, "Deflect")) {
      targetSurcharge = 1;
    }
    surcharge += targetSurcharge;
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
 * Get the effective Might of a card at the moment of play.
 *
 * Used for interactive cost reduction: the engine needs to read the
 * chosen target's current Might before the card is played to compute
 * the effective cost. Includes base Might plus any equipment bonus,
 * buff counter, and runtime Might modifiers stored on meta.
 */
function getCardEffectiveMight(
  cardId: string,
  getCardMeta?: (cardId: CoreCardId) => Partial<RiftboundCardMeta> | undefined,
): number {
  const registry = getGlobalCardRegistry();
  const baseMight = registry.getMight(cardId);
  if (baseMight === 0) {
    return 0;
  }
  const meta = getCardMeta?.(cardId as CoreCardId);
  const buffBonus = meta?.buffed ? 1 : 0;
  const mightMod = meta?.mightModifier ?? 0;
  const staticBonus = meta?.staticMightBonus ?? 0;
  let equipBonus = 0;
  for (const equipId of meta?.equippedWith ?? []) {
    equipBonus += registry.getMightBonus(equipId);
  }
  return Math.max(0, baseMight + buffBonus + mightMod + staticBonus + equipBonus);
}

/**
 * Compute the interactive cost reduction (rule: "Energy cost is reduced
 * by the Might of the unit you choose") for a card being played.
 * Returns 0 if the card has no interactive reduction or no chosen target.
 */
function getInteractiveReduction(
  cardId: string,
  chosenTargetId: string | undefined,
  getCardMeta?: (cardId: CoreCardId) => Partial<RiftboundCardMeta> | undefined,
): number {
  if (!chosenTargetId) {
    return 0;
  }
  const registry = getGlobalCardRegistry();
  const mode = registry.getInteractiveCostReduction(cardId);
  if (mode !== "target-might") {
    return 0;
  }
  return getCardEffectiveMight(chosenTargetId, getCardMeta);
}

/**
 * Optional extras for card affordability and cost deduction.
 */
interface CostExtras {
  /** Targets of the card (used for Deflect surcharge calculation). */
  targets?: string[];
  /**
   * Card ID of the target chosen at play time for interactive cost
   * reduction (e.g., Hextech Gauntlets chooses a unit; the unit's
   * Might reduces the gauntlets' energy cost).
   */
  chosenTargetId?: string;
  /**
   * Value of X for X-cost spells — the chosen non-negative integer
   * amount the player pays on top of the card's base cost. Each point
   * of X consumes 1 energy from the rune pool.
   */
  xAmount?: number;
  /**
   * Number of EXTRA Repeat activations for spells with the `[Repeat]`
   * keyword. Each additional repeat adds the spell's `repeat` cost on
   * top of the base cost. See RiftboundMoves.playSpell.repeatCount.
   */
  repeatCount?: number;
}

/**
 * Compute the total Repeat surcharge (energy) for a spell being played
 * with `repeatCount` additional effects.
 */
function getRepeatEnergySurcharge(cardId: string, repeatCount: number): number {
  if (repeatCount <= 0) {
    return 0;
  }
  const registry = getGlobalCardRegistry();
  const cost = registry.getSpellRepeatCost(cardId);
  if (!cost) {
    return 0;
  }
  return (cost.energy ?? 0) * repeatCount;
}

/**
 * Rule 357.1.a: during the Pay Costs step a player may activate [Reaction]
 * resource abilities (e.g. a rune's "[T]: Add [1]") to add Energy. For
 * affordability checks we therefore credit each ready rune in the player's
 * Rune Pool as +1 potential energy on top of the banked pool.
 */
function getPotentialRuneEnergy(
  zones: { getCardsInZone: (zone: CoreZoneId, player: CorePlayerId) => readonly CoreCardId[] },
  counters: { getFlag: (cardId: CoreCardId, flag: string) => boolean | undefined },
  playerId: string,
): number {
  let potential = 0;
  const runes = zones.getCardsInZone("runePool" as CoreZoneId, playerId as CorePlayerId);
  for (const runeId of runes) {
    if (!counters.getFlag(runeId, "exhausted")) {
      potential += 1;
    }
  }
  return potential;
}

/**
 * Check if player can afford a card's cost from their rune pool.
 */
function canAffordCard(
  state: RiftboundGameState,
  playerId: string,
  cardId: string,
  extras: CostExtras,
  getCardMeta?: (cardId: CoreCardId) => Partial<RiftboundCardMeta> | undefined,
  potentialEnergy = 0,
): boolean {
  const registry = getGlobalCardRegistry();
  const pool = state.runePools[playerId];
  if (!pool) {
    return false;
  }

  const modifier = getCostModifier(cardId, getCardMeta);
  const baseCost = registry.getCostToDeduct(cardId);
  const interactive = getInteractiveReduction(cardId, extras.chosenTargetId, getCardMeta);
  const xAmount = Math.max(0, extras.xAmount ?? 0);
  const repeatSurcharge = getRepeatEnergySurcharge(cardId, Math.max(0, extras.repeatCount ?? 0));
  const adjustedEnergy =
    Math.max(0, baseCost.energy + modifier - interactive) + xAmount + repeatSurcharge;

  // Rule 357.1.a: ready runes can be exhausted for energy during Pay Costs,
  // so treat their yield as available when testing affordability.
  const availableEnergy = pool.energy + potentialEnergy;
  if (availableEnergy < adjustedEnergy) {
    return false;
  }

  // Check power (domain requirements are not affected by cost modifiers)
  for (const [domain, amount] of Object.entries(baseCost.power)) {
    const available = pool.power[domain as keyof typeof pool.power] ?? 0;
    if (available < (amount ?? 0)) {
      return false;
    }
  }

  const deflectCost = getDeflectSurcharge(state, playerId, extras.targets);
  if (deflectCost > 0) {
    const remainingEnergy = availableEnergy - adjustedEnergy;
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
  extras: CostExtras,
  getCardMeta?: (cardId: CoreCardId) => Partial<RiftboundCardMeta> | undefined,
): void {
  const registry = getGlobalCardRegistry();
  const cost = registry.getCostToDeduct(cardId);
  const pool = draft.runePools[playerId];
  if (!pool) {
    return;
  }

  const modifier = getCostModifier(cardId, getCardMeta);
  const interactive = getInteractiveReduction(cardId, extras.chosenTargetId, getCardMeta);
  const xAmount = Math.max(0, extras.xAmount ?? 0);
  const repeatSurcharge = getRepeatEnergySurcharge(cardId, Math.max(0, extras.repeatCount ?? 0));
  const adjustedEnergy =
    Math.max(0, cost.energy + modifier - interactive) + xAmount + repeatSurcharge;

  pool.energy = Math.max(0, pool.energy - adjustedEnergy);
  for (const [domain, amount] of Object.entries(cost.power)) {
    if (amount && amount > 0) {
      const key = domain as keyof typeof pool.power;
      pool.power[key] = Math.max(0, (pool.power[key] ?? 0) - amount);
    }
  }

  const deflectCost = getDeflectSurcharge(draft, playerId, extras.targets);
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
      if (state.pendingChoice) {
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

      // Rule 577.3.c (Ambush): a unit with Ambush may be played to a
      // Battlefield where the player has friendly units, as a Reaction.
      // Otherwise the unit must be played on its controller's turn during
      // The main phase to the player's base.
      const location = context.params.location as string | undefined;
      const targetIsBattlefield = Boolean(location) && isBattlefieldZone(location);
      const registry = getGlobalCardRegistry();
      const hasAmbush = registry.hasKeyword(context.params.cardId, "Ambush");

      if (targetIsBattlefield) {
        // Ambush path: relax phase / active-player gating and permit the
        // Unit to be played directly to the target battlefield.
        if (!hasAmbush) {
          return false;
        }
        const bfId = extractBattlefieldId(location ?? "");
        if (!bfId) {
          return false;
        }
        const bfZoneId = getBattlefieldZoneId(bfId);
        const unitsAtBattlefield = context.zones.getCardsInZone(
          bfZoneId as CoreZoneId,
          context.params.playerId as CorePlayerId,
        );
        const hasFriendlyUnits = unitsAtBattlefield.length > 0;
        // Reaction timing is always legal per `isLegalTiming("reaction", ...)`
        // Regardless of chain/showdown state, so we treat Ambush as
        // Permanently reaction-legal and rely on `canPlayViaAmbush`'s
        // Friendly-units check.
        if (!canPlayViaAmbush(hasAmbush, hasFriendlyUnits, true)) {
          return false;
        }
      } else {
        // Standard play path: active player, main phase.
        if (state.turn.activePlayer !== context.params.playerId) {
          return false;
        }
        if (state.turn.phase !== "main") {
          return false;
        }
        // Rule 140.1.b/c + 508.1.a: Playing a Unit is a Discretionary Action,
        // legal only in a Neutral Open state (no chain, no showdown).
        const interaction = state.interaction ?? createInteractionState();
        if (getTurnState(interaction) !== "neutral-open") {
          return false;
        }
      }

      if (
        !canAffordCard(
          state,
          context.params.playerId,
          context.params.cardId,
          {},
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

      const results: { playerId: string; cardId: string; location: string }[] = [];
      for (const cardId of handCards) {
        const def = registry.get(cardId as string);
        if (!def || def.cardType !== "unit") {
          continue;
        }
        if (!registry.canAfford(cardId as string, affordPool)) {
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

      deductCost(draft, playerId, cardId, {}, createMetaAccessor(context.cards));

      zones.moveCard({
        cardId: cardId as CoreCardId,
        targetZoneId: location as CoreZoneId,
      });

      counters.setFlag(cardId as CoreCardId, "exhausted", true);

      // Fire "play-self" and "play-card" triggers BEFORE incrementing the
      // Rule-724 counter, so a Legion trigger on this card itself cannot
      // Satisfy its own condition — it must observe the count of cards
      // That were played EARLIER in this turn.
      fireTriggers(
        { cardId, playerId, type: "play-self" },
        { cards: context.cards, counters, draft, zones },
      );
      fireTriggers(
        { cardId, cardType: "unit", playerId, type: "play-card" },
        { cards: context.cards, counters, draft, zones },
      );

      // Rule 724 (Legion) tracker: count this play so subsequent cards
      // Can satisfy their Legion conditions. Runes are NOT counted.
      if (draft.cardsPlayedThisTurn) {
        draft.cardsPlayedThisTurn[playerId] = (draft.cardsPlayedThisTurn[playerId] ?? 0) + 1;
      }
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
  },

  /**
   * Play a spell (rule 146-151)
   */
  playSpell: {
    condition: (state, context) => {
      if (state.status !== "playing") {
        return false;
      }
      if (state.pendingChoice) {
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

      // Rule: Repeat cost is only valid on spells that have a defined
      // `repeat` cost on their spell ability. Reject repeatCount > 0 for
      // Spells without Repeat.
      const reqRepeatCount = Math.max(0, context.params.repeatCount ?? 0);
      if (reqRepeatCount > 0) {
        const registryCheck = getGlobalCardRegistry();
        if (!registryCheck.getSpellRepeatCost(context.params.cardId)) {
          return false;
        }
      }

      if (
        !canAffordCard(
          state,
          context.params.playerId,
          context.params.cardId,
          {
            repeatCount: reqRepeatCount,
            targets: context.params.targets,
            xAmount: context.params.xAmount,
          },
          createMetaAccessor(context.cards),
          getPotentialRuneEnergy(context.zones, context.counters, context.params.playerId),
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

      // Rule 530: in Neutral Open state, only the active player holds
      // Priority, so only they may play an Action-timed spell. Reaction
      // Spells can be played by any relevant player in a Closed state.
      if (timing === "action" && turnState === "neutral-open") {
        if (state.turn.activePlayer !== context.params.playerId) {
          return false;
        }
      }

      // Rule 355.5.a / 358.3.a: per-player criteria-based instructions ("Each player …")
      // are not caster play-time Choices; an impossible instruction is skipped on
      // resolution rather than making the play illegal, so only gate on caster-chosen targets.
      const abilities = registry.getAbilities(context.params.cardId) ?? [];
      const spellAbility = abilities.find((a: { type: string }) => a.type === "spell");
      const effect = spellAbility?.effect as
        | { target?: { type: string; quantity?: number | "all" }; player?: string }
        | undefined;
      // Rule 355.10.d: quantity:"all" selects programmatically — those objects are
      // not caster-chosen targets, so 355.8's ≥1-valid-target gate does not apply.
      if (
        effect?.target &&
        effect.target.type !== "self" &&
        effect.target.quantity !== "all" &&
        !effect.player
      ) {
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
      if (state.pendingChoice) {
        return [];
      }

      const registry = getGlobalCardRegistry();
      const interaction = state.interaction ?? createInteractionState();
      const turnState = getTurnState(interaction);
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

      const results: { playerId: string; cardId: string; targets?: string[] }[] = [];
      for (const cardId of handCards) {
        const def = registry.get(cardId as string);
        if (!def || def.cardType !== "spell") {
          continue;
        }
        if (!registry.canAfford(cardId as string, affordPool)) {
          continue;
        }

        // Check spell timing is legal in current turn state (rule 553)
        const timing = (registry.getSpellTiming(cardId as string) ?? "action") as
          | "action"
          | "reaction";
        if (!isLegalTiming(timing, turnState)) {
          continue;
        }

        // Rule 355.5.a / 358.3.a: skip the target-existence gate for per-player
        // criteria-based effects ("Each player …"); only caster-chosen targets
        // make a spell illegal to play when none exist.
        const abilities = registry.getAbilities(cardId as string) ?? [];
        const spellAbility = abilities.find((a: { type: string }) => a.type === "spell");
        const effect = spellAbility?.effect as
          | { target?: { type: string; quantity?: number | "all" }; player?: string }
          | undefined;
        // Rule 355.10.d: quantity:"all" is programmatic selection, not a caster
        // Choice — do not require ≥1 match to enumerate the play.
        if (
          effect?.target &&
          effect.target.type !== "self" &&
          effect.target.quantity !== "all" &&
          !effect.player
        ) {
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
      const { cardId, playerId, targets, xAmount, repeatCount } = context.params;
      const { zones } = context;

      const repeatN = Math.max(0, repeatCount ?? 0);
      deductCost(
        draft,
        playerId,
        cardId,
        { repeatCount: repeatN, targets, xAmount },
        createMetaAccessor(context.cards),
      );

      // Look up spell effect from card definition
      const registry = getGlobalCardRegistry();
      const abilities = registry.getAbilities(cardId) ?? [];
      const spellAbility = abilities.find((a) => a.type === "spell");
      const spellEffect = spellAbility?.effect;

      // For X-cost spells, wrap the effect so the chosen X value travels
      // With it through the chain. The effect executor reads `variables.x`
      // When resolving `{ variable: "x" }` amount expressions.
      // For Repeat spells, we wrap the effect in a `sequence` that
      // Repeats the original effect (1 + repeatCount) times. This
      // Executes during chain resolution exactly once per repeat.
      const xValue = Math.max(0, xAmount ?? 0);
      let effectToStore: unknown = spellEffect;
      if (spellEffect && repeatN > 0) {
        const repeatedEffects = Array.from({ length: 1 + repeatN }, () => spellEffect);
        effectToStore = {
          effects: repeatedEffects,
          type: "sequence",
        };
      }
      if (xValue > 0 && effectToStore) {
        effectToStore = {
          ...(effectToStore as Record<string, unknown>),
          _variables: { x: xValue },
        };
      }

      // Add spell to the chain (rule 537)
      const interaction = draft.interaction ?? createInteractionState();
      const turnOrder = Object.keys(draft.players);
      draft.interaction = addToChain(
        interaction,
        { cardId, controller: playerId, effect: effectToStore, type: "spell" },
        turnOrder,
      );

      // Rule 419.4.a: play-spell / play-card triggers fire when the spell
      // RESOLVES (not here) — see executeResolvedItem in chain-moves.ts.
      // Firing here would trigger e.g. Abandoned Hall even on countered
      // spells (425.1.b).

      // Rule 724 (Legion) tracker: count this spell play so subsequent
      // Cards can satisfy their Legion conditions.
      if (draft.cardsPlayedThisTurn) {
        draft.cardsPlayedThisTurn[playerId] = (draft.cardsPlayedThisTurn[playerId] ?? 0) + 1;
      }

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
   * Reveal and play a hidden card (rule 723.1.c.3).
   *
   * Playing a card from facedown OPENS a chain. For spell cards this
   * means we add a chain item (same as playSpell). For unit/gear cards
   * we move them to the appropriate zone (battlefield / base).
   */
  revealHidden: {
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
      return true;
    },
    reducer: (draft, context) => {
      const { cardId, playerId } = context.params;
      const { zones, counters, cards } = context;

      const meta = cards.getCardMeta(cardId as CoreCardId) as Partial<RiftboundCardMeta>;
      const battlefieldId = meta.hiddenAt;

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
          { cardId, controller: playerId, effect: spellEffect, type: "spell" },
          turnOrder,
        );
        zones.moveCard({
          cardId: cardId as CoreCardId,
          targetZoneId: "trash" as CoreZoneId,
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
        fireTriggers({ cardId, playerId, type: "play-self" }, { cards, counters, draft, zones });
        fireTriggers(
          { cardId, cardType: "unit", playerId, type: "play-card" },
          { cards, counters, draft, zones },
        );
      }
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
      if (state.pendingChoice) {
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

          counters.setFlag(championId, "exhausted", true);
        }
      }
    },
  },
};
