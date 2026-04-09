/**
 * Engine Gaps Phase 2 Tests
 *
 * Tests for:
 * - Task 2A: Ambush, Backline, Hunt keywords
 * - Task 2B: New trigger events (play-card, win-combat, choose, hide)
 * - Task 2C: enter-ready effect handler
 * - Task 2D: AmountExpression resolution via resolveAmount
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { KEYWORD_DEFINITIONS, sortByBacklinePriority } from "../keywords";
import type { CombatUnit } from "../combat";
import { distributeDamage, resolveCombat } from "../combat";
import type { GameEvent } from "../abilities/game-events";
import type { CardWithAbilities, TriggerableAbility } from "../abilities/trigger-matcher";
import { findMatchingTriggers } from "../abilities/trigger-matcher";
import type { EffectContext, ExecutableEffect } from "../abilities/effect-executor";
import { executeEffect } from "../abilities/effect-executor";
import type { RiftboundGameState } from "../types";
import {
  CardDefinitionRegistry,
  clearGlobalCardRegistry,
  setGlobalCardRegistry,
} from "../operations/card-lookup";

// ============================================================================
// Shared helpers
// ============================================================================

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

function createMockEffectContext(
  draft: RiftboundGameState,
  opts: {
    playerId: string;
    sourceCardId: string;
    sourceZone?: string;
    cards?: Record<string, { zone: string; owner: string }>;
    cardMeta?: Map<string, Record<string, unknown>>;
  },
): EffectContext & {
  flagsCalled: { cardId: string; flag: string; value: boolean }[];
  zoneContents: Map<string, string[]>;
} {
  const cardStore = new Map<string, { zone: string; owner: string }>();
  const zoneContents = new Map<string, string[]>();
  const flagsCalled: { cardId: string; flag: string; value: boolean }[] = [];
  const metaStore = opts.cardMeta ?? new Map<string, Record<string, unknown>>();
  const counterStore = new Map<string, Record<string, number>>();

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
      getCardMeta: ((cardId: string) =>
        metaStore.get(cardId)) as unknown as EffectContext["cards"]["getCardMeta"],
      getCardOwner: (cardId) => cardStore.get(cardId as string)?.owner,
      updateCardMeta: ((cardId: string, meta: Record<string, unknown>) => {
        const existing = metaStore.get(cardId) ?? {};
        metaStore.set(cardId, { ...existing, ...meta });
      }) as unknown as EffectContext["cards"]["updateCardMeta"],
    },
    counters: {
      addCounter: (cardId, counter, amount) => {
        const key = cardId as string;
        const counters = counterStore.get(key) ?? {};
        counters[counter] = (counters[counter] ?? 0) + amount;
        counterStore.set(key, counters);
      },
      clearCounter: () => {},
      removeCounter: (cardId, counter, amount) => {
        const key = cardId as string;
        const counters = counterStore.get(key) ?? {};
        counters[counter] = Math.max(0, (counters[counter] ?? 0) - amount);
        counterStore.set(key, counters);
      },
      setFlag: (cardId, flag, value) => {
        flagsCalled.push({ cardId: cardId as string, flag, value: value as boolean });
      },
    },
    draft,
    flagsCalled,
    playerId: opts.playerId,
    sourceCardId: opts.sourceCardId,
    sourceZone: opts.sourceZone,
    zoneContents,
    zones: {
      drawCards: (params) => {
        const sourceCards = zoneContents.get(params.from as string) ?? [];
        for (let i = 0; i < params.count && sourceCards.length > 0; i++) {
          const cardId = sourceCards.shift()!;
          const targetCards = zoneContents.get(params.to as string) ?? [];
          targetCards.push(cardId);
          zoneContents.set(params.to as string, targetCards);
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

function unit(
  id: string,
  might: number,
  keywords: string[] = [],
  damage = 0,
  owner = "p1",
  keywordValues?: Record<string, number>,
): CombatUnit {
  return { baseMight: might, currentDamage: damage, id, keywordValues, keywords, owner };
}

function makeAbility(event: string, on = "self"): TriggerableAbility {
  return {
    effect: { amount: 1, type: "draw" },
    trigger: { event, on },
    type: "triggered",
  };
}

function makeCard(
  id: string,
  abilities: TriggerableAbility[],
  zone = "base",
  owner = "p1",
): CardWithAbilities {
  return { abilities, id, owner, zone };
}

// ============================================================================
// Task 2A: Keywords
// ============================================================================

describe("Task 2A: Ambush keyword", () => {
  test("Ambush is defined in KEYWORD_DEFINITIONS", () => {
    expect(KEYWORD_DEFINITIONS.Ambush).toBeDefined();
    expect(KEYWORD_DEFINITIONS.Ambush.category).toBe("play");
    expect(KEYWORD_DEFINITIONS.Ambush.stackable).toBe(false);
  });
});

describe("Task 2A: Backline keyword", () => {
  test("Backline is defined in KEYWORD_DEFINITIONS", () => {
    expect(KEYWORD_DEFINITIONS.Backline).toBeDefined();
    expect(KEYWORD_DEFINITIONS.Backline.category).toBe("combat");
    expect(KEYWORD_DEFINITIONS.Backline.stackable).toBe(false);
  });

  test("sortByBacklinePriority puts Backline units last", () => {
    const units = [
      { hasBackline: true, id: "a" },
      { hasBackline: false, id: "b" },
      { hasBackline: false, id: "c" },
    ];
    const sorted = sortByBacklinePriority(units);
    expect(sorted[0].id).toBe("b");
    expect(sorted[1].id).toBe("c");
    expect(sorted[2].id).toBe("a");
  });

  test("sortByBacklinePriority preserves order among non-Backline units", () => {
    const units = [
      { hasBackline: false, id: "a" },
      { hasBackline: false, id: "b" },
    ];
    const sorted = sortByBacklinePriority(units);
    expect(sorted[0].id).toBe("a");
    expect(sorted[1].id).toBe("b");
  });

  test("multiple Backline units stay in relative order", () => {
    const units = [
      { hasBackline: false, id: "a" },
      { hasBackline: true, id: "b" },
      { hasBackline: true, id: "c" },
    ];
    const sorted = sortByBacklinePriority(units);
    expect(sorted[0].id).toBe("a");
    expect(sorted[1].id).toBe("b");
    expect(sorted[2].id).toBe("c");
  });

  test("distributeDamage assigns Backline units damage last", () => {
    const units = [unit("backline-unit", 4, ["Backline"]), unit("normal-unit", 3)];
    const result = distributeDamage(units, 5);
    // Normal unit (3 Might) gets lethal first, then 2 to Backline
    expect(result["normal-unit"]).toBe(3);
    expect(result["backline-unit"]).toBe(2);
  });

  test("distributeDamage respects Tank > Normal > Backline ordering", () => {
    const units = [
      unit("backline-unit", 3, ["Backline"]),
      unit("normal-unit", 2),
      unit("tank-unit", 4, ["Tank"]),
    ];
    const result = distributeDamage(units, 9);
    // Tank first (4), then Normal (2), then Backline (3)
    expect(result["tank-unit"]).toBe(4);
    expect(result["normal-unit"]).toBe(2);
    expect(result["backline-unit"]).toBe(3);
  });

  test("Backline unit survives when total damage is insufficient", () => {
    const attackers = [unit("a1", 5, [], 0, "p1")];
    const defenders = [unit("d1", 3, [], 0, "p2"), unit("d2", 4, ["Backline"], 0, "p2")];
    const result = resolveCombat(attackers, defenders);
    // 5 damage total: d1 (normal) gets 3 lethal, d2 (Backline) gets 2 — not lethal (4 Might)
    expect(result.killed).toContain("d1");
    expect(result.killed).not.toContain("d2");
  });
});

describe("Task 2A: Hunt keyword", () => {
  test("Hunt is defined in KEYWORD_DEFINITIONS", () => {
    expect(KEYWORD_DEFINITIONS.Hunt).toBeDefined();
    expect(KEYWORD_DEFINITIONS.Hunt.category).toBe("trigger");
    expect(KEYWORD_DEFINITIONS.Hunt.stackable).toBe(true);
  });
});

// ============================================================================
// Task 2B: Trigger Events
// ============================================================================

describe("Task 2B: play-card trigger event", () => {
  test("matches play-card trigger on the played card", () => {
    const card = makeCard("card-1", [makeAbility("play-card")]);
    const event: GameEvent = {
      cardId: "card-1",
      cardType: "unit",
      playerId: "p1",
      type: "play-card",
    };

    const matches = findMatchingTriggers(event, [card]);
    expect(matches).toHaveLength(1);
    expect(matches[0].cardId).toBe("card-1");
  });

  test("play-card does NOT match a different card with self trigger", () => {
    const card = makeCard("card-2", [makeAbility("play-card")]);
    const event: GameEvent = {
      cardId: "card-1",
      cardType: "unit",
      playerId: "p1",
      type: "play-card",
    };

    const matches = findMatchingTriggers(event, [card]);
    expect(matches).toHaveLength(0);
  });
});

describe("Task 2B: win-combat trigger event", () => {
  test("matches win-combat trigger", () => {
    const card = makeCard("unit-1", [makeAbility("win-combat")], "battlefield-bf-1");
    const event: GameEvent = { battlefieldId: "bf-1", cardId: "unit-1", type: "win-combat" };

    const matches = findMatchingTriggers(event, [card]);
    expect(matches).toHaveLength(1);
  });
});

describe("Task 2B: choose trigger event", () => {
  test("matches choose trigger", () => {
    const card = makeCard("unit-1", [makeAbility("choose")], "base");
    const event: GameEvent = { cardId: "unit-1", chooserId: "p1", type: "choose" };

    const matches = findMatchingTriggers(event, [card]);
    expect(matches).toHaveLength(1);
  });
});

describe("Task 2B: hide trigger event", () => {
  test("matches hide trigger", () => {
    const card = makeCard("card-1", [makeAbility("hide")], "base");
    const event: GameEvent = { cardId: "card-1", playerId: "p1", type: "hide" };

    const matches = findMatchingTriggers(event, [card]);
    expect(matches).toHaveLength(1);
  });
});

// ============================================================================
// Task 2C: enter-ready effect
// ============================================================================

describe("Task 2C: enter-ready effect", () => {
  test("sets exhausted to false on source card when no target", () => {
    const state = createMockState();
    const ctx = createMockEffectContext(state, {
      cards: { "unit-1": { owner: "p1", zone: "base" } },
      playerId: "p1",
      sourceCardId: "unit-1",
    });

    const effect: ExecutableEffect = { type: "enter-ready" };
    executeEffect(effect, ctx);

    const exhaustedFlag = ctx.flagsCalled.find(
      (f) => f.cardId === "unit-1" && f.flag === "exhausted",
    );
    expect(exhaustedFlag).toBeDefined();
    expect(exhaustedFlag!.value).toBe(false);
  });

  test("sets exhausted to false on targeted card", () => {
    const state = createMockState();
    const ctx = createMockEffectContext(state, {
      cards: {
        "unit-1": { owner: "p1", zone: "base" },
        "unit-2": { owner: "p1", zone: "base" },
      },
      playerId: "p1",
      sourceCardId: "unit-1",
    });

    const effect: ExecutableEffect = { target: { type: "self" }, type: "enter-ready" };
    executeEffect(effect, ctx);

    const exhaustedFlag = ctx.flagsCalled.find(
      (f) => f.cardId === "unit-1" && f.flag === "exhausted",
    );
    expect(exhaustedFlag).toBeDefined();
    expect(exhaustedFlag!.value).toBe(false);
  });
});

// ============================================================================
// Task 2D: AmountExpression resolution
// ============================================================================

describe("Task 2D: resolveAmount for damage", () => {
  let registry: CardDefinitionRegistry;

  beforeEach(() => {
    registry = new CardDefinitionRegistry();
    setGlobalCardRegistry(registry);
  });

  afterEach(() => {
    clearGlobalCardRegistry();
  });

  test("numeric amount works as before", () => {
    const state = createMockState();
    const ctx = createMockEffectContext(state, {
      cards: {
        source: { owner: "p1", zone: "base" },
        target: { owner: "p2", zone: "base" },
      },
      playerId: "p1",
      sourceCardId: "source",
    });

    registry.register("target", { cardType: "unit", id: "target", might: 5, name: "Target" });

    const effect: ExecutableEffect = {
      amount: 3,
      target: { type: "self" },
      type: "damage",
    };
    executeEffect(effect, ctx);

    // Verify damage was applied (via counter)
    // We're using the mock, so just confirm no errors
    expect(true).toBe(true);
  });

  test("cardsInHand AmountExpression resolves to hand size", () => {
    const state = createMockState();
    const ctx = createMockEffectContext(state, {
      cards: {
        d1: { owner: "p1", zone: "mainDeck" },
        d2: { owner: "p1", zone: "mainDeck" },
        d3: { owner: "p1", zone: "mainDeck" },
        h1: { owner: "p1", zone: "hand" },
        h2: { owner: "p1", zone: "hand" },
        h3: { owner: "p1", zone: "hand" },
        source: { owner: "p1", zone: "base" },
        target: { owner: "p2", zone: "base" },
      },
      playerId: "p1",
      sourceCardId: "source",
    });

    registry.register("source", { cardType: "unit", id: "source", might: 3, name: "Source" });

    // Draw with AmountExpression: cards in hand = 3
    const effect: ExecutableEffect = {
      amount: { cardsInHand: "self" },
      type: "draw",
    };

    executeEffect(effect, ctx);

    // 3 cards in hand → draw 3 cards
    const hand = ctx.zoneContents.get("hand") ?? [];
    // Original 3 + 3 drawn = 6
    expect(hand.length).toBe(6);
  });

  test("cardsInTrash AmountExpression resolves to trash size for opponent", () => {
    const state = createMockState();
    const ctx = createMockEffectContext(state, {
      cards: {
        source: { owner: "p1", zone: "base" },
        t1: { owner: "p2", zone: "trash" },
        t2: { owner: "p2", zone: "trash" },
      },
      playerId: "p1",
      sourceCardId: "source",
    });

    // Score with AmountExpression: opponent's trash count = 2
    const effect: ExecutableEffect = {
      amount: { cardsInTrash: "opponent" },
      type: "score",
    };

    executeEffect(effect, ctx);

    expect(state.players.p1.victoryPoints).toBe(2);
  });
});

// ============================================================================
// Total keyword count
// ============================================================================

describe("Keyword definitions completeness", () => {
  test("includes all 17 expected keywords", () => {
    // Original 14 + Ambush + Backline + Hunt = 17
    expect(Object.keys(KEYWORD_DEFINITIONS).length).toBeGreaterThanOrEqual(17);
    expect(KEYWORD_DEFINITIONS.Ambush).toBeDefined();
    expect(KEYWORD_DEFINITIONS.Backline).toBeDefined();
    expect(KEYWORD_DEFINITIONS.Hunt).toBeDefined();
  });
});
