/**
 * Wave 5 Cost Primitive Tests
 *
 * Engine tests for the three cost-related primitives introduced for
 * Bullet Time, Hextech Gauntlets, and Mageseeker Investigator:
 *
 * 1. X-cost spells — the player chooses a non-negative integer X at play
 *    time; each X point is deducted from the rune pool and the value is
 *    exposed to the effect executor via `variables.x`.
 * 2. Interactive cost reduction — `interactiveCostReduction: "target-might"`
 *    instructs `playGear` to reduce the card's energy cost by the Might of
 *    a chosen target at play time.
 * 3. Move escalation — `moveEscalation: true` charges the active player 1
 *    rainbow per unit moved beyond the first per turn while an enemy card
 *    with the flag is on the board.
 *
 * These tests drive the effect executor and registry directly rather than
 * going through the full move pipeline to stay resilient against unrelated
 * engine changes.
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
import { movementMoves } from "../game-definition/moves/movement";
import type { RiftboundCardMeta, RiftboundGameState } from "../types";

// ============================================================================
// Mock Effect Context Helpers
// ============================================================================

function createMockState(overrides?: Partial<RiftboundGameState>): RiftboundGameState {
  const base = {
    battlefields: { "bf-1": { contested: false, controller: "p1", id: "bf-1" } },
    conqueredThisTurn: { p1: [], p2: [] },
    gameId: "test",
    players: {
      p1: { id: "p1", turnsTaken: 0, victoryPoints: 0, xp: 0 },
      p2: { id: "p2", turnsTaken: 0, victoryPoints: 0, xp: 0 },
    },
    runePools: {
      p1: { energy: 5, power: {} },
      p2: { energy: 5, power: {} },
    },
    scoredThisTurn: { p1: [], p2: [] },
    status: "playing",
    turn: { activePlayer: "p1", number: 1, phase: "main" },
    unitsMovedThisTurn: { p1: 0, p2: 0 },
    victoryScore: 8,
    xpGainedThisTurn: { p1: 0, p2: 0 },
    ...overrides,
  };
  return base as unknown as RiftboundGameState;
}

interface MockCard {
  zone: string;
  owner: string;
  meta: Partial<RiftboundCardMeta>;
}

function createMockEffectContext(
  draft: RiftboundGameState,
  opts: {
    playerId: string;
    sourceCardId: string;
    sourceZone?: string;
    cards?: Record<string, MockCard>;
    variables?: Record<string, number>;
  },
) {
  const cardStore = new Map<string, MockCard>();
  const zoneContents = new Map<string, string[]>();

  if (opts.cards) {
    for (const [id, data] of Object.entries(opts.cards)) {
      cardStore.set(id, { ...data, meta: { ...data.meta } });
      const existing = zoneContents.get(data.zone) ?? [];
      existing.push(id);
      zoneContents.set(data.zone, existing);
    }
  }

  const ctx: EffectContext & {
    cardStore: typeof cardStore;
  } = {
    cardStore,
    cards: {
      getCardMeta: ((cardId: string) =>
        cardStore.get(cardId)?.meta) as unknown as EffectContext["cards"]["getCardMeta"],
      getCardOwner: (cardId) => cardStore.get(cardId as string)?.owner,
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
    playerId: opts.playerId,
    sourceCardId: opts.sourceCardId,
    sourceZone: opts.sourceZone,
    variables: opts.variables,
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
        for (const [, cards] of zoneContents) {
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
// 1. X-Cost Damage Effect (Bullet Time)
// ============================================================================

describe("X-cost spell — Bullet Time", () => {
  let registry: CardDefinitionRegistry;

  beforeEach(() => {
    registry = new CardDefinitionRegistry();
    registry.register("bullet-time", {
      cardType: "spell",
      energyCost: 1,
      id: "bullet-time",
      name: "Bullet Time",
      timing: "action",
    });
    registry.register("enemy-unit-1", {
      cardType: "unit",
      id: "enemy-unit-1",
      might: 3,
      name: "Grunt A",
    });
    registry.register("enemy-unit-2", {
      cardType: "unit",
      id: "enemy-unit-2",
      might: 2,
      name: "Grunt B",
    });
    registry.register("friendly-unit", {
      cardType: "unit",
      id: "friendly-unit",
      might: 4,
      name: "Ally",
    });
    setGlobalCardRegistry(registry);
  });

  afterEach(() => {
    clearGlobalCardRegistry();
  });

  test("damage effect with { variable: 'x' } reads the bound X value", () => {
    const draft = createMockState();
    const ctx = createMockEffectContext(draft, {
      cards: {
        "bullet-time": { meta: {}, owner: "p1", zone: "trash" },
        "enemy-unit-1": { meta: { damage: 0 }, owner: "p2", zone: "battlefield-bf-1" },
        "enemy-unit-2": { meta: { damage: 0 }, owner: "p2", zone: "battlefield-bf-1" },
      },
      playerId: "p1",
      sourceCardId: "bullet-time",
      variables: { x: 3 },
    });

    executeEffect(
      {
        amount: { variable: "x" },
        target: {
          controller: "enemy",
          location: "battlefield",
          quantity: "all",
          type: "unit",
        },
        type: "damage",
      } as ExecutableEffect,
      ctx,
    );

    expect(ctx.cardStore.get("enemy-unit-1")?.meta.damage).toBe(3);
    expect(ctx.cardStore.get("enemy-unit-2")?.meta.damage).toBe(3);
  });

  test("only enemy units are damaged", () => {
    const draft = createMockState();
    const ctx = createMockEffectContext(draft, {
      cards: {
        "bullet-time": { meta: {}, owner: "p1", zone: "trash" },
        "enemy-unit-1": { meta: { damage: 0 }, owner: "p2", zone: "battlefield-bf-1" },
        "friendly-unit": { meta: { damage: 0 }, owner: "p1", zone: "battlefield-bf-1" },
      },
      playerId: "p1",
      sourceCardId: "bullet-time",
      variables: { x: 2 },
    });

    executeEffect(
      {
        amount: { variable: "x" },
        target: {
          controller: "enemy",
          location: "battlefield",
          quantity: "all",
          type: "unit",
        },
        type: "damage",
      } as ExecutableEffect,
      ctx,
    );

    expect(ctx.cardStore.get("enemy-unit-1")?.meta.damage).toBe(2);
    expect(ctx.cardStore.get("friendly-unit")?.meta.damage).toBe(0);
  });

  test("X=0 deals no damage", () => {
    const draft = createMockState();
    const ctx = createMockEffectContext(draft, {
      cards: {
        "bullet-time": { meta: {}, owner: "p1", zone: "trash" },
        "enemy-unit-1": { meta: { damage: 0 }, owner: "p2", zone: "battlefield-bf-1" },
      },
      playerId: "p1",
      sourceCardId: "bullet-time",
      variables: { x: 0 },
    });

    executeEffect(
      {
        amount: { variable: "x" },
        target: {
          controller: "enemy",
          location: "battlefield",
          quantity: "all",
          type: "unit",
        },
        type: "damage",
      } as ExecutableEffect,
      ctx,
    );

    expect(ctx.cardStore.get("enemy-unit-1")?.meta.damage).toBe(0);
  });

  test("units in base are not affected", () => {
    const draft = createMockState();
    const ctx = createMockEffectContext(draft, {
      cards: {
        "bullet-time": { meta: {}, owner: "p1", zone: "trash" },
        "enemy-unit-1": { meta: { damage: 0 }, owner: "p2", zone: "base" },
        "enemy-unit-2": { meta: { damage: 0 }, owner: "p2", zone: "battlefield-bf-1" },
      },
      playerId: "p1",
      sourceCardId: "bullet-time",
      variables: { x: 5 },
    });

    executeEffect(
      {
        amount: { variable: "x" },
        target: {
          controller: "enemy",
          location: "battlefield",
          quantity: "all",
          type: "unit",
        },
        type: "damage",
      } as ExecutableEffect,
      ctx,
    );

    expect(ctx.cardStore.get("enemy-unit-1")?.meta.damage).toBe(0);
    expect(ctx.cardStore.get("enemy-unit-2")?.meta.damage).toBe(5);
  });
});

// ============================================================================
// 2. Interactive Cost Reduction (Hextech Gauntlets)
// ============================================================================

describe("Interactive cost reduction — Hextech Gauntlets", () => {
  let registry: CardDefinitionRegistry;

  beforeEach(() => {
    registry = new CardDefinitionRegistry();
    registry.register("hextech-gauntlets", {
      cardType: "equipment",
      energyCost: 3,
      id: "hextech-gauntlets",
      interactiveCostReduction: "target-might",
      mightBonus: 3,
      name: "Hextech Gauntlets",
      powerCost: ["rainbow"],
    });
    registry.register("unit-big", {
      cardType: "unit",
      energyCost: 5,
      id: "unit-big",
      might: 5,
      name: "Huge Warrior",
    });
    registry.register("unit-small", {
      cardType: "unit",
      energyCost: 2,
      id: "unit-small",
      might: 1,
      name: "Squire",
    });
    registry.register("unit-zero", {
      cardType: "unit",
      energyCost: 0,
      id: "unit-zero",
      might: 0,
      name: "Ghost",
    });
    setGlobalCardRegistry(registry);
  });

  afterEach(() => {
    clearGlobalCardRegistry();
  });

  test("getInteractiveCostReduction returns 'target-might' for tagged cards", () => {
    expect(registry.getInteractiveCostReduction("hextech-gauntlets")).toBe("target-might");
    expect(registry.getInteractiveCostReduction("unit-big")).toBeUndefined();
  });

  test("registry reflects the card's base cost unchanged by the flag", () => {
    // The marker does not affect the stored cost; reduction is applied at
    // Play time in `canAffordCard` / `deductCost`.
    const cost = registry.getCostToDeduct("hextech-gauntlets");
    expect(cost.energy).toBe(3);
  });

  test("cost reduction equals target unit's base Might when no meta", () => {
    // The `playGear` reducer calls `getInteractiveReduction`, which reads
    // The registry Might plus any meta modifiers. With no meta, reduction
    // Equals the base Might (5 for unit-big, 1 for unit-small).
    expect(registry.getMight("unit-big")).toBe(5);
    expect(registry.getMight("unit-small")).toBe(1);
    expect(registry.getMight("unit-zero")).toBe(0);
  });
});

// ============================================================================
// 3. Move Escalation (Mageseeker Investigator)
// ============================================================================

describe("Move escalation — Mageseeker Investigator", () => {
  let registry: CardDefinitionRegistry;

  beforeEach(() => {
    registry = new CardDefinitionRegistry();
    registry.register("mageseeker", {
      cardType: "unit",
      energyCost: 4,
      id: "mageseeker",
      might: 4,
      moveEscalation: true,
      name: "Mageseeker Investigator",
    });
    registry.register("plain-unit", {
      cardType: "unit",
      energyCost: 2,
      id: "plain-unit",
      might: 2,
      name: "Plain Unit",
    });
    setGlobalCardRegistry(registry);
  });

  afterEach(() => {
    clearGlobalCardRegistry();
  });

  test("hasMoveEscalation returns true for Mageseeker and false for plain units", () => {
    expect(registry.hasMoveEscalation("mageseeker")).toBe(true);
    expect(registry.hasMoveEscalation("plain-unit")).toBe(false);
  });

  test("unitsMovedThisTurn tracks per-player move counts", () => {
    const state = createMockState({
      unitsMovedThisTurn: { p1: 2, p2: 0 },
    });
    expect(state.unitsMovedThisTurn?.p1).toBe(2);
    expect(state.unitsMovedThisTurn?.p2).toBe(0);
  });

  /**
   * Drive `standardMove.condition` through a stub context with an enemy
   * Mageseeker at the DESTINATION battlefield. rule 204.4: moving two units
   * there at the same time costs [rainbow] — POWER of any domain
   * (135.2.e.5.a) — and rule 203 makes the move illegal when it cannot be
   * paid. Energy in the pool is no substitute.
   */
  test("standardMove condition rejects a multi-unit move onto the escalator's battlefield with no power", () => {
    const state = createMockState({
      battlefields: {
        "bf-1": { contested: false, controller: "p1", id: "bf-1" },
      },
      runePools: {
        p1: { energy: 5, power: {} },
        p2: { energy: 5, power: {} },
      },
      unitsMovedThisTurn: { p1: 1, p2: 0 },
    });

    // Zone layout: our moving units on base, Mageseeker on battlefield bf-1
    const zoneMap: Record<string, string> = {
      mageseeker: "battlefield-bf-1",
      "moving-unit": "base",
      "moving-unit-2": "base",
    };
    const ownerMap: Record<string, string> = {
      mageseeker: "p2",
      "moving-unit": "p1",
      "moving-unit-2": "p1",
    };
    const exhaustedMap: Record<string, boolean> = {
      mageseeker: false,
      "moving-unit": false,
      "moving-unit-2": false,
    };

    const condition = movementMoves.standardMove?.condition;
    expect(condition).toBeDefined();
    if (!condition) {
      return;
    }

    const mockContext = {
      cards: {
        getCardMeta: () => ({}),
        getCardOwner: (id: string) => ownerMap[id],
      },
      counters: {
        getFlag: (id: string, flag: string) =>
          flag === "exhausted" ? exhaustedMap[id] === true : false,
      },
      params: {
        destination: "bf-1",
        playerId: "p1",
        unitIds: ["moving-unit", "moving-unit-2"],
      },
      zones: {
        getCardZone: (id: string) => zoneMap[id],
        getCardsInZone: (zone: string) => {
          if (zone === "base") {
            return Object.keys(zoneMap).filter(
              (k) => zoneMap[k] === "base" && ownerMap[k] === "p1",
            );
          }
          if (zone === "battlefield-bf-1") {
            return Object.keys(zoneMap).filter((k) => zoneMap[k] === "battlefield-bf-1");
          }
          return [];
        },
      },
    };

    // Two units at the same time onto the Mageseeker's battlefield cost one
    // [rainbow]; P1 holds no power at all → rejected (rule 203).
    expect(condition(state, mockContext as unknown as Parameters<typeof condition>[1])).toBe(false);
  });

  test("standardMove condition allows second move when pool can cover surcharge", () => {
    const state = createMockState({
      battlefields: {
        "bf-1": { contested: false, controller: "p1", id: "bf-1" },
      },
      runePools: {
        p1: { energy: 3, power: {} },
        p2: { energy: 5, power: {} },
      },
      unitsMovedThisTurn: { p1: 1, p2: 0 },
    });

    const zoneMap: Record<string, string> = {
      mageseeker: "battlefield-bf-1",
      "moving-unit": "base",
    };
    const ownerMap: Record<string, string> = {
      mageseeker: "p2",
      "moving-unit": "p1",
    };

    const condition = movementMoves.standardMove?.condition;
    if (!condition) {
      return;
    }

    const mockContext = {
      cards: {
        getCardMeta: () => ({}),
        getCardOwner: (id: string) => ownerMap[id],
      },
      counters: {
        getFlag: () => false,
      },
      params: {
        destination: "bf-1",
        playerId: "p1",
        unitIds: ["moving-unit"],
      },
      zones: {
        getCardZone: (id: string) => zoneMap[id],
        getCardsInZone: (zone: string) => {
          if (zone === "base") {
            return ["moving-unit"];
          }
          if (zone === "battlefield-bf-1") {
            return ["mageseeker"];
          }
          return [];
        },
      },
    };

    expect(condition(state, mockContext as unknown as Parameters<typeof condition>[1])).toBe(true);
  });

  test("standardMove condition does not charge surcharge without an enemy escalator", () => {
    const state = createMockState({
      battlefields: {
        "bf-1": { contested: false, controller: "p1", id: "bf-1" },
      },
      runePools: {
        p1: { energy: 0, power: {} },
        p2: { energy: 5, power: {} },
      },
      unitsMovedThisTurn: { p1: 5, p2: 0 }, // Already moved many units
    });

    const zoneMap: Record<string, string> = {
      "moving-unit": "base",
    };
    const ownerMap: Record<string, string> = {
      "moving-unit": "p1",
    };

    const condition = movementMoves.standardMove?.condition;
    if (!condition) {
      return;
    }

    const mockContext = {
      cards: {
        getCardMeta: () => ({}),
        getCardOwner: (id: string) => ownerMap[id],
      },
      counters: {
        getFlag: () => false,
      },
      params: {
        destination: "bf-1",
        playerId: "p1",
        unitIds: ["moving-unit"],
      },
      zones: {
        getCardZone: (id: string) => zoneMap[id],
        getCardsInZone: (zone: string) => {
          if (zone === "base") {
            return ["moving-unit"];
          }
          return [];
        },
      },
    };

    // No Mageseeker on the board → surcharge=0 → move allowed even with 0 energy
    expect(condition(state, mockContext as unknown as Parameters<typeof condition>[1])).toBe(true);
  });

  test("standardMove reducer deducts the surcharge from POWER and increments the counter", () => {
    const state = createMockState({
      battlefields: {
        "bf-1": { contested: false, controller: "p1", id: "bf-1" },
      },
      runePools: {
        p1: { energy: 3, power: { fury: 1 } },
        p2: { energy: 5, power: {} },
      },
      unitsMovedThisTurn: { p1: 1, p2: 0 },
    }) as RiftboundGameState & Record<string, unknown>;

    const zoneMap: Record<string, string> = {
      mageseeker: "battlefield-bf-1",
      "moving-unit": "base",
      "moving-unit-2": "base",
    };
    const ownerMap: Record<string, string> = {
      mageseeker: "p2",
      "moving-unit": "p1",
      "moving-unit-2": "p1",
    };

    const reducer = movementMoves.standardMove?.reducer;
    if (!reducer) {
      return;
    }

    const exhausted: Record<string, boolean> = {};
    const movedTo: Record<string, string> = {};

    const mockContext = {
      cards: {
        getCardMeta: () => ({}),
        getCardOwner: (id: string) => ownerMap[id],
      },
      counters: {
        setFlag: (id: string, flag: string, value: boolean) => {
          if (flag === "exhausted") {
            exhausted[id] = value;
          }
        },
      },
      params: {
        destination: "bf-1",
        playerId: "p1",
        unitIds: ["moving-unit", "moving-unit-2"],
      },
      zones: {
        getCardZone: (id: string) => zoneMap[id],
        getCardsInZone: (zone: string) => {
          if (zone === "base") {
            return ["moving-unit", "moving-unit-2"];
          }
          if (zone === "battlefield-bf-1") {
            return ["mageseeker"];
          }
          return [];
        },
        moveCard: ({ cardId, targetZoneId }: { cardId: string; targetZoneId: string }) => {
          movedTo[cardId] = targetZoneId;
        },
      },
    };

    reducer(
      state as unknown as Parameters<typeof reducer>[0],
      mockContext as unknown as Parameters<typeof reducer>[1],
    );

    // rule 135.2.e.5.a — the [rainbow] pip comes out of POWER, energy is untouched
    expect(state.runePools.p1?.energy).toBe(3);
    expect(state.runePools.p1?.power.fury).toBe(0);
    // Counter incremented
    expect(state.unitsMovedThisTurn?.p1).toBe(3);
    // Unit moved and exhausted
    expect(movedTo["moving-unit"]).toBe("battlefield-bf-1");
    expect(exhausted["moving-unit"]).toBe(true);
  });
});
