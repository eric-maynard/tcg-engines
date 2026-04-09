/**
 * 1v1 Duel Setup Flow Tests
 *
 * Tests the full pregame sequence for a 1v1 Duel (rule 644):
 * Roll → Choose first → Place legends → Place champions →
 * Select battlefields → Initialize decks → Shuffle → Draw 4 → Mulligan → Play
 */

import { describe, expect, test } from "bun:test";
import { RuleEngine } from "@tcg/core";
import type { PlayerId } from "@tcg/core";
import { riftboundDefinition } from "../game-definition/definition";
import type { RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "../types";

const P1 = "player-1";
const P2 = "player-2";

function createEngine() {
  return new RuleEngine<RiftboundGameState, RiftboundMoves, unknown, RiftboundCardMeta>(
    riftboundDefinition,
    [
      { id: P1, name: "Alice" },
      { id: P2, name: "Bob" },
    ],
    { seed: "duel-setup-test" },
  );
}

describe("1v1 Duel Setup: Roll for First", () => {
  test("initial state has setup with rollForFirst step", () => {
    const engine = createEngine();
    const state = engine.getState();
    expect(state.status).toBe("setup");
    expect(state.setup).toBeDefined();
    expect(state.setup!.step).toBe("rollForFirst");
  });

  test("player can roll for first", () => {
    const engine = createEngine();

    const result = engine.executeMove("rollForFirst", {
      params: { playerId: P1 },
      playerId: P1 as PlayerId,
    });
    expect(result.success).toBe(true);

    const state = engine.getState();
    expect(state.setup!.rolls[P1]).toBeDefined();
    expect(state.setup!.rolls[P1]).toBeGreaterThanOrEqual(1);
    expect(state.setup!.rolls[P1]).toBeLessThanOrEqual(20);
  });

  test("cannot roll twice", () => {
    const engine = createEngine();

    engine.executeMove("rollForFirst", {
      params: { playerId: P1 },
      playerId: P1 as PlayerId,
    });

    const result = engine.executeMove("rollForFirst", {
      params: { playerId: P1 },
      playerId: P1 as PlayerId,
    });
    expect(result.success).toBe(false);
  });

  test("after both roll, step advances to chooseFirst", () => {
    const engine = createEngine();

    engine.executeMove("rollForFirst", {
      params: { playerId: P1 },
      playerId: P1 as PlayerId,
    });
    engine.executeMove("rollForFirst", {
      params: { playerId: P2 },
      playerId: P2 as PlayerId,
    });

    const state = engine.getState();
    expect(state.setup!.step).toBe("chooseFirst");
    expect(state.setup!.rollWinner).toBeDefined();
  });
});

describe("1v1 Duel Setup: Choose First Player", () => {
  function rollBothPlayers() {
    const engine = createEngine();
    engine.executeMove("rollForFirst", {
      params: { playerId: P1 },
      playerId: P1 as PlayerId,
    });
    engine.executeMove("rollForFirst", {
      params: { playerId: P2 },
      playerId: P2 as PlayerId,
    });
    return engine;
  }

  test("roll winner can choose who goes first", () => {
    const engine = rollBothPlayers();
    const state = engine.getState();
    const winner = state.setup!.rollWinner!;

    const result = engine.executeMove("chooseFirstPlayer", {
      params: { firstPlayerId: P1, playerId: winner },
      playerId: winner as PlayerId,
    });
    expect(result.success).toBe(true);

    const newState = engine.getState();
    expect(newState.setup!.firstPlayer).toBe(P1);
    expect(newState.setup!.secondPlayer).toBe(P2);
    expect(newState.setup!.step).toBe("placeLegends");
  });

  test("non-winner cannot choose", () => {
    const engine = rollBothPlayers();
    const state = engine.getState();
    const nonWinner = state.setup!.rollWinner === P1 ? P2 : P1;

    const result = engine.executeMove("chooseFirstPlayer", {
      params: { firstPlayerId: nonWinner, playerId: nonWinner },
      playerId: nonWinner as PlayerId,
    });
    expect(result.success).toBe(false);
  });

  test("winner can choose themselves to go first", () => {
    const engine = rollBothPlayers();
    const state = engine.getState();
    const winner = state.setup!.rollWinner!;

    const result = engine.executeMove("chooseFirstPlayer", {
      params: { firstPlayerId: winner, playerId: winner },
      playerId: winner as PlayerId,
    });
    expect(result.success).toBe(true);

    const newState = engine.getState();
    expect(newState.setup!.firstPlayer).toBe(winner);
  });
});

describe("1v1 Duel Setup: Full Sequence", () => {
  test("complete setup from roll to play", () => {
    const engine = createEngine();

    // 1. Both players roll
    engine.executeMove("rollForFirst", {
      params: { playerId: P1 },
      playerId: P1 as PlayerId,
    });
    engine.executeMove("rollForFirst", {
      params: { playerId: P2 },
      playerId: P2 as PlayerId,
    });

    // 2. Winner chooses first player
    const rollState = engine.getState();
    const winner = rollState.setup!.rollWinner!;
    engine.executeMove("chooseFirstPlayer", {
      params: { firstPlayerId: P1, playerId: winner },
      playerId: winner as PlayerId,
    });

    // 3. Place legends
    engine.executeMove("placeLegend", {
      params: { legendId: "p1-legend", playerId: P1 },
      playerId: P1 as PlayerId,
    });
    engine.executeMove("placeLegend", {
      params: { legendId: "p2-legend", playerId: P2 },
      playerId: P2 as PlayerId,
    });

    // 4. Place champions
    engine.executeMove("placeChampion", {
      params: { championId: "p1-champion", playerId: P1 },
      playerId: P1 as PlayerId,
    });
    engine.executeMove("placeChampion", {
      params: { championId: "p2-champion", playerId: P2 },
      playerId: P2 as PlayerId,
    });

    // 5. Select battlefields (1 of 3 each)
    engine.executeMove("selectBattlefield", {
      params: {
        battlefieldId: "p1-bf-1",
        discardIds: ["p1-bf-2", "p1-bf-3"],
        playerId: P1,
      },
      playerId: P1 as PlayerId,
    });
    engine.executeMove("selectBattlefield", {
      params: {
        battlefieldId: "p2-bf-1",
        discardIds: ["p2-bf-2", "p2-bf-3"],
        playerId: P2,
      },
      playerId: P2 as PlayerId,
    });

    // 6. Initialize decks
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
    }

    // 7. Shuffle decks
    for (const pid of [P1, P2]) {
      engine.executeMove("shuffleDecks", {
        params: { playerId: pid },
        playerId: pid as PlayerId,
      });
    }

    // 8. Draw initial hand (4 cards each, rule 116)
    for (const pid of [P1, P2]) {
      engine.executeMove("drawInitialHand", {
        params: { playerId: pid },
        playerId: pid as PlayerId,
      });
    }

    // 9. Mulligan (in turn order — first player, then second)
    // P1 keeps all cards (empty keepCards = keep everything by sending all card IDs)
    engine.executeMove("mulligan", {
      params: { keepCards: [], playerId: P1 },
      playerId: P1 as PlayerId,
    });
    // P2 keeps all cards too
    engine.executeMove("mulligan", {
      params: { keepCards: [], playerId: P2 },
      playerId: P2 as PlayerId,
    });

    // 10. Transition to play
    const transResult = engine.executeMove("transitionToPlay", {
      params: {},
      playerId: P1 as PlayerId,
    });
    expect(transResult.success).toBe(true);

    // Verify final state
    const state = engine.getState();
    expect(state.status).toBe("playing");
    expect(state.setup).toBeUndefined(); // Setup state cleared
    expect(state.battlefields["p1-bf-1"]).toBeDefined();
    expect(state.battlefields["p2-bf-1"]).toBeDefined();
    expect(state.secondPlayerExtraRune).toBe(true);
    expect(state.turn.activePlayer).toBe(P1); // First player goes first
  });
});
