/**
 * Chain & Showdown Moves
 *
 * Moves for interacting with the chain (spell stack) and showdown (combat window).
 * Includes activated ability support and spell effect execution on resolution.
 */

import type {
  CardId as CoreCardId,
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
  GameMoveDefinitions,
} from "@tcg/core";
import {
  addToChain,
  allPlayersPassed,
  createInteractionState,
  endShowdown as endShowdownState,
  getActiveShowdown,
  getTurnState,
  isLegalTiming,
  isShowdownEnded,
  passFocus as passFocusState,
  passPriority as passPriorityState,
  resolveTopItem,
  startShowdown as startShowdownState,
} from "../../chain";
import type { ChainItem } from "../../chain";
import { executeEffect } from "../../abilities/effect-executor";
import type { EffectContext, ExecutableEffect } from "../../abilities/effect-executor";
import { fireTriggers } from "../../abilities/trigger-runner";
import { performCleanup } from "../../cleanup";
import { getGlobalCardRegistry } from "../../operations/card-lookup";
import type { RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "../../types";

/**
 * Build an EffectContext from a move reducer's context.
 */
function buildEffectContext(
  draft: RiftboundGameState,
  playerId: string,
  sourceCardId: string,
  context: {
    zones: {
      moveCard: (params: { cardId: CoreCardId; targetZoneId: CoreZoneId }) => void;
      drawCards: (params: {
        count: number;
        from: CoreZoneId;
        to: CoreZoneId;
        playerId: CorePlayerId;
      }) => CoreCardId[];
      getCardsInZone: (zoneId: CoreZoneId, playerId?: CorePlayerId) => CoreCardId[];
      getCardZone: (cardId: CoreCardId) => CoreZoneId | undefined;
    };
    cards: {
      getCardOwner: (cardId: CoreCardId) => string | undefined;
      getCardMeta: (cardId: CoreCardId) => Partial<RiftboundCardMeta> | undefined;
      updateCardMeta: (cardId: CoreCardId, meta: Partial<RiftboundCardMeta>) => void;
    };
    counters: {
      setFlag: (cardId: CoreCardId, flag: string, value: boolean) => void;
      addCounter: (cardId: CoreCardId, counter: string, amount: number) => void;
      removeCounter: (cardId: CoreCardId, counter: string, amount: number) => void;
      clearCounter: (cardId: CoreCardId, counter: string) => void;
    };
  },
): EffectContext {
  const triggerCtx = {
    cards: context.cards,
    counters: context.counters,
    draft,
    zones: context.zones,
  };
  return {
    cards: {
      getCardMeta: context.cards.getCardMeta as EffectContext["cards"]["getCardMeta"],
      getCardOwner: context.cards.getCardOwner,
      updateCardMeta: context.cards.updateCardMeta as EffectContext["cards"]["updateCardMeta"],
    },
    counters: context.counters,
    draft,
    fireTriggers: (event) => fireTriggers(event, triggerCtx),
    playerId,
    sourceCardId,
    sourceZone: context.zones.getCardZone(sourceCardId as CoreCardId) as string | undefined,
    zones: context.zones,
  };
}

/**
 * Execute a resolved chain item's effect.
 * Skips execution if the item was countered (rule 543).
 */
function executeResolvedItem(
  resolved: ChainItem,
  draft: RiftboundGameState,
  context: Parameters<typeof buildEffectContext>[3],
): void {
  // Countered items don't execute their effects
  if (resolved.countered) {
    return;
  }

  const effect = resolved.effect as ExecutableEffect | undefined;
  if (!effect) {
    // No stored effect — try to look up from card registry (fallback for spells)
    const registry = getGlobalCardRegistry();
    const abilities = registry.getAbilities(resolved.cardId) ?? [];
    const spellAbility = abilities.find((a) => a.type === "spell");
    if (spellAbility?.effect) {
      const effectCtx = buildEffectContext(draft, resolved.controller, resolved.cardId, context);
      executeEffect(spellAbility.effect as ExecutableEffect, effectCtx);
    }
    return;
  }

  const effectCtx = buildEffectContext(draft, resolved.controller, resolved.cardId, context);
  executeEffect(effect, effectCtx);
}

/**
 * Deduct an activated ability's cost from the player's rune pool.
 */
function deductAbilityCost(
  draft: RiftboundGameState,
  playerId: string,
  cost: Record<string, unknown>,
): void {
  const pool = draft.runePools[playerId];
  if (!pool) {
    return;
  }

  const energyCost = (cost.energy as number) ?? 0;
  if (energyCost > 0) {
    pool.energy = Math.max(0, pool.energy - energyCost);
  }

  const powerCost = cost.power as string[] | undefined;
  if (powerCost) {
    for (const domain of powerCost) {
      const key = domain as keyof typeof pool.power;
      pool.power[key] = Math.max(0, (pool.power[key] ?? 0) - 1);
    }
  }
}

export const chainMoves: Partial<
  GameMoveDefinitions<RiftboundGameState, RiftboundMoves, RiftboundCardMeta, unknown>
> = {
  /**
   * Pass priority during a chain (rule 540.4)
   *
   * The active player passes. If all relevant players pass,
   * the top item on the chain resolves and its effect executes.
   */
  passChainPriority: {
    condition: (state, context) => {
      if (!state.interaction?.chain?.active) {
        return false;
      }
      return state.interaction.chain.activePlayer === context.params.playerId;
    },
    enumerator: (state, context) => {
      if (!state.interaction?.chain?.active) {return [];}
      if (state.interaction.chain.activePlayer !== (context.playerId as string)) {return [];}
      return [{ playerId: context.playerId as string }];
    },
    reducer: (draft, context) => {
      if (!draft.interaction) {
        return;
      }

      draft.interaction = passPriorityState(draft.interaction);

      // If all passed, auto-resolve the top item
      if (allPlayersPassed(draft.interaction)) {
        const { resolved, newState } = resolveTopItem(draft.interaction);
        draft.interaction = newState;

        if (resolved) {
          executeResolvedItem(resolved, draft, context);

          // Run state-based checks after resolution (rule 543.3/518)
          performCleanup({
            cards: context.cards,
            counters: context.counters,
            draft,
            zones: context.zones,
          });
        }
      }
    },
  },

  /**
   * Manually resolve the top item on the chain (rule 543)
   *
   * Called after all players have passed priority.
   */
  resolveChain: {
    condition: (state) => {
      if (!state.interaction?.chain?.active) {
        return false;
      }
      return allPlayersPassed(state.interaction);
    },
    enumerator: (state) => {
      if (!state.interaction?.chain?.active) {return [];}
      if (!allPlayersPassed(state.interaction)) {return [];}
      return [{}];
    },
    reducer: (draft, context) => {
      if (!draft.interaction) {
        return;
      }

      const { resolved, newState } = resolveTopItem(draft.interaction);
      draft.interaction = newState;

      if (resolved) {
        executeResolvedItem(resolved, draft, context);

        performCleanup({
          cards: context.cards,
          counters: context.counters,
          draft,
          zones: context.zones,
        });
      }
    },
  },

  /**
   * Activate an ability on a card (rules 564-585)
   *
   * Player chooses a card + ability index, pays the cost,
   * and the ability goes on the chain.
   */
  activateAbility: {
    condition: (state, context) => {
      if (state.status !== "playing") {
        return false;
      }

      const { playerId, cardId, abilityIndex } = context.params;

      // Card must be on board
      const zone = context.zones.getCardZone(cardId as CoreCardId) as string | undefined;
      if (!zone || (zone !== "base" && !zone.startsWith("battlefield"))) {
        return false;
      }

      // Must be controlled by the player
      const owner = context.cards.getCardOwner(cardId as CoreCardId);
      if (owner !== playerId) {
        return false;
      }

      // Look up the ability
      const registry = getGlobalCardRegistry();
      const abilities = registry.getAbilities(cardId) ?? [];
      const ability = abilities[abilityIndex];
      if (!ability || ability.type !== "activated") {
        return false;
      }

      // Check timing legality
      const interaction = state.interaction ?? createInteractionState();
      const turnState = getTurnState(interaction);
      const timing = (ability.keyword === "Reaction" ? "reaction" : "action") as
        | "action"
        | "reaction";
      if (!isLegalTiming(timing, turnState)) {
        return false;
      }

      // Check if player can afford the cost
      if (ability.cost) {
        const cost = ability.cost as Record<string, unknown>;
        const pool = state.runePools[playerId];
        if (!pool) {
          return false;
        }

        const energyCost = (cost.energy as number) ?? 0;
        if (pool.energy < energyCost) {
          return false;
        }

        const powerCost = cost.power as string[] | undefined;
        if (powerCost) {
          const needed: Record<string, number> = {};
          for (const d of powerCost) {
            needed[d] = (needed[d] ?? 0) + 1;
          }
          for (const [d, count] of Object.entries(needed)) {
            if ((pool.power[d as keyof typeof pool.power] ?? 0) < count) {
              return false;
            }
          }
        }
      }

      return true;
    },
    enumerator: (state, context) => {
      if (state.status !== "playing") {return [];}
      const playerId = context.playerId as string;
      const registry = getGlobalCardRegistry();
      const interaction = state.interaction ?? createInteractionState();
      const turnState = getTurnState(interaction);
      const results: { playerId: string; cardId: string; abilityIndex: number }[] = [];

      // Collect cards on base and battlefields owned by this player
      const baseCards = context.zones.getCardsInZone(
        "base" as CoreZoneId,
        playerId as CorePlayerId,
      );
      const bfCards: CoreCardId[] = [];
      for (const bfId of Object.keys(state.battlefields ?? {})) {
        const cards = context.zones.getCardsInZone(bfId as CoreZoneId, playerId as CorePlayerId);
        bfCards.push(...cards);
      }

      for (const cardId of [...baseCards, ...bfCards]) {
        const owner = context.cards.getCardOwner(cardId);
        if (owner !== playerId) {continue;}

        const abilities = registry.getAbilities(cardId as string) ?? [];
        for (let i = 0; i < abilities.length; i++) {
          const ability = abilities[i];
          if (!ability || ability.type !== "activated") {continue;}

          // Check timing
          const timing = (ability.keyword === "Reaction" ? "reaction" : "action") as
            | "action"
            | "reaction";
          if (!isLegalTiming(timing, turnState)) {continue;}

          // Check cost affordability
          if (ability.cost) {
            const cost = ability.cost as Record<string, unknown>;
            const pool = state.runePools[playerId];
            if (!pool) {continue;}
            const energyCost = (cost.energy as number) ?? 0;
            if (pool.energy < energyCost) {continue;}
            const powerCost = cost.power as string[] | undefined;
            if (powerCost) {
              const needed: Record<string, number> = {};
              for (const d of powerCost) {needed[d] = (needed[d] ?? 0) + 1;}
              let affordable = true;
              for (const [d, count] of Object.entries(needed)) {
                if ((pool.power[d as keyof typeof pool.power] ?? 0) < count) {
                  affordable = false;
                  break;
                }
              }
              if (!affordable) {continue;}
            }
          }

          results.push({ abilityIndex: i, cardId: cardId as string, playerId });
        }
      }
      return results;
    },
    reducer: (draft, context) => {
      const { playerId, cardId, abilityIndex } = context.params;

      const registry = getGlobalCardRegistry();
      const abilities = registry.getAbilities(cardId) ?? [];
      const ability = abilities[abilityIndex];
      if (!ability) {
        return;
      }

      // Pay cost
      if (ability.cost) {
        const cost = ability.cost as Record<string, unknown>;
        deductAbilityCost(draft, playerId, cost);

        // Handle exhaust cost
        if (cost.exhaust) {
          context.counters.setFlag(cardId as CoreCardId, "exhausted", true);
        }
      }

      // Add ability to chain
      const interaction = draft.interaction ?? createInteractionState();
      const turnOrder = Object.keys(draft.players);
      draft.interaction = addToChain(
        interaction,
        { cardId, controller: playerId, effect: ability.effect, type: "ability" },
        turnOrder,
      );
    },
  },

  /**
   * Pass focus during a showdown (rule 553.4)
   *
   * The focus player passes. If all relevant players pass,
   * the showdown ends.
   */
  passShowdownFocus: {
    condition: (state, context) => {
      const interaction = state.interaction ?? createInteractionState();
      const activeShowdown = getActiveShowdown(interaction);
      if (!activeShowdown?.active) {
        return false;
      }
      return activeShowdown.focusPlayer === context.params.playerId;
    },
    enumerator: (state, context) => {
      const interaction = state.interaction ?? createInteractionState();
      const activeShowdown = getActiveShowdown(interaction);
      if (!activeShowdown?.active) {return [];}
      if (activeShowdown.focusPlayer !== (context.playerId as string)) {return [];}
      return [{ playerId: context.playerId as string }];
    },
    reducer: (draft) => {
      if (!draft.interaction) {
        return;
      }

      draft.interaction = passFocusState(draft.interaction);

      // If showdown ended (all passed), clean up
      if (isShowdownEnded(draft.interaction)) {
        draft.interaction = endShowdownState(draft.interaction);
      }
    },
  },

  /**
   * Start a showdown at a battlefield (rule 548)
   *
   * Triggered when a battlefield becomes contested.
   */
  startShowdown: {
    condition: (state, context) => {
      if (state.status !== "playing") {
        return false;
      }
      const bf = state.battlefields[context.params.battlefieldId];
      if (!bf) {
        return false;
      }
      // Allow nested showdowns — a new showdown pushes onto the stack
      return true;
    },
    enumerator: (state, context) => {
      if (state.status !== "playing") {return [];}
      const results: { playerId: string; battlefieldId: string }[] = [];
      for (const bfId of Object.keys(state.battlefields ?? {})) {
        if (state.battlefields[bfId]) {
          results.push({ battlefieldId: bfId, playerId: context.playerId as string });
        }
      }
      return results;
    },
    reducer: (draft, context) => {
      const { playerId, battlefieldId } = context.params;
      const playerIds = Object.keys(draft.players);

      const bf = draft.battlefields[battlefieldId];
      const relevantPlayers = bf?.contested
        ? [playerId, ...(bf.contestedBy && bf.contestedBy !== playerId ? [bf.contestedBy] : [])]
        : playerIds;

      const uniqueRelevant = [...new Set(relevantPlayers)];
      const opponent = uniqueRelevant.find((p) => p !== playerId) ?? playerId;

      const interaction = draft.interaction ?? createInteractionState();
      draft.interaction = startShowdownState(
        interaction,
        battlefieldId,
        playerId,
        uniqueRelevant,
        bf?.contested ?? false,
        playerId,
        opponent,
      );
    },
  },

  /**
   * End a showdown (rule 553.4.a)
   *
   * Called when all relevant players have passed focus.
   */
  endShowdown: {
    condition: (state) => {
      const interaction = state.interaction ?? createInteractionState();
      const activeShowdown = getActiveShowdown(interaction);
      return activeShowdown?.active === false || isShowdownEnded(interaction);
    },
    enumerator: (state) => {
      const interaction = state.interaction ?? createInteractionState();
      if (!interaction.showdownStack?.length) {return [];}
      const activeShowdown = getActiveShowdown(interaction);
      if (activeShowdown?.active === false || isShowdownEnded(interaction)) {return [{}];}
      return [];
    },
    reducer: (draft) => {
      if (!draft.interaction) {
        return;
      }
      draft.interaction = endShowdownState(draft.interaction);
    },
  },
};
