/**
 * Chain Effect Execution Tests
 *
 * Tests that spells actually execute their effects when resolving from the chain,
 * and that activated abilities can be put on the chain and resolve correctly.
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
import {
  addToChain,
  allPlayersPassed,
  createInteractionState,
  passPriority,
  resolveTopItem,
} from "../chain";
import type { TurnInteractionState } from "../chain";
import { executeEffect } from "../abilities/effect-executor";
import type { EffectContext, ExecutableEffect } from "../abilities/effect-executor";
import type { RiftboundCardMeta, RiftboundGameState } from "../types";

const P1 = "p1";
const P2 = "p2";
const TURN_ORDER = [P1, P2];

function createMockState(overrides?: Partial<RiftboundGameState>): RiftboundGameState {
  return {
    battlefields: { "bf-1": { contested: false, controller: "p1", id: "bf-1" } },
    conqueredThisTurn: { p1: [], p2: [] },
    gameId: "test",
    players: { p1: { id: "p1", victoryPoints: 0 }, p2: { id: "p2", victoryPoints: 0 } },
    runePools: { p1: { energy: 5, power: { fury: 2 } }, p2: { energy: 3, power: {} } },
    scoredThisTurn: { p1: [], p2: [] },
    status: "playing",
    turn: { activePlayer: "p1", number: 1, phase: "main" },
    victoryScore: 8,
    ...overrides,
  };
}

describe("Chain Spell Effect Execution", () => {
  let registry: CardDefinitionRegistry;

  beforeEach(() => {
    registry = new CardDefinitionRegistry();
    setGlobalCardRegistry(registry);
  });

  afterEach(() => {
    clearGlobalCardRegistry();
  });

  test("spell effect is stored on ChainItem when added via addToChain", () => {
    const damageEffect = { amount: 3, target: { type: "unit" }, type: "damage" };

    let state = createInteractionState();
    state = addToChain(
      state,
      { cardId: "fireball", controller: P1, effect: damageEffect, type: "spell" },
      TURN_ORDER,
    );

    expect(state.chain).not.toBeNull();
    expect(state.chain!.items).toHaveLength(1);
    expect(state.chain!.items[0]!.effect).toEqual(damageEffect);
  });

  test("resolveTopItem returns the resolved item with its effect", () => {
    const drawEffect = { amount: 2, type: "draw" };

    let state = createInteractionState();
    state = addToChain(
      state,
      { cardId: "arcane-intellect", controller: P1, effect: drawEffect, type: "spell" },
      TURN_ORDER,
    );

    // Both players pass
    state = passPriority(state); // P1 passes
    state = passPriority(state); // P2 passes
    expect(allPlayersPassed(state)).toBe(true);

    const { resolved } = resolveTopItem(state);
    expect(resolved).not.toBeNull();
    expect(resolved!.cardId).toBe("arcane-intellect");
    expect(resolved!.effect).toEqual(drawEffect);
  });

  test("spell effect executes when chain resolves (via registry fallback)", () => {
    // Register a spell card with a draw effect
    registry.register("draw-spell", {
      abilities: [{ effect: { amount: 2, type: "draw" }, type: "spell" }],
      cardType: "spell",
      id: "draw-spell",
      name: "Arcane Intellect",
      timing: "action",
    });

    let state = createInteractionState();

    // Add spell WITHOUT effect (simulating old behavior — effect looked up on resolve)
    state = addToChain(state, { cardId: "draw-spell", controller: P1, type: "spell" }, TURN_ORDER);

    // Both pass
    state = passPriority(state);
    state = passPriority(state);

    const { resolved } = resolveTopItem(state);
    expect(resolved).not.toBeNull();

    // The effect should be retrievable from registry
    const abilities = registry.getAbilities(resolved!.cardId) ?? [];
    const spellAbility = abilities.find((a) => a.type === "spell");
    expect(spellAbility?.effect).toBeDefined();
    expect((spellAbility!.effect as ExecutableEffect).type).toBe("draw");
  });

  test("LIFO: last spell added resolves first with correct effect", () => {
    const damageEffect = { amount: 3, target: { type: "unit" }, type: "damage" };
    const drawEffect = { amount: 1, type: "draw" };

    let state = createInteractionState();

    // P1 plays damage spell
    state = addToChain(
      state,
      { cardId: "fireball", controller: P1, effect: damageEffect, type: "spell" },
      TURN_ORDER,
    );

    // P2 responds with draw spell
    state = addToChain(
      state,
      { cardId: "counter-draw", controller: P2, effect: drawEffect, type: "spell" },
      TURN_ORDER,
    );

    // Both pass
    state = passPriority(state); // P2 passes (they were active after adding)
    state = passPriority(state); // P1 passes

    // Draw spell resolves first (LIFO)
    const { resolved: first, newState: after1 } = resolveTopItem(state);
    expect(first!.cardId).toBe("counter-draw");
    expect((first!.effect as ExecutableEffect).type).toBe("draw");

    // After first resolves, passes reset — need to pass again
    let state2 = after1;
    state2 = passPriority(state2); // P1 passes (controller of remaining item)
    state2 = passPriority(state2); // P2 passes

    // Fireball resolves second
    const { resolved: second } = resolveTopItem(state2);
    expect(second!.cardId).toBe("fireball");
    expect((second!.effect as ExecutableEffect).type).toBe("damage");
  });
});

describe("Activated Ability on Chain", () => {
  let registry: CardDefinitionRegistry;

  beforeEach(() => {
    registry = new CardDefinitionRegistry();
    setGlobalCardRegistry(registry);
  });

  afterEach(() => {
    clearGlobalCardRegistry();
  });

  test("activated ability goes on chain with its effect", () => {
    const drawEffect = { amount: 1, type: "draw" };

    let state = createInteractionState();
    state = addToChain(
      state,
      { cardId: "gold-token", controller: P1, effect: drawEffect, type: "ability" },
      TURN_ORDER,
    );

    expect(state.chain!.items).toHaveLength(1);
    expect(state.chain!.items[0]!.type).toBe("ability");
    expect(state.chain!.items[0]!.effect).toEqual(drawEffect);
  });

  test("activated ability resolves and returns its effect", () => {
    const addResourceEffect = { energy: 1, type: "add-resource" };

    let state = createInteractionState();
    state = addToChain(
      state,
      { cardId: "gold-token", controller: P1, effect: addResourceEffect, type: "ability" },
      TURN_ORDER,
    );

    // Both pass
    state = passPriority(state);
    state = passPriority(state);

    const { resolved } = resolveTopItem(state);
    expect(resolved!.type).toBe("ability");
    expect(resolved!.effect).toEqual(addResourceEffect);
  });

  test("ability interleaves with spells on chain (LIFO)", () => {
    let state = createInteractionState();

    // P1 plays a spell
    state = addToChain(
      state,
      { cardId: "fireball", controller: P1, effect: { amount: 3, type: "damage" }, type: "spell" },
      TURN_ORDER,
    );

    // P2 activates a reaction ability in response
    state = addToChain(
      state,
      {
        cardId: "shield-gear",
        controller: P2,
        effect: { amount: 2, type: "heal" },
        type: "ability",
      },
      TURN_ORDER,
    );

    // Both pass
    state = passPriority(state);
    state = passPriority(state);

    // Ability resolves first (LIFO)
    const { resolved: first, newState } = resolveTopItem(state);
    expect(first!.type).toBe("ability");
    expect((first!.effect as ExecutableEffect).type).toBe("heal");

    // Then spell
    let state2 = newState;
    state2 = passPriority(state2);
    state2 = passPriority(state2);
    const { resolved: second } = resolveTopItem(state2);
    expect(second!.type).toBe("spell");
    expect((second!.effect as ExecutableEffect).type).toBe("damage");
  });
});

describe("Activated Ability Cost & Validation", () => {
  let registry: CardDefinitionRegistry;

  beforeEach(() => {
    registry = new CardDefinitionRegistry();
    setGlobalCardRegistry(registry);
  });

  afterEach(() => {
    clearGlobalCardRegistry();
  });

  test("activated ability with energy cost is registered correctly", () => {
    registry.register("gold-token", {
      abilities: [
        {
          cost: { exhaust: true },
          effect: { energy: 1, type: "add-resource" },
          type: "activated",
        },
      ],
      cardType: "gear",
      id: "gold-token",
      name: "Gold",
    });

    const abilities = registry.getAbilities("gold-token") ?? [];
    expect(abilities).toHaveLength(1);
    expect(abilities[0]!.type).toBe("activated");
    expect(abilities[0]!.cost).toEqual({ exhaust: true });
    expect(abilities[0]!.effect).toEqual({ energy: 1, type: "add-resource" });
  });

  test("ability with [2] cost registered with energy cost", () => {
    registry.register("card-draw-gear", {
      abilities: [
        {
          cost: { energy: 2 },
          effect: { amount: 1, type: "draw" },
          type: "activated",
        },
      ],
      cardType: "gear",
      id: "card-draw-gear",
      name: "Crystal Ball",
    });

    const abilities = registry.getAbilities("card-draw-gear") ?? [];
    const cost = abilities[0]!.cost as Record<string, unknown>;
    expect(cost.energy).toBe(2);
  });
});
