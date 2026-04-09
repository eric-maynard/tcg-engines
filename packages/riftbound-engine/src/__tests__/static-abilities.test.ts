/**
 * Static / Passive Ability Tests
 *
 * Tests for continuous effects that apply while a card is on the board.
 * These are recalculated from scratch after every state mutation.
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
import { recalculateStaticEffects } from "../abilities/static-abilities";
import type { StaticAbilityContext } from "../abilities/static-abilities";
import type { RiftboundCardMeta, RiftboundGameState } from "../types";

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

function createMockStaticContext(
  draft: RiftboundGameState,
  cardData: Record<string, { zone: string; owner: string; meta: Partial<RiftboundCardMeta> }>,
): StaticAbilityContext & {
  cardStore: Map<string, { zone: string; owner: string; meta: Partial<RiftboundCardMeta> }>;
} {
  const cardStore = new Map(
    Object.entries(cardData).map(([k, v]) => [k, { ...v, meta: { ...v.meta } }]),
  );
  const zoneContents = new Map<string, string[]>();

  for (const [cardId, data] of cardStore) {
    const existing = zoneContents.get(data.zone) ?? [];
    existing.push(cardId);
    zoneContents.set(data.zone, existing);
  }

  return {
    cardStore,
    cards: {
      getCardMeta: ((cardId: string) =>
        cardStore.get(cardId)?.meta) as unknown as StaticAbilityContext["cards"]["getCardMeta"],
      getCardOwner: ((cardId: string) =>
        cardStore.get(cardId)?.owner) as unknown as StaticAbilityContext["cards"]["getCardOwner"],
      updateCardMeta: ((cardId: string, updates: Partial<RiftboundCardMeta>) => {
        const card = cardStore.get(cardId);
        if (card) {
          card.meta = { ...card.meta, ...updates };
        }
      }) as unknown as StaticAbilityContext["cards"]["updateCardMeta"],
    },
    draft,
    zones: {
      getCardsInZone: ((zoneId: string, playerId?: string) => {
        const cards = zoneContents.get(zoneId) ?? [];
        if (playerId) {
          return cards.filter((id) => cardStore.get(id)?.owner === playerId);
        }
        return [...cards];
      }) as unknown as StaticAbilityContext["zones"]["getCardsInZone"],
    },
  };
}

describe("Static Abilities: Self Might Modification", () => {
  let registry: CardDefinitionRegistry;

  beforeEach(() => {
    registry = new CardDefinitionRegistry();
    setGlobalCardRegistry(registry);
  });

  afterEach(() => {
    clearGlobalCardRegistry();
  });

  test("unconditional +1 Might is always applied", () => {
    registry.register("unit-1", {
      abilities: [{ effect: { amount: 1, type: "modify-might" }, type: "static" }],
      cardType: "unit",
      id: "unit-1",
      might: 3,
      name: "Strong Warrior",
    });

    const draft = createMockState();
    const ctx = createMockStaticContext(draft, {
      "unit-1": { meta: { damage: 0 }, owner: "p1", zone: "base" },
    });

    recalculateStaticEffects(ctx);

    expect(ctx.cardStore.get("unit-1")?.meta.staticMightBonus).toBe(1);
  });

  test("conditional +2 Might applies only when at battlefield", () => {
    registry.register("unit-1", {
      abilities: [
        {
          condition: { type: "while-at-battlefield" },
          effect: { amount: 2, type: "modify-might" },
          type: "static",
        },
      ],
      cardType: "unit",
      id: "unit-1",
      might: 3,
      name: "Battlefield Warrior",
    });

    const draft = createMockState();

    // At base — condition not met
    const ctxBase = createMockStaticContext(draft, {
      "unit-1": { meta: { damage: 0 }, owner: "p1", zone: "base" },
    });
    recalculateStaticEffects(ctxBase);
    expect(ctxBase.cardStore.get("unit-1")?.meta.staticMightBonus ?? 0).toBe(0);

    // At battlefield — condition met
    const ctxBf = createMockStaticContext(draft, {
      "unit-1": { meta: { damage: 0 }, owner: "p1", zone: "battlefield-bf-1" },
    });
    recalculateStaticEffects(ctxBf);
    expect(ctxBf.cardStore.get("unit-1")?.meta.staticMightBonus).toBe(2);
  });

  test("while-mighty condition checks if Might >= 5", () => {
    registry.register("unit-1", {
      abilities: [
        {
          condition: { type: "while-mighty" },
          effect: { amount: 2, type: "modify-might" },
          type: "static",
        },
      ],
      cardType: "unit",
      id: "unit-1",
      might: 5,
      name: "Mighty Warrior",
    });

    const draft = createMockState();
    const ctx = createMockStaticContext(draft, {
      "unit-1": { meta: { damage: 0 }, owner: "p1", zone: "base" },
    });

    recalculateStaticEffects(ctx);

    // 5 Might (base) >= 5 threshold → condition met → +2 bonus
    expect(ctx.cardStore.get("unit-1")?.meta.staticMightBonus).toBe(2);
  });
});

describe("Static Abilities: Keyword Granting", () => {
  let registry: CardDefinitionRegistry;

  beforeEach(() => {
    registry = new CardDefinitionRegistry();
    setGlobalCardRegistry(registry);
  });

  afterEach(() => {
    clearGlobalCardRegistry();
  });

  test("grants keyword to self", () => {
    registry.register("unit-1", {
      abilities: [{ effect: { keyword: "Shield", type: "grant-keyword" }, type: "static" }],
      cardType: "unit",
      id: "unit-1",
      might: 3,
      name: "Shielded Warrior",
    });

    const draft = createMockState();
    const ctx = createMockStaticContext(draft, {
      "unit-1": { meta: { damage: 0 }, owner: "p1", zone: "base" },
    });

    recalculateStaticEffects(ctx);

    const meta = ctx.cardStore.get("unit-1")?.meta;
    expect(meta?.grantedKeywords).toHaveLength(1);
    expect(meta?.grantedKeywords?.[0]?.keyword).toBe("Shield");
    expect(meta?.grantedKeywords?.[0]?.duration).toBe("static");
  });

  test("grants keyword to all friendly units at same battlefield", () => {
    registry.register("leader", {
      abilities: [
        {
          affects: "units",
          effect: { keyword: "Assault", type: "grant-keyword" },
          type: "static",
        },
      ],
      cardType: "unit",
      id: "leader",
      might: 2,
      name: "Inspiring Leader",
    });
    registry.register("ally", {
      cardType: "unit",
      id: "ally",
      might: 3,
      name: "Ally",
    });
    registry.register("enemy", {
      cardType: "unit",
      id: "enemy",
      might: 3,
      name: "Enemy",
    });

    const draft = createMockState();
    const ctx = createMockStaticContext(draft, {
      ally: { meta: { damage: 0 }, owner: "p1", zone: "battlefield-bf-1" },
      enemy: { meta: { damage: 0 }, owner: "p2", zone: "battlefield-bf-1" },
      leader: { meta: { damage: 0 }, owner: "p1", zone: "battlefield-bf-1" },
    });

    recalculateStaticEffects(ctx);

    // Leader and ally should have Assault (same zone, same owner)
    expect(
      ctx.cardStore.get("leader")?.meta.grantedKeywords?.some((gk) => gk.keyword === "Assault"),
    ).toBe(true);
    expect(
      ctx.cardStore.get("ally")?.meta.grantedKeywords?.some((gk) => gk.keyword === "Assault"),
    ).toBe(true);
    // Enemy should NOT have Assault
    expect(
      ctx.cardStore.get("enemy")?.meta.grantedKeywords?.some((gk) => gk.keyword === "Assault"),
    ).toBeFalsy();
  });
});

describe("Static Abilities: Recalculation", () => {
  let registry: CardDefinitionRegistry;

  beforeEach(() => {
    registry = new CardDefinitionRegistry();
    setGlobalCardRegistry(registry);
  });

  afterEach(() => {
    clearGlobalCardRegistry();
  });

  test("static effects are stripped and reapplied on each pass", () => {
    registry.register("unit-1", {
      abilities: [{ effect: { amount: 1, type: "modify-might" }, type: "static" }],
      cardType: "unit",
      id: "unit-1",
      might: 3,
      name: "Warrior",
    });

    const draft = createMockState();
    const ctx = createMockStaticContext(draft, {
      "unit-1": { meta: { damage: 0, staticMightBonus: 5 }, owner: "p1", zone: "base" },
    });

    // Even though staticMightBonus was 5, it should be recalculated to 1
    recalculateStaticEffects(ctx);
    expect(ctx.cardStore.get("unit-1")?.meta.staticMightBonus).toBe(1);
  });

  test("static keywords don't duplicate on multiple passes", () => {
    registry.register("unit-1", {
      abilities: [{ effect: { keyword: "Tank", type: "grant-keyword" }, type: "static" }],
      cardType: "unit",
      id: "unit-1",
      might: 3,
      name: "Warrior",
    });

    const draft = createMockState();
    const ctx = createMockStaticContext(draft, {
      "unit-1": { meta: { damage: 0 }, owner: "p1", zone: "base" },
    });

    // Run three times
    recalculateStaticEffects(ctx);
    recalculateStaticEffects(ctx);
    recalculateStaticEffects(ctx);

    // Should still have exactly 1 Tank keyword
    const meta = ctx.cardStore.get("unit-1")?.meta;
    const tankCount = meta?.grantedKeywords?.filter((gk) => gk.keyword === "Tank").length ?? 0;
    expect(tankCount).toBe(1);
  });

  test("static effects removed when source card leaves board", () => {
    registry.register("leader", {
      abilities: [
        { affects: "all-friendly", effect: { amount: 1, type: "modify-might" }, type: "static" },
      ],
      cardType: "unit",
      id: "leader",
      might: 2,
      name: "Leader",
    });
    registry.register("ally", {
      cardType: "unit",
      id: "ally",
      might: 3,
      name: "Ally",
    });

    const draft = createMockState();

    // With leader on board
    const ctx1 = createMockStaticContext(draft, {
      ally: { meta: { damage: 0 }, owner: "p1", zone: "base" },
      leader: { meta: { damage: 0 }, owner: "p1", zone: "base" },
    });
    recalculateStaticEffects(ctx1);
    expect(ctx1.cardStore.get("ally")?.meta.staticMightBonus).toBe(1);

    // Without leader (removed from board)
    const ctx2 = createMockStaticContext(draft, {
      ally: { meta: { damage: 0, staticMightBonus: 1 }, owner: "p1", zone: "base" },
    });
    recalculateStaticEffects(ctx2);
    expect(ctx2.cardStore.get("ally")?.meta.staticMightBonus ?? 0).toBe(0);
  });

  test("non-static granted keywords preserved during recalculation", () => {
    registry.register("unit-1", {
      abilities: [{ effect: { keyword: "Tank", type: "grant-keyword" }, type: "static" }],
      cardType: "unit",
      id: "unit-1",
      might: 3,
      name: "Warrior",
    });

    const draft = createMockState();
    const ctx = createMockStaticContext(draft, {
      "unit-1": {
        meta: {
          damage: 0,
          grantedKeywords: [{ duration: "turn" as const, keyword: "Assault", value: 1 }],
        },
        owner: "p1",
        zone: "base",
      },
    });

    recalculateStaticEffects(ctx);

    const meta = ctx.cardStore.get("unit-1")?.meta;
    // Should have both: the turn-scoped Assault AND the static Tank
    expect(
      meta?.grantedKeywords?.some((gk) => gk.keyword === "Assault" && gk.duration === "turn"),
    ).toBe(true);
    expect(
      meta?.grantedKeywords?.some((gk) => gk.keyword === "Tank" && gk.duration === "static"),
    ).toBe(true);
  });
});

describe("Static Abilities: Condition Evaluation", () => {
  let registry: CardDefinitionRegistry;

  beforeEach(() => {
    registry = new CardDefinitionRegistry();
    setGlobalCardRegistry(registry);
  });

  afterEach(() => {
    clearGlobalCardRegistry();
  });

  test("while-buffed condition", () => {
    registry.register("unit-1", {
      abilities: [
        {
          condition: { type: "while-buffed" },
          effect: { amount: 2, type: "modify-might" },
          type: "static",
        },
      ],
      cardType: "unit",
      id: "unit-1",
      might: 3,
      name: "Buffed Warrior",
    });

    const draft = createMockState();

    // Not buffed
    const ctx1 = createMockStaticContext(draft, {
      "unit-1": { meta: { buffed: false, damage: 0 }, owner: "p1", zone: "base" },
    });
    recalculateStaticEffects(ctx1);
    expect(ctx1.cardStore.get("unit-1")?.meta.staticMightBonus ?? 0).toBe(0);

    // Buffed
    const ctx2 = createMockStaticContext(draft, {
      "unit-1": { meta: { buffed: true, damage: 0 }, owner: "p1", zone: "base" },
    });
    recalculateStaticEffects(ctx2);
    expect(ctx2.cardStore.get("unit-1")?.meta.staticMightBonus).toBe(2);
  });

  test("while-alone condition", () => {
    registry.register("unit-1", {
      abilities: [
        {
          condition: { type: "while-alone" },
          effect: { amount: 3, type: "modify-might" },
          type: "static",
        },
      ],
      cardType: "unit",
      id: "unit-1",
      might: 3,
      name: "Lone Wolf",
    });
    registry.register("unit-2", { cardType: "unit", id: "unit-2", might: 2, name: "Buddy" });

    const draft = createMockState();

    // Alone at battlefield
    const ctx1 = createMockStaticContext(draft, {
      "unit-1": { meta: { damage: 0 }, owner: "p1", zone: "battlefield-bf-1" },
    });
    recalculateStaticEffects(ctx1);
    expect(ctx1.cardStore.get("unit-1")?.meta.staticMightBonus).toBe(3);

    // Not alone (friendly unit present)
    const ctx2 = createMockStaticContext(draft, {
      "unit-1": { meta: { damage: 0 }, owner: "p1", zone: "battlefield-bf-1" },
      "unit-2": { meta: { damage: 0 }, owner: "p1", zone: "battlefield-bf-1" },
    });
    recalculateStaticEffects(ctx2);
    expect(ctx2.cardStore.get("unit-1")?.meta.staticMightBonus ?? 0).toBe(0);
  });

  test("AND condition (both must be true)", () => {
    registry.register("unit-1", {
      abilities: [
        {
          condition: {
            conditions: [{ type: "while-at-battlefield" }, { type: "while-buffed" }],
            type: "and",
          },
          effect: { amount: 3, type: "modify-might" },
          type: "static",
        },
      ],
      cardType: "unit",
      id: "unit-1",
      might: 3,
      name: "Complex Warrior",
    });

    const draft = createMockState();

    // At battlefield but not buffed
    const ctx1 = createMockStaticContext(draft, {
      "unit-1": { meta: { buffed: false, damage: 0 }, owner: "p1", zone: "battlefield-bf-1" },
    });
    recalculateStaticEffects(ctx1);
    expect(ctx1.cardStore.get("unit-1")?.meta.staticMightBonus ?? 0).toBe(0);

    // At battlefield AND buffed
    const ctx2 = createMockStaticContext(draft, {
      "unit-1": { meta: { buffed: true, damage: 0 }, owner: "p1", zone: "battlefield-bf-1" },
    });
    recalculateStaticEffects(ctx2);
    expect(ctx2.cardStore.get("unit-1")?.meta.staticMightBonus).toBe(3);
  });
});
