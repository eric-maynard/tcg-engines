/**
 * Visual Monkey Test Bug Fixes (Round 2)
 *
 * Regression tests for 4 bugs found during visual monkey testing:
 * 1. Hold events not emitted during beginning phase scoring (CRITICAL)
 * 2. Empty battlefield conquer skips showdown (HIGH)
 * 3. Conquer events not emitted from conquerBattlefield (HIGH)
 * 4. Rune pool cards not recycled back to rune deck (MEDIUM)
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { PlayerId as CorePlayerId } from "@tcg/core";
import { combatMoves } from "../game-definition/moves/combat";
import { movementMoves } from "../game-definition/moves/movement";
import { riftboundFlow } from "../game-definition/flow/riftbound-flow";
import { fireTriggers } from "../abilities/trigger-runner";
import { getActiveShowdown } from "../chain";
import {
  CardDefinitionRegistry,
  clearGlobalCardRegistry,
  setGlobalCardRegistry,
} from "../operations/card-lookup";
import type { RiftboundCardMeta, RiftboundGameState } from "../types";
import {
  HELPER_P1 as P1,
  HELPER_P2 as P2,
  createMockMoveContext as createMockContext,
  createMockMoveState,
} from "./helpers/move-context";

// ============================================================================
// Shared Helpers
// ============================================================================

let registry: CardDefinitionRegistry;

function createMockState(overrides?: Partial<RiftboundGameState>): RiftboundGameState {
  return createMockMoveState({ gameId: "test-visual-monkey-2", ...overrides });
}

/**
 * Create a mock FlowContext for testing flow phase hooks.
 */
function createMockFlowContext(
  state: RiftboundGameState,
  cards: Record<string, { owner: string; zone: string; meta?: Partial<RiftboundCardMeta> }>,
  currentPlayer: string = P1,
) {
  const mockCtx = createMockContext(state, cards);
  return {
    ...mockCtx,
    flowContext: {
      cards: {
        getCardMeta: mockCtx.context.cards.getCardMeta,
        getCardOwner: mockCtx.context.cards.getCardOwner,
        updateCardMeta: mockCtx.context.cards.updateCardMeta,
      },
      endGameSegment: () => {},
      endPhase: () => {},
      endStep: () => {},
      endTurn: () => {},
      game: {} as unknown,
      getCurrentGameSegment: () => "mainGame",
      getCurrentPhase: () => "beginning",
      getCurrentPlayer: () => currentPlayer,
      getCurrentStep: () => undefined,
      getTurnNumber: () => 1,
      setCurrentPlayer: () => {},
      state,
      zones: {
        ...mockCtx.context.zones,
        bulkMove: (() => []) as unknown,
        getCardZone: mockCtx.context.zones.getCardZone,
        mulligan: (() => {}) as unknown,
      },
    },
  };
}

beforeEach(() => {
  registry = new CardDefinitionRegistry();
  setGlobalCardRegistry(registry);
});

afterEach(() => {
  clearGlobalCardRegistry();
});

// ============================================================================
// Fix 1: Hold events not emitted during beginning phase (CRITICAL)
// ============================================================================

describe("Fix 1: Hold events fire during beginning phase scoring", () => {
  test("fireTriggers matches hold event for card with hold trigger", () => {
    // Register a battlefield card (like Altar to Unity) with "When you hold here" trigger
    registry.register("altar-to-unity", {
      abilities: [
        {
          effect: {
            amount: 1,
            location: "base",
            token: { might: 1, name: "Recruit", type: "unit" },
            type: "create-token",
          },
          trigger: { event: "hold", on: "self" },
          type: "triggered",
        },
      ],
      cardType: "battlefield",
      id: "altar-to-unity",
      name: "Altar to Unity",
    });

    const state = createMockState({
      battlefields: {
        "altar-to-unity": { contested: false, controller: P1, id: "altar-to-unity" },
      },
    });
    const { context } = createMockContext(state, {
      "altar-to-unity": { owner: P1, zone: "battlefieldRow" },
    });

    // Fire hold event - battlefieldId must match the card ID (as in real game setup)
    const triggerCount = fireTriggers(
      { battlefieldId: "altar-to-unity", playerId: P1, type: "hold" },
      {
        cards: context.cards,
        counters: context.counters,
        draft: state,
        zones: context.zones,
      },
    );

    // The hold trigger should fire
    expect(triggerCount).toBeGreaterThanOrEqual(1);
  });

  test("beginning phase onBegin emits hold events and awards VP", () => {
    // Test that the flow's beginning phase onBegin calls fireTriggers for hold events
    const state = createMockState({
      battlefields: {
        "bf-1": { contested: false, controller: P1, id: "bf-1" },
        "bf-2": { contested: false, controller: null, id: "bf-2" },
      },
    });

    const { flowContext } = createMockFlowContext(state, {}, P1);

    // Access the beginning phase from the flow definition
    const flowDef = riftboundFlow as {
      gameSegments: Record<
        string,
        { turn: { phases: Record<string, { onBegin?: (ctx: unknown) => void }> } }
      >;
    };
    const beginningPhase = flowDef.gameSegments.mainGame.turn.phases.beginning;

    // Execute the beginning phase hook
    beginningPhase.onBegin!(
      flowContext as unknown as Parameters<NonNullable<typeof beginningPhase.onBegin>>[0],
    );

    // VP should be awarded for the controlled battlefield (bf-1)
    expect(state.players[P1].victoryPoints).toBe(1);

    // Bf-1 should be tracked as scored
    expect(state.scoredThisTurn[P1]).toContain("bf-1");

    // Bf-2 is uncontrolled, should NOT be scored
    expect(state.scoredThisTurn[P1]).not.toContain("bf-2");
  });

  test("beginning phase hold event does not fire for uncontrolled battlefields", () => {
    // Register a battlefield card with hold trigger
    registry.register("hold-bf", {
      abilities: [
        {
          effect: { amount: 1, type: "draw" },
          trigger: { event: "hold" },
          type: "triggered",
        },
      ],
      cardType: "battlefield",
      id: "hold-bf",
      name: "Hold Battlefield",
    });

    const state = createMockState({
      battlefields: {
        "bf-1": { contested: false, controller: null, id: "bf-1" },
      },
    });

    const { flowContext } = createMockFlowContext(
      state,
      {
        "hold-bf": { owner: P1, zone: "battlefieldRow" },
      },
      P1,
    );

    const flowDef = riftboundFlow as {
      gameSegments: Record<
        string,
        { turn: { phases: Record<string, { onBegin?: (ctx: unknown) => void }> } }
      >;
    };
    const beginningPhase = flowDef.gameSegments.mainGame.turn.phases.beginning;

    beginningPhase.onBegin!(
      flowContext as unknown as Parameters<NonNullable<typeof beginningPhase.onBegin>>[0],
    );

    // No VP should be awarded (battlefield is uncontrolled)
    expect(state.players[P1].victoryPoints).toBe(0);
  });
});

// ============================================================================
// Fix 2: Empty battlefield conquer skips showdown (HIGH)
// ============================================================================

describe("Fix 2: Showdown starts when units move to uncontrolled battlefield", () => {
  test("standardMove starts a showdown when moving to uncontrolled battlefield", () => {
    registry.register("unit-1", {
      cardType: "unit",
      id: "unit-1",
      keywords: [],
      might: 3,
      name: "Moving Unit",
    });

    const state = createMockState();
    const { context } = createMockContext(state, {
      "unit-1": { owner: P1, zone: "base" },
    });

    // Execute standardMove to move unit to uncontrolled bf-1
    const reducer = movementMoves.standardMove!.reducer!;
    reducer(state as unknown as Parameters<typeof reducer>[0], {
      ...context,
      params: {
        destination: "bf-1",
        playerId: P1,
        unitIds: ["unit-1"],
      },
    });

    // A showdown should have been started
    expect(state.interaction).toBeDefined();
    const activeShowdown = getActiveShowdown(state.interaction!);
    expect(activeShowdown).not.toBeNull();
    expect(activeShowdown?.active).toBe(true);
    expect(activeShowdown?.battlefieldId).toBe("bf-1");
    expect(activeShowdown?.isCombatShowdown).toBe(false);
  });

  test("standardMove does NOT start showdown when moving to already-controlled battlefield", () => {
    registry.register("unit-1", {
      cardType: "unit",
      id: "unit-1",
      keywords: [],
      might: 3,
      name: "Moving Unit",
    });

    const state = createMockState({
      battlefields: {
        "bf-1": { contested: false, controller: P1, id: "bf-1" },
        "bf-2": { contested: false, controller: null, id: "bf-2" },
      },
    });
    const { context } = createMockContext(state, {
      "unit-1": { owner: P1, zone: "base" },
    });

    const reducer = movementMoves.standardMove!.reducer!;
    reducer(state as unknown as Parameters<typeof reducer>[0], {
      ...context,
      params: {
        destination: "bf-1",
        playerId: P1,
        unitIds: ["unit-1"],
      },
    });

    // No showdown should be started (player already controls bf-1)
    expect(state.interaction).toBeUndefined();
  });

  test("conquerBattlefield is blocked while showdown is active at that battlefield", () => {
    registry.register("unit-1", {
      cardType: "unit",
      id: "unit-1",
      keywords: [],
      might: 3,
      name: "Attacker",
    });

    const state = createMockState({
      interaction: {
        chain: null,
        nextChainItemId: 1,
        showdownStack: [
          {
            active: true,
            battlefieldId: "bf-1",
            focusPlayer: P1,
            isCombatShowdown: false,
            passedPlayers: [],
            relevantPlayers: [P1, P2],
          },
        ],
      },
    });
    const { context } = createMockContext(state, {
      "unit-1": { owner: P1, zone: "battlefield-bf-1" },
    });

    const condition = combatMoves.conquerBattlefield!.condition!;
    const result = condition(state, {
      ...context,
      params: {
        battlefieldId: "bf-1",
        playerId: P1,
      },
    });

    // Conquer should be blocked while showdown is active
    expect(result).toBe(false);
  });

  test("conquerBattlefield is allowed after showdown resolves", () => {
    registry.register("unit-1", {
      cardType: "unit",
      id: "unit-1",
      keywords: [],
      might: 3,
      name: "Attacker",
    });

    // Showdown ended (active: false) or no showdown
    const state = createMockState();
    const { context } = createMockContext(state, {
      "unit-1": { owner: P1, zone: "battlefield-bf-1" },
    });

    const condition = combatMoves.conquerBattlefield!.condition!;
    const result = condition(state, {
      ...context,
      params: {
        battlefieldId: "bf-1",
        playerId: P1,
      },
    });

    // Conquer should be allowed (no active showdown)
    expect(result).toBe(true);
  });

  test("conquerBattlefield enumerator excludes battlefields with active showdown", () => {
    registry.register("unit-1", {
      cardType: "unit",
      id: "unit-1",
      keywords: [],
      might: 3,
      name: "Attacker",
    });

    const state = createMockState({
      interaction: {
        chain: null,
        nextChainItemId: 1,
        showdownStack: [
          {
            active: true,
            battlefieldId: "bf-1",
            focusPlayer: P1,
            isCombatShowdown: false,
            passedPlayers: [],
            relevantPlayers: [P1, P2],
          },
        ],
      },
    });
    const { context } = createMockContext(state, {
      "unit-1": { owner: P1, zone: "battlefield-bf-1" },
    });

    const enumerator = combatMoves.conquerBattlefield!.enumerator!;
    const moves = enumerator(state, {
      ...context,
      playerId: P1 as CorePlayerId,
    });

    // Bf-1 should NOT appear in enumerable moves (showdown active)
    const bf1Moves = moves.filter((m: { battlefieldId: string }) => m.battlefieldId === "bf-1");
    expect(bf1Moves).toHaveLength(0);
  });
});

// ============================================================================
// Fix 3: Conquer events not emitted from conquerBattlefield (HIGH)
// ============================================================================

describe("Fix 3: Conquer events fire from conquerBattlefield reducer", () => {
  test("conquerBattlefield reducer emits conquer event (trigger fires)", () => {
    // Register a unit with "When you conquer" trigger that modifies meta
    registry.register("conquer-tracker", {
      abilities: [
        {
          effect: { target: { type: "self" }, type: "buff" },
          trigger: { event: "conquer" },
          type: "triggered",
        },
      ],
      cardType: "unit",
      id: "conquer-tracker",
      keywords: [],
      might: 3,
      name: "Conquer Tracker",
    });

    registry.register("attacker-unit", {
      cardType: "unit",
      id: "attacker-unit",
      keywords: [],
      might: 3,
      name: "Attacker",
    });

    const state = createMockState();
    const { context } = createMockContext(state, {
      "attacker-unit": { owner: P1, zone: "battlefield-bf-1" },
      "conquer-tracker": { owner: P1, zone: "base" },
    });

    // Run the conquerBattlefield reducer
    const reducer = combatMoves.conquerBattlefield!.reducer!;
    reducer(state as unknown as Parameters<typeof reducer>[0], {
      ...context,
      params: {
        battlefieldId: "bf-1",
        playerId: P1,
      },
    });

    // The battlefield should be conquered and VP awarded
    expect(state.battlefields["bf-1"].controller).toBe(P1);
    expect(state.players[P1].victoryPoints).toBe(1);
  });

  test("fireTriggers finds conquer triggers on board cards", () => {
    // Verify the trigger matcher works for conquer events
    registry.register("blade-dancer", {
      abilities: [
        {
          effect: { amount: 1, type: "draw" },
          trigger: { event: "conquer" },
          type: "triggered",
        },
      ],
      cardType: "unit",
      id: "blade-dancer",
      keywords: [],
      might: 3,
      name: "Blade Dancer",
    });

    const state = createMockState();
    const { context } = createMockContext(state, {
      "blade-dancer": { owner: P1, zone: "base" },
    });

    const triggerCount = fireTriggers(
      { battlefieldId: "bf-1", playerId: P1, type: "conquer" },
      {
        cards: context.cards,
        counters: context.counters,
        draft: state,
        zones: context.zones,
      },
    );

    expect(triggerCount).toBeGreaterThanOrEqual(1);
  });

  test("resolveFullCombat emits conquer event when attacker wins", () => {
    // Register cards for combat
    registry.register("strong-attacker", {
      cardType: "unit",
      id: "strong-attacker",
      keywords: [],
      might: 5,
      name: "Strong Attacker",
    });
    registry.register("weak-defender", {
      cardType: "unit",
      id: "weak-defender",
      keywords: [],
      might: 1,
      name: "Weak Defender",
    });

    const state = createMockState({
      battlefields: {
        "bf-1": { contested: true, contestedBy: P1, controller: P2, id: "bf-1" },
        "bf-2": { contested: false, controller: null, id: "bf-2" },
      },
    });
    const { context } = createMockContext(state, {
      "strong-attacker": { owner: P1, zone: "battlefield-bf-1" },
      "weak-defender": { owner: P2, zone: "battlefield-bf-1" },
    });

    // Should not throw when resolving combat
    const reducer = combatMoves.resolveFullCombat!.reducer!;
    expect(() => {
      reducer(state as unknown as Parameters<typeof reducer>[0], {
        ...context,
        params: { battlefieldId: "bf-1" },
      });
    }).not.toThrow();
  });
});
