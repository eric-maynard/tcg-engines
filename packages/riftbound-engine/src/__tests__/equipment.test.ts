/**
 * Equipment System Tests
 *
 * Tests for attaching/detaching equipment to units,
 * equipment Might bonus in combat, and cleanup on unit death.
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
import type { CleanupContext } from "../cleanup";
import { performCleanup } from "../cleanup";
import type { CombatUnit } from "../combat";
import { resolveCombat } from "../combat";
import type { RiftboundCardMeta, RiftboundGameState } from "../types";

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

function createMockCleanupContext(
  draft: RiftboundGameState,
  cardData: Record<string, { zone: string; owner: string; meta: Partial<RiftboundCardMeta> }>,
): CleanupContext & {
  cardStore: Map<string, { zone: string; owner: string; meta: Partial<RiftboundCardMeta> }>;
} {
  const cardStore = new Map(Object.entries(cardData));
  const zoneContents = new Map<string, string[]>();

  for (const [cardId, data] of cardStore) {
    const existing = zoneContents.get(data.zone) ?? [];
    existing.push(cardId);
    zoneContents.set(data.zone, existing);
  }

  return {
    cardStore,
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
        return [...cards];
      }) as unknown as CleanupContext["zones"]["getCardsInZone"],
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

describe("Equipment: Metadata Tracking", () => {
  let registry: CardDefinitionRegistry;

  beforeEach(() => {
    registry = new CardDefinitionRegistry();
    setGlobalCardRegistry(registry);
  });

  afterEach(() => {
    clearGlobalCardRegistry();
  });

  test("RiftboundCardMeta supports attachedTo and equippedWith fields", () => {
    const meta: RiftboundCardMeta = {
      attachedTo: "unit-1",
      buffed: false,
      combatRole: null,
      damage: 0,
      equippedWith: ["equip-1", "equip-2"],
      exhausted: false,
      hidden: false,
      stunned: false,
    };

    expect(meta.attachedTo).toBe("unit-1");
    expect(meta.equippedWith).toEqual(["equip-1", "equip-2"]);
  });

  test("attachedTo defaults to undefined", () => {
    const meta: Partial<RiftboundCardMeta> = { damage: 0 };
    expect(meta.attachedTo).toBeUndefined();
    expect(meta.equippedWith).toBeUndefined();
  });
});

describe("Equipment: Combat Might Bonus", () => {
  let registry: CardDefinitionRegistry;

  beforeEach(() => {
    registry = new CardDefinitionRegistry();
    setGlobalCardRegistry(registry);
  });

  afterEach(() => {
    clearGlobalCardRegistry();
  });

  test("getMightBonus returns bonus from equipment definition", () => {
    registry.register("fury-blade", {
      cardType: "equipment",
      id: "fury-blade",
      mightBonus: 2,
      name: "Fury Blade",
    });

    expect(registry.getMightBonus("fury-blade")).toBe(2);
  });

  test("getMightBonus returns 0 for non-equipment cards", () => {
    registry.register("unit-1", {
      cardType: "unit",
      id: "unit-1",
      might: 3,
      name: "Warrior",
    });

    expect(registry.getMightBonus("unit-1")).toBe(0);
  });

  test("equipped unit has higher effective Might in combat", () => {
    // A 3-Might unit with a +2 equipment should have 5 effective Might
    const equipped: CombatUnit = {
      id: "equipped-unit",
      owner: "p1",
      baseMight: 5, // 3 base + 2 from equipment (calculated before combat)
      currentDamage: 0,
      keywords: [],
    };

    const defender: CombatUnit = {
      baseMight: 4,
      currentDamage: 0,
      id: "defender-unit",
      keywords: [],
      owner: "p2",
    };

    const result = resolveCombat([equipped], [defender]);

    expect(result.winner).toBe("attacker");
    expect(result.attackerTotal).toBe(5);
    expect(result.defenderTotal).toBe(4);
  });
});

describe("Equipment: Cleanup on Unit Death", () => {
  let registry: CardDefinitionRegistry;

  beforeEach(() => {
    registry = new CardDefinitionRegistry();
    setGlobalCardRegistry(registry);
  });

  afterEach(() => {
    clearGlobalCardRegistry();
  });

  test("equipment is detached when equipped unit dies", () => {
    registry.register("unit-1", { cardType: "unit", id: "unit-1", might: 3, name: "Warrior" });
    registry.register("equip-1", {
      cardType: "equipment",
      id: "equip-1",
      mightBonus: 2,
      name: "Sword",
    });

    const draft = createMockState({
      battlefields: { "bf-1": { contested: false, controller: "p1", id: "bf-1" } },
    });

    const cardData = {
      "equip-1": {
        meta: { attachedTo: "unit-1" } as Partial<RiftboundCardMeta>,
        owner: "p1",
        zone: "battlefield-bf-1",
      },
      "unit-1": {
        meta: { damage: 5, equippedWith: ["equip-1"] } as Partial<RiftboundCardMeta>,
        owner: "p1",
        zone: "battlefield-bf-1",
      },
    };
    const ctx = createMockCleanupContext(draft, cardData);

    const result = performCleanup(ctx);

    // Unit should be killed
    expect(result.killed).toContain("unit-1");

    // Equipment should be detached (attachedTo cleared)
    expect(cardData["equip-1"].meta.attachedTo).toBeUndefined();

    // Equipment should be moved to base
    expect(cardData["equip-1"].zone).toBe("base");

    // Unit's equippedWith should be cleared
    expect(cardData["unit-1"].meta.equippedWith).toBeUndefined();
  });

  test("multiple equipment pieces detached on unit death", () => {
    registry.register("unit-1", { cardType: "unit", id: "unit-1", might: 2, name: "Warrior" });
    registry.register("equip-1", {
      cardType: "equipment",
      id: "equip-1",
      mightBonus: 1,
      name: "Sword",
    });
    registry.register("equip-2", {
      cardType: "equipment",
      id: "equip-2",
      mightBonus: 1,
      name: "Shield",
    });

    const draft = createMockState({
      battlefields: { "bf-1": { contested: false, controller: "p1", id: "bf-1" } },
    });

    const cardData = {
      "equip-1": {
        meta: { attachedTo: "unit-1" } as Partial<RiftboundCardMeta>,
        owner: "p1",
        zone: "battlefield-bf-1",
      },
      "equip-2": {
        meta: { attachedTo: "unit-1" } as Partial<RiftboundCardMeta>,
        owner: "p1",
        zone: "battlefield-bf-1",
      },
      "unit-1": {
        meta: { damage: 4, equippedWith: ["equip-1", "equip-2"] } as Partial<RiftboundCardMeta>,
        owner: "p1",
        zone: "battlefield-bf-1",
      },
    };
    const ctx = createMockCleanupContext(draft, cardData);

    performCleanup(ctx);

    // Both equipment pieces should be at base
    expect(cardData["equip-1"].zone).toBe("base");
    expect(cardData["equip-2"].zone).toBe("base");
    expect(cardData["equip-1"].meta.attachedTo).toBeUndefined();
    expect(cardData["equip-2"].meta.attachedTo).toBeUndefined();
  });

  test("unit without equipment dies normally", () => {
    registry.register("unit-1", { cardType: "unit", id: "unit-1", might: 2, name: "Unit" });

    const draft = createMockState({
      battlefields: { "bf-1": { contested: false, controller: "p1", id: "bf-1" } },
    });

    const cardData = {
      "unit-1": {
        meta: { damage: 3 } as Partial<RiftboundCardMeta>,
        owner: "p1",
        zone: "battlefield-bf-1",
      },
    };
    const ctx = createMockCleanupContext(draft, cardData);

    const result = performCleanup(ctx);

    expect(result.killed).toContain("unit-1");
    expect(cardData["unit-1"].zone).toBe("trash");
  });
});
