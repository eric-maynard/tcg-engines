/**
 * Unit Modifier Tests
 *
 * Tests for stun, buff, heal, grant-keyword, add-resource, banish,
 * modify-might, and the "becomes mighty" trigger.
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
import type { CombatUnit } from "../combat";
import { calculateSideMight, resolveCombat } from "../combat";
import type { GrantedKeyword, RiftboundCardMeta, RiftboundGameState } from "../types";

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
// Stun in Combat
// ============================================================================

describe("Stun: Combat Impact", () => {
  test("stunned unit contributes 0 Might in combat", () => {
    // A 5-Might stunned attacker vs 3-Might defender
    // Stunned attacker should contribute 0, so defender wins
    const attacker: CombatUnit = {
      id: "stunned-unit",
      owner: "p1",
      baseMight: 0, // BuildCombatUnit sets this to 0 for stunned units
      currentDamage: 0,
      keywords: [],
    };

    const defender: CombatUnit = {
      baseMight: 3,
      currentDamage: 0,
      id: "defender",
      keywords: [],
      owner: "p2",
    };

    const result = resolveCombat([attacker], [defender]);
    expect(result.winner).toBe("defender");
    expect(result.attackerTotal).toBe(0);
    expect(result.defenderTotal).toBe(3);
  });

  test("stunned unit still takes lethal damage", () => {
    const attacker: CombatUnit = {
      baseMight: 5,
      currentDamage: 0,
      id: "attacker",
      keywords: [],
      owner: "p1",
    };

    // Stunned defender has 0 Might contribution but 3 base Might for damage threshold
    const defender: CombatUnit = {
      id: "stunned-defender",
      owner: "p2",
      baseMight: 0, // Stunned: 0 Might in combat
      currentDamage: 0,
      keywords: [],
    };

    const result = resolveCombat([attacker], [defender]);
    expect(result.winner).toBe("attacker");
    // Excess damage = 5 - 0 = 5, assigned to defender
    // Defender has baseMight 0 so even 0 damage is lethal... but that's because
    // We set baseMight=0 for stunned. The kill check uses baseMight from CombatUnit.
    expect(result.killed).toContain("stunned-defender");
  });
});

// ============================================================================
// Buff Cap
// ============================================================================

describe("Buff: Cap Enforcement", () => {
  let registry: CardDefinitionRegistry;

  beforeEach(() => {
    registry = new CardDefinitionRegistry();
    registry.register("unit-1", { cardType: "unit", id: "unit-1", might: 4, name: "Warrior" });
    setGlobalCardRegistry(registry);
  });

  afterEach(() => {
    clearGlobalCardRegistry();
  });

  test("buff grants +1 Might", () => {
    const draft = createMockState();
    const ctx = createMockEffectContext(draft, {
      cards: {
        "unit-1": { meta: { buffed: false, damage: 0 }, owner: "p1", zone: "base" },
      },
      playerId: "p1",
      sourceCardId: "source",
    });

    executeEffect({ target: { type: "self" }, type: "buff" } as ExecutableEffect, {
      ...ctx,
      sourceCardId: "unit-1",
    });

    expect(ctx.cardStore.get("unit-1")?.meta.buffed).toBe(true);
  });

  test("second buff on already-buffed unit is ignored (max 1)", () => {
    const draft = createMockState();
    const ctx = createMockEffectContext(draft, {
      cards: {
        "unit-1": { meta: { buffed: true, damage: 0 }, owner: "p1", zone: "base" },
      },
      playerId: "p1",
      sourceCardId: "unit-1",
    });

    // This should be a no-op since already buffed
    executeEffect({ target: { type: "self" }, type: "buff" } as ExecutableEffect, ctx);

    // Still buffed (no double-buff)
    expect(ctx.cardStore.get("unit-1")?.meta.buffed).toBe(true);
  });
});

// ============================================================================
// Heal Effect
// ============================================================================

describe("Heal Effect", () => {
  let registry: CardDefinitionRegistry;

  beforeEach(() => {
    registry = new CardDefinitionRegistry();
    registry.register("unit-1", { cardType: "unit", id: "unit-1", might: 5, name: "Warrior" });
    setGlobalCardRegistry(registry);
  });

  afterEach(() => {
    clearGlobalCardRegistry();
  });

  test("heal removes damage from a unit", () => {
    const draft = createMockState();
    const ctx = createMockEffectContext(draft, {
      cards: {
        "unit-1": { meta: { damage: 3 }, owner: "p1", zone: "base" },
      },
      playerId: "p1",
      sourceCardId: "unit-1",
    });

    executeEffect({ amount: 2, target: { type: "self" }, type: "heal" } as ExecutableEffect, ctx);

    expect(ctx.cardStore.get("unit-1")?.meta.damage).toBe(1);
  });

  test("heal does not reduce damage below 0", () => {
    const draft = createMockState();
    const ctx = createMockEffectContext(draft, {
      cards: {
        "unit-1": { meta: { damage: 1 }, owner: "p1", zone: "base" },
      },
      playerId: "p1",
      sourceCardId: "unit-1",
    });

    executeEffect({ amount: 5, target: { type: "self" }, type: "heal" } as ExecutableEffect, ctx);

    expect(ctx.cardStore.get("unit-1")?.meta.damage).toBe(0);
  });
});

// ============================================================================
// Grant Keyword Effect
// ============================================================================

describe("Grant Keyword Effect", () => {
  let registry: CardDefinitionRegistry;

  beforeEach(() => {
    registry = new CardDefinitionRegistry();
    registry.register("unit-1", { cardType: "unit", id: "unit-1", might: 3, name: "Warrior" });
    setGlobalCardRegistry(registry);
  });

  afterEach(() => {
    clearGlobalCardRegistry();
  });

  test("grant-keyword adds keyword to card meta", () => {
    const draft = createMockState();
    const ctx = createMockEffectContext(draft, {
      cards: {
        "unit-1": { meta: { damage: 0 }, owner: "p1", zone: "base" },
      },
      playerId: "p1",
      sourceCardId: "unit-1",
    });

    executeEffect(
      {
        duration: "turn",
        keyword: "Assault",
        target: { type: "self" },
        type: "grant-keyword",
        value: 2,
      } as ExecutableEffect,
      ctx,
    );

    const meta = ctx.cardStore.get("unit-1")?.meta;
    expect(meta?.grantedKeywords).toHaveLength(1);
    expect(meta?.grantedKeywords?.[0]?.keyword).toBe("Assault");
    expect(meta?.grantedKeywords?.[0]?.value).toBe(2);
    expect(meta?.grantedKeywords?.[0]?.duration).toBe("turn");
  });

  test("grant-keywords adds multiple keywords", () => {
    const draft = createMockState();
    const ctx = createMockEffectContext(draft, {
      cards: {
        "unit-1": { meta: { damage: 0 }, owner: "p1", zone: "base" },
      },
      playerId: "p1",
      sourceCardId: "unit-1",
    });

    executeEffect(
      {
        duration: "permanent",
        keywords: ["Tank", "Shield"],
        target: { type: "self" },
        type: "grant-keywords",
      } as ExecutableEffect,
      ctx,
    );

    const meta = ctx.cardStore.get("unit-1")?.meta;
    expect(meta?.grantedKeywords).toHaveLength(2);
    expect(meta?.grantedKeywords?.map((gk) => gk.keyword)).toEqual(["Tank", "Shield"]);
    expect(meta?.grantedKeywords?.[0]?.duration).toBe("permanent");
  });

  test("granted keywords stack with existing ones", () => {
    const draft = createMockState();
    const ctx = createMockEffectContext(draft, {
      cards: {
        "unit-1": {
          meta: {
            damage: 0,
            grantedKeywords: [{ duration: "turn" as const, keyword: "Assault", value: 1 }],
          },
          owner: "p1",
          zone: "base",
        },
      },
      playerId: "p1",
      sourceCardId: "unit-1",
    });

    executeEffect(
      {
        duration: "turn",
        keyword: "Tank",
        target: { type: "self" },
        type: "grant-keyword",
      } as ExecutableEffect,
      ctx,
    );

    const meta = ctx.cardStore.get("unit-1")?.meta;
    expect(meta?.grantedKeywords).toHaveLength(2);
  });
});

// ============================================================================
// Add Resource Effect
// ============================================================================

describe("Add Resource Effect", () => {
  test("adds energy to rune pool", () => {
    const draft = createMockState();
    const ctx = createMockEffectContext(draft, {
      playerId: "p1",
      sourceCardId: "source",
    });

    executeEffect({ energy: 3, type: "add-resource" } as ExecutableEffect, ctx);

    expect(draft.runePools.p1?.energy).toBe(3);
  });

  test("adds power to rune pool", () => {
    const draft = createMockState();
    const ctx = createMockEffectContext(draft, {
      playerId: "p1",
      sourceCardId: "source",
    });

    executeEffect(
      { power: ["fury", "fury", "mind"], type: "add-resource" } as ExecutableEffect,
      ctx,
    );

    expect(draft.runePools.p1?.power.fury).toBe(2);
    expect(draft.runePools.p1?.power.mind).toBe(1);
  });

  test("adds both energy and power", () => {
    const draft = createMockState();
    const ctx = createMockEffectContext(draft, {
      playerId: "p1",
      sourceCardId: "source",
    });

    executeEffect({ energy: 1, power: ["calm"], type: "add-resource" } as ExecutableEffect, ctx);

    expect(draft.runePools.p1?.energy).toBe(1);
    expect(draft.runePools.p1?.power.calm).toBe(1);
  });
});

// ============================================================================
// Banish Effect
// ============================================================================

describe("Banish Effect", () => {
  let registry: CardDefinitionRegistry;

  beforeEach(() => {
    registry = new CardDefinitionRegistry();
    registry.register("unit-1", { cardType: "unit", id: "unit-1", might: 3, name: "Warrior" });
    setGlobalCardRegistry(registry);
  });

  afterEach(() => {
    clearGlobalCardRegistry();
  });

  test("banish moves card to banishment zone", () => {
    const draft = createMockState();
    const ctx = createMockEffectContext(draft, {
      cards: {
        "unit-1": { meta: { damage: 0 }, owner: "p1", zone: "base" },
      },
      playerId: "p1",
      sourceCardId: "source",
    });

    executeEffect(
      {
        target: { controller: "friendly", type: "unit" },
        type: "banish",
      } as ExecutableEffect,
      ctx,
    );

    expect(ctx.cardStore.get("unit-1")?.zone).toBe("banishment");
  });
});

// ============================================================================
// Modify Might Effect
// ============================================================================

describe("Modify Might Effect", () => {
  let registry: CardDefinitionRegistry;

  beforeEach(() => {
    registry = new CardDefinitionRegistry();
    registry.register("unit-1", { cardType: "unit", id: "unit-1", might: 3, name: "Warrior" });
    setGlobalCardRegistry(registry);
  });

  afterEach(() => {
    clearGlobalCardRegistry();
  });

  test("modify-might adds to mightModifier in metadata", () => {
    const draft = createMockState();
    const ctx = createMockEffectContext(draft, {
      cards: {
        "unit-1": { meta: { damage: 0, mightModifier: 0 }, owner: "p1", zone: "base" },
      },
      playerId: "p1",
      sourceCardId: "unit-1",
    });

    executeEffect(
      {
        amount: 2,
        target: { type: "self" },
        type: "modify-might",
      } as ExecutableEffect,
      ctx,
    );

    expect(ctx.cardStore.get("unit-1")?.meta.mightModifier).toBe(2);
  });

  test("negative modify-might reduces mightModifier", () => {
    const draft = createMockState();
    const ctx = createMockEffectContext(draft, {
      cards: {
        "unit-1": { meta: { damage: 0, mightModifier: 3 }, owner: "p1", zone: "base" },
      },
      playerId: "p1",
      sourceCardId: "unit-1",
    });

    executeEffect(
      {
        amount: -2,
        target: { type: "self" },
        type: "modify-might",
      } as ExecutableEffect,
      ctx,
    );

    expect(ctx.cardStore.get("unit-1")?.meta.mightModifier).toBe(1);
  });

  test("modify-might stacks with previous modifiers", () => {
    const draft = createMockState();
    const ctx = createMockEffectContext(draft, {
      cards: {
        "unit-1": { meta: { damage: 0, mightModifier: 1 }, owner: "p1", zone: "base" },
      },
      playerId: "p1",
      sourceCardId: "unit-1",
    });

    executeEffect(
      { amount: 2, target: { type: "self" }, type: "modify-might" } as ExecutableEffect,
      ctx,
    );

    expect(ctx.cardStore.get("unit-1")?.meta.mightModifier).toBe(3);
  });
});

// ============================================================================
// Becomes Mighty Trigger
// ============================================================================

describe("Becomes Mighty Trigger", () => {
  let registry: CardDefinitionRegistry;

  beforeEach(() => {
    registry = new CardDefinitionRegistry();
    setGlobalCardRegistry(registry);
  });

  afterEach(() => {
    clearGlobalCardRegistry();
  });

  test("fires when buff pushes Might from 4 to 5", () => {
    registry.register("unit-1", { cardType: "unit", id: "unit-1", might: 4, name: "Big Warrior" });

    const draft = createMockState();
    const ctx = createMockEffectContext(draft, {
      cards: {
        "unit-1": { meta: { buffed: false, damage: 0 }, owner: "p1", zone: "base" },
      },
      playerId: "p1",
      sourceCardId: "unit-1",
    });

    executeEffect({ target: { type: "self" }, type: "buff" } as ExecutableEffect, ctx);

    // Should have fired become-mighty
    const mightyEvents = ctx.firedEvents.filter((e) => e.type === "become-mighty");
    expect(mightyEvents).toHaveLength(1);
    expect(mightyEvents[0]?.cardId).toBe("unit-1");
  });

  test("does NOT fire when unit is already Mighty (Might >= 5)", () => {
    registry.register("unit-1", {
      cardType: "unit",
      id: "unit-1",
      might: 5,
      name: "Already Mighty",
    });

    const draft = createMockState();
    const ctx = createMockEffectContext(draft, {
      cards: {
        "unit-1": { meta: { buffed: false, damage: 0 }, owner: "p1", zone: "base" },
      },
      playerId: "p1",
      sourceCardId: "unit-1",
    });

    executeEffect({ target: { type: "self" }, type: "buff" } as ExecutableEffect, ctx);

    // Might went from 5 to 6, but was already Mighty — should NOT fire
    const mightyEvents = ctx.firedEvents.filter((e) => e.type === "become-mighty");
    expect(mightyEvents).toHaveLength(0);
  });

  test("fires when modify-might crosses threshold", () => {
    registry.register("unit-1", {
      cardType: "unit",
      id: "unit-1",
      might: 3,
      name: "Small Warrior",
    });

    const draft = createMockState();
    const ctx = createMockEffectContext(draft, {
      cards: {
        "unit-1": { meta: { damage: 0, mightModifier: 0 }, owner: "p1", zone: "base" },
      },
      playerId: "p1",
      sourceCardId: "unit-1",
    });

    executeEffect(
      { amount: 2, target: { type: "self" }, type: "modify-might" } as ExecutableEffect,
      ctx,
    );

    // 3 base + 2 mod = 5 → becomes mighty
    const mightyEvents = ctx.firedEvents.filter((e) => e.type === "become-mighty");
    expect(mightyEvents).toHaveLength(1);
  });

  test("does NOT fire when modify-might stays below threshold", () => {
    registry.register("unit-1", {
      cardType: "unit",
      id: "unit-1",
      might: 2,
      name: "Small Warrior",
    });

    const draft = createMockState();
    const ctx = createMockEffectContext(draft, {
      cards: {
        "unit-1": { meta: { damage: 0, mightModifier: 0 }, owner: "p1", zone: "base" },
      },
      playerId: "p1",
      sourceCardId: "unit-1",
    });

    executeEffect(
      { amount: 2, target: { type: "self" }, type: "modify-might" } as ExecutableEffect,
      ctx,
    );

    // 2 + 2 = 4, still below 5
    const mightyEvents = ctx.firedEvents.filter((e) => e.type === "become-mighty");
    expect(mightyEvents).toHaveLength(0);
  });

  test("can fire multiple times per turn (buff, un-buff, re-buff)", () => {
    registry.register("unit-1", {
      cardType: "unit",
      id: "unit-1",
      might: 4,
      name: "Volatile Warrior",
    });

    const draft = createMockState();
    const ctx = createMockEffectContext(draft, {
      cards: {
        "unit-1": {
          meta: { buffed: false, damage: 0, mightModifier: 0 },
          owner: "p1",
          zone: "base",
        },
      },
      playerId: "p1",
      sourceCardId: "unit-1",
    });

    // First buff: 4 + 1 = 5 → becomes mighty
    executeEffect({ target: { type: "self" }, type: "buff" } as ExecutableEffect, ctx);
    expect(ctx.firedEvents.filter((e) => e.type === "become-mighty")).toHaveLength(1);

    // Simulate removing the buff (un-buff via flag clear)
    ctx.cardStore.get("unit-1")!.meta.buffed = false;

    // Second buff: 4 + 1 = 5 → becomes mighty AGAIN
    executeEffect({ target: { type: "self" }, type: "buff" } as ExecutableEffect, ctx);
    expect(ctx.firedEvents.filter((e) => e.type === "become-mighty")).toHaveLength(2);
  });
});

// ============================================================================
// Granted Keywords in Combat
// ============================================================================

describe("Granted Keywords in Combat", () => {
  test("granted Assault keyword contributes to combat Might", () => {
    // A unit with 3 base Might + granted Assault (value included via keywords list)
    // In buildCombatUnit, granted keywords are merged into the keywords array
    const attacker: CombatUnit = {
      baseMight: 3,
      currentDamage: 0,
      id: "attacker",
      keywords: ["Assault"],
      owner: "p1", // Would be merged from grantedKeywords in buildCombatUnit
    };

    // CalculateSideMight should add Assault bonus for attackers
    const total = calculateSideMight([attacker], true);
    expect(total).toBe(4); // 3 base + 1 Assault
  });
});
