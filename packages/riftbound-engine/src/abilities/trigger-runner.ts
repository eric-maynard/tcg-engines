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
import { addToChain, createInteractionState } from "../chain/chain-state";
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
    getCardController?: (cardId: CoreCardId) => string | undefined;
    updateCardMeta?: (cardId: CoreCardId, meta: Partial<RiftboundCardMeta>) => void;
  };
  /**
   * Create a new card instance directly in a zone.
   * Used for token creation (rule 170-178).
   */
  readonly createCardInZone?: (cardId: string, zoneId: string, ownerId: string) => void;
  /**
   * Escape hatch: when true, execute matched triggers immediately instead of
   * placing them on the chain. Rule 583.3 says triggers go on the chain, so
   * this should only be set by callers that run outside the priority loop
   * (flow-phase hooks). Default false.
   */
  readonly resolveInline?: boolean;
}

/**
 * Convert card definition abilities to TriggerableAbility format.
 */
export function toTriggerableAbilities(cardId: string): TriggerableAbility[] {
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
          restrictions: (a.trigger as { restrictions?: readonly { type: string; count?: number }[] })
            .restrictions,
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
export function evaluateTriggerCondition(
  condition: unknown,
  state: RiftboundGameState,
  controllerId: string,
  event: GameEvent,
  ctx?: TriggerRunnerContext,
  sourceCardId?: string,
): boolean {
  if (!condition || typeof condition !== "object") {
    return true;
  }
  const c = condition as { type?: string };
  if (c.type === "legion") {
    return evaluateLegionCondition(state, controllerId);
  }
  if (c.type === "paid-additional-cost") {
    // Zaun Punk (sfd-160-221) et al: the payoff fires only when the optional
    // additional cost was actually paid. The play event carries the flag; if
    // absent the enumeration hasn't run and the payoff must NOT fire for free.
    return (event as { paidAdditionalCost?: boolean }).paidAdditionalCost === true;
  }
  if (c.type === "while-empowered") {
    // Rule 827 (rule-id: ven-136-166): `[Empowered][>]` triggers fire only
    // while the source is Empowered.
    if (!ctx || !sourceCardId) {
      return false;
    }
    return ctx.cards.getCardMeta(sourceCardId as CoreCardId)?.empowered === true;
  }
  if (c.type === "while-at-battlefield") {
    // rule-id: ogn-067-298 (Blitzcrank, Impassive) — "When you play me to a
    // battlefield" must not fire when the unit is played to base.
    if (!ctx || !sourceCardId) {
      return true;
    }
    const zone = ctx.zones.getCardZone?.(sourceCardId as CoreCardId);
    if (zone !== undefined) {
      return zone.startsWith("battlefield-");
    }
    for (const bfId of Object.keys(ctx.draft.battlefields ?? {})) {
      const ids = ctx.zones.getCardsInZone(`battlefield-${bfId}` as CoreZoneId);
      if (ids.some((id) => (id as string) === sourceCardId)) {
        return true;
      }
    }
    return false;
  }
  if (c.type === "control" && ctx) {
    // rule-id: ven-058-166 (Patched Porobot) / rule 383.2.a.1 — an "if you
    // control N <thing>" clause is part of the trigger condition; with fewer
    // than N matching permanents the ability must not be put on the chain.
    return evaluateControlCondition(
      (c as { target?: unknown }).target,
      ctx,
      controllerId,
      sourceCardId,
    );
  }
  return true;
}

/**
 * Count permanents on the board (base + battlefields) controlled by
 * `controllerId` that match a parsed `ControlCondition.target`, and compare
 * against `target.quantity.atLeast` (default 1).
 */
function evaluateControlCondition(
  target: unknown,
  ctx: TriggerRunnerContext,
  controllerId: string,
  sourceCardId?: string,
): boolean {
  if (!target || typeof target !== "object") {
    return true;
  }
  const t = target as {
    type?: string;
    controller?: string;
    excludeSelf?: boolean;
    filter?: unknown;
    quantity?: { atLeast?: number } | number;
  };
  const min =
    typeof t.quantity === "number"
      ? t.quantity
      : typeof t.quantity === "object" && typeof t.quantity?.atLeast === "number"
        ? t.quantity.atLeast
        : 1;

  const ids: string[] = [];
  for (const playerId of Object.keys(ctx.draft.players ?? {})) {
    ids.push(
      ...ctx.zones
        .getCardsInZone("base" as CoreZoneId, playerId as CorePlayerId)
        .map((x) => x as string),
    );
  }
  for (const bfId of Object.keys(ctx.draft.battlefields ?? {})) {
    ids.push(
      ...ctx.zones.getCardsInZone(`battlefield-${bfId}` as CoreZoneId).map((x) => x as string),
    );
  }

  const registry = getGlobalCardRegistry();
  const filters = t.filter === undefined ? [] : Array.isArray(t.filter) ? t.filter : [t.filter];
  let count = 0;
  for (const id of ids) {
    if (t.excludeSelf && id === sourceCardId) {
      continue;
    }
    const owner = ctx.cards.getCardOwner(id as CoreCardId) ?? "";
    if (t.controller === "enemy") {
      if (owner === controllerId || owner === "") {
        continue;
      }
    } else if (owner !== controllerId) {
      continue;
    }
    const def = registry.get(id) as
      | { cardType?: string; tags?: readonly string[] }
      | undefined;
    const cardType = def?.cardType;
    if (t.type === "unit" && cardType !== "unit") {
      continue;
    }
    if (
      (t.type === "gear" || t.type === "equipment") &&
      cardType !== "gear" &&
      cardType !== "equipment"
    ) {
      continue;
    }
    let ok = true;
    for (const f of filters) {
      if (f && typeof f === "object" && typeof (f as { tag?: unknown }).tag === "string") {
        const tag = (f as { tag: string }).tag.toLowerCase();
        if (!(def?.tags ?? []).some((x) => x.toLowerCase() === tag)) {
          ok = false;
          break;
        }
      }
    }
    if (!ok) {
      continue;
    }
    count++;
    if (count >= min) {
      return true;
    }
  }
  return count >= min;
}

/**
 * Build the list of cards on the board with their abilities.
 * Scans base, battlefield, and legendZone zones, looks up abilities from the card definition registry.
 */
export function getBoardCards(ctx: TriggerRunnerContext): CardWithAbilities[] {
  const boardCards: CardWithAbilities[] = [];
  // rule-id: sfd-109-221 (Akshan / Dazzling Aurora) — "your" on a permanent's
  // trigger refers to its current CONTROLLER, not its owner, so a
  // control-changed permanent triggers for whoever controls it now.
  const controllerOf = (cardId: CoreCardId, fallback: string): string =>
    ctx.cards.getCardController?.(cardId) ?? ctx.cards.getCardOwner(cardId) ?? fallback;

  // Get cards from all players' bases and legend zones
  for (const playerId of Object.keys(ctx.draft.players)) {
    const baseCards = ctx.zones.getCardsInZone("base" as CoreZoneId, playerId as CorePlayerId);
    for (const cardId of baseCards) {
      boardCards.push({
        abilities: toTriggerableAbilities(cardId as string),
        id: cardId as string,
        owner: controllerOf(cardId, playerId),
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
      const owner = controllerOf(cardId, "");
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
  // Rule ogn-006-298 (Flame Chompers): a card that reads "When you discard
  // me…" is in the trash by the time the discard event is processed. Include
  // the discarded card itself in the scan so its self-trigger can match.
  if (event.type === "discard" && !boardCards.some((c) => c.id === event.cardId)) {
    boardCards.push({
      abilities: toTriggerableAbilities(event.cardId),
      id: event.cardId,
      owner: event.playerId,
      zone: ctx.zones.getCardZone?.(event.cardId as CoreCardId) ?? "trash",
    });
  }
  const allMatches = findMatchingTriggers(event, boardCards, ctx.draft);

  // Rule 724 (Legion) and other conditional triggers: filter matches by
  // Their ability.condition before executing. Conditions are evaluated
  // Against the controller of the card (owner, since abilities cannot
  // Change controller separately today).
  const filtered = allMatches.filter((match) =>
    evaluateTriggerCondition(
      match.ability.condition,
      ctx.draft,
      match.cardOwner,
      match.event,
      ctx,
      match.cardId,
    ),
  );

  // Rule 585: Order simultaneous triggers by (1) turn player first
  // (2) within the same owner, preserve scan order (controller-chosen
  // Order defaults to insertion order for goldfish compatibility).
  const turnPlayer = ctx.draft.turn?.activePlayer ?? "";
  const turnOrder = Object.keys(ctx.draft.players ?? {});
  const matches = orderTriggers(filtered, turnPlayer, turnOrder);

  // Rule 583.3: a Triggered Ability behaves like an Activated Ability and is
  // placed on the Chain — always, whether or not a chain already exists.
  // Rule 541.1: pushed in the computed order so the last-pushed is top-of-stack.
  // The effect executes only when the chain resolves via passChainPriority.
  //
  // The `ctx.resolveInline` escape hatch preserves the old behavior for
  // callers that cannot open a chain (e.g. flow-phase hooks that run outside
  // the priority loop). Default is false — triggers go on the chain.
  const resolveInline = ctx.resolveInline === true;

  if (matches.length === 0) {
    return 0;
  }

  if (!resolveInline) {
    if (!ctx.draft.interaction) {
      (ctx.draft as RiftboundGameState & {
        interaction: NonNullable<RiftboundGameState["interaction"]>;
      }).interaction = createInteractionState();
    }
    for (const match of matches) {
      const effect = match.ability.effect as unknown;
      (ctx.draft as RiftboundGameState & {
        interaction: NonNullable<RiftboundGameState["interaction"]>;
      }).interaction = addToChain(
        ctx.draft.interaction!,
        {
          cardId: match.cardId,
          controller: match.cardOwner,
          effect,
          // Rule 583 (unl-021-219): carry the "you may" flag onto the chain so
          // executeResolvedItem can prompt the controller to opt in or decline.
          optional: match.ability.optional === true,
          // rule-id: ven-021-166 — carry the firing event so "moved to or from"
          // target qualifiers can resolve against its from/to zones.
          triggerEvent: match.event,
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
        getCardController: (ctx.cards as { getCardController?: unknown })
          .getCardController as EffectContext["cards"]["getCardController"],
        setCardController: (ctx.cards as { setCardController?: unknown })
          .setCardController as EffectContext["cards"]["setCardController"],
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
