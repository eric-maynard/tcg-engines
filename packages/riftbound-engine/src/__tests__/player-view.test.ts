/**
 * Riftbound Player View Tests
 *
 * Verifies the player view function correctly filters game state
 * based on Riftbound privacy rules (rule 127).
 *
 * Zone-level filtering (hand, deck, facedown cards) is handled by the
 * core engine. These tests verify the game-specific state filtering
 * in `RiftboundGameState`.
 */

import { describe, expect, test } from "bun:test";
import type { PlayerId } from "@tcg/core";
import { RuleEngine } from "@tcg/core";
import { riftboundDefinition } from "../game-definition/definition";
import type {
  BattlefieldState,
  CardId,
  RiftboundCardMeta,
  RiftboundGameState,
  RiftboundMoves,
  RunePool,
} from "../types";
import { createPlayerView } from "../views/player-view";

const PLAYER_ONE = "player-1";
const PLAYER_TWO = "player-2";

/**
 * Create a minimal test state for player view testing
 */
function createTestState(overrides?: Partial<RiftboundGameState>): RiftboundGameState {
  return {
    battlefields: {
      "bf-1": {
        contested: false,
        controller: PLAYER_ONE,
        id: "bf-1" as CardId,
      },
      "bf-2": {
        contested: true,
        contestedBy: PLAYER_TWO,
        controller: null,
        id: "bf-2" as CardId,
      },
    },
    conqueredThisTurn: {
      [PLAYER_ONE]: ["bf-1" as CardId],
      [PLAYER_TWO]: [],
    },
    gameId: "test-game-123",
    players: {
      [PLAYER_ONE]: { id: PLAYER_ONE, victoryPoints: 3 },
      [PLAYER_TWO]: { id: PLAYER_TWO, victoryPoints: 5 },
    },
    runePools: {
      [PLAYER_ONE]: { energy: 4, power: { calm: 1, fury: 2 } },
      [PLAYER_TWO]: { energy: 3, power: { mind: 1 } },
    },
    scoredThisTurn: {
      [PLAYER_ONE]: [],
      [PLAYER_TWO]: [],
    },
    status: "playing",
    turn: {
      activePlayer: PLAYER_ONE,
      number: 5,
      phase: "main",
    },
    victoryScore: 8,
    ...overrides,
  };
}

describe("createPlayerView", () => {
  describe("player validation", () => {
    test("throws for unknown player ID", () => {
      const state = createTestState();
      expect(() => createPlayerView(state, "unknown-player")).toThrow(
        "Player unknown-player not found in game state",
      );
    });

    test("error message includes valid player IDs", () => {
      const state = createTestState();
      expect(() => createPlayerView(state, "nobody")).toThrow("player-1, player-2");
    });

    test("accepts valid player-1", () => {
      const state = createTestState();
      expect(() => createPlayerView(state, PLAYER_ONE)).not.toThrow();
    });

    test("accepts valid player-2", () => {
      const state = createTestState();
      expect(() => createPlayerView(state, PLAYER_TWO)).not.toThrow();
    });
  });

  describe("public state visibility", () => {
    test("both players see the same game ID", () => {
      const state = createTestState();
      const p1View = createPlayerView(state, PLAYER_ONE);
      const p2View = createPlayerView(state, PLAYER_TWO);

      expect(p1View.gameId).toBe("test-game-123");
      expect(p2View.gameId).toBe("test-game-123");
    });

    test("both players see all victory point totals", () => {
      const state = createTestState();
      const p1View = createPlayerView(state, PLAYER_ONE);
      const p2View = createPlayerView(state, PLAYER_TWO);

      expect(p1View.players[PLAYER_ONE].victoryPoints).toBe(3);
      expect(p1View.players[PLAYER_TWO].victoryPoints).toBe(5);
      expect(p2View.players[PLAYER_ONE].victoryPoints).toBe(3);
      expect(p2View.players[PLAYER_TWO].victoryPoints).toBe(5);
    });

    test("both players see victory score threshold", () => {
      const state = createTestState();
      const p1View = createPlayerView(state, PLAYER_ONE);
      const p2View = createPlayerView(state, PLAYER_TWO);

      expect(p1View.victoryScore).toBe(8);
      expect(p2View.victoryScore).toBe(8);
    });

    test("both players see battlefield control status", () => {
      const state = createTestState();
      const p1View = createPlayerView(state, PLAYER_ONE);
      const p2View = createPlayerView(state, PLAYER_TWO);

      // Battlefield 1 controlled by player-1
      expect(p1View.battlefields["bf-1"].controller).toBe(PLAYER_ONE);
      expect(p2View.battlefields["bf-1"].controller).toBe(PLAYER_ONE);

      // Battlefield 2 uncontrolled but contested
      expect(p1View.battlefields["bf-2"].controller).toBeNull();
      expect(p2View.battlefields["bf-2"].controller).toBeNull();
      expect(p1View.battlefields["bf-2"].contested).toBe(true);
      expect(p2View.battlefields["bf-2"].contested).toBe(true);
      expect(p1View.battlefields["bf-2"].contestedBy).toBe(PLAYER_TWO);
      expect(p2View.battlefields["bf-2"].contestedBy).toBe(PLAYER_TWO);
    });

    test("both players see rune pool resources", () => {
      const state = createTestState();
      const p1View = createPlayerView(state, PLAYER_ONE);
      const p2View = createPlayerView(state, PLAYER_TWO);

      // Player 1 sees opponent's rune pool
      expect(p1View.runePools[PLAYER_TWO].energy).toBe(3);
      expect(p1View.runePools[PLAYER_TWO].power).toEqual({ mind: 1 });

      // Player 2 sees opponent's rune pool
      expect(p2View.runePools[PLAYER_ONE].energy).toBe(4);
      expect(p2View.runePools[PLAYER_ONE].power).toEqual({ calm: 1, fury: 2 });
    });

    test("both players see turn state", () => {
      const state = createTestState();
      const p1View = createPlayerView(state, PLAYER_ONE);
      const p2View = createPlayerView(state, PLAYER_TWO);

      expect(p1View.turn.number).toBe(5);
      expect(p1View.turn.activePlayer).toBe(PLAYER_ONE);
      expect(p1View.turn.phase).toBe("main");
      expect(p2View.turn.number).toBe(5);
      expect(p2View.turn.activePlayer).toBe(PLAYER_ONE);
      expect(p2View.turn.phase).toBe("main");
    });

    test("both players see game status", () => {
      const state = createTestState();
      const p1View = createPlayerView(state, PLAYER_ONE);
      const p2View = createPlayerView(state, PLAYER_TWO);

      expect(p1View.status).toBe("playing");
      expect(p2View.status).toBe("playing");
    });

    test("both players see conquered and scored tracking", () => {
      const state = createTestState();
      const p1View = createPlayerView(state, PLAYER_ONE);
      const p2View = createPlayerView(state, PLAYER_TWO);

      expect(p1View.conqueredThisTurn[PLAYER_ONE]).toEqual(["bf-1"]);
      expect(p2View.conqueredThisTurn[PLAYER_ONE]).toEqual(["bf-1"]);
    });

    test("both players see winner when game is finished", () => {
      const state = createTestState({
        status: "finished",
        winner: PLAYER_TWO,
      });
      const p1View = createPlayerView(state, PLAYER_ONE);
      const p2View = createPlayerView(state, PLAYER_TWO);

      expect(p1View.winner).toBe(PLAYER_TWO);
      expect(p2View.winner).toBe(PLAYER_TWO);
    });
  });

  describe("state identity", () => {
    test("returns the same state reference (no unnecessary copies)", () => {
      const state = createTestState();
      const view = createPlayerView(state, PLAYER_ONE);

      // Since all state is public, the function returns the same reference
      // The core engine handles deep cloning in getPlayerView()
      expect(view).toBe(state);
    });
  });

  describe("different game phases", () => {
    test("works during setup phase", () => {
      const state = createTestState({
        status: "setup",
        turn: { activePlayer: PLAYER_ONE, number: 1, phase: "setup" },
      });

      const view = createPlayerView(state, PLAYER_ONE);
      expect(view.status).toBe("setup");
      expect(view.turn.phase).toBe("setup");
    });

    test("works during channel phase", () => {
      const state = createTestState({
        turn: { activePlayer: PLAYER_TWO, number: 3, phase: "channel" },
      });

      const view = createPlayerView(state, PLAYER_TWO);
      expect(view.turn.phase).toBe("channel");
    });

    test("works when game is finished", () => {
      const state = createTestState({
        players: {
          [PLAYER_ONE]: { id: PLAYER_ONE, victoryPoints: 8 },
          [PLAYER_TWO]: { id: PLAYER_TWO, victoryPoints: 6 },
        },
        status: "finished",
        winner: PLAYER_ONE,
      });

      const view = createPlayerView(state, PLAYER_TWO);
      expect(view.status).toBe("finished");
      expect(view.winner).toBe(PLAYER_ONE);
      expect(view.players[PLAYER_ONE].victoryPoints).toBe(8);
    });
  });

  describe("empty/minimal state", () => {
    test("works with no battlefields", () => {
      const state = createTestState({ battlefields: {} });
      const view = createPlayerView(state, PLAYER_ONE);
      expect(view.battlefields).toEqual({});
    });

    test("works with empty rune pools", () => {
      const state = createTestState({
        runePools: {
          [PLAYER_ONE]: { energy: 0, power: {} },
          [PLAYER_TWO]: { energy: 0, power: {} },
        },
      });
      const view = createPlayerView(state, PLAYER_ONE);
      expect(view.runePools[PLAYER_ONE].energy).toBe(0);
      expect(view.runePools[PLAYER_TWO].energy).toBe(0);
    });
  });

  describe("determinism", () => {
    test("same state and player always produces the same view", () => {
      const state = createTestState();
      const view1 = createPlayerView(state, PLAYER_ONE);
      const view2 = createPlayerView(state, PLAYER_ONE);

      expect(view1).toEqual(view2);
    });

    test("different players may see different views (future extensibility)", () => {
      const state = createTestState();
      const p1View = createPlayerView(state, PLAYER_ONE);
      const p2View = createPlayerView(state, PLAYER_TWO);

      // Currently both views are identical since all state is public
      expect(p1View).toEqual(p2View);
    });
  });
});

describe("playerView integration with game definition", () => {
  function createEngine() {
    return new RuleEngine<RiftboundGameState, RiftboundMoves, unknown, RiftboundCardMeta>(
      riftboundDefinition,
      [
        { id: PLAYER_ONE, name: "Player One" },
        { id: PLAYER_TWO, name: "Player Two" },
      ],
      { seed: "player-view-test" },
    );
  }

  test("game definition has playerView configured", () => {
    expect(riftboundDefinition.playerView).toBeDefined();
    expect(typeof riftboundDefinition.playerView).toBe("function");
  });

  test("playerView does not return raw state passthrough", () => {
    // Verify the definition uses createPlayerView, not a no-op
    const engine = createEngine();
    const state = engine.getState();

    // The playerView should call createPlayerView which validates the player
    expect(() => {
      riftboundDefinition.playerView!(state, "invalid-player-id");
    }).toThrow();
  });

  test("getPlayerView returns valid state for player-1", () => {
    const engine = createEngine();
    const view = engine.getPlayerView(PLAYER_ONE);

    expect(view).toBeDefined();
    expect(view.players[PLAYER_ONE]).toBeDefined();
    expect(view.players[PLAYER_TWO]).toBeDefined();
    expect(view.status).toBe("setup");
  });

  test("getPlayerView returns valid state for player-2", () => {
    const engine = createEngine();
    const view = engine.getPlayerView(PLAYER_TWO);

    expect(view).toBeDefined();
    expect(view.players[PLAYER_ONE]).toBeDefined();
    expect(view.players[PLAYER_TWO]).toBeDefined();
  });

  test("getPlayerView reflects state changes after moves", () => {
    const engine = createEngine();

    // Initialize deck for player-1
    engine.executeMove("initializeMainDeck", {
      params: {
        cardIds: Array.from({ length: 40 }, (_, i) => `p1-card-${i}`),
        playerId: PLAYER_ONE,
      },
      playerId: PLAYER_ONE as PlayerId,
    });

    const view = engine.getPlayerView(PLAYER_ONE);
    expect(view).toBeDefined();
    expect(view.status).toBe("setup");
  });

  test("both players see consistent game state", () => {
    const engine = createEngine();
    const p1View = engine.getPlayerView(PLAYER_ONE);
    const p2View = engine.getPlayerView(PLAYER_TWO);

    // Victory points should be consistent
    expect(p1View.players[PLAYER_ONE].victoryPoints).toBe(p2View.players[PLAYER_ONE].victoryPoints);
    expect(p1View.players[PLAYER_TWO].victoryPoints).toBe(p2View.players[PLAYER_TWO].victoryPoints);

    // Turn state should be consistent
    expect(p1View.turn.activePlayer).toBe(p2View.turn.activePlayer);
    expect(p1View.turn.phase).toBe(p2View.turn.phase);
  });
});
