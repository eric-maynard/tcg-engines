/**
 * Token Creation Tests
 *
 * Tests for the create-token effect that instantiates new token
 * game objects at runtime (rule 170-178).
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
import type { RiftboundGameState } from "../types";

function createMockState(overrides?: Partial<RiftboundGameState>): RiftboundGameState {
  return {
    battlefields: { "bf-1": { contested: false, controller: "p1", id: "bf-1" } },
    conqueredThisTurn: { p1: [], p2: [] },
    gameId: "test",
    players: { p1: { id: "p1", victoryPoints: 0 }, p2: { id: "p2", victoryPoints: 0 } },
    runePools: { p1: { energy: 0, power: {} }, p2: { energy: 0, power: {} } },
    scoredThisTurn: { p1: [], p2: [] },
    status: "playing",
    turn: { activePlayer: "p1", number: 1, phase: "main" },
    victoryScore: 8,
    ...overrides,
  };
}

/**
 * Build a mock EffectContext with token creation support.
 */
function createMockEffectContext(
  draft: RiftboundGameState,
  opts: {
    playerId: string;
    sourceCardId: string;
    sourceZone?: string;
    cards?: Record<string, { zone: string; owner: string }>;
  },
): EffectContext & { createdTokens: string[]; zoneContents: Map<string, string[]> } {
  const cardStore = new Map<string, { zone: string; owner: string }>();
  const zoneContents = new Map<string, string[]>();
  const createdTokens: string[] = [];

  // Initialize card data
  if (opts.cards) {
    for (const [id, data] of Object.entries(opts.cards)) {
      cardStore.set(id, { ...data });
      const existing = zoneContents.get(data.zone) ?? [];
      existing.push(id);
      zoneContents.set(data.zone, existing);
    }
  }

  return {
    cards: {
      getCardOwner: (cardId) => cardStore.get(cardId as string)?.owner,
    },
    counters: {
      addCounter: () => {},
      clearCounter: () => {},
      removeCounter: () => {},
      setFlag: () => {},
    },
    createCardInZone: (cardId: string, zoneId: string, ownerId: string) => {
      cardStore.set(cardId, { owner: ownerId, zone: zoneId });
      const existing = zoneContents.get(zoneId) ?? [];
      existing.push(cardId);
      zoneContents.set(zoneId, existing);
      createdTokens.push(cardId);
    },
    createdTokens,
    draft,
    playerId: opts.playerId,
    sourceCardId: opts.sourceCardId,
    sourceZone: opts.sourceZone,
    zoneContents,
    zones: {
      drawCards: (params) => {
        const sourceCards = zoneContents.get(params.from as string) ?? [];
        for (let i = 0; i < params.count && sourceCards.length > 0; i++) {
          const cardId = sourceCards.shift()!;
          const target = zoneContents.get(params.to as string) ?? [];
          target.push(cardId);
          zoneContents.set(params.to as string, target);
        }
      },
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
}

describe("Token Creation Effect (rule 170-178)", () => {
  let registry: CardDefinitionRegistry;

  beforeEach(() => {
    registry = new CardDefinitionRegistry();
    setGlobalCardRegistry(registry);
  });

  afterEach(() => {
    clearGlobalCardRegistry();
  });

  test("creates a single unit token at base", () => {
    const draft = createMockState();
    const ctx = createMockEffectContext(draft, {
      playerId: "p1",
      sourceCardId: "source-card",
    });

    const effect: ExecutableEffect = {
      amount: 1,
      location: "base",
      token: { might: 1, name: "Recruit", type: "unit" },
      type: "create-token",
    };

    executeEffect(effect, ctx);

    expect(ctx.createdTokens).toHaveLength(1);
    const tokenId = ctx.createdTokens[0]!;

    // Token should be in base zone
    const baseCards = ctx.zoneContents.get("base") ?? [];
    expect(baseCards).toContain(tokenId);

    // Token definition should be registered in global registry
    const def = registry.get(tokenId);
    expect(def).toBeDefined();
    expect(def?.name).toBe("Recruit");
    expect(def?.cardType).toBe("unit");
    expect(def?.might).toBe(1);
  });

  test("creates multiple tokens", () => {
    const draft = createMockState();
    const ctx = createMockEffectContext(draft, {
      playerId: "p1",
      sourceCardId: "source-card",
    });

    const effect: ExecutableEffect = {
      amount: 3,
      location: "base",
      token: { might: 2, name: "Sand Soldier", type: "unit" },
      type: "create-token",
    };

    executeEffect(effect, ctx);

    expect(ctx.createdTokens).toHaveLength(3);
    const baseCards = ctx.zoneContents.get("base") ?? [];
    for (const tokenId of ctx.createdTokens) {
      expect(baseCards).toContain(tokenId);
    }
  });

  test("creates token at 'here' location (source zone)", () => {
    const draft = createMockState();
    const ctx = createMockEffectContext(draft, {
      cards: {
        "source-card": { owner: "p1", zone: "battlefield-bf-1" },
      },
      playerId: "p1",
      sourceCardId: "source-card",
      sourceZone: "battlefield-bf-1",
    });

    const effect: ExecutableEffect = {
      location: "here",
      token: { might: 3, name: "Mech", type: "unit" },
      type: "create-token",
    };

    executeEffect(effect, ctx);

    expect(ctx.createdTokens).toHaveLength(1);
    const bfCards = ctx.zoneContents.get("battlefield-bf-1") ?? [];
    expect(bfCards).toContain(ctx.createdTokens[0]!);
  });

  test("creates gear token", () => {
    const draft = createMockState();
    const ctx = createMockEffectContext(draft, {
      playerId: "p1",
      sourceCardId: "source-card",
    });

    const effect: ExecutableEffect = {
      location: "base",
      token: { name: "Gold", type: "gear" },
      type: "create-token",
    };

    executeEffect(effect, ctx);

    expect(ctx.createdTokens).toHaveLength(1);
    const def = registry.get(ctx.createdTokens[0]!);
    expect(def?.cardType).toBe("gear");
    expect(def?.might).toBeUndefined();
  });

  test("defaults to 1 token and base location when omitted", () => {
    const draft = createMockState();
    const ctx = createMockEffectContext(draft, {
      playerId: "p1",
      sourceCardId: "source-card",
    });

    const effect: ExecutableEffect = {
      token: { might: 1, name: "Recruit", type: "unit" },
      type: "create-token",
    };

    executeEffect(effect, ctx);

    expect(ctx.createdTokens).toHaveLength(1);
    const baseCards = ctx.zoneContents.get("base") ?? [];
    expect(baseCards).toContain(ctx.createdTokens[0]!);
  });

  test("token with keywords is registered with those keywords", () => {
    const draft = createMockState();
    const ctx = createMockEffectContext(draft, {
      playerId: "p1",
      sourceCardId: "source-card",
    });

    const effect: ExecutableEffect = {
      location: "base",
      token: { keywords: ["Temporary"], might: 3, name: "Sprite", type: "unit" },
      type: "create-token",
    };

    executeEffect(effect, ctx);

    const def = registry.get(ctx.createdTokens[0]!);
    expect(def?.keywords).toContain("Temporary");
  });

  test("no-ops gracefully when createCardInZone is not provided", () => {
    const draft = createMockState();
    // Build a context WITHOUT createCardInZone
    const ctx: EffectContext = {
      cards: { getCardOwner: () => undefined },
      counters: {
        addCounter: () => {},
        clearCounter: () => {},
        removeCounter: () => {},
        setFlag: () => {},
      },
      draft,
      playerId: "p1",
      sourceCardId: "source-card",
      zones: {
        drawCards: () => {},
        getCardZone: (() => undefined) as EffectContext["zones"]["getCardZone"],
        getCardsInZone: (() => []) as EffectContext["zones"]["getCardsInZone"],
        moveCard: () => {},
      },
      // No createCardInZone
    };

    const effect: ExecutableEffect = {
      token: { might: 1, name: "Recruit", type: "unit" },
      type: "create-token",
    };

    // Should not throw
    expect(() => executeEffect(effect, ctx)).not.toThrow();
  });
});
