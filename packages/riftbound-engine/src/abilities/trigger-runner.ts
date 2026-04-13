/**
 * Trigger Runner
 *
 * Executes matched triggers by running their effects.
 * Called from move reducers after game events occur.
 */

import type {
  CardId as CoreCardId,
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
} from "@tcg/core";
import { getGlobalCardRegistry } from "../operations/card-lookup";
import type { RiftboundCardMeta, RiftboundGameState } from "../types";
import type { EffectContext, ExecutableEffect } from "./effect-executor";
import { executeEffect } from "./effect-executor";
import type { GameEvent } from "./game-events";
import { evaluateLegionCondition } from "./legion-conditions";
import type {
  CardWithAbilities,
  MatchedTrigger,
  TriggerableAbility,
} from "./trigger-matcher";
import { findMatchingTriggers } from "./trigger-matcher";

/**
 * Context passed from move reducers to the trigger runner.
 */
export interface TriggerRunnerContext {
  readonly draft: RiftboundGameState;
  readonly zones: {
    moveCard: (params: { cardId: CoreCardId; targetZoneId: CoreZoneId }) => void;
    drawCards: (params: {
      count: number;
      from: CoreZoneId;
      to: CoreZoneId;
      playerId: CorePlayerId;
    }) => void;
    getCardsInZone: (zoneId: CoreZoneId, playerId?: CorePlayerId) => CoreCardId[];
    getCardZone?: (cardId: CoreCardId) => string | undefined;
  };
  readonly counters: {
    setFlag: (cardId: CoreCardId, flag: string, value: boolean) => void;
    addCounter: (cardId: CoreCardId, counter: string, amount: number) => void;
    removeCounter?: (cardId: CoreCardId, counter: string, amount: number) => void;
    clearCounter?: (cardId: CoreCardId, counter: string) => void;
  };
  readonly cards: {
    getCardMeta: (cardId: CoreCardId) => Partial<RiftboundCardMeta> | undefined;
    getCardOwner: (cardId: CoreCardId) => string | undefined;
    updateCardMeta?: (cardId: CoreCardId, meta: Partial<RiftboundCardMeta>) => void;
  };
  /**
   * Create a new card instance directly in a zone.
   * Used for token creation (rule 170-178).
   */
  readonly createCardInZone?: (cardId: string, zoneId: string, ownerId: string) => void;
}

/**
 * Convert card definition abilities to TriggerableAbility format.
 */
function toTriggerableAbilities(cardId: string): TriggerableAbility[] {
  const registry = getGlobalCardRegistry();
  const abilities = registry.getAbilities(cardId);
  if (!abilities) {
    return [];
  }

  const result: TriggerableAbility[] = [];
  for (const a of abilities) {
    if (a.type === "triggered" && a.trigger) {
      result.push({
        condition: (a as { condition?: unknown }).condition,
        effect: a.effect,
        optional: a.optional,
        trigger: {
          event: a.trigger.event,
          on: a.trigger.on,
        },
        type: "triggered",
      });
    }
  }
  return result;
}

/**
 * Evaluate whether a triggered ability's `condition` holds against the
 * current game state. Returns `true` if there is no condition or the
 * condition is satisfied.
 *
 * Currently supports:
 *   - `{ type: "legion" }` — Rule 724, "you played another card this turn"
 *
 * Unknown condition shapes are permissive (return `true`) so the engine
 * does not silently drop triggers with as-yet-unsupported condition
 * structures.
 */
function evaluateTriggerCondition(
  condition: unknown,
  state: RiftboundGameState,
  controllerId: string,
): boolean {
  if (!condition || typeof condition !== "object") {
    return true;
  }
  const c = condition as { type?: string };
  if (c.type === "legion") {
    return evaluateLegionCondition(state, controllerId);
  }
  return true;
}

/**
 * Build the list of cards on the board with their abilities.
 * Scans base, battlefield, and legendZone zones, looks up abilities from the card definition registry.
 */
function getBoardCards(ctx: TriggerRunnerContext): CardWithAbilities[] {
  const boardCards: CardWithAbilities[] = [];

  // Get cards from all players' bases and legend zones
  for (const playerId of Object.keys(ctx.draft.players)) {
    const baseCards = ctx.zones.getCardsInZone("base" as CoreZoneId, playerId as CorePlayerId);
    for (const cardId of baseCards) {
      boardCards.push({
        abilities: toTriggerableAbilities(cardId as string),
        id: cardId as string,
        owner: playerId,
        zone: "base",
      });
    }

    const legendCards = ctx.zones.getCardsInZone(
      "legendZone" as CoreZoneId,
      playerId as CorePlayerId,
    );
    for (const cardId of legendCards) {
      boardCards.push({
        abilities: toTriggerableAbilities(cardId as string),
        id: cardId as string,
        owner: playerId,
        zone: "legendZone",
      });
    }
  }

  // Get cards from battlefields
  for (const bfId of Object.keys(ctx.draft.battlefields)) {
    const bfZoneId = `battlefield-${bfId}` as CoreZoneId;
    const bfCards = ctx.zones.getCardsInZone(bfZoneId);
    for (const cardId of bfCards) {
      const owner = ctx.cards.getCardOwner(cardId) ?? "";
      boardCards.push({
        abilities: toTriggerableAbilities(cardId as string),
        id: cardId as string,
        owner,
        zone: bfZoneId as string,
      });
    }
  }

  // Get cards from battlefieldRow (battlefield cards themselves)
  const battlefieldRowCards = ctx.zones.getCardsInZone("battlefieldRow" as CoreZoneId);
  for (const cardId of battlefieldRowCards) {
    const owner = ctx.cards.getCardOwner(cardId) ?? "";
    boardCards.push({
      abilities: toTriggerableAbilities(cardId as string),
      id: cardId as string,
      owner,
      zone: "battlefieldRow",
    });
  }

  // Rule 585.1 / 585.2 (ambiguity): champions in championZone have NOT been
  // Played yet. Per the rules primer consensus, their triggers do NOT fire
  // While they sit in championZone — a champion's abilities only come online
  // Once the card has been played (moved out of championZone into play).
  // Legends in legendZone, by contrast, DO have their triggers active.
  // So we intentionally skip scanning championZone here.

  return boardCards;
}

/**
 * Fire triggers for a game event.
 *
 * Scans all cards on the board for matching triggered abilities
 * and executes their effects.
 *
 * @param event - The game event that occurred
 * @param ctx - The trigger runner context from the move reducer
 * @returns Number of triggers that fired
 */
/**
 * Order simultaneous triggers per rule 585.
 *
 * Rule 585.1: Multiple triggers controlled by the **same** player fire in
 * the order that player chooses. The engine defaults to the insertion order
 * that `findMatchingTriggers` produced, which is deterministic (scan order
 * of `getBoardCards`) — so auto/goldfish play does not stall on an ordering
 * prompt.
 *
 * Rule 585.2: When triggers belong to **different** controllers, the turn
 * player's triggers fire first, then each subsequent player in turn order.
 *
 * @param matches - Triggers in original scan order
 * @param turnPlayer - The active player (turn player)
 * @param turnOrder - Full turn order (players in seat order)
 * @returns Triggers in rule-585-compliant order
 */
export function orderTriggers(
  matches: MatchedTrigger[],
  turnPlayer: string,
  turnOrder: string[],
): MatchedTrigger[] {
  if (matches.length <= 1) {
    return matches;
  }

  // Build a ranking: turn player first (rank 0), next player clockwise (rank 1), ...
  const rank: Record<string, number> = {};
  if (turnOrder.length > 0) {
    const startIdx = Math.max(0, turnOrder.indexOf(turnPlayer));
    for (let i = 0; i < turnOrder.length; i++) {
      const pid = turnOrder[(startIdx + i) % turnOrder.length];
      if (pid !== undefined && rank[pid] === undefined) {
        rank[pid] = i;
      }
    }
  } else {
    rank[turnPlayer] = 0;
  }

  // Rule 585.2: stable sort by owner rank (turn player first).
  // Rule 585.1: within a single owner, preserve insertion order (stable sort).
  return matches
    .map((m, i) => ({ idx: i, match: m }))
    .toSorted((a, b) => {
      const ra = rank[a.match.cardOwner] ?? Number.MAX_SAFE_INTEGER;
      const rb = rank[b.match.cardOwner] ?? Number.MAX_SAFE_INTEGER;
      if (ra !== rb) {
        return ra - rb;
      }
      return a.idx - b.idx;
    })
    .map((entry) => entry.match);
}

export function fireTriggers(event: GameEvent, ctx: TriggerRunnerContext): number {
  const boardCards = getBoardCards(ctx);
  const allMatches = findMatchingTriggers(event, boardCards);

  // Rule 724 (Legion) and other conditional triggers: filter matches by
  // Their ability.condition before executing. Conditions are evaluated
  // Against the controller of the card (owner, since abilities cannot
  // Change controller separately today).
  const filtered = allMatches.filter((match) =>
    evaluateTriggerCondition(match.ability.condition, ctx.draft, match.cardOwner),
  );

  // Rule 585: Order simultaneous triggers by (1) turn player first
  // (2) within the same owner, preserve scan order (controller-chosen
  // Order defaults to insertion order for goldfish compatibility).
  const turnPlayer = ctx.draft.turn?.activePlayer ?? "";
  const turnOrder = Object.keys(ctx.draft.players ?? {});
  const matches = orderTriggers(filtered, turnPlayer, turnOrder);

  // Rule 541: When a triggered ability fires during an active chain, the
  // Triggered ability is added to the chain as a new item (it does not
  // Resolve immediately). When no chain is active, triggers resolve inline.
  const chainActive = ctx.draft.interaction?.chain?.active === true;

  if (chainActive) {
    // Add each trigger onto the chain in the order computed above so that
    // The most-recently-pushed trigger is the new top-of-stack (rule 541.1).
    // Pushes cascade: the trigger-effect executes only when the chain
    // Resolves via `passChainPriority` / `resolveChain`.
    for (const match of matches) {
      if (!ctx.draft.interaction) {
        break;
      }
      const effect = match.ability.effect as unknown;
      (ctx.draft as RiftboundGameState & {
        interaction: NonNullable<RiftboundGameState["interaction"]>;
      }).interaction = addToChain(
        ctx.draft.interaction,
        {
          cardId: match.cardId,
          controller: match.cardOwner,
          effect,
          triggered: true,
          type: "ability",
        },
        turnOrder,
      );
    }
    return matches.length;
  }

  for (const match of matches) {
    // Build a no-op for missing optional methods
    const noop = () => {};
    const effectCtx: EffectContext = {
      cards: {
        getCardMeta: ctx.cards.getCardMeta as EffectContext["cards"]["getCardMeta"],
        getCardOwner: ctx.cards.getCardOwner,
        updateCardMeta: (ctx.cards as { updateCardMeta?: unknown })
          .updateCardMeta as EffectContext["cards"]["updateCardMeta"],
      },
      counters: {
        addCounter: ctx.counters.addCounter,
        clearCounter: ctx.counters.clearCounter ?? noop,
        removeCounter: ctx.counters.removeCounter ?? noop,
        setFlag: ctx.counters.setFlag,
      },
      createCardInZone: ctx.createCardInZone,
      draft: ctx.draft,
      fireTriggers: (innerEvent) => fireTriggers(innerEvent, ctx),
      playerId: match.cardOwner,
      sourceCardId: match.cardId,
      zones: {
        drawCards: ctx.zones.drawCards,
        getCardZone: ctx.zones.getCardZone ?? (() => undefined),
        getCardsInZone: ctx.zones.getCardsInZone,
        moveCard: ctx.zones.moveCard,
      },
    };

    const effect = match.ability.effect as ExecutableEffect;
    if (effect) {
      executeEffect(effect, effectCtx);
    }
  }

  return matches.length;
}
