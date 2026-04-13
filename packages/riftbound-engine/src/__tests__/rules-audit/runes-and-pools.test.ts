/**
 * Rules Audit: Runes & Pools (rules 153-161) + Channel/Recycle (515.3, 594)
 *
 * Wave 1 (Foundations) — targets the ~27 rule index entries that map to
 * `runes-and-pools.test.ts`. These tests exercise the conceptual Rune Pool
 * (energy/power counters), physical rune cards on the board, and related
 * mechanics.
 *
 * CRITICAL rules primer:
 *   Rule 159: "The Rune Pool is a conceptual collection of a player's
 *             available Energy and Power available to pay Costs."
 *   Rule 160: "Every player's Rune Pool empties at the end of each player's
 *             draw phase and the end of each player's turn."
 *   Rule 160.1: "Any unspent Energy or Power are lost."
 *   Rule 154.1.a: Runes remain on the Board until Recycled or otherwise
 *                 removed from the board.
 *
 * IMPORTANT DISTINCTION: when a rule says "rune pool empties", it refers to
 * the conceptual Energy/Power counters — the physical rune CARDS stay on the
 * board in the base zone. Do not conflate the two.
 */

import { describe, expect, it } from "bun:test";
import {
  P1,
  P2,
  advancePhase,
  applyMove,
  createCard,
  createMinimalGameState,
  getRunesOnBoard,
  getState,
} from "./helpers";

describe("Rule 159: Rune Pool is a conceptual Energy/Power collection", () => {
  it("adding energy does not create a physical card in any zone", () => {
    const engine = createMinimalGameState({ phase: "main" });
    applyMove(engine, "addResources", { energy: 3, playerId: P1, power: {} });

    const state = getState(engine);
    expect(state.runePools[P1].energy).toBe(3);
    // No rune cards were created just because energy was added.
    expect(getRunesOnBoard(engine, P1)).toHaveLength(0);
  });

  it("rune cards on the board are separate from conceptual Energy counters", () => {
    const engine = createMinimalGameState({ phase: "main" });
    // Create 2 physical rune cards in the runePool zone.
    createCard(engine, "rune-1", {
      cardType: "rune",
      domain: "fury",
      owner: P1,
      zone: "runePool",
    });
    createCard(engine, "rune-2", {
      cardType: "rune",
      domain: "calm",
      owner: P1,
      zone: "runePool",
    });

    // But give the player 0 energy — the counters are independent of cards.
    expect(getState(engine).runePools[P1].energy).toBe(0);
    expect(getRunesOnBoard(engine, P1)).toHaveLength(2);
  });
});

describe("Rule 159.1: Energy/Power is added to the controlling player's pool", () => {
  it("addResources adds to the specified player's pool only", () => {
    const engine = createMinimalGameState({ phase: "main" });
    applyMove(engine, "addResources", {
      energy: 2,
      playerId: P1,
      power: { fury: 1 },
    });

    const state = getState(engine);
    expect(state.runePools[P1].energy).toBe(2);
    expect(state.runePools[P1].power.fury).toBe(1);
    // P2's pool is untouched.
    expect(state.runePools[P2].energy).toBe(0);
    expect(state.runePools[P2].power).toEqual({});
  });
});

describe("Rule 160: Rune Pool empties at end of draw phase AND end of turn", () => {
  it("Rule 515.4.d: energy counter resets to 0 at end of draw phase", () => {
    const engine = createMinimalGameState({
      phase: "draw",
      runePools: { [P1]: { energy: 5, power: {} } },
    });

    advancePhase(engine, "main");

    expect(getState(engine).runePools[P1].energy).toBe(0);
  });

  it("Rule 515.4.d: power counters reset to empty at end of draw phase", () => {
    const engine = createMinimalGameState({
      phase: "draw",
      runePools: { [P1]: { energy: 0, power: { calm: 1, fury: 2 } } },
    });

    advancePhase(engine, "main");

    expect(getState(engine).runePools[P1].power).toEqual({});
  });

  it("Rule 517.2.c: rune pool empties again at end of turn (ending phase)", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 4, power: { fury: 1 } } },
    });

    // Sanity: the override seeded the pool.
    expect(getState(engine).runePools[P1].energy).toBe(4);
    expect(getState(engine).runePools[P1].power.fury).toBe(1);

    advancePhase(engine, "ending");

    // Rule 517.2.c: pool empties at end of turn (ending phase onBegin).
    expect(getState(engine).runePools[P1].energy).toBe(0);
    expect(getState(engine).runePools[P1].power).toEqual({});
  });
});

describe("Rule 160.1: Unspent Energy/Power is lost (not refunded)", () => {
  it("energy does not carry across the draw-phase boundary", () => {
    const engine = createMinimalGameState({
      phase: "draw",
      runePools: { [P1]: { energy: 7, power: { body: 1 } } },
    });

    advancePhase(engine, "main");

    // Rule 160.1: unspent resources are not banked or refunded.
    const state = getState(engine);
    expect(state.runePools[P1].energy).toBe(0);
    expect(state.runePools[P1].power).toEqual({});
  });
});

describe("Rule 154.1.a: Rune cards remain on the Board until Recycled", () => {
  it("rune cards in runePool zone survive draw-phase rune-pool empty", () => {
    const engine = createMinimalGameState({
      phase: "draw",
      runePools: { [P1]: { energy: 3, power: {} } },
    });
    createCard(engine, "rune-a", {
      cardType: "rune",
      domain: "fury",
      owner: P1,
      zone: "runePool",
    });
    createCard(engine, "rune-b", {
      cardType: "rune",
      domain: "fury",
      owner: P1,
      zone: "runePool",
    });
    createCard(engine, "rune-c", {
      cardType: "rune",
      domain: "fury",
      owner: P1,
      zone: "runePool",
    });

    advancePhase(engine, "main");

    // Per rule 159: "empty" refers to the conceptual pool, not the physical
    // Rune cards on the board. All 3 runes should still be present.
    expect(getRunesOnBoard(engine, P1)).toHaveLength(3);
    // And the conceptual energy counter is 0.
    expect(getState(engine).runePools[P1].energy).toBe(0);
  });

  it("rune cards survive end-of-turn rune-pool empty", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createCard(engine, "rune-x", {
      cardType: "rune",
      domain: "mind",
      owner: P1,
      zone: "runePool",
    });
    applyMove(engine, "addResources", { energy: 2, playerId: P1, power: {} });

    advancePhase(engine, "ending");

    expect(getState(engine).runePools[P1].energy).toBe(0);
    expect(getRunesOnBoard(engine, P1)).toHaveLength(1);
  });
});

describe("Rule 154.1: A Rune is not a Main Deck card", () => {
  it("rune cards registered as cardType 'rune' are identifiable", () => {
    const engine = createMinimalGameState();
    createCard(engine, "rune-1", {
      cardType: "rune",
      domain: "fury",
      owner: P1,
      zone: "runePool",
    });

    // GetRunesOnBoard filters by cardType from the registry.
    const runes = getRunesOnBoard(engine, P1);
    expect(runes).toContain("rune-1");
    expect(runes).toHaveLength(1);
  });
});

describe("Rule 156.1: Energy is used to pay numeric Energy costs", () => {
  it("spendResources deducts from the energy counter", () => {
    const engine = createMinimalGameState({ phase: "main" });
    applyMove(engine, "addResources", { energy: 5, playerId: P1, power: {} });
    applyMove(engine, "spendResources", { energy: 3, playerId: P1, power: {} });

    expect(getState(engine).runePools[P1].energy).toBe(2);
  });
});

describe("Rule 156.2: Power is used to pay Domain-associated Power Costs", () => {
  it("adding Fury power increments only the fury counter", () => {
    const engine = createMinimalGameState({ phase: "main" });
    applyMove(engine, "addResources", {
      energy: 0,
      playerId: P1,
      power: { fury: 2 },
    });

    const state = getState(engine);
    expect(state.runePools[P1].power.fury).toBe(2);
    expect(state.runePools[P1].power.calm ?? 0).toBe(0);
  });

  it("domains are tracked independently", () => {
    const engine = createMinimalGameState({ phase: "main" });
    applyMove(engine, "addResources", {
      energy: 0,
      playerId: P1,
      power: { calm: 1, fury: 1, mind: 1 },
    });

    const state = getState(engine);
    expect(state.runePools[P1].power.fury).toBe(1);
    expect(state.runePools[P1].power.calm).toBe(1);
    expect(state.runePools[P1].power.mind).toBe(1);
  });
});

describe("Rule 515.3: Channel phase channels runes from rune deck (integration)", () => {
  // These tests are deferred to Wave 2 because the channel phase reads from
  // A real runeDeck zone populated by the `initializeRuneDeck` setup move;
  // The rules-audit helpers deliberately skip deck construction.
  it.todo("Rule 515.3: Channel phase channels 2 runes per turn (needs runeDeck setup)");
  it.todo(
    "Rule 644.7: second player channels 3 runes on their first turn (needs initializeRuneDeck)",
  );
});

describe("Rule 594: Recycle action moves a card to the bottom of its deck", () => {
  // Recycle is a game action with multiple shapes. Wave 2 will cover most
  // Of these because they require deck-construction setup and move-level
  // Integration.
  it.todo("Rule 594: Recycle moves a rune card to the bottom of the runeDeck");
  it.todo("Rule 154.2.b: recycled runes return to the Rune Deck (not Main Deck)");
});

describe("Rule 157.2: Basic Runes have tap-for-energy and recycle-for-power", () => {
  it.todo(
    "Rule 157.2.a: basic rune tap ability adds 1 energy to the pool (needs activated ability pipeline)",
  );
  it.todo("Rule 157.2.b: basic rune recycle ability adds 1 matching-domain power to the pool");
});

describe("Rule 606: Channeling action (moves a rune from runeDeck to base)", () => {
  it.todo("Rule 606.1: channeling moves a rune from the top of the rune deck to the Board");
  it.todo("Rule 606.3.a: players can only channel when a game effect directs them to");
});
