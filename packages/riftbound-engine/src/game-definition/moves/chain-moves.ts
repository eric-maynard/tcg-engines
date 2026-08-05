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
import { resolveTarget } from "../../abilities/target-resolver";
import type { TargetDescriptor } from "../../abilities/target-resolver";
import { fireTriggers } from "../../abilities/trigger-runner";
import { evaluateWhileLevel } from "../../abilities/xp-conditions";
import { performCleanup } from "../../cleanup";
import { getGlobalCardRegistry } from "../../operations/card-lookup";
import type { RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "../../types";
import { hasPlayerWon } from "../win-conditions/victory";
import { getPotentialRuneEnergy, spellEffectHasLegalTargets } from "./cards";
import type { SpellEffectTargetShape } from "./cards";

/**
 * Build an EffectContext from a move reducer's context.
 */
export function buildEffectContext(
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
  const zonesWithCreate = context.zones as typeof context.zones & {
    createCardInZone?: (params: {
      cardId: CoreCardId;
      definitionId: string;
      zoneId: CoreZoneId;
      ownerId: CorePlayerId;
      controllerId?: CorePlayerId;
    }) => void;
  };
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
    createCardInZone: zonesWithCreate.createCardInZone
      ? (cardId, zoneId, ownerId) => {
          // [invariant:no-console-errors] Ability-minted token instance ids
          // (token-<slug>-<ts>-<n>) are not valid definitionIds — the image
          // server only knows the shared token-def-<slug> ids used by the
          // manual addToken path. Derive that shared id here so snapshots
          // ship a resolvable definitionId instead of the instance id.
          const slug = /^token-(.+)-\d+-\d+$/.exec(cardId)?.[1];
          return zonesWithCreate.createCardInZone?.({
            cardId: cardId as CoreCardId,
            controllerId: ownerId as CorePlayerId,
            definitionId: slug ? `token-def-${slug}` : cardId,
            ownerId: ownerId as CorePlayerId,
            zoneId: zoneId as CoreZoneId,
          });
        }
      : undefined,
    draft,
    fireTriggers: (event) => fireTriggers(event, triggerCtx),
    playerId,
    sourceCardId,
    sourceZone: context.zones.getCardZone(sourceCardId as CoreCardId) as string | undefined,
    zones: context.zones,
  };
}

/**
 * Rule 135.2.e.5.a: a [rainbow] Power cost may be paid with Power of any
 * Domain. Return true if the pool can cover the given per-domain need,
 * treating "rainbow" as consuming from whichever domain has the most left.
 */
function canAffordPower(
  pool: Partial<Record<string, number>>,
  needed: Record<string, number>,
): boolean {
  const remaining: Record<string, number> = {};
  for (const [d, v] of Object.entries(pool)) {
    if (typeof v === "number" && v > 0) {
      remaining[d] = v;
    }
  }
  let rainbowNeed = 0;
  for (const [d, count] of Object.entries(needed)) {
    if (d === "rainbow") {
      rainbowNeed += count;
      continue;
    }
    if ((remaining[d] ?? 0) < count) {
      return false;
    }
    remaining[d] -= count;
  }
  const leftover = Object.values(remaining).reduce((a, b) => a + b, 0);
  return leftover >= rainbowNeed;
}

/**
 * Execute a resolved chain item's effect.
 * Skips execution if the item was countered (rule 543).
 */
export function executeResolvedItem(
  resolved: ChainItem,
  draft: RiftboundGameState,
  context: Parameters<typeof buildEffectContext>[3],
): void {
  // Countered items don't execute their effects
  if (resolved.countered) {
    return;
  }

  // Rule 583 (unl-021-219): a "you may …" trigger reaches resolution but its
  // effect runs only if the controller opts in. Pause via an `opt-in` pending
  // choice; on accept the reducer re-enters here with `optional` cleared.
  if (resolved.optional) {
    draft.pendingChoice = {
      type: "opt-in",
      playerId: resolved.controller,
      sourceCardId: resolved.cardId,
      resolved: { ...resolved, optional: false },
    };
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
      const baseCtx = buildEffectContext(draft, resolved.controller, resolved.cardId, context);
      const effectCtx: EffectContext = resolved.targets
        ? { ...baseCtx, boundTargets: resolved.targets }
        : baseCtx;
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

  // rule-id: ven-021-166 — expose the firing event's from/to zones so
  // `location: "move-to-or-from"` targets resolve against only the
  // battlefields the triggering move touched.
  const trigEvt = resolved.triggerEvent as { from?: string; to?: string } | undefined;
  const triggerZones = trigEvt
    ? [trigEvt.from, trigEvt.to].filter((z): z is string => typeof z === "string")
    : undefined;

  // Rule 355.10: for a resolved effect that targets a caster-chosen single
  // card ("give a unit X"), the controller picks which card. When targets
  // were not bound at chain-placement time and more than one legal option
  // exists, pause and ask via a `choose-target` pending choice; the effect
  // runs from `resolvePendingChoice` once the pick is made.
  let boundTargets = resolved.targets;
  const target = effect.target as TargetDescriptor | string | undefined;
  if (
    !boundTargets &&
    target &&
    // ogn-122-298: bare-string target ("self" / instanceId) is already fully
    // specified — never route through the choose-target prompt.
    typeof target !== "string" &&
    target.type !== "self" &&
    target.type !== "player" &&
    target.type !== "battlefield" &&
    target.quantity !== "all"
  ) {
    const options = resolveTarget(
      { ...target, quantity: "all" },
      {
        cards: baseCtx.cards,
        draft,
        playerId: resolved.controller,
        sourceCardId: resolved.cardId,
        sourceZone: baseCtx.sourceZone,
        triggerZones,
        zones: baseCtx.zones,
      },
    );
    if (options.length >= 2) {
      draft.pendingChoice = {
        type: "choose-target",
        playerId: resolved.controller,
        sourceCardId: resolved.cardId,
        effect,
        options,
        remaining: 1,
      };
      return;
    }
    boundTargets = options;
  }

  const effectCtx: EffectContext = {
    ...baseCtx,
    ...(_variables ? { variables: _variables } : {}),
    ...(boundTargets ? { boundTargets } : {}),
  };
  // Rule 359.2: "when you choose me" triggers fire when a spell/ability's
  // controller picks a card as a target.
  if (boundTargets && boundTargets.length > 0) {
    const trigCtx = { cards: context.cards, counters: context.counters, draft, zones: context.zones };
    for (const targetId of boundTargets) {
      fireTriggers({ cardId: targetId, chooserId: resolved.controller, type: "choose" }, trigCtx);
    }
  }
  const preLen = draft.interaction?.chain?.items.length ?? 0;
  executeEffect(effect, effectCtx);
  const postLen = draft.interaction?.chain?.items.length ?? 0;

  // Rule 419.4.a: abilities that trigger on playing a card fire when that
  // act is completed by resolution — not when the card is placed on the
  // chain, and never if the card was countered (425.1.b).
  if (resolved.type === "spell") {
    const trigCtx = {
      cards: context.cards,
      counters: context.counters,
      draft,
      zones: context.zones,
    };
    fireTriggers(
      { cardId: resolved.cardId, playerId: resolved.controller, type: "play-spell" },
      trigCtx,
    );
    fireTriggers(
      {
        cardId: resolved.cardId,
        cardType: "spell",
        playerId: resolved.controller,
        type: "play-card",
      },
      trigCtx,
    );
    // Rule 354.2 / 383.2.c / 337.1.b: a pending play the resolving spell put on
    // the chain (Thrill of the Hunt banish→play) must finalize BEFORE any
    // trigger that becomes pending because the spell was played (Abandoned
    // Hall). Lift the effect-added items back above the just-queued triggers so
    // the replayed unit is on the board when the trigger's target is chosen.
    const chain = draft.interaction?.chain;
    if (chain && postLen > preLen && chain.items.length > postLen) {
      const items = chain.items as ChainItem[];
      const pendingPlays = items.splice(preLen, postLen - preLen);
      items.push(...pendingPlays);
    }
  }
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
  zones: { getCardsInZone: (zone: CoreZoneId, player: CorePlayerId) => readonly CoreCardId[] },
  counters: {
    getFlag: (cardId: CoreCardId, flag: string) => boolean | undefined;
    setFlag: (cardId: CoreCardId, flag: string, value: boolean) => void;
  },
): void {
  const pool = draft.runePools[playerId];
  if (!pool) {
    return;
  }

  const energyCost = (cost.energy as number) ?? 0;
  if (energyCost > 0) {
    // Rule 403.1.a + 404.1: the full [N] energy cost must be paid before an
    // ability is finalized to the chain. Rule 357.1.a lets a player exhaust
    // ready runes for energy during Pay Costs, and the condition/enumerator
    // credit those runes toward affordability — so when banked energy is
    // short, auto-exhaust ready runes here to actually cover the shortfall
    // instead of clamping the deduction to zero.
    let shortfall = energyCost - pool.energy;
    if (shortfall > 0) {
      const runes = zones.getCardsInZone("runePool" as CoreZoneId, playerId as CorePlayerId);
      for (const runeId of runes) {
        if (shortfall <= 0) {
          break;
        }
        if (counters.getFlag(runeId, "exhausted")) {
          continue;
        }
        counters.setFlag(runeId, "exhausted", true);
        pool.energy += 1;
        shortfall -= 1;
      }
    }
    pool.energy = Math.max(0, pool.energy - energyCost);
  }

  const powerCost = cost.power as string[] | undefined;
  if (powerCost) {
    for (const domain of powerCost) {
      // Rule 135.2.e.5.a: [rainbow] costs are paid with any Domain's Power.
      const key =
        domain === "rainbow"
          ? (Object.entries(pool.power).sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))[0]?.[0] as
              | keyof typeof pool.power
              | undefined)
          : (domain as keyof typeof pool.power);
      if (key !== undefined) {
        pool.power[key] = Math.max(0, (pool.power[key] ?? 0) - 1);
      }
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
      if (state.pendingChoice) {
        return false;
      }
      if (!state.interaction?.chain?.active) {
        return false;
      }
      return allPlayersPassed(state.interaction);
    },
    enumerator: (state) => {
      if (state.pendingChoice) {
        return [];
      }
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

      // Rule 728 / [Level N]: an activated ability gated by a while-level
      // condition is unavailable until the controller has ≥ threshold XP.
      const abilityCondition = (ability as { condition?: { type?: string; threshold?: number } })
        .condition;
      if (abilityCondition?.type === "while-level") {
        if (!evaluateWhileLevel(state, playerId, abilityCondition.threshold ?? 0)) {
          return false;
        }
      }

      // Rule 580.3 (unl-160-219): "Use this ability only while I'm at a
      // battlefield" attaches a self-at-battlefield restriction to the
      // activated ability; the host card must be at a battlefield zone.
      const abilityRestrictions = (ability as { restrictions?: readonly { type: string }[] })
        .restrictions;
      if (abilityRestrictions?.some((r) => r.type === "self-at-battlefield")) {
        if (!zone.startsWith("battlefield")) {
          return false;
        }
      }
      // Rule 827.1.c.1: [Empower] carries an implicit "Play only if not
      // Empowered" — reject activation when the host is already Empowered.
      if (abilityRestrictions?.some((r) => r.type === "not-empowered")) {
        const hostMeta = context.cards.getCardMeta(cardId as CoreCardId) as
          | { empowered?: boolean }
          | undefined;
        if (hostMeta?.empowered === true) {
          return false;
        }
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
        // Rule 357.1.a: ready runes may be exhausted for energy during Pay
        // Costs, so count them toward affordability (parity with play* moves).
        const potentialEnergy = getPotentialRuneEnergy(
          context.zones,
          context.counters as { getFlag: (c: CoreCardId, f: string) => boolean | undefined },
          playerId,
        );
        if (pool.energy + potentialEnergy < energyCost) {
          return false;
        }

        const powerCost = cost.power as string[] | undefined;
        if (powerCost) {
          const needed: Record<string, number> = {};
          for (const d of powerCost) {
            needed[d] = (needed[d] ?? 0) + 1;
          }
          if (!canAffordPower(pool.power, needed)) {
            return false;
          }
        }

        // "Spend N XP" costs (rule 728) require the host card to have ≥N XP
        // counters at activation time.
        const xpCost = cost.xp as number | undefined;
        if (xpCost && xpCost > 0) {
          const {getCounter} = (
            context.counters as { getCounter?: (c: CoreCardId, t: string) => number }
          );
          const have = getCounter ? getCounter(cardId as CoreCardId, "xp") : 0;
          if (have < xpCost) {
            return false;
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

        // Rule 357.2 / 422.3: a "Discard N" cost requires ≥N cards in hand
        // at activation time; the caller names which card via `discardId`.
        const discardCost = cost.discard as number | undefined;
        if (discardCost && discardCost > 0) {
          const hand = context.zones.getCardsInZone(
            "hand" as CoreZoneId,
            playerId as CorePlayerId,
          );
          if (hand.length < discardCost) {
            return false;
          }
          const discardId = context.params.discardId as string | undefined;
          if (discardId && !hand.includes(discardId as CoreCardId)) {
            return false;
          }
        }

        // Rule 577.2: A [Kill] (sacrifice) cost requires a legal target on
        // the board matching the descriptor. Malzahar (ogn-113-298) is the
        // canonical case: exhaust + kill a friendly permanent → +2 rainbow.
        // The host card cannot pay its own kill cost.
        if (cost.kill) {
          const sacrificeId = context.params.sacrificeId as string | undefined;
          const options = resolveTarget(cost.kill as TargetDescriptor, {
            cards: context.cards,
            draft: state,
            playerId,
            sourceCardId: cardId,
            sourceZone: zone,
            zones: context.zones,
          }).filter((id) => id !== cardId);
          if (options.length === 0) {
            return false;
          }
          if (sacrificeId && !options.includes(sacrificeId)) {
            return false;
          }
        }
      }

      // Rule 355.8 / 355.10.c: an activated ability whose effect names a
      // caster-chosen target cannot be put on the chain when no legal
      // choice exists (e.g. Unlicensed Armory with zero friendly units).
      if (
        !spellEffectHasLegalTargets(ability.effect as SpellEffectTargetShape | undefined, {
          cards: context.cards,
          draft: state,
          playerId,
          sourceCardId: cardId,
          sourceZone: zone,
          zones: context.zones,
        })
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
      const playerId = context.playerId as string;
      const interaction = state.interaction ?? createInteractionState();
      const turnState = getTurnState(interaction);
      const results: {
        playerId: string;
        cardId: string;
        abilityIndex: number;
        sourceCardId?: string;
        sacrificeId?: string;
        discardId?: string;
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

          // Rule 728 / [Level N]: skip activated abilities whose while-level
          // condition is not yet met (e.g. Honeyfruit's Level-6 ability).
          const abilityCondition = (
            ability as { condition?: { type?: string; threshold?: number } }
          ).condition;
          if (abilityCondition?.type === "while-level") {
            if (!evaluateWhileLevel(state, playerId, abilityCondition.threshold ?? 0)) {
              continue;
            }
          }

          // Rule 580.3 (unl-160-219): "Use this ability only while I'm at a
          // battlefield" — skip when the host card is not at a battlefield.
          const abilityRestrictions = (ability as { restrictions?: readonly { type: string }[] })
            .restrictions;
          if (abilityRestrictions?.some((r) => r.type === "self-at-battlefield")) {
            const hostZone = context.zones.getCardZone(entry.hostCardId as CoreCardId) as
              | string
              | undefined;
            if (!hostZone?.startsWith("battlefield")) {
              continue;
            }
          }
          // Rule 827.1.c.1: [Empower] — skip when the host is already Empowered.
          if (abilityRestrictions?.some((r) => r.type === "not-empowered")) {
            const hostMeta = context.cards.getCardMeta(entry.hostCardId as CoreCardId) as
              | { empowered?: boolean }
              | undefined;
            if (hostMeta?.empowered === true) {
              continue;
            }
          }

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
            // Rule 357.1.a: ready runes may be exhausted for energy during Pay
            // Costs, so count them toward affordability (parity with play* moves).
            const potentialEnergy = getPotentialRuneEnergy(
              context.zones,
              context.counters as { getFlag: (c: CoreCardId, f: string) => boolean | undefined },
              playerId,
            );
            if (pool.energy + potentialEnergy < energyCost) {
              continue;
            }
            const powerCost = cost.power as string[] | undefined;
            if (powerCost) {
              const needed: Record<string, number> = {};
              for (const d of powerCost) {
                needed[d] = (needed[d] ?? 0) + 1;
              }
              if (!canAffordPower(pool.power, needed)) {
                continue;
              }
            }

            const xpCost = cost.xp as number | undefined;
            if (xpCost && xpCost > 0) {
              const {getCounter} = (
                context.counters as { getCounter?: (c: CoreCardId, t: string) => number }
              );
              const have = getCounter
                ? getCounter(entry.hostCardId as CoreCardId, "xp")
                : 0;
              if (have < xpCost) {
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

          // Rule 357.2 / 422.3: a "Discard N" cost enumerates one activation
          // per hand card so the caller can pick which card to discard. Fewer
          // than N cards in hand → the ability is not activatable.
          let discardOptions: string[] | undefined;
          const discardCost = (ability.cost as Record<string, unknown> | undefined)?.discard as
            | number
            | undefined;
          if (discardCost && discardCost > 0) {
            const hand = context.zones.getCardsInZone(
              "hand" as CoreZoneId,
              playerId as CorePlayerId,
            );
            if (hand.length < discardCost) {
              continue;
            }
            discardOptions = [...hand] as string[];
          }

          // Rule 577.2: A [Kill] (sacrifice) cost enumerates one activation
          // per legal sacrifice target so the caller can pick which permanent
          // to trash. No legal target → the ability is not activatable.
          let sacrificeOptions: string[] | undefined;
          const killCost = (ability.cost as Record<string, unknown> | undefined)?.kill;
          if (killCost) {
            const hostZone = context.zones.getCardZone(entry.hostCardId as CoreCardId) as
              | string
              | undefined;
            sacrificeOptions = resolveTarget(killCost as TargetDescriptor, {
              cards: context.cards,
              draft: state,
              playerId,
              sourceCardId: entry.hostCardId,
              sourceZone: hostZone,
              zones: context.zones,
            }).filter((id) => id !== entry.hostCardId);
            if (sacrificeOptions.length === 0) {
              continue;
            }
          }

          // Rule 355.8 / 355.10.c: skip abilities whose caster-chosen effect
          // target has no legal choices on the current board.
          const hostZone = context.zones.getCardZone(entry.hostCardId as CoreCardId) as
            | string
            | undefined;
          if (
            !spellEffectHasLegalTargets(ability.effect as SpellEffectTargetShape | undefined, {
              cards: context.cards,
              draft: state,
              playerId,
              sourceCardId: entry.hostCardId,
              sourceZone: hostZone,
              zones: context.zones,
            })
          ) {
            continue;
          }

          const result: {
            playerId: string;
            cardId: string;
            abilityIndex: number;
            sourceCardId?: string;
            sacrificeId?: string;
            discardId?: string;
          } = {
            abilityIndex: entry.abilityIndex,
            cardId: entry.hostCardId,
            playerId,
          };
          if (entry.sourceCardId !== entry.hostCardId) {
            result.sourceCardId = entry.sourceCardId;
          }
          const bases: (typeof result)[] = sacrificeOptions
            ? sacrificeOptions.map((sacrificeId) => ({ ...result, sacrificeId }))
            : [result];
          if (discardOptions) {
            for (const base of bases) {
              for (const discardId of discardOptions) {
                results.push({ ...base, discardId });
              }
            }
          } else {
            results.push(...bases);
          }
        }
      }
      return results;
    },
    reducer: (draft, context) => {
      const { playerId, cardId, abilityIndex, sourceCardId, sacrificeId, discardId } =
        context.params;

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
        deductAbilityCost(draft, playerId, cost, context.zones, context.counters);

        // Handle exhaust cost — always exhaust the host card, never the
        // Source (Heimerdinger exhausts himself for an inherited ability).
        if (cost.exhaust) {
          context.counters.setFlag(cardId as CoreCardId, "exhausted", true);
        }

        // Handle "Spend N XP" cost — remove N XP counters from the host card.
        const xpCost = cost.xp as number | undefined;
        if (xpCost && xpCost > 0) {
          context.counters.removeCounter(cardId as CoreCardId, "xp", xpCost);
        }

        // Rule 357.2 / 422.3: pay the "Discard N" cost — the chosen hand
        // card is trashed before the ability is placed on the chain.
        if (cost.discard) {
          if (!discardId) {
            return;
          }
          context.zones.moveCard({
            cardId: discardId as CoreCardId,
            targetZoneId: "trash" as CoreZoneId,
          });
          // Rule ogn-006-298: emit the discard event for the paid-as-cost card.
          fireTriggers(
            { cardId: discardId as string, playerId, type: "discard" },
            { cards: context.cards, counters: context.counters, draft, zones: context.zones },
          );
        }

        // Handle kill (sacrifice) cost — the chosen permanent is trashed as
        // part of paying the cost, before the effect resolves.
        if (cost.kill) {
          if (!sacrificeId) {
            return;
          }
          context.zones.moveCard({
            cardId: sacrificeId as CoreCardId,
            targetZoneId: "trash" as CoreZoneId,
          });
        }
      }

      // Rule 605.2: activated abilities that Add resources resolve immediately
      // and cannot be reacted to — do not open a chain for them.
      const effectType = (ability.effect as { type?: string } | undefined)?.type;
      if (effectType === "add-resource" || effectType === "add") {
        const effectCtx = buildEffectContext(draft, playerId, cardId, context);
        executeEffect(ability.effect as ExecutableEffect, effectCtx);
        return;
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
      if (state.pendingChoice) {
        return false;
      }
      const interaction = state.interaction ?? createInteractionState();
      // Rule 509.1: focus cannot pass while a chain is active on top of the
      // showdown — the chain must fully resolve first.
      if (interaction.chain?.active) {
        return false;
      }
      const activeShowdown = getActiveShowdown(interaction);
      if (!activeShowdown?.active) {
        return false;
      }
      return activeShowdown.focusPlayer === context.params.playerId;
    },
    enumerator: (state, context) => {
      if (state.pendingChoice) {
        return [];
      }
      const interaction = state.interaction ?? createInteractionState();
      if (interaction.chain?.active) {
        return [];
      }
      const activeShowdown = getActiveShowdown(interaction);
      if (!activeShowdown?.active) {
        return [];
      }
      if (activeShowdown.focusPlayer !== (context.playerId as string)) {
        return [];
      }
      return [{ playerId: context.playerId as string }];
    },
    reducer: (draft, context) => {
      if (!draft.interaction) {
        return;
      }

      const before = getActiveShowdown(draft.interaction);
      draft.interaction = passFocusState(draft.interaction);

      // If showdown ended (all passed), clean up.
      if (isShowdownEnded(draft.interaction)) {
        const bf = before?.battlefieldId ? draft.battlefields[before.battlefieldId] : undefined;
        if (bf) {
          if (before?.isCombatShowdown) {
            // Rule 348.1 → resolveFullCombat becomes legal (Combat Damage Step).
            bf.showdownComplete = true;
          } else {
            // Rule 348.2 / 316.8.b / 466.5.a: Non-Combat Showdown close — mark
            // the battlefield's showdown complete so startShowdown does not
            // re-stage the same battlefield this turn.
            bf.showdownComplete = true;
            // Rule 348.2.a: Non-Combat Showdown close — if only one player's
            // units remain and they don't already control it, they establish
            // Control. 348.2.a.1: this is a Conquer if not yet scored.
            const bfZone = `battlefield-${before!.battlefieldId}` as CoreZoneId;
            const owners = new Set<string>();
            for (const cid of context.zones.getCardsInZone(bfZone)) {
              const o = context.cards.getCardOwner(cid);
              if (o) owners.add(o as string);
            }
            if (owners.size === 1) {
              const solo = [...owners][0];
              if (bf.controller !== solo) {
                bf.controller = solo;
                if (!draft.conqueredThisTurn[solo]) draft.conqueredThisTurn[solo] = [];
                draft.conqueredThisTurn[solo].push(before!.battlefieldId);
                const scored = draft.scoredThisTurn[solo] ?? [];
                if (!scored.includes(before!.battlefieldId)) {
                  const p = draft.players[solo];
                  if (p) p.victoryPoints += 1;
                  if (!draft.scoredThisTurn[solo]) draft.scoredThisTurn[solo] = [];
                  draft.scoredThisTurn[solo].push(before!.battlefieldId);
                  if (hasPlayerWon(draft, solo)) {
                    draft.status = "finished";
                    draft.winner = solo;
                    context.endGame?.({
                      metadata: { finalScore: p?.victoryPoints ?? 0, method: "conquer" },
                      reason: "victory_points",
                      winner: solo as CorePlayerId,
                    });
                  }
                }
              }
            }
          }
        }
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
      if (state.pendingChoice) {
        return false;
      }
      // Rule 548: Starting a Showdown is a Discretionary Action, legal only
      // in a Neutral Open state (no chain, no showdown). Also blocks nested
      // showdowns — a second showdown cannot stack while one is already open.
      const interaction = state.interaction ?? createInteractionState();
      if (getTurnState(interaction) !== "neutral-open") {
        return false;
      }
      if (getActiveShowdown(interaction)?.active) {
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
      // Rule 348.1/465.2: once the Combat Showdown has closed, the remaining
      // combat steps are Outstanding — the same showdown cannot be reopened.
      if (bf.showdownComplete) {
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
      if (getTurnState(interaction) !== "neutral-open") {
        return [];
      }
      if (getActiveShowdown(interaction)?.active) {
        return [];
      }
      // Rule 548: Only contested battlefields can have showdowns
      const results: { playerId: string; battlefieldId: string }[] = [];
      for (const bfId of Object.keys(state.battlefields ?? {})) {
        const bf = state.battlefields[bfId];
        if (bf?.contested && !bf.showdownComplete) {
          results.push({ battlefieldId: bfId, playerId: context.playerId as string });
        }
      }
      return results;
    },
    reducer: (draft, context) => {
      const { playerId, battlefieldId } = context.params;
      const playerIds = Object.keys(draft.players);

      const bf = draft.battlefields[battlefieldId];
      const isCombat = bf?.contested ?? false;
      // Rule 464.2.c (Vendetta): Attacker = player who applied Contested;
      // Defender = the player who did NOT apply Contested (bf.controller when
      // set, otherwise the other player). Rule 550.2: non-combat → all players.
      const attacker = bf?.contestedBy ?? playerId;
      const defender =
        bf?.controller ?? playerIds.find((p) => p !== attacker) ?? undefined;
      const relevantPlayers =
        isCombat && defender ? [...new Set([attacker, defender])] : playerIds;

      const interaction = draft.interaction ?? createInteractionState();
      draft.interaction = startShowdownState(
        interaction,
        battlefieldId,
        playerId,
        relevantPlayers,
        isCombat,
        attacker,
        defender,
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
      if (state.pendingChoice) {
        return false;
      }
      const interaction = state.interaction ?? createInteractionState();
      const activeShowdown = getActiveShowdown(interaction);
      return activeShowdown?.active === false || isShowdownEnded(interaction);
    },
    enumerator: (state) => {
      if (state.pendingChoice) {
        return [];
      }
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
      if (state.pendingChoice) {
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
    // Rule 601: Counter is a card effect, not a player Discretionary Action.
    // No enumerator — this move exists for sandbox/effect-executor use only.
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
