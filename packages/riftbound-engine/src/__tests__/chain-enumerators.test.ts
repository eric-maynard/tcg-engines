/**
 * Chain & Showdown Move Enumerator Tests
 *
 * Validates that chain/showdown moves correctly enumerate available parameters
 * so they appear in availableMoves when conditions are met.
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
import { createInteractionState, getActiveShowdown, startShowdown } from "../chain";
import type { TurnInteractionState } from "../chain";
import { chainMoves } from "../game-definition/moves/chain-moves";
import type { RiftboundGameState } from "../types";

const P1 = "p1";
const P2 = "p2";

function createMockState(overrides?: Partial<RiftboundGameState>): RiftboundGameState {
  return {
    battlefields: {
      "bf-1": { contested: false, controller: "p1", id: "bf-1" },
      "bf-2": { contested: false, controller: "p2", id: "bf-2" },
    },
    conqueredThisTurn: { p1: [], p2: [] },
    gameId: "test",
    players: {
      p1: { id: "p1", victoryPoints: 0, xp: 0 },
      p2: { id: "p2", victoryPoints: 0, xp: 0 },
    },
    runePools: { p1: { energy: 5, power: { fury: 2 } }, p2: { energy: 3, power: {} } },
    scoredThisTurn: { p1: [], p2: [] },
    status: "playing",
    turn: { activePlayer: "p1", number: 1, phase: "main" },
    victoryScore: 8,
    ...overrides,
  };
}

function createMockEnumContext(playerId: string, zoneCards: Record<string, string[]> = {}) {
  return {
    cards: {
      getCardMeta: () => undefined,
      getCardOwner: (cardId: CoreCardId) => {
        // All mock cards owned by the requesting player
        for (const cards of Object.values(zoneCards)) {
          if (cards.includes(cardId as string)) {
            return playerId;
          }
        }
        return undefined;
      },
      updateCardMeta: () => {},
    },
    counters: {
      addCounter: () => {},
      clearCounter: () => {},
      removeCounter: () => {},
      setFlag: () => {},
    },
    game: { getState: () => ({}) },
    playerId: playerId as CorePlayerId,
    rng: { next: () => 0 },
    zones: {
      getCardZone: (cardId: CoreCardId) => {
        for (const [zone, cards] of Object.entries(zoneCards)) {
          if (cards.includes(cardId as string)) {
            return zone as CoreZoneId;
          }
        }
        return undefined;
      },
      getCardsInZone: (zoneId: CoreZoneId, _pid?: CorePlayerId) =>
        (zoneCards[zoneId as string] ?? []) as CoreCardId[],
    },
  };
}

// ============================================
// PassChainPriority
// ============================================

describe("passChainPriority enumerator", () => {
  const enumerator = chainMoves.passChainPriority!.enumerator!;

  test("returns [{ playerId }] when chain is active and player has priority", () => {
    let interaction = createInteractionState();
    // Manually set up chain active state
    interaction = {
      ...interaction,
      chain: {
        active: true,
        activePlayer: P1,
        items: [{ cardId: "spell-1", controller: P1, type: "spell" }],
        passedPlayers: [],
        relevantPlayers: [P1, P2],
      },
    };
    const state = createMockState({ interaction });
    const context = createMockEnumContext(P1);

    const result = enumerator(state, context as never);
    expect(result).toEqual([{ playerId: P1 }]);
  });

  test("returns [] when chain is not active", () => {
    const state = createMockState();
    const context = createMockEnumContext(P1);

    const result = enumerator(state, context as never);
    expect(result).toEqual([]);
  });

  test("returns [] when another player has priority", () => {
    let interaction = createInteractionState();
    interaction = {
      ...interaction,
      chain: {
        active: true,
        activePlayer: P2,
        items: [{ cardId: "spell-1", controller: P1, type: "spell" }],
        passedPlayers: [],
        relevantPlayers: [P1, P2],
      },
    };
    const state = createMockState({ interaction });
    const context = createMockEnumContext(P1);

    const result = enumerator(state, context as never);
    expect(result).toEqual([]);
  });
});

// ============================================
// ResolveChain
// ============================================

describe("resolveChain enumerator", () => {
  const enumerator = chainMoves.resolveChain!.enumerator!;

  test("returns [{}] when chain is active and all players passed", () => {
    let interaction = createInteractionState();
    interaction = {
      ...interaction,
      chain: {
        active: true,
        activePlayer: P1,
        items: [{ cardId: "spell-1", controller: P1, type: "spell" }],
        passedPlayers: [P1, P2],
        relevantPlayers: [P1, P2],
      },
    };
    const state = createMockState({ interaction });
    const context = createMockEnumContext(P1);

    const result = enumerator(state, context as never);
    expect(result).toEqual([{}]);
  });

  test("returns [] when not all players have passed", () => {
    let interaction = createInteractionState();
    interaction = {
      ...interaction,
      chain: {
        active: true,
        activePlayer: P1,
        items: [{ cardId: "spell-1", controller: P1, type: "spell" }],
        passedPlayers: [P1],
        relevantPlayers: [P1, P2],
      },
    };
    const state = createMockState({ interaction });
    const context = createMockEnumContext(P1);

    const result = enumerator(state, context as never);
    expect(result).toEqual([]);
  });

  test("returns [] when chain is not active", () => {
    const state = createMockState();
    const context = createMockEnumContext(P1);

    const result = enumerator(state, context as never);
    expect(result).toEqual([]);
  });
});

// ============================================
// PassShowdownFocus
// ============================================

describe("passShowdownFocus enumerator", () => {
  const enumerator = chainMoves.passShowdownFocus!.enumerator!;

  test("returns [{ playerId }] when player has focus", () => {
    let interaction = createInteractionState();
    interaction = startShowdown(interaction, "bf-1", P1, [P1, P2], false, P1, P2);
    const state = createMockState({ interaction });
    const context = createMockEnumContext(P1);

    const result = enumerator(state, context as never);
    expect(result).toEqual([{ playerId: P1 }]);
  });

  test("returns [] when different player has focus", () => {
    let interaction = createInteractionState();
    interaction = startShowdown(interaction, "bf-1", P1, [P1, P2], false, P1, P2);
    const state = createMockState({ interaction });
    const context = createMockEnumContext(P2);

    const result = enumerator(state, context as never);
    expect(result).toEqual([]);
  });

  test("returns [] when no showdown is active", () => {
    const state = createMockState();
    const context = createMockEnumContext(P1);

    const result = enumerator(state, context as never);
    expect(result).toEqual([]);
  });
});

// ============================================
// StartShowdown
// ============================================

describe("startShowdown enumerator", () => {
  const enumerator = chainMoves.startShowdown!.enumerator!;

  test("enumerates only contested battlefields (Rule 548)", () => {
    const state = createMockState({
      battlefields: {
        "bf-1": { contested: true, controller: "p1", id: "bf-1" },
        "bf-2": { contested: false, controller: "p2", id: "bf-2" },
      },
    });
    const context = createMockEnumContext(P1);

    const result = enumerator(state, context as never);
    expect(result).toHaveLength(1);
    expect(result).toContainEqual({ battlefieldId: "bf-1", playerId: P1 });
  });

  test("returns [] when no battlefields are contested", () => {
    const state = createMockState();
    const context = createMockEnumContext(P1);

    const result = enumerator(state, context as never);
    expect(result).toEqual([]);
  });

  test("returns [] when game is not playing", () => {
    const state = createMockState({ status: "finished" as RiftboundGameState["status"] });
    const context = createMockEnumContext(P1);

    const result = enumerator(state, context as never);
    expect(result).toEqual([]);
  });
});

// ============================================
// EndShowdown
// ============================================

describe("endShowdown enumerator", () => {
  const enumerator = chainMoves.endShowdown!.enumerator!;

  test("returns [{}] when showdown has ended", () => {
    // Start a showdown then mark it as ended
    let interaction = createInteractionState();
    interaction = startShowdown(interaction, "bf-1", P1, [P1, P2], false, P1, P2);
    // Manually mark the active showdown as inactive (ended)
    const showdown = getActiveShowdown(interaction);
    if (showdown) {
      showdown.active = false;
    }
    const state = createMockState({ interaction });
    const context = createMockEnumContext(P1);

    const result = enumerator(state, context as never);
    expect(result).toEqual([{}]);
  });

  test("returns [] when showdown is still active", () => {
    let interaction = createInteractionState();
    interaction = startShowdown(interaction, "bf-1", P1, [P1, P2], false, P1, P2);
    const state = createMockState({ interaction });
    const context = createMockEnumContext(P1);

    const result = enumerator(state, context as never);
    expect(result).toEqual([]);
  });

  test("returns [] when no showdown exists", () => {
    const state = createMockState();
    const context = createMockEnumContext(P1);

    const result = enumerator(state, context as never);
    expect(result).toEqual([]);
  });
});

// ============================================
// ActivateAbility
// ============================================

describe("activateAbility enumerator", () => {
  let registry: CardDefinitionRegistry;
  const enumerator = chainMoves.activateAbility!.enumerator!;

  beforeEach(() => {
    registry = new CardDefinitionRegistry();
    setGlobalCardRegistry(registry);
  });

  afterEach(() => {
    clearGlobalCardRegistry();
  });

  test("enumerates activated abilities on base cards", () => {
    registry.register("card-1", {
      abilities: [{ effect: { amount: 1, type: "draw" }, type: "activated" }],
    });

    const state = createMockState();
    const context = createMockEnumContext(P1, { base: ["card-1"] });

    const result = enumerator(state, context as never);
    expect(result).toEqual([{ abilityIndex: 0, cardId: "card-1", playerId: P1 }]);
  });

  test("enumerates activated abilities on battlefield cards", () => {
    registry.register("card-2", {
      abilities: [{ effect: { amount: 2, type: "damage" }, type: "activated" }],
    });

    const state = createMockState();
    const context = createMockEnumContext(P1, { "battlefield-bf-1": ["card-2"] });

    const result = enumerator(state, context as never);
    expect(result).toEqual([{ abilityIndex: 0, cardId: "card-2", playerId: P1 }]);
  });

  test("skips non-activated abilities", () => {
    registry.register("card-3", {
      abilities: [
        { effect: { amount: 1, type: "draw" }, trigger: { type: "onPlay" }, type: "triggered" },
        { effect: { amount: 1, type: "draw" }, type: "activated" },
        { effect: { amount: 1, type: "modify-might" }, type: "static" },
      ],
    });

    const state = createMockState();
    const context = createMockEnumContext(P1, { base: ["card-3"] });

    const result = enumerator(state, context as never);
    expect(result).toEqual([{ abilityIndex: 1, cardId: "card-3", playerId: P1 }]);
  });

  test("skips abilities player cannot afford", () => {
    registry.register("card-expensive", {
      abilities: [{ cost: { energy: 99 }, effect: { amount: 5, type: "draw" }, type: "activated" }],
    });

    const state = createMockState();
    const context = createMockEnumContext(P1, { base: ["card-expensive"] });

    const result = enumerator(state, context as never);
    expect(result).toEqual([]);
  });

  test("returns [] when game is not playing", () => {
    const state = createMockState({ status: "finished" as RiftboundGameState["status"] });
    const context = createMockEnumContext(P1, { base: ["card-1"] });

    const result = enumerator(state, context as never);
    expect(result).toEqual([]);
  });

  test("returns [] when no cards have activated abilities", () => {
    registry.register("card-passive", {
      abilities: [{ effect: { amount: 1, type: "modify-might" }, type: "static" }],
    });

    const state = createMockState();
    const context = createMockEnumContext(P1, { base: ["card-passive"] });

    const result = enumerator(state, context as never);
    expect(result).toEqual([]);
  });

  test("enumerates activated abilities on legend zone cards", () => {
    registry.register("legend-1", {
      abilities: [
        { cost: { exhaust: true }, effect: { energy: 1, type: "add-resource" }, type: "activated" },
      ],
      cardType: "legend",
      id: "legend-1",
      name: "Test Legend",
    });

    const state = createMockState();
    const context = createMockEnumContext(P1, { legendZone: ["legend-1"] });

    const result = enumerator(state, context as never);
    expect(result).toEqual([{ abilityIndex: 0, cardId: "legend-1", playerId: P1 }]);
  });

  test("enumerates Reaction-timed activated abilities on legend zone during neutral-open", () => {
    // Daughter of the Void style: [Exhaust]: [Reaction] — [Add] [rainbow]
    registry.register("legend-reaction", {
      abilities: [
        {
          cost: { exhaust: true },
          effect: { rainbow: 1, type: "add-resource" },
          keyword: "Reaction",
          type: "activated",
        },
      ],
      cardType: "legend",
      id: "legend-reaction",
      name: "Daughter of the Void",
    });

    const state = createMockState(); // Neutral-open state
    const context = createMockEnumContext(P1, { legendZone: ["legend-reaction"] });

    const result = enumerator(state, context as never);
    // Reaction abilities are always legal (any timing)
    expect(result).toEqual([{ abilityIndex: 0, cardId: "legend-reaction", playerId: P1 }]);
  });

  test("enumerates activated abilities on champion zone cards", () => {
    registry.register("champion-1", {
      abilities: [{ effect: { amount: 1, type: "draw" }, type: "activated" }],
      cardType: "unit",
      id: "champion-1",
      name: "Test Champion",
    });

    const state = createMockState();
    const context = createMockEnumContext(P1, { championZone: ["champion-1"] });

    const result = enumerator(state, context as never);
    expect(result).toEqual([{ abilityIndex: 0, cardId: "champion-1", playerId: P1 }]);
  });

  test("enumerates activated ability with timing:'reaction' during neutral-closed", () => {
    // Tests the timing field (not keyword) on activated abilities
    registry.register("legend-timing", {
      abilities: [
        {
          cost: { exhaust: true },
          effect: { rainbow: 1, type: "add-resource" },
          timing: "reaction",
          type: "activated",
        },
      ],
      cardType: "legend",
      id: "legend-timing",
      name: "Legend With Timing Field",
    });

    // Create a state with an active chain (neutral-closed)
    let interaction = createInteractionState();
    interaction = {
      ...interaction,
      chain: {
        active: true,
        activePlayer: P1,
        items: [{ cardId: "spell-1", controller: P2, id: "chain-1", type: "spell" }],
        passedPlayers: [],
        relevantPlayers: [P1, P2],
        turnOrder: [P1, P2],
      },
    };
    const state = createMockState({ interaction });
    const context = createMockEnumContext(P1, { legendZone: ["legend-timing"] });

    const result = enumerator(state, context as never);
    // Reaction-timed abilities should be available during closed state
    expect(result).toEqual([{ abilityIndex: 0, cardId: "legend-timing", playerId: P1 }]);
  });

  test("skips action-timed ability during neutral-closed", () => {
    // An action ability should NOT be available when chain is active
    registry.register("legend-action", {
      abilities: [
        {
          cost: { exhaust: true },
          effect: { amount: 1, type: "draw" },
          type: "activated",
          // No timing or keyword — defaults to "action"
        },
      ],
      cardType: "legend",
      id: "legend-action",
      name: "Legend With Action Ability",
    });

    let interaction = createInteractionState();
    interaction = {
      ...interaction,
      chain: {
        active: true,
        activePlayer: P1,
        items: [{ cardId: "spell-1", controller: P2, id: "chain-1", type: "spell" }],
        passedPlayers: [],
        relevantPlayers: [P1, P2],
        turnOrder: [P1, P2],
      },
    };
    const state = createMockState({ interaction });
    const context = createMockEnumContext(P1, { legendZone: ["legend-action"] });

    const result = enumerator(state, context as never);
    // Action abilities are NOT available during closed state
    expect(result).toEqual([]);
  });

  test("condition returns true for legend zone activated abilities", () => {
    const condition = chainMoves.activateAbility!.condition!;
    registry.register("legend-cond", {
      abilities: [
        { cost: { exhaust: true }, effect: { energy: 1, type: "add-resource" }, type: "activated" },
      ],
      cardType: "legend",
      id: "legend-cond",
      name: "Test Legend",
    });

    const state = createMockState();
    const context = {
      cards: {
        getCardMeta: () => undefined,
        getCardOwner: () => P1,
        updateCardMeta: () => {},
      },
      counters: {
        addCounter: () => {},
        clearCounter: () => {},
        removeCounter: () => {},
        setFlag: () => {},
      },
      params: { abilityIndex: 0, cardId: "legend-cond", playerId: P1 },
      zones: {
        getCardZone: () => "legendZone" as CoreZoneId,
        getCardsInZone: () => ["legend-cond"] as CoreCardId[],
      },
    };

    expect(condition(state, context as never)).toBe(true);
  });
});
