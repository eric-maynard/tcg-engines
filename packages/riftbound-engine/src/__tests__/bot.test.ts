/**
 * Riftbound Bot Tests
 *
 * Tests the bot player can take actions and play through a game.
 */

import { describe, expect, test } from "bun:test";
import { RuleEngine } from "@tcg/core";
import type { PlayerId } from "@tcg/core";
import { RiftboundBot } from "../bot";
import { riftboundDefinition } from "../game-definition/definition";
import type { RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "../types";

const P1 = "player-1";
const P2 = "player-2";

function createEngine() {
  return new RuleEngine<RiftboundGameState, RiftboundMoves, unknown, RiftboundCardMeta>(
    riftboundDefinition,
    [
      { id: P1, name: "Human" },
      { id: P2, name: "Bot" },
    ],
    { seed: "bot-test" },
  );
}

function setupPlayingGame() {
  const engine = createEngine();

  for (const pid of [P1, P2]) {
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
    engine.executeMove("drawInitialHand", {
      params: { playerId: pid },
      playerId: pid as PlayerId,
    });
  }

  engine.executeMove("placeBattlefields", {
    params: { battlefieldIds: ["bf-1", "bf-2"] },
    playerId: P1 as PlayerId,
  });

  engine.executeMove("transitionToPlay", {
    params: {},
    playerId: P1 as PlayerId,
  });

  return engine;
}

describe("RiftboundBot", () => {
  test("can be created", () => {
    const engine = setupPlayingGame();
    const bot = new RiftboundBot(engine, P2, "balanced");
    expect(bot).toBeDefined();
  });

  test("knows when it's not its turn", () => {
    const engine = setupPlayingGame();
    const bot = new RiftboundBot(engine, P2, "balanced");
    // P1 goes first
    expect(bot.isMyTurn()).toBe(false);
  });

  test("knows when game is not over", () => {
    const engine = setupPlayingGame();
    const bot = new RiftboundBot(engine, P2, "balanced");
    expect(bot.isGameOver()).toBe(false);
  });

  test("returns null action when not its turn", () => {
    const engine = setupPlayingGame();
    const bot = new RiftboundBot(engine, P2, "balanced");
    const action = bot.takeAction();
    expect(action).toBeNull();
  });

  test("can take action when it's its turn", () => {
    const engine = setupPlayingGame();

    // End P1's turn first
    engine.executeMove("endTurn", {
      params: { playerId: P1 },
      playerId: P1 as PlayerId,
    });

    const bot = new RiftboundBot(engine, P2, "balanced");
    // Now it should be P2's turn (after flow advances)
    // The bot should be able to take at least endTurn action
    const action = bot.takeAction();
    if (bot.isMyTurn()) {
      expect(action).not.toBeNull();
      expect(action!.success).toBe(true);
    }
  });

  test("takeTurn returns array of actions", () => {
    const engine = setupPlayingGame();

    // End P1's turn
    engine.executeMove("endTurn", {
      params: { playerId: P1 },
      playerId: P1 as PlayerId,
    });

    const bot = new RiftboundBot(engine, P2, "aggressive");
    const actions = bot.takeTurn();
    // Should have at least attempted something
    expect(Array.isArray(actions)).toBe(true);
  });

  test("different strategies create valid bots", () => {
    const engine = setupPlayingGame();
    const strategies = ["random", "aggressive", "defensive", "balanced"] as const;

    for (const strategy of strategies) {
      const bot = new RiftboundBot(engine, P2, strategy);
      expect(bot).toBeDefined();
    }
  });

  test("bot detects game over", () => {
    const engine = setupPlayingGame();

    // Give P1 control of both battlefields
    engine.applyPatches([
      { op: "replace", path: ["battlefields", "bf-1", "controller"], value: P1 },
      { op: "replace", path: ["battlefields", "bf-2", "controller"], value: P1 },
    ]);

    // Make P1 win (score 8 points using 2 BFs, resetting each "turn")
    for (let i = 0; i < 8; i++) {
      const bfId = i % 2 === 0 ? "bf-1" : "bf-2";
      if (i % 2 === 0 && i > 0) {
        engine.applyPatches([{ op: "replace", path: ["scoredThisTurn", P1], value: [] }]);
      }
      engine.executeMove("scorePoint", {
        params: { battlefieldId: bfId, method: "conquer", playerId: P1 },
        playerId: P1 as PlayerId,
      });
    }

    const bot = new RiftboundBot(engine, P2, "balanced");
    expect(bot.isGameOver()).toBe(true);
  });

  test("bot doesn't act after game over", () => {
    const engine = setupPlayingGame();

    // Give P1 control of both battlefields
    engine.applyPatches([
      { op: "replace", path: ["battlefields", "bf-1", "controller"], value: P1 },
      { op: "replace", path: ["battlefields", "bf-2", "controller"], value: P1 },
    ]);

    // End the game
    for (let i = 0; i < 8; i++) {
      const bfId = i % 2 === 0 ? "bf-1" : "bf-2";
      if (i % 2 === 0 && i > 0) {
        engine.applyPatches([{ op: "replace", path: ["scoredThisTurn", P1], value: [] }]);
      }
      engine.executeMove("scorePoint", {
        params: { battlefieldId: bfId, method: "conquer", playerId: P1 },
        playerId: P1 as PlayerId,
      });
    }

    const bot = new RiftboundBot(engine, P2, "balanced");
    const action = bot.takeAction();
    expect(action).toBeNull();
  });

  test("bot has safety valve against infinite loops", () => {
    const engine = setupPlayingGame();

    // End P1's turn
    engine.executeMove("endTurn", {
      params: { playerId: P1 },
      playerId: P1 as PlayerId,
    });

    // Bot with low max actions
    const bot = new RiftboundBot(engine, P2, "balanced", 3);
    const actions = bot.takeTurn();
    // Should not exceed 3 actions
    expect(actions.length).toBeLessThanOrEqual(3);
  });
});
