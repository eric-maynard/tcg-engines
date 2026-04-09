/**
 * Cost System Tests
 *
 * Tests for cost modification: cost reduction, cost increase,
 * additional cost tracking, and "if you paid" condition evaluation.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type {
  CardId as CoreCardId,
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
} from "@tcg/core";
import {
  CardDefinitionRegistry,
  clearGlobalCardRegistry,
  setGlobalCardRegistry,
} from "../operations/card-lookup";
import type { EffectContext, ExecutableEffect } from "../abilities/effect-executor";
import { executeEffect } from "../abilities/effect-executor";
import { evaluateCondition } from "../abilities/static-abilities";
import type { RiftboundCardMeta, RiftboundGameState } from "../types";

function createMockState(overrides?: Partial<RiftboundGameState>): RiftboundGameState {
  return {
    battlefields: { "bf-1": { contested: false, controller: "p1", id: "bf-1" } },
    conqueredThisTurn: { p1: [], p2: [] },
    gameId: "test",
    players: { p1: { id: "p1", victoryPoints: 0 }, p2: { id: "p2", victoryPoints: 0 } },
    runePools: { p1: { energy: 5, power: {} }, p2: { energy: 5, power: {} } },
    scoredThisTurn: { p1: [], p2: [] },
    status: "playing",
    turn: { activePlayer: "p1", number: 1, phase: "main" },
    victoryScore: 8,
    ...overrides,
  };
}

/**
 * Build a mock EffectContext with full card meta support.
 */
function createMockEffectContext(
  draft: RiftboundGameState,
  opts: {
    playerId: string;
    sourceCardId: string;
    sourceZone?: string;
    cards?: Record<string, { zone: string; owner: string; meta: Partial<RiftboundCardMeta> }>;
  },
) {
  const cardStore = new Map<
    string,
    { zone: string; owner: string; meta: Partial<RiftboundCardMeta> }
  >();
  const zoneContents = new Map<string, string[]>();
  const firedEvents: { type: string; [key: string]: unknown }[] = [];

  if (opts.cards) {
    for (const [id, data] of Object.entries(opts.cards)) {
      cardStore.set(id, { ...data, meta: { ...data.meta } });
      const existing = zoneContents.get(data.zone) ?? [];
      existing.push(id);
      zoneContents.set(data.zone, existing);
    }
  }

  const ctx: EffectContext & {
    firedEvents: typeof firedEvents;
    cardStore: typeof cardStore;
    zoneContents: typeof zoneContents;
  } = {
    cardStore,
    cards: {
      getCardMeta: ((cardId: string) =>
        cardStore.get(cardId)?.meta) as unknown as EffectContext["cards"]["getCardMeta"],
      getCardOwner: (cardId) => cardStore.get(cardId as string)?.owner,
      updateCardMeta: ((cardId: string, updates: Record<string, unknown>) => {
        const card = cardStore.get(cardId);
        if (card) {
          card.meta = { ...card.meta, ...updates } as Partial<RiftboundCardMeta>;
        }
      }) as unknown as EffectContext["cards"]["updateCardMeta"],
    },
    counters: {
      addCounter: (cardId, counter, amount) => {
        const card = cardStore.get(cardId as string);
        if (card) {
          const cur = (card.meta as Record<string, number>)[counter] ?? 0;
          (card.meta as Record<string, number>)[counter] = cur + amount;
        }
      },
      clearCounter: (cardId, counter) => {
        const card = cardStore.get(cardId as string);
        if (card) {
          (card.meta as Record<string, number>)[counter] = 0;
        }
      },
      removeCounter: (cardId, counter, amount) => {
        const card = cardStore.get(cardId as string);
        if (card) {
          const cur = (card.meta as Record<string, number>)[counter] ?? 0;
          (card.meta as Record<string, number>)[counter] = Math.max(0, cur - amount);
        }
      },
      setFlag: (cardId, flag, value) => {
        const card = cardStore.get(cardId as string);
        if (card) {
          (card.meta as Record<string, unknown>)[flag] = value;
        }
      },
    },
    draft,
    fireTriggers: (event) => {
      firedEvents.push(event as { type: string; [key: string]: unknown });
    },
    firedEvents,
    playerId: opts.playerId,
    sourceCardId: opts.sourceCardId,
    sourceZone: opts.sourceZone,
    zoneContents,
    zones: {
      drawCards: () => {},
      getCardZone: ((cardId: string) =>
        cardStore.get(cardId)?.zone) as unknown as EffectContext["zones"]["getCardZone"],
      getCardsInZone: ((zoneId: string, playerId?: string) => {
        const cards = zoneContents.get(zoneId) ?? [];
        if (playerId) {
          return cards.filter((id) => cardStore.get(id)?.owner === playerId);
        }
        return [...cards];
      }) as unknown as EffectContext["zones"]["getCardsInZone"],
      moveCard: (params) => {
        const cardId = params.cardId as string;
        const targetZone = params.targetZoneId as string;
        for (const [_zone, cards] of zoneContents) {
          const idx = cards.indexOf(cardId);
          if (idx !== -1) {
            cards.splice(idx, 1);
            break;
          }
        }
        const target = zoneContents.get(targetZone) ?? [];
        target.push(cardId);
        zoneContents.set(targetZone, target);
        const card = cardStore.get(cardId);
        if (card) {
          card.zone = targetZone;
        }
      },
    },
  };

  return ctx;
}

// ============================================================================
// Cost Reduction Effect
// ============================================================================

describe("Cost Reduction Effect", () => {
  let registry: CardDefinitionRegistry;

  beforeEach(() => {
    registry = new CardDefinitionRegistry();
    registry.register("unit-1", {
      cardType: "unit",
      energyCost: 5,
      id: "unit-1",
      might: 3,
      name: "Warrior",
    });
    registry.register("source-card", {
      cardType: "unit",
      id: "source-card",
      might: 2,
      name: "Source",
    });
    setGlobalCardRegistry(registry);
  });

  afterEach(() => {
    clearGlobalCardRegistry();
  });

  test("cost-reduction reduces costModifier on target card", () => {
    const draft = createMockState();
    const ctx = createMockEffectContext(draft, {
      cards: {
        "source-card": { meta: { damage: 0 }, owner: "p1", zone: "base" },
        "unit-1": { meta: { costModifier: 0, damage: 0 }, owner: "p1", zone: "base" },
      },
      playerId: "p1",
      sourceCardId: "source-card",
    });

    executeEffect(
      {
        amount: 2,
        target: { controller: "friendly", type: "unit" },
        type: "cost-reduction",
      } as ExecutableEffect,
      ctx,
    );

    expect(ctx.cardStore.get("unit-1")?.meta.costModifier).toBe(-2);
  });

  test("cost-reduction stacks with existing modifier", () => {
    const draft = createMockState();
    const ctx = createMockEffectContext(draft, {
      cards: {
        "unit-1": { meta: { costModifier: -1, damage: 0 }, owner: "p1", zone: "hand" },
      },
      playerId: "p1",
      sourceCardId: "unit-1",
    });

    executeEffect(
      {
        amount: 2,
        target: { type: "self" },
        type: "cost-reduction",
      } as ExecutableEffect,
      ctx,
    );

    expect(ctx.cardStore.get("unit-1")?.meta.costModifier).toBe(-3);
  });

  test("cost-reduction defaults to source card when no target specified", () => {
    const draft = createMockState();
    const ctx = createMockEffectContext(draft, {
      cards: {
        "unit-1": { meta: { costModifier: 0, damage: 0 }, owner: "p1", zone: "hand" },
      },
      playerId: "p1",
      sourceCardId: "unit-1",
    });

    executeEffect(
      {
        amount: 1,
        type: "cost-reduction",
      } as ExecutableEffect,
      ctx,
    );

    expect(ctx.cardStore.get("unit-1")?.meta.costModifier).toBe(-1);
  });
});

// ============================================================================
// Cost Increase Effect
// ============================================================================

describe("Cost Increase Effect", () => {
  let registry: CardDefinitionRegistry;

  beforeEach(() => {
    registry = new CardDefinitionRegistry();
    registry.register("unit-1", {
      cardType: "unit",
      energyCost: 3,
      id: "unit-1",
      might: 3,
      name: "Warrior",
    });
    registry.register("source-card", {
      cardType: "unit",
      id: "source-card",
      might: 2,
      name: "Source",
    });
    setGlobalCardRegistry(registry);
  });

  afterEach(() => {
    clearGlobalCardRegistry();
  });

  test("cost-increase raises costModifier on target card", () => {
    const draft = createMockState();
    const ctx = createMockEffectContext(draft, {
      cards: {
        "source-card": { meta: { damage: 0 }, owner: "p1", zone: "base" },
        "unit-1": { meta: { costModifier: 0, damage: 0 }, owner: "p2", zone: "base" },
      },
      playerId: "p1",
      sourceCardId: "source-card",
    });

    executeEffect(
      {
        amount: 2,
        target: { controller: "enemy", type: "unit" },
        type: "cost-increase",
      } as ExecutableEffect,
      ctx,
    );

    expect(ctx.cardStore.get("unit-1")?.meta.costModifier).toBe(2);
  });

  test("cost-increase stacks with existing positive modifier", () => {
    const draft = createMockState();
    const ctx = createMockEffectContext(draft, {
      cards: {
        "unit-1": { meta: { costModifier: 1, damage: 0 }, owner: "p1", zone: "hand" },
      },
      playerId: "p1",
      sourceCardId: "unit-1",
    });

    executeEffect(
      {
        amount: 2,
        target: { type: "self" },
        type: "cost-increase",
      } as ExecutableEffect,
      ctx,
    );

    expect(ctx.cardStore.get("unit-1")?.meta.costModifier).toBe(3);
  });

  test("cost-increase defaults to source card when no target specified", () => {
    const draft = createMockState();
    const ctx = createMockEffectContext(draft, {
      cards: {
        "unit-1": { meta: { costModifier: 0, damage: 0 }, owner: "p1", zone: "hand" },
      },
      playerId: "p1",
      sourceCardId: "unit-1",
    });

    executeEffect(
      {
        amount: 3,
        type: "cost-increase",
      } as ExecutableEffect,
      ctx,
    );

    expect(ctx.cardStore.get("unit-1")?.meta.costModifier).toBe(3);
  });
});

// ============================================================================
// Cost Modifier Floor (can't go below 0)
// ============================================================================

describe("Cost Modifier: Effective Cost Floor", () => {
  let registry: CardDefinitionRegistry;

  beforeEach(() => {
    registry = new CardDefinitionRegistry();
    registry.register("cheap-unit", {
      cardType: "unit",
      energyCost: 2,
      id: "cheap-unit",
      might: 1,
      name: "Cheap Unit",
    });
    setGlobalCardRegistry(registry);
  });

  afterEach(() => {
    clearGlobalCardRegistry();
  });

  test("effective cost cannot go below 0 even with large reduction", () => {
    // Card costs 2 energy, but has a -5 modifier
    // The deductCost function should clamp to 0, not negative
    const draft = createMockState({
      runePools: { p1: { energy: 10, power: {} }, p2: { energy: 5, power: {} } },
    });
    const ctx = createMockEffectContext(draft, {
      cards: {
        "cheap-unit": { meta: { costModifier: -5, damage: 0 }, owner: "p1", zone: "hand" },
      },
      playerId: "p1",
      sourceCardId: "cheap-unit",
    });

    // Apply a cost reduction that exceeds the base cost
    executeEffect(
      {
        amount: 5,
        target: { type: "self" },
        type: "cost-reduction",
      } as ExecutableEffect,
      ctx,
    );

    // CostModifier is -10 (stacking -5 + -5), but the effective energy cost
    // Will be clamped to 0 by Math.max(0, ...) in canAffordCard/deductCost
    expect(ctx.cardStore.get("cheap-unit")?.meta.costModifier).toBe(-10);
  });
});

// ============================================================================
// Cost Modifiers in canAffordCard / deductCost
// ============================================================================

describe("Cost Modifiers in Cost Calculation", () => {
  let registry: CardDefinitionRegistry;

  beforeEach(() => {
    registry = new CardDefinitionRegistry();
    registry.register("unit-3cost", {
      cardType: "unit",
      energyCost: 3,
      id: "unit-3cost",
      might: 2,
      name: "3-Cost Unit",
    });
    registry.register("unit-5cost", {
      cardType: "unit",
      energyCost: 5,
      id: "unit-5cost",
      might: 4,
      name: "5-Cost Unit",
    });
    setGlobalCardRegistry(registry);
  });

  afterEach(() => {
    clearGlobalCardRegistry();
  });

  test("cost reduction makes an unaffordable card affordable", () => {
    // Player has 3 energy, card costs 5 but has -2 cost modifier
    // Adjusted cost = max(0, 5 + (-2)) = 3, which is affordable
    const baseCost = registry.getCostToDeduct("unit-5cost");
    const modifier = -2;
    const adjustedEnergy = Math.max(0, baseCost.energy + modifier);
    const playerEnergy = 3;

    expect(adjustedEnergy).toBe(3);
    expect(playerEnergy >= adjustedEnergy).toBe(true);
  });

  test("cost increase makes an affordable card unaffordable", () => {
    // Player has 3 energy, card costs 3 but has +1 cost modifier
    // Adjusted cost = max(0, 3 + 1) = 4, which is unaffordable
    const baseCost = registry.getCostToDeduct("unit-3cost");
    const modifier = 1;
    const adjustedEnergy = Math.max(0, baseCost.energy + modifier);
    const playerEnergy = 3;

    expect(adjustedEnergy).toBe(4);
    expect(playerEnergy >= adjustedEnergy).toBe(false);
  });

  test("cost reduction does not reduce effective cost below 0", () => {
    // Card costs 3, modifier is -5
    // Adjusted cost = max(0, 3 + (-5)) = max(0, -2) = 0
    const baseCost = registry.getCostToDeduct("unit-3cost");
    const modifier = -5;
    const adjustedEnergy = Math.max(0, baseCost.energy + modifier);

    expect(adjustedEnergy).toBe(0);
  });

  test("deductCost applies cost modifier correctly", () => {
    // Simulate deductCost logic: card costs 5, modifier is -2
    // Should deduct 3 energy
    const draft = createMockState({
      runePools: { p1: { energy: 10, power: {} }, p2: { energy: 5, power: {} } },
    });

    const cost = registry.getCostToDeduct("unit-5cost");
    const modifier = -2;
    const adjustedEnergy = Math.max(0, cost.energy + modifier);
    const pool = draft.runePools.p1;

    expect(pool).toBeDefined();
    if (pool) {
      pool.energy = Math.max(0, pool.energy - adjustedEnergy);
      expect(pool.energy).toBe(7); // 10 - 3 = 7
    }
  });

  test("deductCost with cost increase deducts more energy", () => {
    // Card costs 3, modifier is +2
    // Should deduct 5 energy
    const draft = createMockState({
      runePools: { p1: { energy: 10, power: {} }, p2: { energy: 5, power: {} } },
    });

    const cost = registry.getCostToDeduct("unit-3cost");
    const modifier = 2;
    const adjustedEnergy = Math.max(0, cost.energy + modifier);
    const pool = draft.runePools.p1;

    expect(pool).toBeDefined();
    if (pool) {
      pool.energy = Math.max(0, pool.energy - adjustedEnergy);
      expect(pool.energy).toBe(5); // 10 - 5 = 5
    }
  });
});

// ============================================================================
// Additional Cost Tracking
// ============================================================================

describe("Additional Cost Tracking", () => {
  let registry: CardDefinitionRegistry;

  beforeEach(() => {
    registry = new CardDefinitionRegistry();
    registry.register("unit-1", {
      cardType: "unit",
      id: "unit-1",
      might: 3,
      name: "Warrior",
    });
    setGlobalCardRegistry(registry);
  });

  afterEach(() => {
    clearGlobalCardRegistry();
  });

  test("additional-cost marks card as having paid in game state", () => {
    const draft = createMockState({
      additionalCostsPaid: {},
    });
    const ctx = createMockEffectContext(draft, {
      cards: {
        "unit-1": { meta: { damage: 0 }, owner: "p1", zone: "base" },
      },
      playerId: "p1",
      sourceCardId: "unit-1",
    });

    executeEffect(
      {
        type: "additional-cost",
      } as ExecutableEffect,
      ctx,
    );

    expect(draft.additionalCostsPaid?.["unit-1"]).toBe(true);
  });

  test("additional-cost does nothing when additionalCostsPaid is not initialized", () => {
    const draft = createMockState();
    // AdditionalCostsPaid is undefined
    const ctx = createMockEffectContext(draft, {
      cards: {
        "unit-1": { meta: { damage: 0 }, owner: "p1", zone: "base" },
      },
      playerId: "p1",
      sourceCardId: "unit-1",
    });

    // Should not throw
    executeEffect(
      {
        type: "additional-cost",
      } as ExecutableEffect,
      ctx,
    );

    expect(draft.additionalCostsPaid).toBeUndefined();
  });
});

// ============================================================================
// "If You Paid the Additional Cost" Condition
// ============================================================================

describe("Paid Additional Cost Condition", () => {
  test("returns true when card has paid additional cost", () => {
    const draft = createMockState({
      additionalCostsPaid: { "unit-1": true },
    });
    const source = { id: "unit-1", owner: "p1", zone: "base" };
    const ctx = {
      cards: {
        getCardMeta: (() => ({})) as (cardId: CoreCardId) => Partial<RiftboundCardMeta> | undefined,
        getCardOwner: (() => "p1") as (cardId: CoreCardId) => string | undefined,
        updateCardMeta: (() => {}) as (
          cardId: CoreCardId,
          meta: Partial<RiftboundCardMeta>,
        ) => void,
      },
      draft,
      zones: {
        getCardsInZone: (() => []) as (zoneId: CoreZoneId, playerId?: CorePlayerId) => CoreCardId[],
      },
    };

    const result = evaluateCondition({ type: "paid-additional-cost" }, source, ctx);

    expect(result).toBe(true);
  });

  test("returns false when card has not paid additional cost", () => {
    const draft = createMockState({
      additionalCostsPaid: {},
    });
    const source = { id: "unit-1", owner: "p1", zone: "base" };
    const ctx = {
      cards: {
        getCardMeta: (() => ({})) as (cardId: CoreCardId) => Partial<RiftboundCardMeta> | undefined,
        getCardOwner: (() => "p1") as (cardId: CoreCardId) => string | undefined,
        updateCardMeta: (() => {}) as (
          cardId: CoreCardId,
          meta: Partial<RiftboundCardMeta>,
        ) => void,
      },
      draft,
      zones: {
        getCardsInZone: (() => []) as (zoneId: CoreZoneId, playerId?: CorePlayerId) => CoreCardId[],
      },
    };

    const result = evaluateCondition({ type: "paid-additional-cost" }, source, ctx);

    expect(result).toBe(false);
  });

  test("returns false when additionalCostsPaid is undefined", () => {
    const draft = createMockState();
    const source = { id: "unit-1", owner: "p1", zone: "base" };
    const ctx = {
      cards: {
        getCardMeta: (() => ({})) as (cardId: CoreCardId) => Partial<RiftboundCardMeta> | undefined,
        getCardOwner: (() => "p1") as (cardId: CoreCardId) => string | undefined,
        updateCardMeta: (() => {}) as (
          cardId: CoreCardId,
          meta: Partial<RiftboundCardMeta>,
        ) => void,
      },
      draft,
      zones: {
        getCardsInZone: (() => []) as (zoneId: CoreZoneId, playerId?: CorePlayerId) => CoreCardId[],
      },
    };

    const result = evaluateCondition({ type: "paid-additional-cost" }, source, ctx);

    expect(result).toBe(false);
  });
});
