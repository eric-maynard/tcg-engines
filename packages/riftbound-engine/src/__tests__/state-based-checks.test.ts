/**
 * State-Based Checks & Cleanup Tests
 *
 * Tests automatic death checks, orphaned hidden card removal,
 * stale combat role cleanup, and combat pending detection.
 */

import { describe, expect, test } from "bun:test";
import type { CleanupContext } from "../cleanup";
import { performCleanup, performFullCleanup } from "../cleanup";
import {
  CardDefinitionRegistry,
  clearGlobalCardRegistry,
  setGlobalCardRegistry,
} from "../operations/card-lookup";
import type { RiftboundCardMeta, RiftboundGameState } from "../types";

// Minimal mock types
type MockCardId = string;

function createMockState(overrides?: Partial<RiftboundGameState>): RiftboundGameState {
  return {
    battlefields: {},
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

// Mutable card store for testing
function createMockContext(
  draft: RiftboundGameState,
  cardData: Record<string, { zone: string; owner: string; meta: Partial<RiftboundCardMeta> }>,
): CleanupContext {
  const cardStore = new Map(Object.entries(cardData));
  const zoneContents = new Map<string, string[]>();

  // Build zone contents from card data
  for (const [cardId, data] of cardStore) {
    const existing = zoneContents.get(data.zone) ?? [];
    existing.push(cardId);
    zoneContents.set(data.zone, existing);
  }

  // Track moves for assertions
  const movedToTrash: string[] = [];

  return {
    cards: {
      getCardMeta: (cardId) => cardStore.get(cardId as string)?.meta,
      getCardOwner: (cardId) => cardStore.get(cardId as string)?.owner,
      updateCardMeta: (cardId, meta) => {
        const card = cardStore.get(cardId as string);
        if (card) {
          card.meta = { ...card.meta, ...meta };
        }
      },
    },
    counters: {
      clearCounter: (cardId, counter) => {
        const card = cardStore.get(cardId as string);
        if (card) {
          (card.meta as Record<string, unknown>)[counter] = 0;
        }
      },
      getCounter: (cardId, counter) => {
        const meta = cardStore.get(cardId as string)?.meta;
        return (meta as Record<string, number>)?.[counter] ?? 0;
      },
      setFlag: (cardId, flag, value) => {
        const card = cardStore.get(cardId as string);
        if (card) {
          (card.meta as Record<string, unknown>)[flag] = value;
        }
      },
    },
    draft,
    zones: {
      getCardsInZone: ((zoneId: string, playerId?: string) => {
        const cards = zoneContents.get(zoneId) ?? [];
        if (playerId) {
          return cards.filter((id) => cardStore.get(id)?.owner === playerId);
        }
        return cards;
      }) as unknown as CleanupContext["zones"]["getCardsInZone"],
      moveCard: (params) => {
        const cardId = params.cardId as string;
        const targetZone = params.targetZoneId as string;

        // Remove from current zone
        for (const [zone, cards] of zoneContents) {
          const idx = cards.indexOf(cardId);
          if (idx !== -1) {
            cards.splice(idx, 1);
            break;
          }
        }

        // Add to target zone
        const target = zoneContents.get(targetZone) ?? [];
        target.push(cardId);
        zoneContents.set(targetZone, target);

        // Update card store
        const card = cardStore.get(cardId);
        if (card) {
          card.zone = targetZone;
        }

        if (targetZone === "trash") {
          movedToTrash.push(cardId);
        }
      },
    },
  };
}

describe("State-Based Checks: Death by Damage (rule 520)", () => {
  test("unit with damage >= might is killed", () => {
    // Register a unit with 3 might
    const registry = new CardDefinitionRegistry();
    registry.register("unit-1", {
      cardType: "unit",
      id: "unit-1",
      might: 3,
      name: "Test Unit",
    });
    setGlobalCardRegistry(registry);

    const draft = createMockState({
      battlefields: { "bf-1": { contested: false, controller: "p1", id: "bf-1" } },
    });

    const ctx = createMockContext(draft, {
      "unit-1": { meta: { damage: 3 }, owner: "p1", zone: "battlefield-bf-1" },
    });

    const result = performCleanup(ctx);

    expect(result.killed).toContain("unit-1");
    expect(result.stateChanged).toBe(true);

    clearGlobalCardRegistry();
  });

  test("unit with damage < might survives", () => {
    const registry = new CardDefinitionRegistry();
    registry.register("unit-1", {
      cardType: "unit",
      id: "unit-1",
      might: 5,
      name: "Tough Unit",
    });
    setGlobalCardRegistry(registry);

    const draft = createMockState({
      battlefields: { "bf-1": { contested: false, controller: "p1", id: "bf-1" } },
    });

    const ctx = createMockContext(draft, {
      "unit-1": { meta: { damage: 4 }, owner: "p1", zone: "battlefield-bf-1" },
    });

    const result = performCleanup(ctx);

    expect(result.killed).not.toContain("unit-1");

    clearGlobalCardRegistry();
  });

  test("unit with 0 damage is not checked", () => {
    const registry = new CardDefinitionRegistry();
    registry.register("unit-1", {
      cardType: "unit",
      id: "unit-1",
      might: 3,
      name: "Healthy Unit",
    });
    setGlobalCardRegistry(registry);

    const draft = createMockState({
      battlefields: { "bf-1": { contested: false, controller: "p1", id: "bf-1" } },
    });

    const ctx = createMockContext(draft, {
      "unit-1": { meta: { damage: 0 }, owner: "p1", zone: "battlefield-bf-1" },
    });

    const result = performCleanup(ctx);

    expect(result.killed).toHaveLength(0);

    clearGlobalCardRegistry();
  });

  test("multiple units killed simultaneously", () => {
    const registry = new CardDefinitionRegistry();
    registry.register("unit-1", { cardType: "unit", id: "unit-1", might: 2, name: "Unit A" });
    registry.register("unit-2", { cardType: "unit", id: "unit-2", might: 3, name: "Unit B" });
    registry.register("unit-3", { cardType: "unit", id: "unit-3", might: 5, name: "Unit C" });
    setGlobalCardRegistry(registry);

    const draft = createMockState({
      battlefields: { "bf-1": { contested: false, controller: "p1", id: "bf-1" } },
    });

    const ctx = createMockContext(draft, {
      "unit-1": { meta: { damage: 2 }, owner: "p1", zone: "battlefield-bf-1" }, // Dies (2 >= 2)
      "unit-2": { meta: { damage: 5 }, owner: "p2", zone: "battlefield-bf-1" }, // Dies (5 >= 3)
      "unit-3": { meta: { damage: 3 }, owner: "p1", zone: "base" }, // Lives (3 < 5)
    });

    const result = performCleanup(ctx);

    expect(result.killed).toContain("unit-1");
    expect(result.killed).toContain("unit-2");
    expect(result.killed).not.toContain("unit-3");

    clearGlobalCardRegistry();
  });

  test("killed unit metadata is cleared", () => {
    const registry = new CardDefinitionRegistry();
    registry.register("unit-1", { cardType: "unit", id: "unit-1", might: 2, name: "Unit" });
    setGlobalCardRegistry(registry);

    const draft = createMockState({
      battlefields: { "bf-1": { contested: false, controller: "p1", id: "bf-1" } },
    });

    const cardData = {
      "unit-1": {
        meta: { combatRole: "attacker" as const, damage: 5, exhausted: true, stunned: true },
        owner: "p1",
        zone: "battlefield-bf-1",
      },
    };
    const ctx = createMockContext(draft, cardData);

    performCleanup(ctx);

    // Metadata should be cleared
    expect(cardData["unit-1"].meta.damage).toBe(0);
    expect(cardData["unit-1"].meta.exhausted).toBe(false);
    expect(cardData["unit-1"].meta.stunned).toBe(false);
    expect(cardData["unit-1"].meta.combatRole).toBeNull();

    clearGlobalCardRegistry();
  });
});

describe("State-Based Checks: Stale Combat Roles (rule 521)", () => {
  test("combat role cleared for units not at a battlefield", () => {
    const registry = new CardDefinitionRegistry();
    registry.register("unit-1", { cardType: "unit", id: "unit-1", might: 3, name: "Unit" });
    setGlobalCardRegistry(registry);

    const draft = createMockState();

    const cardData = {
      "unit-1": { meta: { combatRole: "attacker" as const, damage: 0 }, owner: "p1", zone: "base" },
    };
    const ctx = createMockContext(draft, cardData);

    performCleanup(ctx);

    expect(cardData["unit-1"].meta.combatRole).toBeNull();

    clearGlobalCardRegistry();
  });

  test("combat role preserved for units at a battlefield", () => {
    const registry = new CardDefinitionRegistry();
    registry.register("unit-1", { cardType: "unit", id: "unit-1", might: 3, name: "Unit" });
    setGlobalCardRegistry(registry);

    const draft = createMockState({
      battlefields: { "bf-1": { contested: true, controller: "p1", id: "bf-1" } },
    });

    const cardData = {
      "unit-1": {
        meta: { combatRole: "attacker" as const, damage: 0 },
        owner: "p1",
        zone: "battlefield-bf-1",
      },
    };
    const ctx = createMockContext(draft, cardData);

    performCleanup(ctx);

    // Should NOT be cleared — unit is at a battlefield
    expect(cardData["unit-1"].meta.combatRole).toBe("attacker");

    clearGlobalCardRegistry();
  });
});

describe("State-Based Checks: Orphaned Hidden Cards (rule 523)", () => {
  test("hidden card removed when no friendly unit at battlefield", () => {
    const registry = new CardDefinitionRegistry();
    setGlobalCardRegistry(registry);

    const draft = createMockState({
      battlefields: { "bf-1": { contested: false, controller: null, id: "bf-1" } },
    });

    const ctx = createMockContext(draft, {
      "hidden-1": { meta: { hidden: true, hiddenAt: "bf-1" }, owner: "p1", zone: "facedown-bf-1" },
      // No p1 units at bf-1
    });

    const result = performCleanup(ctx);

    expect(result.hiddenRemoved).toContain("hidden-1");

    clearGlobalCardRegistry();
  });

  test("hidden card preserved when friendly unit present", () => {
    const registry = new CardDefinitionRegistry();
    registry.register("unit-1", { cardType: "unit", id: "unit-1", might: 3, name: "Unit" });
    setGlobalCardRegistry(registry);

    const draft = createMockState({
      battlefields: { "bf-1": { contested: false, controller: "p1", id: "bf-1" } },
    });

    const ctx = createMockContext(draft, {
      "hidden-1": { meta: { hidden: true }, owner: "p1", zone: "facedown-bf-1" },
      "unit-1": { meta: { damage: 0 }, owner: "p1", zone: "battlefield-bf-1" },
    });

    const result = performCleanup(ctx);

    expect(result.hiddenRemoved).not.toContain("hidden-1");

    clearGlobalCardRegistry();
  });
});

describe("State-Based Checks: Combat Pending (rule 524)", () => {
  test("marks combat pending when opposing units at same battlefield", () => {
    const registry = new CardDefinitionRegistry();
    registry.register("unit-1", { cardType: "unit", id: "unit-1", might: 3, name: "A" });
    registry.register("unit-2", { cardType: "unit", id: "unit-2", might: 3, name: "B" });
    setGlobalCardRegistry(registry);

    const draft = createMockState({
      battlefields: { "bf-1": { contested: false, controller: "p1", id: "bf-1" } },
    });

    const ctx = createMockContext(draft, {
      "unit-1": { meta: { damage: 0 }, owner: "p1", zone: "battlefield-bf-1" },
      "unit-2": { meta: { damage: 0 }, owner: "p2", zone: "battlefield-bf-1" },
    });

    const result = performCleanup(ctx);

    expect(result.combatPending).toContain("bf-1");

    clearGlobalCardRegistry();
  });

  test("no combat pending with only one player's units", () => {
    const registry = new CardDefinitionRegistry();
    registry.register("unit-1", { cardType: "unit", id: "unit-1", might: 3, name: "A" });
    registry.register("unit-2", { cardType: "unit", id: "unit-2", might: 3, name: "B" });
    setGlobalCardRegistry(registry);

    const draft = createMockState({
      battlefields: { "bf-1": { contested: false, controller: "p1", id: "bf-1" } },
    });

    const ctx = createMockContext(draft, {
      "unit-1": { meta: { damage: 0 }, owner: "p1", zone: "battlefield-bf-1" },
      "unit-2": { meta: { damage: 0 }, owner: "p1", zone: "battlefield-bf-1" },
    });

    const result = performCleanup(ctx);

    expect(result.combatPending).toHaveLength(0);

    clearGlobalCardRegistry();
  });

  test("already contested battlefield not re-flagged", () => {
    const registry = new CardDefinitionRegistry();
    registry.register("unit-1", { cardType: "unit", id: "unit-1", might: 3, name: "A" });
    registry.register("unit-2", { cardType: "unit", id: "unit-2", might: 3, name: "B" });
    setGlobalCardRegistry(registry);

    const draft = createMockState({
      battlefields: { "bf-1": { contested: true, controller: "p1", id: "bf-1" } },
    });

    const ctx = createMockContext(draft, {
      "unit-1": { meta: { damage: 0 }, owner: "p1", zone: "battlefield-bf-1" },
      "unit-2": { meta: { damage: 0 }, owner: "p2", zone: "battlefield-bf-1" },
    });

    const result = performCleanup(ctx);

    expect(result.combatPending).toHaveLength(0); // Already contested

    clearGlobalCardRegistry();
  });
});

describe("State-Based Checks: Full Cleanup Loop", () => {
  test("no changes on clean board", () => {
    const registry = new CardDefinitionRegistry();
    setGlobalCardRegistry(registry);

    const draft = createMockState();
    const ctx = createMockContext(draft, {});

    const result = performFullCleanup(ctx);

    expect(result.stateChanged).toBe(false);
    expect(result.killed).toHaveLength(0);

    clearGlobalCardRegistry();
  });
});
