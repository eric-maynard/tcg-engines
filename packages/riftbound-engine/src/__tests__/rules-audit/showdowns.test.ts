/**
 * Rules Audit: Showdowns (rules 545-553, 548.2, 516.5)
 *
 * Wave 2C — covers ~31 rule index entries mapped to showdowns.test.ts.
 *
 * Key Riftbound showdown rules:
 *   - Rule 546: A Showdown is a window where Relevant Players play Spells in
 *     alternating order.
 *   - Rule 548: A Showdown begins when a Battlefield becomes Contested and
 *     the turn is in Neutral Open.
 *   - Rule 548.1: If contested between two players → Showdown as Combat step.
 *   - Rule 548.2: If contested against an uncontrolled battlefield → Showdown
 *     opens during Cleanup at the end of the Move (this is the "non-combat
 *     showdown" path, also cited in rule 516.5.b).
 *   - Rule 549: Player who applied Contested status gains Focus.
 *   - Rule 550: Relevant Players depend on how the Showdown began.
 *   - Rule 553.4: When all Relevant Players have passed once in sequence,
 *     the Showdown ends.
 *
 * These tests exercise the `chain-state` state machine directly and the
 * `standardMove` / `contestBattlefield` engine moves to prove that
 * non-combat showdowns open correctly when units move to an empty bf.
 */

import { describe, expect, it } from "bun:test";
import {
  P1,
  P2,
  applyMove,
  createBattlefield,
  createCard,
  createMinimalGameState,
  getInteractionState,
  getState,
} from "./helpers";
import {
  addToChain,
  createInteractionState,
  endShowdown,
  getActiveShowdown,
  getTurnState,
  isLegalTiming,
  isShowdownEnded,
  passFocus,
  startShowdown,
} from "../../chain/chain-state";

// ===========================================================================
// Rule 546: Showdown is a Window of Opportunity
// ===========================================================================

describe("Rule 546: Showdown gives Relevant Players an Open State to play spells", () => {
  it("starting a showdown sets the top-of-stack showdown to active", () => {
    const state = createInteractionState();
    const withShowdown = startShowdown(state, "bf-1", P1, [P1, P2], false);
    const sd = getActiveShowdown(withShowdown);
    expect(sd).not.toBeNull();
    expect(sd?.active).toBe(true);
    expect(sd?.battlefieldId).toBe("bf-1");
  });

  it("turn state becomes 'showdown-open' while a showdown is active with no chain", () => {
    const state = createInteractionState();
    const withShowdown = startShowdown(state, "bf-1", P1, [P1, P2], false);
    expect(getTurnState(withShowdown)).toBe("showdown-open");
  });
});

describe("Rule 546.1: Each spell played during a showdown creates a Chain", () => {
  it("adding a spell item to chain transitions showdown-open → showdown-closed", () => {
    let state = createInteractionState();
    state = startShowdown(state, "bf-1", P1, [P1, P2], false);
    state = addToChain(state, { cardId: "spell-1", controller: P1, type: "spell" }, [P1, P2]);
    expect(getTurnState(state)).toBe("showdown-closed");
  });
});

describe("Rule 546.2: Players made Relevant remain so until the Showdown ends", () => {
  it("relevant players persist on the showdown stack", () => {
    let state = createInteractionState();
    state = startShowdown(state, "bf-1", P1, [P1, P2], false);
    // Pass focus once — the showdown should still track both as relevant
    state = passFocus(state);
    const sd = getActiveShowdown(state);
    expect(sd?.relevantPlayers).toEqual([P1, P2]);
  });
});

// ===========================================================================
// Rule 547: Turn state is partially determined by showdown in progress
// ===========================================================================

describe("Rule 547.1: Turn is in Showdown State if a Showdown is in progress", () => {
  it("no showdown, no chain → neutral-open", () => {
    const state = createInteractionState();
    expect(getTurnState(state)).toBe("neutral-open");
  });

  it("showdown active, no chain → showdown-open", () => {
    let state = createInteractionState();
    state = startShowdown(state, "bf-1", P1, [P1, P2], false);
    expect(getTurnState(state)).toBe("showdown-open");
  });

  it("showdown active, chain has items → showdown-closed", () => {
    let state = createInteractionState();
    state = startShowdown(state, "bf-1", P1, [P1, P2], false);
    state = addToChain(state, { cardId: "spell-1", controller: P1, type: "spell" }, [P1, P2]);
    expect(getTurnState(state)).toBe("showdown-closed");
  });
});

describe("Rule 547.1.a: Cards of all categories cannot be played during Showdown State by default", () => {
  it("action-timing spells are NOT legal in a closed state", () => {
    // Neutral Closed: only reaction is legal
    expect(isLegalTiming("action", "neutral-closed")).toBe(false);
    expect(isLegalTiming("reaction", "neutral-closed")).toBe(true);
  });

  it("action-timing spells ARE legal during showdown-open (rule 546 overrides 547.1.a default)", () => {
    // Per rule 546 the showdown itself defines an open state where spells can
    // Be played — the "cannot be played" restriction is subject to showdown
    // Rules.
    expect(isLegalTiming("action", "showdown-open")).toBe(true);
    expect(isLegalTiming("reaction", "showdown-open")).toBe(true);
  });
});

describe("Rule 547.2: Neutral State when no Showdown is in progress", () => {
  it("no showdown → turn state starts with 'neutral-' prefix", () => {
    const state = createInteractionState();
    expect(getTurnState(state).startsWith("neutral-")).toBe(true);
  });
});

// ===========================================================================
// Rule 548: A Showdown begins when a Battlefield becomes Contested
// ===========================================================================

describe("Rule 548: A Showdown begins when Control of a Battlefield is Contested in Neutral Open", () => {
  it("startShowdown with isCombatShowdown=true marks the showdown as a combat showdown", () => {
    let state = createInteractionState();
    state = startShowdown(state, "bf-1", P1, [P1, P2], true, P1, P2);
    const sd = getActiveShowdown(state);
    expect(sd?.isCombatShowdown).toBe(true);
    expect(sd?.attackingPlayer).toBe(P1);
    expect(sd?.defendingPlayer).toBe(P2);
  });
});

describe("Rule 548.1: Two-player contested battlefield → Showdown as a step of Combat", () => {
  it("combat-initiated showdown carries attacker and defender information", () => {
    let state = createInteractionState();
    state = startShowdown(state, "bf-1", P1, [P1, P2], true, P1, P2);
    const sd = getActiveShowdown(state);
    expect(sd?.attackingPlayer).toBe(P1);
    expect(sd?.defendingPlayer).toBe(P2);
    expect(sd?.isCombatShowdown).toBe(true);
  });
});

// ===========================================================================
// Rule 548.2 / 516.5.b: Non-combat showdown from empty-battlefield move
// ===========================================================================

describe("Rule 548.2 / 516.5.b: Move to uncontrolled empty battlefield opens a Showdown during Cleanup", () => {
  it("unit moves to uncontrolled battlefield → interaction state has an active showdown", () => {
    const engine = createMinimalGameState({ currentPlayer: P1, phase: "main" });
    createBattlefield(engine, "bf-empty", { controller: null });
    createCard(engine, "scout", {
      cardType: "unit",
      might: 2,
      owner: P1,
      zone: "base",
    });

    const result = applyMove(engine, "standardMove", {
      destination: "bf-empty",
      playerId: P1,
      unitIds: ["scout"],
    });
    expect(result.success).toBe(true);

    const interaction = getInteractionState(engine);
    const sd = interaction ? getActiveShowdown(interaction) : null;
    expect(sd).not.toBeNull();
    expect(sd?.active).toBe(true);
    expect(sd?.battlefieldId).toBe("bf-empty");
    // Non-combat: isCombatShowdown should be false
    expect(sd?.isCombatShowdown).toBe(false);
  });

  it("non-combat showdown blocks immediate conquer (rule 548.2)", () => {
    const engine = createMinimalGameState({ currentPlayer: P1, phase: "main" });
    createBattlefield(engine, "bf-empty", { controller: null });
    createCard(engine, "scout", {
      cardType: "unit",
      might: 2,
      owner: P1,
      zone: "base",
    });

    applyMove(engine, "standardMove", {
      destination: "bf-empty",
      playerId: P1,
      unitIds: ["scout"],
    });

    // Attempt to conquer: should be blocked while the showdown is open
    const conquerResult = applyMove(engine, "conquerBattlefield", {
      battlefieldId: "bf-empty",
      playerId: P1,
    });
    expect(conquerResult.success).toBe(false);
  });

  it("moving to a battlefield the active player ALREADY controls does not open a new showdown", () => {
    const engine = createMinimalGameState({ currentPlayer: P1, phase: "main" });
    createBattlefield(engine, "bf-home", { controller: P1 });
    createCard(engine, "reinforcement", {
      cardType: "unit",
      might: 2,
      owner: P1,
      zone: "base",
    });

    applyMove(engine, "standardMove", {
      destination: "bf-home",
      playerId: P1,
      unitIds: ["reinforcement"],
    });

    const interaction = getInteractionState(engine);
    const sd = interaction ? getActiveShowdown(interaction) : null;
    expect(sd?.active ?? false).toBe(false);
  });
});

// ===========================================================================
// Rule 549: Focus to the player who applied Contested status
// ===========================================================================

describe("Rule 549: The player who applied Contested gains Focus when Showdown begins", () => {
  it("startShowdown assigns focus to the specified player", () => {
    let state = createInteractionState();
    state = startShowdown(state, "bf-1", P1, [P1, P2], true, P1, P2);
    const sd = getActiveShowdown(state);
    expect(sd?.focusPlayer).toBe(P1);
  });

  it("in a non-combat move showdown, the moving player has Focus", () => {
    const engine = createMinimalGameState({ currentPlayer: P1, phase: "main" });
    createBattlefield(engine, "bf-1", { controller: null });
    createCard(engine, "u1", {
      cardType: "unit",
      might: 1,
      owner: P1,
      zone: "base",
    });
    applyMove(engine, "standardMove", {
      destination: "bf-1",
      playerId: P1,
      unitIds: ["u1"],
    });

    const interaction = getInteractionState(engine);
    const sd = interaction ? getActiveShowdown(interaction) : null;
    expect(sd?.focusPlayer).toBe(P1);
  });
});

// ===========================================================================
// Rule 550: Relevant Players depend on how the Showdown began
// ===========================================================================

describe("Rule 550.1: Combat-initiated showdown → Attacker + Defender are Relevant", () => {
  it("relevantPlayers for combat showdown contains both attacker and defender", () => {
    let state = createInteractionState();
    state = startShowdown(state, "bf-1", P1, [P1, P2], true, P1, P2);
    const sd = getActiveShowdown(state);
    expect(sd?.relevantPlayers).toEqual([P1, P2]);
  });
});

describe("Rule 550.2: Non-combat showdown → all players are Relevant", () => {
  it("non-combat move showdown sets both players as relevant", () => {
    const engine = createMinimalGameState({ currentPlayer: P1, phase: "main" });
    createBattlefield(engine, "bf-1", { controller: null });
    createCard(engine, "u1", {
      cardType: "unit",
      might: 1,
      owner: P1,
      zone: "base",
    });
    applyMove(engine, "standardMove", {
      destination: "bf-1",
      playerId: P1,
      unitIds: ["u1"],
    });

    const interaction = getInteractionState(engine);
    const sd = interaction ? getActiveShowdown(interaction) : null;
    expect(sd?.relevantPlayers).toEqual(expect.arrayContaining([P1, P2]));
    expect(sd?.relevantPlayers?.length).toBe(2);
  });
});

// ===========================================================================
// Rule 551: Initial Chain (combat showdowns only)
// ===========================================================================

describe("Rule 551: Showdowns may or may not begin with an Initial Chain", () => {
  it("a newly-started showdown has no chain by default", () => {
    let state = createInteractionState();
    state = startShowdown(state, "bf-1", P1, [P1, P2], true, P1, P2);
    expect(state.chain).toBeNull();
  });

  it.todo(
    "Rule 551.1: Combat-initiated showdown populates 'When I attack'/'When I defend' triggers to initial chain",
  );
  it.todo("Rule 551.1.a: Focus player orders their triggered abilities first, then turn order");
});

// ===========================================================================
// Rule 552: When last chain item resolves, Focus passes
// ===========================================================================

describe("Rule 552: When the last chain item resolves, Focus passes to the next Relevant Player", () => {
  it.todo(
    "Rule 552: After a chain resolves inside a showdown, focus advances to the next relevant player",
  );
});

// ===========================================================================
// Rule 553: Actions available to the Focus player
// ===========================================================================

describe("Rule 553: During a Showdown, Focus player may play spell / activate ability / pass", () => {
  it.todo("Rule 553.1: Playing a legally-timed spell starts a new chain inside the showdown");
  it.todo("Rule 553.2: Focus player may activate legally-timed abilities of game objects");
  it.todo("Rule 553.3: Focus player may 'invite' another player to act — invited gets focus");
});

// ===========================================================================
// Rule 553.4.a: Showdown ends when all relevant players pass in sequence
// ===========================================================================

describe("Rule 553.4.a: If all Relevant Players have passed once in sequence, the Showdown ends", () => {
  it("two players each pass once in sequence → showdown ends", () => {
    let state = createInteractionState();
    state = startShowdown(state, "bf-1", P1, [P1, P2], false);

    // P1 passes focus
    state = passFocus(state);
    expect(isShowdownEnded(state)).toBe(false);

    // P2 passes focus
    state = passFocus(state);
    expect(isShowdownEnded(state)).toBe(true);
  });

  it("single-pass does not end the showdown (both must pass)", () => {
    let state = createInteractionState();
    state = startShowdown(state, "bf-1", P1, [P1, P2], false);
    state = passFocus(state);
    const sd = getActiveShowdown(state);
    // Active flag unchanged until ALL have passed
    expect(sd?.active).toBe(true);
  });

  it("after all pass, showdown's passedPlayers contains both players", () => {
    let state = createInteractionState();
    state = startShowdown(state, "bf-1", P1, [P1, P2], false);
    state = passFocus(state);
    state = passFocus(state);
    const sd = getActiveShowdown(state);
    expect(sd?.passedPlayers).toEqual(expect.arrayContaining([P1, P2]));
  });
});

// ===========================================================================
// Rule 553.5: Focus passes to next Relevant Player in Turn Order
// ===========================================================================

describe("Rule 553.5: After passing (without ending), Focus goes to next Relevant Player", () => {
  it("P1 passes → P2 gets focus", () => {
    let state = createInteractionState();
    state = startShowdown(state, "bf-1", P1, [P1, P2], false);
    state = passFocus(state);
    const sd = getActiveShowdown(state);
    expect(sd?.focusPlayer).toBe(P2);
  });
});

// ===========================================================================
// EndShowdown clears the top-of-stack showdown
// ===========================================================================

describe("endShowdown: removes the top-of-stack showdown", () => {
  it("after endShowdown the stack is empty (no active showdown)", () => {
    let state = createInteractionState();
    state = startShowdown(state, "bf-1", P1, [P1, P2], false);
    state = endShowdown(state);
    expect(getActiveShowdown(state)).toBeNull();
  });

  it("endShowdown on an empty stack is a no-op", () => {
    const state = createInteractionState();
    const after = endShowdown(state);
    expect(after.showdownStack).toEqual([]);
  });
});

// ===========================================================================
// Nested showdowns (rare, but supported by stack)
// ===========================================================================

describe("Showdown stack: nested showdowns are supported", () => {
  it("starting a second showdown pushes onto the stack without ending the first", () => {
    let state = createInteractionState();
    state = startShowdown(state, "bf-1", P1, [P1, P2], false);
    state = startShowdown(state, "bf-2", P2, [P1, P2], false);
    // Top-of-stack = bf-2
    expect(getActiveShowdown(state)?.battlefieldId).toBe("bf-2");
    // Ending bf-2 exposes bf-1 again
    state = endShowdown(state);
    expect(getActiveShowdown(state)?.battlefieldId).toBe("bf-1");
  });
});

// ===========================================================================
// Interaction with conquer: showdown must resolve first
// ===========================================================================

describe("Rule 548.2 integration: Conquer is gated on showdown completion", () => {
  it("conquerBattlefield's condition rejects while a showdown at that bf is active", () => {
    const engine = createMinimalGameState({ currentPlayer: P1, phase: "main" });
    createBattlefield(engine, "bf-1", { controller: null });
    createCard(engine, "u1", {
      cardType: "unit",
      might: 2,
      owner: P1,
      zone: "base",
    });

    applyMove(engine, "standardMove", {
      destination: "bf-1",
      playerId: P1,
      unitIds: ["u1"],
    });

    // Showdown should now be open → conquer blocked
    const attempt = applyMove(engine, "conquerBattlefield", {
      battlefieldId: "bf-1",
      playerId: P1,
    });
    expect(attempt.success).toBe(false);

    // State: battlefield still uncontrolled, no VP granted
    const state = getState(engine);
    expect(state.battlefields["bf-1"].controller).toBeNull();
    expect(state.players[P1].victoryPoints).toBe(0);
  });
});

// ===========================================================================
// Multiple battlefields: showdown opens only at the targeted bf
// ===========================================================================

describe("Showdown scope: a showdown only applies to the battlefield it opened at", () => {
  it("showdown at bf-1 does not block conquer at an unrelated bf-2", () => {
    const engine = createMinimalGameState({ currentPlayer: P1, phase: "main" });
    createBattlefield(engine, "bf-1", { controller: null });
    createBattlefield(engine, "bf-2", { controller: null });
    createCard(engine, "u1", {
      cardType: "unit",
      might: 2,
      owner: P1,
      zone: "base",
    });
    createCard(engine, "u2", {
      cardType: "unit",
      might: 2,
      owner: P1,
      zone: "battlefield-bf-2", // Already on bf-2, no opponents there
    });

    // Move to bf-1 opens a showdown there
    applyMove(engine, "standardMove", {
      destination: "bf-1",
      playerId: P1,
      unitIds: ["u1"],
    });

    // Conquer at bf-2 (unrelated) should still be legal
    const conquerBf2 = applyMove(engine, "conquerBattlefield", {
      battlefieldId: "bf-2",
      playerId: P1,
    });
    expect(conquerBf2.success).toBe(true);
  });
});

// ===========================================================================
// Rule 516.5 / 516.5.b: Showdowns caused by move vs combat
// ===========================================================================

describe("Rule 516.5.b: A Move to an empty battlefield opens a non-combat Showdown", () => {
  it("standardMove to uncontrolled bf opens showdown with isCombatShowdown=false", () => {
    const engine = createMinimalGameState({ currentPlayer: P1, phase: "main" });
    createBattlefield(engine, "bf-1", { controller: null });
    createCard(engine, "u1", {
      cardType: "unit",
      might: 2,
      owner: P1,
      zone: "base",
    });

    applyMove(engine, "standardMove", {
      destination: "bf-1",
      playerId: P1,
      unitIds: ["u1"],
    });

    const interaction = getInteractionState(engine);
    const sd = interaction ? getActiveShowdown(interaction) : null;
    expect(sd?.isCombatShowdown).toBe(false);
  });
});

// ===========================================================================
// Deferred rules (Wave 3+)
// ===========================================================================

describe("Deferred showdown rules (Wave 3+)", () => {
  it.todo("Rule 546.1 detail: Chain created inside showdown alternates between Relevant Players");
  it.todo("Rule 547.1.b: Card abilities cannot be played during Showdown State by default");
  it.todo("Rule 550.1.a: Players may become Relevant during the course of showdown play");
  it.todo("Rule 551.1.a.1: Triggered abilities from other players become Relevant and order");
  it.todo("Rule 551.1.b: No triggered abilities → no initial chain, showdown still proceeds");
});
