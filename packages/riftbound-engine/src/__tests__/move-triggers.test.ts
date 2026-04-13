/**
 * Move Triggered Ability Tests
 *
 * Regression tests for: "move" triggers never fire because
 * standardMove/gankingMove reducers did not dispatch a "move" game event.
 *
 * Example card: Treasure Hunter (sfd-130-221)
 *   "When I move, play a Gold gear token exhausted."
 *   Ability: { type: "triggered", trigger: { event: "move", on: "self" }, ... }
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type {
  CardId as CoreCardId,
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
} from "@tcg/core";
import { movementMoves } from "../game-definition/moves/movement";
import {
  CardDefinitionRegistry,
  clearGlobalCardRegistry,
  setGlobalCardRegistry,
} from "../operations/card-lookup";
import type { RiftboundCardMeta, RiftboundGameState } from "../types";

const P1 = "player-1";
const P2 = "player-2";

let registry: CardDefinitionRegistry;

function createMockState(overrides?: Partial<RiftboundGameState>): RiftboundGameState {
  return {
    battlefields: {
      "bf-1": { contested: false, controller: P1, id: "bf-1" },
      "bf-2": { contested: false, controller: P1, id: "bf-2" },
    },
    conqueredThisTurn: { [P1]: [], [P2]: [] },
    gameId: "test-move-triggers",
    players: {
      [P1]: { id: P1, victoryPoints: 0, xp: 0 },
      [P2]: { id: P2, victoryPoints: 0, xp: 0 },
    },
    runePools: {
      [P1]: { energy: 10, power: {} },
      [P2]: { energy: 10, power: {} },
    },
    scoredThisTurn: { [P1]: [], [P2]: [] },
    status: "playing",
    turn: { activePlayer: P1, number: 1, phase: "main" },
    victoryScore: 8,
    xpGainedThisTurn: { [P1]: 0, [P2]: 0 },
    ...overrides,
  } as RiftboundGameState;
}

/**
 * Build a mock move context that mirrors the real engine's context
 * well enough to drive a reducer and observe side-effects.
 */
function createMockContext(
  cards: Record<string, { owner: string; zone: string; meta?: Partial<RiftboundCardMeta> }>,
) {
  const cardStore = new Map<string, { owner: string; zone: string }>();
  const zoneContents = new Map<string, string[]>();
  const metaStore = new Map<string, Partial<RiftboundCardMeta>>();
  const flagStore = new Map<string, Record<string, boolean>>();
  const counterStore = new Map<string, Record<string, number>>();

  for (const [id, data] of Object.entries(cards)) {
    cardStore.set(id, { owner: data.owner, zone: data.zone });
    metaStore.set(id, data.meta ?? {});
    const existing = zoneContents.get(data.zone) ?? [];
    existing.push(id);
    zoneContents.set(data.zone, existing);
  }

  return {
    context: {
      cards: {
        getCardMeta: ((cardId: string) => metaStore.get(cardId) ?? {}) as unknown as (
          cardId: CoreCardId,
        ) => Partial<RiftboundCardMeta>,
        getCardOwner: ((cardId: string) => cardStore.get(cardId)?.owner) as unknown as (
          cardId: CoreCardId,
        ) => string | undefined,
        updateCardMeta: ((cardId: string, meta: Partial<RiftboundCardMeta>) => {
          const existing = metaStore.get(cardId) ?? {};
          metaStore.set(cardId, { ...existing, ...meta });
        }) as unknown as (cardId: CoreCardId, meta: Partial<RiftboundCardMeta>) => void,
      },
      counters: {
        addCounter: ((cardId: string, counter: string, amount: number) => {
          const existing = counterStore.get(cardId) ?? {};
          existing[counter] = (existing[counter] ?? 0) + amount;
          counterStore.set(cardId, existing);
        }) as unknown as (cardId: CoreCardId, type: string, amount: number) => void,
        clearCounter: (() => {}) as unknown as (cardId: CoreCardId, type: string) => void,
        getFlag: ((cardId: string, flag: string) =>
          flagStore.get(cardId)?.[flag] ?? false) as unknown as (
          cardId: CoreCardId,
          flag: string,
        ) => boolean,
        removeCounter: (() => {}) as unknown as (
          cardId: CoreCardId,
          type: string,
          amount: number,
        ) => void,
        setFlag: ((cardId: string, flag: string, value: boolean) => {
          const existing = flagStore.get(cardId) ?? {};
          existing[flag] = value;
          flagStore.set(cardId, existing);
        }) as unknown as (cardId: CoreCardId, flag: string, value: boolean) => void,
      },
      params: {} as Record<string, unknown>,
      playerId: P1 as CorePlayerId,
      zones: {
        drawCards: (() => []) as unknown as (params: {
          count: number;
          from: CoreZoneId;
          to: CoreZoneId;
          playerId: CorePlayerId;
        }) => CoreCardId[],
        getCardZone: ((cardId: string) => cardStore.get(cardId)?.zone) as unknown as (
          cardId: CoreCardId,
        ) => string | undefined,
        getCardsInZone: ((zoneId: string, playerId?: string) => {
          if (playerId) {
            const all = zoneContents.get(zoneId) ?? [];
            return all.filter((id) => cardStore.get(id)?.owner === playerId);
          }
          return [...(zoneContents.get(zoneId) ?? [])];
        }) as unknown as (zoneId: CoreZoneId, playerId?: CorePlayerId) => CoreCardId[],
        moveCard: ((params: { cardId: string; targetZoneId: string }) => {
          const { cardId, targetZoneId } = params;
          for (const [, zCards] of zoneContents) {
            const idx = zCards.indexOf(cardId);
            if (idx !== -1) {
              zCards.splice(idx, 1);
              break;
            }
          }
          const target = zoneContents.get(targetZoneId) ?? [];
          target.push(cardId);
          zoneContents.set(targetZoneId, target);
          const card = cardStore.get(cardId);
          if (card) {
            card.zone = targetZoneId;
          }
        }) as unknown as (params: { cardId: CoreCardId; targetZoneId: CoreZoneId }) => void,
        shuffleZone: (() => {}) as unknown as (zoneId: CoreZoneId, playerId?: CorePlayerId) => void,
      },
    },
    flagStore,
    zoneContents,
  };
}

beforeEach(() => {
  registry = new CardDefinitionRegistry();
  setGlobalCardRegistry(registry);
});

afterEach(() => {
  clearGlobalCardRegistry();
});

describe("Move triggered abilities fire on standardMove", () => {
  test("self-trigger on move executes its effect when a unit moves base->battlefield", () => {
    // Register a unit with a move self-trigger whose effect is stun-self.
    // Stun writes a "stunned" flag on sourceCardId, giving us a cheap
    // Observable for "the trigger's effect ran".
    registry.register("mover-unit", {
      abilities: [
        {
          effect: { type: "stun" },
          optional: false,
          trigger: { event: "move", on: "self" },
          type: "triggered",
        },
      ],
      cardType: "unit",
      id: "mover-unit",
      keywords: [],
      might: 1,
      name: "Mover Unit",
    });

    const state = createMockState();
    const { context, flagStore } = createMockContext({
      "mover-unit": { owner: P1, zone: "base" },
    });

    const reducer = movementMoves.standardMove!.reducer!;
    reducer(
      state as unknown as Parameters<typeof reducer>[0],
      {
        ...context,
        params: {
          destination: "bf-1",
          playerId: P1,
          unitIds: ["mover-unit"],
        },
      } as unknown as Parameters<typeof reducer>[1],
    );

    // The move trigger fired and executed its stun effect on self
    expect(flagStore.get("mover-unit")?.stunned).toBe(true);
  });

  test("gankingMove fires move trigger for battlefield-to-battlefield movement", () => {
    registry.register("ganker-unit", {
      abilities: [
        {
          effect: { type: "stun" },
          optional: false,
          trigger: { event: "move", on: "self" },
          type: "triggered",
        },
      ],
      cardType: "unit",
      id: "ganker-unit",
      keywords: ["Ganking"],
      might: 2,
      name: "Ganker Unit",
    });

    const state = createMockState();
    const { context, flagStore } = createMockContext({
      "ganker-unit": { owner: P1, zone: "battlefield-bf-1" },
    });

    const reducer = movementMoves.gankingMove!.reducer!;
    reducer(
      state as unknown as Parameters<typeof reducer>[0],
      {
        ...context,
        params: {
          playerId: P1,
          toBattlefield: "bf-2",
          unitId: "ganker-unit",
        },
      } as unknown as Parameters<typeof reducer>[1],
    );

    expect(flagStore.get("ganker-unit")?.stunned).toBe(true);
  });

  test("non-moving units do not get their move trigger fired", () => {
    registry.register("mover-unit", {
      abilities: [
        {
          effect: { type: "stun" },
          optional: false,
          trigger: { event: "move", on: "self" },
          type: "triggered",
        },
      ],
      cardType: "unit",
      id: "mover-unit",
      keywords: [],
      might: 1,
      name: "Mover Unit",
    });
    registry.register("bystander", {
      abilities: [
        {
          effect: { type: "stun" },
          optional: false,
          trigger: { event: "move", on: "self" },
          type: "triggered",
        },
      ],
      cardType: "unit",
      id: "bystander",
      keywords: [],
      might: 1,
      name: "Bystander",
    });

    const state = createMockState();
    const { context, flagStore } = createMockContext({
      bystander: { owner: P1, zone: "base" },
      "mover-unit": { owner: P1, zone: "base" },
    });

    const reducer = movementMoves.standardMove!.reducer!;
    reducer(
      state as unknown as Parameters<typeof reducer>[0],
      {
        ...context,
        params: {
          destination: "bf-1",
          playerId: P1,
          unitIds: ["mover-unit"],
        },
      } as unknown as Parameters<typeof reducer>[1],
    );

    // Only the card that actually moved should have its move trigger fire
    expect(flagStore.get("mover-unit")?.stunned).toBe(true);
    expect(flagStore.get("bystander")?.stunned).toBeUndefined();
  });
});
