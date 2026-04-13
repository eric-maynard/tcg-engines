/**
 * Battlefield primitive tests
 *
 * Covers three deferred primitives added to support battlefield cards
 * whose effects are global, per-battlefield, or turn-count-gated:
 *
 * - `getEffectiveVictoryScore` / `hasPlayerWon` — read per-player
 *   `victoryScoreModifier` (Aspirant's Climb).
 * - `applyBattlefieldPermanentEffects` — bakes `increase-victory-score`
 *   and `increase-hidden-capacity` static battlefield effects into state
 *   at setup (Aspirant's Climb, Bandle Tree).
 * - `canPlayerScoreAtBattlefield` — gates scoring via `prevent-score`
 *   static abilities with `turn-count-at-least` conditions
 *   (Forgotten Monument).
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  CardDefinitionRegistry,
  clearGlobalCardRegistry,
  setGlobalCardRegistry,
} from "../operations/card-lookup";
import { applyBattlefieldPermanentEffects } from "../operations/battlefield-setup-effects";
import { canPlayerScoreAtBattlefield } from "../operations/scoring-rules";
import type { PlayerState, RiftboundGameState } from "../types";
import { getEffectiveVictoryScore, hasPlayerWon } from "../game-definition/win-conditions/victory";

function createPlayer(id: string, overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    id,
    turnsTaken: 0,
    victoryPoints: 0,
    victoryScoreModifier: 0,
    xp: 0,
    ...overrides,
  };
}

function createState(overrides: Partial<RiftboundGameState> = {}): RiftboundGameState {
  return {
    battlefields: {},
    conqueredThisTurn: { p1: [], p2: [] },
    gameId: "test",
    players: {
      p1: createPlayer("p1"),
      p2: createPlayer("p2"),
    },
    runePools: {
      p1: { energy: 0, power: {} },
      p2: { energy: 0, power: {} },
    },
    scoredThisTurn: { p1: [], p2: [] },
    status: "playing",
    turn: { activePlayer: "p1", number: 1, phase: "main" },
    victoryScore: 8,
    xpGainedThisTurn: { p1: 0, p2: 0 },
    ...overrides,
  };
}

describe("victoryScoreModifier primitive (Aspirant's Climb)", () => {
  test("getEffectiveVictoryScore returns base victoryScore when modifier is unset", () => {
    const state = createState();
    expect(getEffectiveVictoryScore(state, "p1")).toBe(8);
  });

  test("getEffectiveVictoryScore adds the player's victoryScoreModifier", () => {
    const state = createState({
      players: {
        p1: createPlayer("p1", { victoryScoreModifier: 1 }),
        p2: createPlayer("p2", { victoryScoreModifier: 0 }),
      },
    });
    expect(getEffectiveVictoryScore(state, "p1")).toBe(9);
    expect(getEffectiveVictoryScore(state, "p2")).toBe(8);
  });

  test("hasPlayerWon respects the modifier (at base 8, needs 9 when +1)", () => {
    const state = createState({
      players: {
        p1: createPlayer("p1", { victoryPoints: 8, victoryScoreModifier: 1 }),
        p2: createPlayer("p2", { victoryPoints: 8, victoryScoreModifier: 0 }),
      },
    });

    expect(hasPlayerWon(state, "p1")).toBe(false);
    expect(hasPlayerWon(state, "p2")).toBe(true);
  });
});

describe("applyBattlefieldPermanentEffects", () => {
  let registry: CardDefinitionRegistry;

  beforeEach(() => {
    registry = new CardDefinitionRegistry();
    setGlobalCardRegistry(registry);
  });

  afterEach(() => {
    clearGlobalCardRegistry();
  });

  test("increase-victory-score bumps every player's modifier by amount", () => {
    registry.register("bf-climb", {
      abilities: [
        {
          effect: { amount: 1, type: "increase-victory-score" },
          type: "static",
        },
      ],
      cardType: "battlefield",
      id: "bf-climb",
      name: "Aspirant's Climb",
    });

    const state = createState({
      battlefields: {
        "bf-climb": { contested: false, controller: null, id: "bf-climb" },
      },
    });

    applyBattlefieldPermanentEffects(state);

    expect(state.players.p1?.victoryScoreModifier).toBe(1);
    expect(state.players.p2?.victoryScoreModifier).toBe(1);
    expect(getEffectiveVictoryScore(state, "p1")).toBe(9);
  });

  test("increase-hidden-capacity bumps the source battlefield's bonus", () => {
    registry.register("bf-tree", {
      abilities: [
        {
          effect: { amount: 1, type: "increase-hidden-capacity" },
          type: "static",
        },
      ],
      cardType: "battlefield",
      id: "bf-tree",
      name: "Bandle Tree",
    });

    const state = createState({
      battlefields: {
        "bf-tree": { contested: false, controller: null, id: "bf-tree" },
      },
    });

    applyBattlefieldPermanentEffects(state);

    expect(state.battlefields["bf-tree"]?.hiddenCapacityBonus).toBe(1);
  });

  test("does nothing for battlefields without permanent static effects", () => {
    registry.register("bf-plain", {
      abilities: [],
      cardType: "battlefield",
      id: "bf-plain",
      name: "Plain Battlefield",
    });

    const state = createState({
      battlefields: {
        "bf-plain": { contested: false, controller: null, id: "bf-plain" },
      },
    });

    applyBattlefieldPermanentEffects(state);

    expect(state.players.p1?.victoryScoreModifier).toBe(0);
    expect(state.battlefields["bf-plain"]?.hiddenCapacityBonus).toBeUndefined();
  });
});

describe("canPlayerScoreAtBattlefield (Forgotten Monument)", () => {
  let registry: CardDefinitionRegistry;

  beforeEach(() => {
    registry = new CardDefinitionRegistry();
    setGlobalCardRegistry(registry);
  });

  afterEach(() => {
    clearGlobalCardRegistry();
  });

  test("returns true when the battlefield has no prevent-score abilities", () => {
    registry.register("bf-plain", {
      abilities: [],
      cardType: "battlefield",
      id: "bf-plain",
      name: "Plain",
    });

    const state = createState();
    expect(canPlayerScoreAtBattlefield(state, "p1", "bf-plain")).toBe(true);
  });

  test("blocks scoring while player.turnsTaken < threshold", () => {
    registry.register("bf-monument", {
      abilities: [
        {
          condition: { threshold: 3, type: "turn-count-at-least" },
          effect: { type: "prevent-score" },
          type: "static",
        },
      ],
      cardType: "battlefield",
      id: "bf-monument",
      name: "Forgotten Monument",
    });

    // Turns 1 and 2 are blocked.
    for (const turnsTaken of [0, 1, 2]) {
      const state = createState({
        players: {
          p1: createPlayer("p1", { turnsTaken }),
          p2: createPlayer("p2"),
        },
      });
      expect(canPlayerScoreAtBattlefield(state, "p1", "bf-monument")).toBe(false);
    }
  });

  test("allows scoring once player.turnsTaken >= threshold", () => {
    registry.register("bf-monument", {
      abilities: [
        {
          condition: { threshold: 3, type: "turn-count-at-least" },
          effect: { type: "prevent-score" },
          type: "static",
        },
      ],
      cardType: "battlefield",
      id: "bf-monument",
      name: "Forgotten Monument",
    });

    const state = createState({
      players: {
        p1: createPlayer("p1", { turnsTaken: 3 }),
        p2: createPlayer("p2", { turnsTaken: 3 }),
      },
    });

    expect(canPlayerScoreAtBattlefield(state, "p1", "bf-monument")).toBe(true);
    expect(canPlayerScoreAtBattlefield(state, "p2", "bf-monument")).toBe(true);
  });

  test("gate is per-player, not global", () => {
    registry.register("bf-monument", {
      abilities: [
        {
          condition: { threshold: 3, type: "turn-count-at-least" },
          effect: { type: "prevent-score" },
          type: "static",
        },
      ],
      cardType: "battlefield",
      id: "bf-monument",
      name: "Forgotten Monument",
    });

    const state = createState({
      players: {
        p1: createPlayer("p1", { turnsTaken: 3 }),
        p2: createPlayer("p2", { turnsTaken: 1 }),
      },
    });

    expect(canPlayerScoreAtBattlefield(state, "p1", "bf-monument")).toBe(true);
    expect(canPlayerScoreAtBattlefield(state, "p2", "bf-monument")).toBe(false);
  });
});
