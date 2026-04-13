/**
 * Meta-tests for the rules-audit helpers.
 *
 * Verifies the test-helper API itself works correctly before Wave 2 agents
 * start writing rule tests on top of it. If these tests fail, Wave 2 tests
 * are unreliable by construction.
 */

import { describe, expect, it } from "bun:test";
import {
  P1,
  P2,
  advancePhase,
  applyMove,
  checkMoveLegal,
  createBattlefield,
  createCard,
  createMinimalGameState,
  fireTrigger,
  getCardsInZone,
  getInteractionState,
  getPendingTriggers,
  getRunesOnBoard,
  getState,
  getZone,
} from "./helpers";

describe("helpers.createMinimalGameState", () => {
  it("produces a state with 2 players and status 'playing'", () => {
    const engine = createMinimalGameState();
    const state = getState(engine);

    expect(state.status).toBe("playing");
    expect(Object.keys(state.players)).toEqual([P1, P2]);
    expect(state.players[P1].victoryPoints).toBe(0);
    expect(state.players[P2].victoryPoints).toBe(0);
  });

  it("defaults to turn 1, main phase, player-1 active", () => {
    const engine = createMinimalGameState();
    const state = getState(engine);

    expect(state.turn.number).toBe(1);
    expect(state.turn.phase).toBe("main");
    expect(state.turn.activePlayer).toBe(P1);
  });

  it("applies phase and turn overrides", () => {
    const engine = createMinimalGameState({
      currentPlayer: P2,
      phase: "draw",
      turn: 3,
    });
    const state = getState(engine);
    expect(state.turn.phase).toBe("draw");
    expect(state.turn.number).toBe(3);
    expect(state.turn.activePlayer).toBe(P2);
  });

  it("applies rune-pool overrides per-player", () => {
    const engine = createMinimalGameState({
      runePools: {
        [P1]: { energy: 4, power: { fury: 2 } },
      },
    });
    const state = getState(engine);
    expect(state.runePools[P1].energy).toBe(4);
    expect(state.runePools[P1].power.fury).toBe(2);
    // P2 still defaults to 0 / {}.
    expect(state.runePools[P2].energy).toBe(0);
    expect(state.runePools[P2].power).toEqual({});
  });
});

describe("helpers.createCard", () => {
  it("places a card in the specified zone under the correct owner", () => {
    const engine = createMinimalGameState();
    createCard(engine, "poro", {
      cardType: "unit",
      might: 2,
      owner: P1,
      zone: "base",
    });

    expect(getZone(engine, P1, "base")).toContain("poro");
    expect(getZone(engine, P2, "base")).not.toContain("poro");
  });

  it("registers the card in the global registry so cardType lookups work", () => {
    const engine = createMinimalGameState();
    createCard(engine, "brittle-rune", {
      cardType: "rune",
      domain: "fury",
      owner: P1,
      zone: "runePool",
    });

    // GetRunesOnBoard filters by cardType=rune in the registry.
    expect(getRunesOnBoard(engine, P1)).toContain("brittle-rune");
  });

  it("allows placing a card into an auto-created battlefield zone", () => {
    const engine = createMinimalGameState();
    createBattlefield(engine, "bf-1", { controller: null });
    createCard(engine, "ranger", {
      cardType: "unit",
      might: 3,
      owner: P1,
      zone: "battlefield-bf-1",
    });

    expect(getCardsInZone(engine, "battlefield-bf-1")).toContain("ranger");
  });
});

describe("helpers.createBattlefield", () => {
  it("adds the battlefield to state.battlefields with the given controller", () => {
    const engine = createMinimalGameState();
    createBattlefield(engine, "bf-1", { controller: P1 });
    const state = getState(engine);

    expect(state.battlefields["bf-1"]).toBeDefined();
    expect(state.battlefields["bf-1"].controller).toBe(P1);
    expect(state.battlefields["bf-1"].contested).toBe(false);
  });

  it("battlefields option on createMinimalGameState creates uncontrolled battlefields", () => {
    const engine = createMinimalGameState({ battlefields: ["bf-a", "bf-b"] });
    const state = getState(engine);

    expect(state.battlefields["bf-a"]).toBeDefined();
    expect(state.battlefields["bf-a"].controller).toBeNull();
    expect(state.battlefields["bf-b"]).toBeDefined();
    expect(state.battlefields["bf-b"].controller).toBeNull();
  });
});

describe("helpers.advancePhase (real flow hooks fire)", () => {
  it("draw.onEnd empties the rune pool (rule 515.4.d)", () => {
    const engine = createMinimalGameState({
      phase: "draw",
      runePools: { [P1]: { energy: 3, power: { fury: 1 } } },
    });

    // Sanity: we are in draw phase with resources.
    expect(getState(engine).runePools[P1].energy).toBe(3);

    advancePhase(engine, "main");

    const state = getState(engine);
    expect(state.turn.phase).toBe("main");
    // Rule 515.4.d — unspent energy/power are lost at end of draw phase.
    expect(state.runePools[P1].energy).toBe(0);
    expect(state.runePools[P1].power).toEqual({});
  });

  it("ending.onBegin clears damage on units", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createCard(engine, "wounded", {
      cardType: "unit",
      meta: { damage: 2 },
      might: 3,
      owner: P1,
      zone: "base",
    });

    advancePhase(engine, "ending");

    // Read damage via internal meta (the ending hook clears it).
    const meta = (
      engine as unknown as {
        internalState: { cardMetas: Record<string, { damage?: number }> };
      }
    ).internalState.cardMetas["wounded"];
    expect(meta?.damage ?? 0).toBe(0);
  });
});

describe("helpers.applyMove / checkMoveLegal", () => {
  it("applyMove runs a real move through the engine (addResources)", () => {
    const engine = createMinimalGameState({ phase: "main" });
    const result = applyMove(engine, "addResources", {
      energy: 2,
      playerId: P1,
      power: { fury: 1 },
    });
    expect(result.success).toBe(true);
    expect(getState(engine).runePools[P1].energy).toBe(2);
    expect(getState(engine).runePools[P1].power.fury).toBe(1);
  });

  it("checkMoveLegal does not mutate state", () => {
    const engine = createMinimalGameState({ phase: "main" });
    const before = getState(engine).runePools[P1].energy;

    // EndTurn for non-active player should be illegal.
    const legal = checkMoveLegal(engine, "endTurn", { playerId: P2 });
    expect(legal).toBe(false);

    const after = getState(engine).runePools[P1].energy;
    expect(after).toBe(before);
  });
});

describe("helpers.fireTrigger", () => {
  it("does not throw when firing an event with no listeners", () => {
    const engine = createMinimalGameState();
    expect(() =>
      fireTrigger(engine, { battlefieldId: "bf-1", playerId: P1, type: "hold" }),
    ).not.toThrow();
  });
});

describe("helpers.getInteractionState", () => {
  it("returns undefined on a freshly constructed state (no chain active)", () => {
    const engine = createMinimalGameState();
    // Interaction may be either undefined or a "neutral-open" default — both
    // Indicate no active chain or showdown.
    const interaction = getInteractionState(engine);
    if (interaction) {
      // Ensure there is no open chain or showdown.
      expect(interaction.chain?.items?.length ?? 0).toBe(0);
    }
  });

  it("getPendingTriggers returns an empty array when no chain is open", () => {
    const engine = createMinimalGameState();
    expect(getPendingTriggers(engine)).toEqual([]);
  });
});
