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

  const rawEffect = resolved.effect as
    | (ExecutableEffect & { _variables?: Record<string, number> })
    | undefined;
  if (!rawEffect) {
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

  // Strip any bound variables (e.g., X-cost value) before executing — they
  // Are threaded into the EffectContext so `{ variable: "x" }` expressions
  // Can resolve to the chosen X amount during spell resolution.
  const { _variables, ...effectRest } = rawEffect;
  const effect = effectRest as ExecutableEffect;

  const baseCtx = buildEffectContext(draft, resolved.controller, resolved.cardId, context);
  const effectCtx: EffectContext = _variables ? { ...baseCtx, variables: _variables } : baseCtx;
  executeEffect(effect, effectCtx);
}

/**
 * A resolved entry returned by `collectActivatedAbilities`.
 *
 * - `hostCardId` is the card whose cost will be paid (e.g., Heimerdinger,
 *   Svellsongur). This is always the card the player selects.
 * - `sourceCardId` is the card whose ability text/effect is used. It equals
 *   `hostCardId` for a card's own abilities and differs for inherited /
 *   copied abilities.
 * - `abilityIndex` indexes into the source card's registry ability list.
 */
interface ActivatedEntry {
  hostCardId: string;
  sourceCardId: string;
  abilityIndex: number;
  ability: NonNullable<
    ReturnType<ReturnType<typeof getGlobalCardRegistry>["getAbilities"]>
  >[number];
}

/**
 * Collect every activated ability available on `hostCardId`, including
 * abilities inherited via `inheritExhaustAbilities` (Heimerdinger) or
 * copied via `copiedFromCardId` meta (Svellsongur).
 *
 * Each returned entry is a distinct `(sourceCardId, abilityIndex)` pair that
 * will be paid on `hostCardId`. Own abilities come first so the existing
 * ability-index convention is preserved for cards without inheritance.
 */
function collectActivatedAbilities(
  hostCardId: string,
  playerId: string,
  ctx: {
    zones: {
      getCardsInZone: (zoneId: CoreZoneId, playerId?: CorePlayerId) => CoreCardId[];
    };
    cards: {
      getCardOwner: (cardId: CoreCardId) => string | undefined;
      getCardMeta: (cardId: CoreCardId) => Partial<RiftboundCardMeta> | undefined;
    };
    battlefields: Record<string, unknown>;
  },
): ActivatedEntry[] {
  const registry = getGlobalCardRegistry();
  const entries: ActivatedEntry[] = [];

  // 1. Own abilities (always present — abilityIndex matches getAbilities)
  const ownAbilities = registry.getAbilities(hostCardId) ?? [];
  for (let i = 0; i < ownAbilities.length; i++) {
    const ability = ownAbilities[i];
    if (!ability || ability.type !== "activated") {
      continue;
    }
    entries.push({
      ability,
      abilityIndex: i,
      hostCardId,
      sourceCardId: hostCardId,
    });
  }

  // 2. Copied abilities (Svellsongur): when `copiedFromCardId` is set,
  // Expose the referenced card's activated abilities as if they were this
  // Card's own.
  const hostMeta = ctx.cards.getCardMeta(hostCardId as CoreCardId) as
    | Partial<RiftboundCardMeta>
    | undefined;
  const copiedFrom = hostMeta?.copiedFromCardId;
  if (copiedFrom && copiedFrom !== hostCardId) {
    const copiedAbilities = registry.getAbilities(copiedFrom as string) ?? [];
    for (let i = 0; i < copiedAbilities.length; i++) {
      const ability = copiedAbilities[i];
      if (!ability || ability.type !== "activated") {
        continue;
      }
      entries.push({
        ability,
        abilityIndex: i,
        hostCardId,
        sourceCardId: copiedFrom as string,
      });
    }
  }

  // 3. Inherited exhaust abilities (Heimerdinger): scan every friendly
  // Legend, unit, and gear for activated abilities whose cost includes
  // `exhaust: true`, and expose each as if it were an ability of this card.
  const hostDef = registry.get(hostCardId);
  if (hostDef?.inheritExhaustAbilities) {
    const friendlyCardIds = collectFriendlyBoardCards(playerId, ctx);
    for (const otherCardId of friendlyCardIds) {
      if (otherCardId === hostCardId) {
        continue;
      }
      const otherDef = registry.get(otherCardId);
      if (!otherDef) {
        continue;
      }
      const { cardType } = otherDef;
      if (
        cardType !== "legend" &&
        cardType !== "unit" &&
        cardType !== "gear" &&
        cardType !== "equipment"
      ) {
        continue;
      }
      const otherAbilities = registry.getAbilities(otherCardId) ?? [];
      for (let i = 0; i < otherAbilities.length; i++) {
        const ability = otherAbilities[i];
        if (!ability || ability.type !== "activated") {
          continue;
        }
        const cost = ability.cost as Record<string, unknown> | undefined;
        if (!cost || cost.exhaust !== true) {
          continue;
        }
        entries.push({
          ability,
          abilityIndex: i,
          hostCardId,
          sourceCardId: otherCardId,
        });
      }
    }
  }

  return entries;
}

/**
 * Collect all friendly cards on the board for a player — used when scanning
 * for inheritable abilities (Heimerdinger).
 */
function collectFriendlyBoardCards(
  playerId: string,
  ctx: {
    zones: {
      getCardsInZone: (zoneId: CoreZoneId, playerId?: CorePlayerId) => CoreCardId[];
    };
    cards: { getCardOwner: (cardId: CoreCardId) => string | undefined };
    battlefields: Record<string, unknown>;
  },
): string[] {
  const collected: string[] = [];
  const push = (cards: CoreCardId[]) => {
    for (const cardId of cards) {
      if (ctx.cards.getCardOwner(cardId) === playerId) {
        collected.push(cardId as string);
      }
    }
  };
  push(ctx.zones.getCardsInZone("base" as CoreZoneId, playerId as CorePlayerId));
  push(ctx.zones.getCardsInZone("legendZone" as CoreZoneId, playerId as CorePlayerId));
  push(ctx.zones.getCardsInZone("championZone" as CoreZoneId, playerId as CorePlayerId));
  for (const bfId of Object.keys(ctx.battlefields)) {
    push(ctx.zones.getCardsInZone(`battlefield-${bfId}` as CoreZoneId, playerId as CorePlayerId));
  }
  return collected;
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
      if (state.pendingChoice) {
        return false;
      }
      if (!state.interaction?.chain?.active) {
        return false;
      }
      return state.interaction.chain.activePlayer === context.params.playerId;
    },
    enumerator: (state, context) => {
      if (state.pendingChoice) {
        return [];
      }
      if (!state.interaction?.chain?.active) {
        return [];
      }
      if (state.interaction.chain.activePlayer !== (context.playerId as string)) {
        return [];
      }
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
      if (!state.interaction?.chain?.active) {
        return [];
      }
      if (!allPlayersPassed(state.interaction)) {
        return [];
      }
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
      if (state.pendingChoice) {
        return false;
      }

      const { playerId, cardId, abilityIndex, sourceCardId } = context.params;

      // Card must be on board (base, battlefield, legendZone, battlefieldRow).
      // Rule 580 / 101 (clarified): champions in championZone have NOT been
      // Played yet — they must be played from championZone into play before
      // Their activated abilities can be used. Legends in legendZone, by
      // Contrast, remain accessible from their zone. ChampionZone is therefore
      // Excluded from the set of zones that permit activation.
      const zone = context.zones.getCardZone(cardId as CoreCardId) as string | undefined;
      if (
        !zone ||
        (zone !== "base" &&
          !zone.startsWith("battlefield") &&
          zone !== "legendZone" &&
          zone !== "battlefieldRow")
      ) {
        return false;
      }

      // Must be controlled by the player
      const owner = context.cards.getCardOwner(cardId as CoreCardId);
      if (owner !== playerId) {
        return false;
      }

      // Look up the ability from the source card (may equal cardId for own
      // Abilities or differ for inherited/copied abilities).
      const registry = getGlobalCardRegistry();
      const abilityLookupId = (sourceCardId as string | undefined) ?? cardId;
      const abilities = registry.getAbilities(abilityLookupId) ?? [];
      const ability = abilities[abilityIndex];
      if (!ability || ability.type !== "activated") {
        return false;
      }

      // If an inherited ability was requested, verify that the host card
      // Legitimately exposes it (prevents arbitrary cross-card activation).
      if (sourceCardId && sourceCardId !== cardId) {
        const entries = collectActivatedAbilities(cardId, playerId, {
          battlefields: state.battlefields,
          cards: context.cards,
          zones: context.zones,
        });
        const match = entries.find(
          (e) => e.sourceCardId === sourceCardId && e.abilityIndex === abilityIndex,
        );
        if (!match) {
          return false;
        }
      }

      // Check timing legality
      const interaction = state.interaction ?? createInteractionState();
      const turnState = getTurnState(interaction);
      const isReaction = ability.keyword === "Reaction" || ability.timing === "reaction";
      const timing = (isReaction ? "reaction" : "action") as "action" | "reaction";
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

        // Rule 577.2: Cost must be payable at activation time. An [Exhaust]
        // Cost cannot be paid if the host card is already exhausted.
        // Exhaust always applies to the host card (`cardId`), even for
        // Inherited abilities where the source differs (e.g., Heimerdinger).
        if (cost.exhaust) {
          const {getFlag} = (
            context.counters as { getFlag?: (c: CoreCardId, f: string) => boolean }
          );
          if (getFlag && getFlag(cardId as CoreCardId, "exhausted")) {
            return false;
          }
          const hostMeta = context.cards.getCardMeta(cardId as CoreCardId) as
            | { exhausted?: boolean }
            | undefined;
          if (hostMeta?.exhausted === true) {
            return false;
          }
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
      const playerId = context.playerId as string;
      const interaction = state.interaction ?? createInteractionState();
      const turnState = getTurnState(interaction);
      const results: {
        playerId: string;
        cardId: string;
        abilityIndex: number;
        sourceCardId?: string;
      }[] = [];

      // Collect cards on base, battlefields, legendZone, battlefieldRow, and championZone
      const baseCards = context.zones.getCardsInZone(
        "base" as CoreZoneId,
        playerId as CorePlayerId,
      );
      const bfCards: CoreCardId[] = [];
      for (const bfId of Object.keys(state.battlefields ?? {})) {
        const bfZoneId = `battlefield-${bfId}` as CoreZoneId;
        const cards = context.zones.getCardsInZone(bfZoneId, playerId as CorePlayerId);
        bfCards.push(...cards);
      }
      const legendCards = context.zones.getCardsInZone(
        "legendZone" as CoreZoneId,
        playerId as CorePlayerId,
      );
      const battlefieldRowCards = context.zones.getCardsInZone(
        "battlefieldRow" as CoreZoneId,
        playerId as CorePlayerId,
      );
      const championZoneCards = context.zones.getCardsInZone(
        "championZone" as CoreZoneId,
        playerId as CorePlayerId,
      );

      for (const cardId of [
        ...baseCards,
        ...bfCards,
        ...legendCards,
        ...battlefieldRowCards,
        ...championZoneCards,
      ]) {
        const owner = context.cards.getCardOwner(cardId);
        if (owner !== playerId) {
          continue;
        }

        const entries = collectActivatedAbilities(cardId as string, playerId, {
          battlefields: state.battlefields,
          cards: context.cards,
          zones: context.zones,
        });

        for (const entry of entries) {
          const { ability } = entry;

          // Check timing
          const isReaction = ability.keyword === "Reaction" || ability.timing === "reaction";
          const timing = (isReaction ? "reaction" : "action") as "action" | "reaction";
          if (!isLegalTiming(timing, turnState)) {
            continue;
          }

          // Check cost affordability
          if (ability.cost) {
            const cost = ability.cost as Record<string, unknown>;
            const pool = state.runePools[playerId];
            if (!pool) {
              continue;
            }
            const energyCost = (cost.energy as number) ?? 0;
            if (pool.energy < energyCost) {
              continue;
            }
            const powerCost = cost.power as string[] | undefined;
            if (powerCost) {
              const needed: Record<string, number> = {};
              for (const d of powerCost) {
                needed[d] = (needed[d] ?? 0) + 1;
              }
              let affordable = true;
              for (const [d, count] of Object.entries(needed)) {
                if ((pool.power[d as keyof typeof pool.power] ?? 0) < count) {
                  affordable = false;
                  break;
                }
              }
              if (!affordable) {
                continue;
              }
            }

            // Rule 577.2: An [Exhaust] cost cannot be paid if the host card
            // Is already exhausted. `entry.hostCardId` is the card that
            // Would pay the exhaust (the unit holding the ability).
            if (cost.exhaust) {
              const hostCardId = entry.hostCardId as CoreCardId;
              const {getFlag} = (
                context.counters as { getFlag?: (c: CoreCardId, f: string) => boolean }
              );
              if (getFlag && getFlag(hostCardId, "exhausted")) {
                continue;
              }
              const hostMeta = context.cards.getCardMeta(hostCardId) as
                | { exhausted?: boolean }
                | undefined;
              if (hostMeta?.exhausted === true) {
                continue;
              }
            }
          }

          const result: {
            playerId: string;
            cardId: string;
            abilityIndex: number;
            sourceCardId?: string;
          } = {
            abilityIndex: entry.abilityIndex,
            cardId: entry.hostCardId,
            playerId,
          };
          if (entry.sourceCardId !== entry.hostCardId) {
            result.sourceCardId = entry.sourceCardId;
          }
          results.push(result);
        }
      }
      return results;
    },
    reducer: (draft, context) => {
      const { playerId, cardId, abilityIndex, sourceCardId } = context.params;

      const registry = getGlobalCardRegistry();
      // For inherited/copied abilities, look up the ability text from the
      // Source card, but pay the cost on the host card (`cardId`).
      const abilityLookupId = (sourceCardId as string | undefined) ?? cardId;
      const abilities = registry.getAbilities(abilityLookupId) ?? [];
      const ability = abilities[abilityIndex];
      if (!ability) {
        return;
      }

      // Pay cost
      if (ability.cost) {
        const cost = ability.cost as Record<string, unknown>;
        deductAbilityCost(draft, playerId, cost);

        // Handle exhaust cost — always exhaust the host card, never the
        // Source (Heimerdinger exhausts himself for an inherited ability).
        if (cost.exhaust) {
          context.counters.setFlag(cardId as CoreCardId, "exhausted", true);
        }
      }

      // Add ability to chain. The chain item's `cardId` is the host so that
      // Effect execution's `sourceCardId` (used for self-targeting and
      // Location-relative targets) resolves to the host.
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
      if (!activeShowdown?.active) {
        return [];
      }
      if (activeShowdown.focusPlayer !== (context.playerId as string)) {
        return [];
      }
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
      // Rule 548: Showdowns begin when a battlefield is contested
      if (!bf.contested) {
        return false;
      }
      return true;
    },
    enumerator: (state, context) => {
      if (state.status !== "playing") {
        return [];
      }
      // Rule 548: Only contested battlefields can have showdowns
      const results: { playerId: string; battlefieldId: string }[] = [];
      for (const bfId of Object.keys(state.battlefields ?? {})) {
        const bf = state.battlefields[bfId];
        if (bf?.contested) {
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
      if (!interaction.showdownStack?.length) {
        return [];
      }
      const activeShowdown = getActiveShowdown(interaction);
      if (activeShowdown?.active === false || isShowdownEnded(interaction)) {
        return [{}];
      }
      return [];
    },
    reducer: (draft) => {
      if (!draft.interaction) {
        return;
      }
      draft.interaction = endShowdownState(draft.interaction);
    },
  },

  /**
   * Invite a non-relevant player into the current chain or showdown
   * (rule 528.3.a / 553.3).
   *
   * The inviter must themselves be a Relevant Player for the active
   * chain/showdown (since only relevant players take discretionary
   * actions). The invited player becomes Relevant for the remainder of
   * this chain/showdown and is appended to the rotation so they get
   * priority/focus after everyone ahead of them has passed.
   */
  invitePlayer: {
    condition: (state, context) => {
      if (state.status !== "playing") {
        return false;
      }
      if (state.pendingChoice) {
        return false;
      }
      const {interaction} = state;
      if (!interaction) {
        return false;
      }
      const activeShowdown = getActiveShowdown(interaction);
      const {chain} = interaction;
      // Must have either an active chain or an active showdown
      if (!chain?.active && !activeShowdown?.active) {
        return false;
      }
      const { playerId, invitedPlayerId } = context.params;
      if (playerId === invitedPlayerId) {
        return false;
      }
      if (!state.players[invitedPlayerId]) {
        return false;
      }
      // Inviter must be relevant in the current chain or showdown
      const chainRelevant = chain?.relevantPlayers ?? [];
      const showdownRelevant = activeShowdown?.relevantPlayers ?? [];
      const inviterRelevant =
        chainRelevant.includes(playerId) || showdownRelevant.includes(playerId);
      if (!inviterRelevant) {
        return false;
      }
      // Cannot invite someone already relevant
      if (chainRelevant.includes(invitedPlayerId)) {
        return false;
      }
      if (showdownRelevant.includes(invitedPlayerId)) {
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
      const {interaction} = state;
      if (!interaction) {
        return [];
      }
      const activeShowdown = getActiveShowdown(interaction);
      const {chain} = interaction;
      if (!chain?.active && !activeShowdown?.active) {
        return [];
      }
      const inviter = context.playerId as string;
      const chainRelevant = chain?.relevantPlayers ?? [];
      const showdownRelevant = activeShowdown?.relevantPlayers ?? [];
      const inviterRelevant =
        chainRelevant.includes(inviter) || showdownRelevant.includes(inviter);
      if (!inviterRelevant) {
        return [];
      }
      const results: { playerId: string; invitedPlayerId: string }[] = [];
      for (const pid of Object.keys(state.players)) {
        if (pid === inviter) {
          continue;
        }
        if (chainRelevant.includes(pid) || showdownRelevant.includes(pid)) {
          continue;
        }
        results.push({ invitedPlayerId: pid, playerId: inviter });
      }
      return results;
    },
    reducer: (draft, context) => {
      if (!draft.interaction) {
        return;
      }
      const { invitedPlayerId } = context.params;
      const activeShowdown = getActiveShowdown(draft.interaction);
      const {chain} = draft.interaction;

      // Append to chain's relevant players (rule 528.3.a)
      if (chain?.active) {
        const chainRelevant = chain.relevantPlayers;
        if (!chainRelevant.includes(invitedPlayerId)) {
          (
            chain as unknown as { relevantPlayers: string[] }
          ).relevantPlayers = [...chainRelevant, invitedPlayerId];
        }
      }

      // Append to the top-of-stack showdown's relevant players (rule 553.3)
      if (activeShowdown?.active) {
        const stack = draft.interaction.showdownStack;
        const topIdx = stack.length - 1;
        if (topIdx >= 0) {
          const sd = stack[topIdx];
          if (sd && !sd.relevantPlayers.includes(invitedPlayerId)) {
            (sd as unknown as { relevantPlayers: string[] }).relevantPlayers = [
              ...sd.relevantPlayers,
              invitedPlayerId,
            ];
          }
        }
      }
    },
  },

  /**
   * Counter a spell on the chain (rule 544.x).
   *
   * Marks the target chain item as countered so its effect is skipped
   * when it resolves. Rule 544.3: costs paid for the countered card are
   * NOT refunded — only the resolve-time effect is skipped. Rule 544.4:
   * players may only counter cards when directed by a game effect;
   * the move permits any relevant player to invoke it because game
   * effects themselves pick the target and owner, but real card text
   * will funnel through the `counter` effect type in the executor.
   */
  counterSpell: {
    condition: (state, context) => {
      if (state.status !== "playing") {
        return false;
      }
      const chain = state.interaction?.chain;
      if (!chain?.active) {
        return false;
      }
      const { targetChainItemId, playerId } = context.params;
      if (!chain.relevantPlayers.includes(playerId)) {
        return false;
      }
      const target = chain.items.find((item) => item.id === targetChainItemId);
      if (!target) {
        return false;
      }
      if (target.countered) {
        return false;
      }
      return true;
    },
    enumerator: (state, context) => {
      if (state.status !== "playing") {
        return [];
      }
      const chain = state.interaction?.chain;
      if (!chain?.active) {
        return [];
      }
      const inviter = context.playerId as string;
      if (!chain.relevantPlayers.includes(inviter)) {
        return [];
      }
      const results: { playerId: string; targetChainItemId: string }[] = [];
      for (const item of chain.items) {
        if (item.countered) {
          continue;
        }
        results.push({ playerId: inviter, targetChainItemId: item.id });
      }
      return results;
    },
    reducer: (draft, context) => {
      const chain = draft.interaction?.chain;
      if (!chain) {
        return;
      }
      const { targetChainItemId } = context.params;
      for (let i = 0; i < chain.items.length; i++) {
        const item = chain.items[i];
        if (item && item.id === targetChainItemId && !item.countered) {
          (chain.items[i] as { countered: boolean }).countered = true;
          break;
        }
      }
    },
  },
};
