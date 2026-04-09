/**
 * Target Resolver Tests
 */

import { describe, expect, test } from "bun:test";
import type { TargetDescriptor, TargetResolverContext } from "../abilities/target-resolver";
import { resolveTarget } from "../abilities/target-resolver";
import {
  CardDefinitionRegistry,
  clearGlobalCardRegistry,
  setGlobalCardRegistry,
} from "../operations/card-lookup";
import type { RiftboundGameState } from "../types";

function mockState(): RiftboundGameState {
  return {
    battlefields: { "bf-1": { contested: false, controller: "p1", id: "bf-1" } },
    conqueredThisTurn: {},
    gameId: "t",
    players: { p1: { id: "p1", victoryPoints: 0 }, p2: { id: "p2", victoryPoints: 0 } },
    runePools: { p1: { energy: 0, power: {} }, p2: { energy: 0, power: {} } },
    scoredThisTurn: {},
    status: "playing",
    turn: { activePlayer: "p1", number: 1, phase: "main" },
    victoryScore: 8,
  };
}

function mockCtx(
  cardLocations: Record<string, { zone: string; owner: string }>,
  playerId = "p1",
  sourceCardId = "source",
): TargetResolverContext {
  return {
    cards: {
      getCardOwner: ((cardId: string) =>
        cardLocations[cardId]?.owner) as unknown as TargetResolverContext["cards"]["getCardOwner"],
    },
    draft: mockState(),
    playerId,
    sourceCardId,
    zones: {
      getCardZone: ((cardId: string) =>
        cardLocations[cardId]?.zone) as unknown as TargetResolverContext["zones"]["getCardZone"],
      getCardsInZone: ((zoneId: string, pid?: string) => {
        const cards: string[] = [];
        for (const [id, data] of Object.entries(cardLocations)) {
          if (data.zone === zoneId) {
            if (!pid || data.owner === pid) {
              cards.push(id);
            }
          }
        }
        return cards;
      }) as unknown as TargetResolverContext["zones"]["getCardsInZone"],
    },
  };
}

describe("Target Resolver", () => {
  test("self target returns source card", () => {
    const ctx = mockCtx({}, "p1", "my-card");
    const result = resolveTarget({ type: "self" }, ctx);
    expect(result).toEqual(["my-card"]);
  });

  test("unit target returns units on board", () => {
    const registry = new CardDefinitionRegistry();
    registry.register("u1", { cardType: "unit", id: "u1", might: 3, name: "Unit 1" });
    registry.register("g1", { cardType: "gear", id: "g1", name: "Gear 1" });
    setGlobalCardRegistry(registry);

    const ctx = mockCtx(
      {
        g1: { owner: "p1", zone: "base" },
        u1: { owner: "p1", zone: "base" },
      },
      "p1",
      "source",
    );

    const result = resolveTarget({ type: "unit" }, ctx);
    expect(result).toContain("u1");
    expect(result).not.toContain("g1");

    clearGlobalCardRegistry();
  });

  test("friendly controller filter", () => {
    const registry = new CardDefinitionRegistry();
    registry.register("u1", { cardType: "unit", id: "u1", might: 3, name: "My Unit" });
    registry.register("u2", { cardType: "unit", id: "u2", might: 3, name: "Enemy Unit" });
    setGlobalCardRegistry(registry);

    const ctx = mockCtx(
      {
        u1: { owner: "p1", zone: "base" },
        u2: { owner: "p2", zone: "base" },
      },
      "p1",
      "source",
    );

    const result = resolveTarget({ controller: "friendly", type: "unit" }, ctx);
    expect(result).toContain("u1");
    expect(result).not.toContain("u2");

    clearGlobalCardRegistry();
  });

  test("enemy controller filter", () => {
    const registry = new CardDefinitionRegistry();
    registry.register("u1", { cardType: "unit", id: "u1", might: 3, name: "My Unit" });
    registry.register("u2", { cardType: "unit", id: "u2", might: 3, name: "Enemy Unit" });
    setGlobalCardRegistry(registry);

    const ctx = mockCtx(
      {
        u1: { owner: "p1", zone: "base" },
        u2: { owner: "p2", zone: "base" },
      },
      "p1",
      "source",
    );

    const result = resolveTarget({ controller: "enemy", type: "unit" }, ctx);
    expect(result).not.toContain("u1");
    expect(result).toContain("u2");

    clearGlobalCardRegistry();
  });

  test("excludes source card (unless self target)", () => {
    const registry = new CardDefinitionRegistry();
    registry.register("source", { cardType: "unit", id: "source", might: 3, name: "Source" });
    registry.register("other", { cardType: "unit", id: "other", might: 3, name: "Other" });
    setGlobalCardRegistry(registry);

    const ctx = mockCtx(
      {
        other: { owner: "p1", zone: "base" },
        source: { owner: "p1", zone: "base" },
      },
      "p1",
      "source",
    );

    const result = resolveTarget({ controller: "friendly", type: "unit" }, ctx);
    expect(result).not.toContain("source");
    expect(result).toContain("other");

    clearGlobalCardRegistry();
  });

  test("quantity limits results", () => {
    const registry = new CardDefinitionRegistry();
    registry.register("u1", { cardType: "unit", id: "u1", might: 3, name: "Unit 1" });
    registry.register("u2", { cardType: "unit", id: "u2", might: 3, name: "Unit 2" });
    registry.register("u3", { cardType: "unit", id: "u3", might: 3, name: "Unit 3" });
    setGlobalCardRegistry(registry);

    const ctx = mockCtx(
      {
        u1: { owner: "p2", zone: "base" },
        u2: { owner: "p2", zone: "base" },
        u3: { owner: "p2", zone: "base" },
      },
      "p1",
      "source",
    );

    // Default quantity is 1
    const one = resolveTarget({ controller: "enemy", type: "unit" }, ctx);
    expect(one).toHaveLength(1);

    // Explicit quantity
    const two = resolveTarget({ controller: "enemy", quantity: 2, type: "unit" }, ctx);
    expect(two).toHaveLength(2);

    // All
    const all = resolveTarget({ controller: "enemy", quantity: "all", type: "unit" }, ctx);
    expect(all).toHaveLength(3);

    clearGlobalCardRegistry();
  });

  test("no target returns empty array", () => {
    const result = resolveTarget(undefined, mockCtx({}));
    expect(result).toHaveLength(0);
  });

  test("gear target type", () => {
    const registry = new CardDefinitionRegistry();
    registry.register("g1", { cardType: "gear", id: "g1", name: "Gear" });
    registry.register("u1", { cardType: "unit", id: "u1", might: 3, name: "Unit" });
    setGlobalCardRegistry(registry);

    const ctx = mockCtx(
      {
        g1: { owner: "p1", zone: "base" },
        u1: { owner: "p1", zone: "base" },
      },
      "p1",
      "source",
    );

    const result = resolveTarget({ controller: "friendly", type: "gear" }, ctx);
    expect(result).toContain("g1");
    expect(result).not.toContain("u1");

    clearGlobalCardRegistry();
  });
});
