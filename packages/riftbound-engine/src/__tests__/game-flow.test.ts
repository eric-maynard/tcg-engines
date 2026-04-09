/**
 * Riftbound Game Flow Integration Tests
 *
 * Tests realistic game scenarios: setup → play → combat → scoring → victory.
 */

import { describe, expect, test } from "bun:test";
import { RuleEngine } from "@tcg/core";
import type { PlayerId, ZoneId } from "@tcg/core";
import { riftboundDefinition } from "../game-definition/definition";
import type { RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "../types";

const P1 = "player-1";
const P2 = "player-2";

function createEngine() {
  return new RuleEngine<RiftboundGameState, RiftboundMoves, unknown, RiftboundCardMeta>(
    riftboundDefinition,
    [
      { id: P1, name: "Player One" },
      { id: P2, name: "Player Two" },
    ],
    { seed: "integration-test" },
  );
}

/** Helper: set up a game ready for play */
function setupGame() {
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

  // Place battlefields
  engine.executeMove("placeBattlefields", {
    params: { battlefieldIds: ["bf-1", "bf-2"] },
    playerId: P1 as PlayerId,
  });

  // Transition to play
  engine.executeMove("transitionToPlay", {
    params: {},
    playerId: P1 as PlayerId,
  });

  return engine;
}

describe("Game Flow: Setup to Play", () => {
  test("full setup creates a playable game", () => {
    const engine = setupGame();
    const state = engine.getState();

    expect(state.status).toBe("playing");
    expect(state.battlefields["bf-1"]).toBeDefined();
    expect(state.battlefields["bf-2"]).toBeDefined();
  });

  test("battlefields start uncontrolled", () => {
    const engine = setupGame();
    const state = engine.getState();

    expect(state.battlefields["bf-1"].controller).toBeNull();
    expect(state.battlefields["bf-2"].controller).toBeNull();
    expect(state.battlefields["bf-1"].contested).toBe(false);
  });
});

describe("Game Flow: Resource Management", () => {
  test("can add and spend resources", () => {
    const engine = setupGame();

    // Add resources
    engine.executeMove("addResources", {
      params: { energy: 5, playerId: P1, power: { fury: 2 } },
      playerId: P1 as PlayerId,
    });

    let state = engine.getState();
    expect(state.runePools[P1].energy).toBe(5);
    expect(state.runePools[P1].power.fury).toBe(2);

    // Spend resources
    engine.executeMove("spendResources", {
      params: { energy: 3, playerId: P1, power: { fury: 1 } },
      playerId: P1 as PlayerId,
    });

    state = engine.getState();
    expect(state.runePools[P1].energy).toBe(2);
    expect(state.runePools[P1].power.fury).toBe(1);
  });
});

describe("Game Flow: Card Play", () => {
  test("rejects playing a card not in hand", () => {
    const engine = setupGame();

    // Card-39 should be deep in the deck, not in hand
    const result = engine.executeMove("playUnit", {
      params: {
        cardId: `${P1}-card-39`,
        location: "base",
        playerId: P1,
      },
      playerId: P1 as PlayerId,
    });
    expect(result.success).toBe(false);
  });

  test("rejects playing when not active player", () => {
    const engine = setupGame();

    // P2 is not the active player
    const result = engine.executeMove("playUnit", {
      params: {
        cardId: `${P2}-card-0`,
        location: "base",
        playerId: P2,
      },
      playerId: P2 as PlayerId,
    });
    expect(result.success).toBe(false);
  });
});

describe("Game Flow: Movement", () => {
  test("rejects standardMove when unit is not on base", () => {
    const engine = setupGame();

    // Card-0 is in hand (from drawInitialHand), not at base — condition rejects
    const result = engine.executeMove("standardMove", {
      params: {
        destination: `battlefield-bf-1`,
        playerId: P1,
        unitIds: [`${P1}-card-0`],
      },
      playerId: P1 as PlayerId,
    });
    expect(result.success).toBe(false);
  });

  test("rejects recall when unit is not on a battlefield", () => {
    const engine = setupGame();

    // Card-0 is in hand, not on a battlefield — condition rejects
    const result = engine.executeMove("recallUnit", {
      params: { playerId: P1, unitId: `${P1}-card-0` },
      playerId: P1 as PlayerId,
    });
    expect(result.success).toBe(false);
  });
});

describe("Game Flow: Combat & Scoring", () => {
  test("rejects contest when no units at battlefield", () => {
    const engine = setupGame();

    // No units at bf-1, so contest should be rejected by condition
    const result = engine.executeMove("contestBattlefield", {
      params: { battlefieldId: "bf-1", playerId: P1 },
      playerId: P1 as PlayerId,
    });
    expect(result.success).toBe(false);

    const state = engine.getState();
    expect(state.battlefields["bf-1"].contested).toBe(false);
  });

  test("scoring a point increases victory points", () => {
    const engine = setupGame();

    // Give P1 control of bf-1 so scorePoint condition passes
    engine.applyPatches([
      { op: "replace", path: ["battlefields", "bf-1", "controller"], value: P1 },
    ]);

    engine.executeMove("scorePoint", {
      params: { battlefieldId: "bf-1", method: "conquer", playerId: P1 },
      playerId: P1 as PlayerId,
    });

    const state = engine.getState();
    expect(state.players[P1].victoryPoints).toBe(1);
  });

  test("reaching victory score ends the game", () => {
    const engine = setupGame();

    // Give P1 control of both battlefields
    engine.applyPatches([
      { op: "replace", path: ["battlefields", "bf-1", "controller"], value: P1 },
      { op: "replace", path: ["battlefields", "bf-2", "controller"], value: P1 },
    ]);

    // Score enough points to win (2 BFs per turn, reset scoring between turns)
    for (let i = 0; i < 8; i++) {
      const bfId = i % 2 === 0 ? "bf-1" : "bf-2";

      // Clear scored tracking every 2 points (new "turn")
      if (i % 2 === 0 && i > 0) {
        engine.applyPatches([{ op: "replace", path: ["scoredThisTurn", P1], value: [] }]);
      }

      engine.executeMove("scorePoint", {
        params: { battlefieldId: bfId, method: "conquer", playerId: P1 },
        playerId: P1 as PlayerId,
      });
    }

    const state = engine.getState();
    expect(state.status).toBe("finished");
    expect(state.winner).toBe(P1);
    expect(state.players[P1].victoryPoints).toBe(8);
  });
});

describe("Game Flow: Counter/Token Management", () => {
  test("can exhaust and ready cards", () => {
    const engine = setupGame();

    engine.executeMove("exhaustCard", {
      params: { cardId: `${P1}-card-0` },
      playerId: P1 as PlayerId,
    });

    engine.executeMove("readyCard", {
      params: { cardId: `${P1}-card-0` },
      playerId: P1 as PlayerId,
    });
  });

  test("can add and remove damage", () => {
    const engine = setupGame();

    engine.executeMove("addDamage", {
      params: { amount: 3, cardId: `${P1}-card-0` },
      playerId: P1 as PlayerId,
    });

    engine.executeMove("removeDamage", {
      params: { amount: 1, cardId: `${P1}-card-0` },
      playerId: P1 as PlayerId,
    });
  });

  test("can buff and unbuff units", () => {
    const engine = setupGame();

    engine.executeMove("addBuff", {
      params: { cardId: `${P1}-card-0` },
      playerId: P1 as PlayerId,
    });

    engine.executeMove("removeBuff", {
      params: { cardId: `${P1}-card-0` },
      playerId: P1 as PlayerId,
    });
  });

  test("can stun and unstun units", () => {
    const engine = setupGame();

    engine.executeMove("stunUnit", {
      params: { cardId: `${P1}-card-0` },
      playerId: P1 as PlayerId,
    });

    engine.executeMove("unstunUnit", {
      params: { cardId: `${P1}-card-0` },
      playerId: P1 as PlayerId,
    });
  });
});

describe("Game Flow: Discard & Trash", () => {
  test("can discard, kill, banish, and recycle", () => {
    const engine = setupGame();

    const discardResult = engine.executeMove("discardCard", {
      params: { cardId: `${P1}-card-0`, playerId: P1 },
      playerId: P1 as PlayerId,
    });
    expect(discardResult.success).toBe(true);

    const killResult = engine.executeMove("killUnit", {
      params: { cardId: `${P1}-card-1` },
      playerId: P1 as PlayerId,
    });
    expect(killResult.success).toBe(true);

    const banishResult = engine.executeMove("banishCard", {
      params: { cardId: `${P1}-card-2` },
      playerId: P1 as PlayerId,
    });
    expect(banishResult.success).toBe(true);

    const recycleResult = engine.executeMove("recycleCard", {
      params: { cardId: `${P1}-card-3` },
      playerId: P1 as PlayerId,
    });
    expect(recycleResult.success).toBe(true);
  });
});
