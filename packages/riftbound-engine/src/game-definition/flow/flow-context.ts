/**
 * Context adapters shared by the flow phase hooks (`riftbound-flow.ts`) and the
 * turn steps that live in their own modules (`expiration-step.ts`).
 *
 * Flow hooks receive a FlowContext (state, zones, cards) but NOT counters, so
 * every adapter here backs the counter API with card meta — which is what every
 * reader consults anyway.
 */

import type {
  CardId as CoreCardId,
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
} from "@tcg/core";
import type { EffectContext } from "../../abilities/effect-executor";
import { fireTriggers } from "../../abilities/trigger-runner";
import type { TriggerRunnerContext } from "../../abilities/trigger-runner";
import type { RiftboundCardMeta, RiftboundGameState } from "../../types";

/** The subset of FlowContext the trigger/effect adapters need. */
export interface FlowHookContext {
  state: RiftboundGameState;
  zones: {
    moveCard: (params: { cardId: CoreCardId; targetZoneId: CoreZoneId }) => void;
    drawCards: (params: {
      count: number;
      from: CoreZoneId;
      to: CoreZoneId;
      playerId: CorePlayerId;
    }) => CoreCardId[];
    getCardsInZone: (zoneId: CoreZoneId, playerId?: CorePlayerId) => CoreCardId[];
    getCardZone?: (cardId: CoreCardId) => CoreZoneId | undefined;
  };
  cards: {
    getCardMeta: (cardId: CoreCardId) => Partial<RiftboundCardMeta>;
    getCardOwner?: (cardId: CoreCardId) => string | undefined;
    getCardController?: (cardId: CoreCardId) => string | undefined;
    updateCardMeta?: (cardId: CoreCardId, meta: Partial<RiftboundCardMeta>) => void;
  };
}

/** Context shape shared by the flow phase hooks that run a whole turn step. */
export type FlowStepContext = FlowHookContext & {
  getCurrentPlayer: () => string;
  /** FlowContext.endTurn — request the turn transition once the hook returns. */
  endTurn?: () => void;
  cards: {
    queryCards: (
      predicate: (cardId: CoreCardId, meta: Partial<RiftboundCardMeta>) => boolean,
    ) => CoreCardId[];
    setCardController?: (cardId: CoreCardId, playerId: CorePlayerId) => void;
    updateCardMeta: (cardId: CoreCardId, meta: Partial<RiftboundCardMeta>) => void;
  };
};

/**
 * Build a TriggerRunnerContext from a flow phase context (no-op counter stubs
 * so triggers can execute their effects).
 */
export function buildFlowTriggerContext(context: FlowHookContext): TriggerRunnerContext {
  const noop = () => {};
  return {
    cards: {
      getCardMeta: context.cards.getCardMeta as TriggerRunnerContext["cards"]["getCardMeta"],
      getCardOwner: (context.cards.getCardOwner ??
        (() => undefined)) as TriggerRunnerContext["cards"]["getCardOwner"],
      getCardController: context.cards.getCardController,
      updateCardMeta: context.cards
        .updateCardMeta as TriggerRunnerContext["cards"]["updateCardMeta"],
    },
    counters: {
      addCounter: noop as TriggerRunnerContext["counters"]["addCounter"],
      setFlag: noop as TriggerRunnerContext["counters"]["setFlag"],
    },
    draft: context.state,
    zones: {
      drawCards: context.zones.drawCards as TriggerRunnerContext["zones"]["drawCards"],
      getCardZone: context.zones.getCardZone as TriggerRunnerContext["zones"]["getCardZone"],
      getCardsInZone: context.zones.getCardsInZone,
      moveCard: context.zones.moveCard,
    },
  };
}

/**
 * rule 370.1 / 710 — effects and the shared effect helpers (become-Mighty
 * evaluation, replacement runs) can be driven from the flow. The counter API is
 * backed by card meta; `fireTriggers` publishes into the same trigger runner the
 * moves use, so anything it queues lands on the Chain as a Pending Item.
 */
export function buildFlowEffectContext(
  context: FlowHookContext,
  opts: { playerId?: string; sourceCardId?: string } = {},
): EffectContext {
  const triggerCtx = buildFlowTriggerContext(context);
  const base = triggerCtx as unknown as EffectContext;
  const setMeta = (cardId: CoreCardId, meta: Record<string, unknown>): void => {
    context.cards.updateCardMeta?.(cardId, meta as Partial<RiftboundCardMeta>);
  };
  const noop = () => {};
  return {
    ...base,
    counters: {
      addCounter: noop,
      clearCounter: (cardId: CoreCardId, counter: string) => setMeta(cardId, { [counter]: 0 }),
      // heal writes the resulting damage through updateCardMeta itself.
      removeCounter: noop,
      setFlag: (cardId: CoreCardId, flag: string, value: boolean) => {
        const meta = context.cards.getCardMeta(cardId) as { __flags?: Record<string, boolean> };
        setMeta(cardId, { __flags: { ...(meta?.__flags ?? {}), [flag]: value }, [flag]: value });
      },
    } as unknown as EffectContext["counters"],
    fireTriggers: (event) => fireTriggers(event, triggerCtx),
    playerId: opts.playerId ?? (context.state.turn?.activePlayer as string) ?? "",
    sourceCardId: opts.sourceCardId ?? "",
  };
}

/**
 * rule 323.1 / 471.1.a.1 — a player reaching the Victory Score wins the game
 * immediately; the remaining phases of the current turn never happen.
 */
export function gameHasEnded(state: { status?: string }): boolean {
  return state.status === "finished";
}

/**
 * rule 315.2.a→b / 317.1→317.2 — a step that follows a trigger step may not run
 * while those triggers (or a prompt they opened) are still live.
 */
export function stepMustWaitForChain(state: RiftboundGameState): boolean {
  return (state.interaction?.chain?.active ?? false) || state.pendingChoice !== undefined;
}

/** All permanents on the board: every player's Base plus every Battlefield zone. */
export function collectBoardCards(context: FlowHookContext): CoreCardId[] {
  const ids: CoreCardId[] = [];
  for (const pid of Object.keys(context.state.players)) {
    ids.push(...context.zones.getCardsInZone("base" as CoreZoneId, pid as CorePlayerId));
  }
  for (const bfId of Object.keys(context.state.battlefields)) {
    ids.push(...context.zones.getCardsInZone(`battlefield-${bfId}` as CoreZoneId));
  }
  return ids;
}
