/**
 * Riftbound Game Definition Smoke Tests
 *
 * Verifies the game definition can be loaded, a game can be created,
 * and basic moves can be executed.
 */

import { describe, expect, test } from "bun:test";
import { RuleEngine } from "@tcg/core";
import type { PlayerId, ZoneId } from "@tcg/core";
import { riftboundDefinition } from "../game-definition/definition";
import type { RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "../types";

const PLAYER_ONE = "player-1";
const PLAYER_TWO = "player-2";

function createEngine() {
  return new RuleEngine<RiftboundGameState, RiftboundMoves, unknown, RiftboundCardMeta>(
    riftboundDefinition,
    [
      { id: PLAYER_ONE, name: "Player One" },
      { id: PLAYER_TWO, name: "Player Two" },
    ],
    { seed: "test-seed" },
  );
}

describe("Riftbound Game Definition", () => {
  test("game definition has correct name", () => {
    expect(riftboundDefinition.name).toBe("Riftbound TCG");
  });

  test("game definition has moves defined", () => {
    expect(riftboundDefinition.moves).toBeDefined();
    expect(Object.keys(riftboundDefinition.moves).length).toBeGreaterThan(0);
  });

  test("game definition has zone configs", () => {
    expect(riftboundDefinition.zones).toBeDefined();
  });

  test("game definition has flow defined", () => {
    expect(riftboundDefinition.flow).toBeDefined();
  });

  test("game definition has trackers", () => {
    expect(riftboundDefinition.trackers).toBeDefined();
  });

  test("can create a RuleEngine instance", () => {
    const engine = createEngine();
    expect(engine).toBeDefined();
  });

  test("initial state has correct structure", () => {
    const engine = createEngine();
    const state = engine.getState();
    expect(state).toBeDefined();
    expect(state.status).toBe("setup");
    expect(state.turn.phase).toBe("setup");
    expect(state.victoryScore).toBe(8);
  });

  test("initial state has both players", () => {
    const engine = createEngine();
    const state = engine.getState();
    expect(state.players[PLAYER_ONE]).toBeDefined();
    expect(state.players[PLAYER_TWO]).toBeDefined();
    expect(state.players[PLAYER_ONE].victoryPoints).toBe(0);
    expect(state.players[PLAYER_TWO].victoryPoints).toBe(0);
  });

  test("initial rune pools are empty", () => {
    const engine = createEngine();
    const state = engine.getState();
    expect(state.runePools[PLAYER_ONE].energy).toBe(0);
    expect(state.runePools[PLAYER_TWO].energy).toBe(0);
  });

  test("endIf detects victory", () => {
    const engine = createEngine();
    const state = engine.getState();

    // No winner initially
    expect(riftboundDefinition.endIf!(state)).toBeUndefined();

    // Simulate a winner
    const winState = {
      ...state,
      players: {
        ...state.players,
        [PLAYER_ONE]: { ...state.players[PLAYER_ONE], victoryPoints: 8 },
      },
    };
    const result = riftboundDefinition.endIf!(winState);
    expect(result).toBeDefined();
    expect(result!.winner).toBe(PLAYER_ONE);
  });
});

describe("Riftbound Setup Flow", () => {
  test("can initialize decks during setup", () => {
    const engine = createEngine();

    // Initialize main deck for player 1
    const result = engine.executeMove("initializeMainDeck", {
      params: {
        cardIds: Array.from({ length: 40 }, (_, i) => `card-${i}`),
        playerId: PLAYER_ONE,
      },
      playerId: PLAYER_ONE as PlayerId,
    });
    expect(result.success).toBe(true);
  });

  test("can draw initial hand", () => {
    const engine = createEngine();

    // Initialize deck first
    engine.executeMove("initializeMainDeck", {
      params: {
        cardIds: Array.from({ length: 40 }, (_, i) => `p1-card-${i}`),
        playerId: PLAYER_ONE,
      },
      playerId: PLAYER_ONE as PlayerId,
    });

    // Draw initial hand (6 cards per rule 116... actually 4 cards)
    const drawResult = engine.executeMove("drawInitialHand", {
      params: { playerId: PLAYER_ONE },
      playerId: PLAYER_ONE as PlayerId,
    });
    expect(drawResult.success).toBe(true);
  });

  test("can transition from setup to main game", () => {
    const engine = createEngine();

    // Initialize decks for both players
    for (const pid of [PLAYER_ONE, PLAYER_TWO]) {
      engine.executeMove("initializeMainDeck", {
        params: {
          cardIds: Array.from({ length: 40 }, (_, i) => `${pid}-card-${i}`),
          playerId: pid,
        },
        playerId: pid as PlayerId,
      });
      engine.executeMove("initializeRuneDeck", {
        params: {
          playerId: pid,
          runeIds: Array.from({ length: 12 }, (_, i) => `${pid}-rune-${i}`),
        },
        playerId: pid as PlayerId,
      });
    }

    // Transition to play
    const result = engine.executeMove("transitionToPlay", {
      params: {},
      playerId: PLAYER_ONE as PlayerId,
    });
    expect(result.success).toBe(true);

    const state = engine.getState();
    expect(state.status).toBe("playing");
  });
});

describe("Riftbound Turn Flow", () => {
  function createPlayingEngine() {
    const engine = createEngine();

    // Quick setup: initialize decks and transition
    for (const pid of [PLAYER_ONE, PLAYER_TWO]) {
      engine.executeMove("initializeMainDeck", {
        params: {
          cardIds: Array.from({ length: 40 }, (_, i) => `${pid}-card-${i}`),
          playerId: pid,
        },
        playerId: pid as PlayerId,
      });
      engine.executeMove("initializeRuneDeck", {
        params: {
          playerId: pid,
          runeIds: Array.from({ length: 12 }, (_, i) => `${pid}-rune-${i}`),
        },
        playerId: pid as PlayerId,
      });
    }

    engine.executeMove("transitionToPlay", {
      params: {},
      playerId: PLAYER_ONE as PlayerId,
    });

    return engine;
  }

  test("game starts in playing status after transition", () => {
    const engine = createPlayingEngine();
    const state = engine.getState();
    expect(state.status).toBe("playing");
  });

  test("player can end turn during action phase", () => {
    const engine = createPlayingEngine();

    // End turn (action phase → ending → next turn)
    const result = engine.executeMove("endTurn", {
      params: { playerId: PLAYER_ONE },
      playerId: PLAYER_ONE as PlayerId,
    });
    expect(result.success).toBe(true);
  });

  test("player can concede", () => {
    const engine = createPlayingEngine();

    const result = engine.executeMove("concede", {
      params: { playerId: PLAYER_ONE },
      playerId: PLAYER_ONE as PlayerId,
    });
    expect(result.success).toBe(true);

    const state = engine.getState();
    expect(state.status).toBe("finished");
    expect(state.winner).toBe(PLAYER_TWO);
  });
});
