/**
 * Chain & Showdown System Tests
 *
 * Tests the spell stack (chain) and combat window (showdown) state machine.
 */

import { describe, expect, test } from "bun:test";
import {
  addToChain,
  allPlayersPassed,
  createInteractionState,
  endShowdown,
  getActiveShowdown,
  getTurnState,
  isLegalTiming,
  isShowdownEnded,
  passFocus,
  passPriority,
  resetShowdownPasses,
  resolveTopItem,
  startShowdown,
} from "../chain";
import type { TurnInteractionState } from "../chain";

const P1 = "player-1";
const P2 = "player-2";
const TURN_ORDER = [P1, P2];

describe("Turn State Detection (rule 510)", () => {
  test("neutral-open: no showdown, no chain", () => {
    const state = createInteractionState();
    expect(getTurnState(state)).toBe("neutral-open");
  });

  test("neutral-closed: no showdown, chain active", () => {
    let state = createInteractionState();
    state = addToChain(
      state,
      {
        cardId: "spell-1",
        controller: P1,
        type: "spell",
      },
      TURN_ORDER,
    );
    expect(getTurnState(state)).toBe("neutral-closed");
  });

  test("showdown-open: showdown active, no chain", () => {
    let state = createInteractionState();
    state = startShowdown(state, "bf-1", P1, [P1, P2], true, P1, P2);
    expect(getTurnState(state)).toBe("showdown-open");
  });

  test("showdown-closed: showdown + chain active", () => {
    let state = createInteractionState();
    state = startShowdown(state, "bf-1", P1, [P1, P2], true, P1, P2);
    state = addToChain(
      state,
      {
        cardId: "spell-1",
        controller: P1,
        type: "spell",
      },
      TURN_ORDER,
    );
    expect(getTurnState(state)).toBe("showdown-closed");
  });
});

describe("Spell Timing Legality (rules 535, 546)", () => {
  test("Reaction is always legal", () => {
    expect(isLegalTiming("reaction", "neutral-open")).toBe(true);
    expect(isLegalTiming("reaction", "neutral-closed")).toBe(true);
    expect(isLegalTiming("reaction", "showdown-open")).toBe(true);
    expect(isLegalTiming("reaction", "showdown-closed")).toBe(true);
  });

  test("Action is legal in open states", () => {
    expect(isLegalTiming("action", "neutral-open")).toBe(true);
    expect(isLegalTiming("action", "showdown-open")).toBe(true);
  });

  test("Action is NOT legal in closed states", () => {
    expect(isLegalTiming("action", "neutral-closed")).toBe(false);
    expect(isLegalTiming("action", "showdown-closed")).toBe(false);
  });
});

describe("Chain: Basic Operations (rules 532-537)", () => {
  test("adding a spell creates a chain", () => {
    let state = createInteractionState();
    state = addToChain(
      state,
      {
        cardId: "fireball",
        controller: P1,
        type: "spell",
      },
      TURN_ORDER,
    );

    expect(state.chain).not.toBeNull();
    expect(state.chain!.active).toBe(true);
    expect(state.chain!.items).toHaveLength(1);
    expect(state.chain!.items[0].cardId).toBe("fireball");
    expect(state.chain!.activePlayer).toBe(P1);
  });

  test("adding a permanent does NOT create a chain (rule 538)", () => {
    let state = createInteractionState();
    state = addToChain(
      state,
      {
        cardId: "unit-1",
        controller: P1,
        type: "permanent",
      },
      TURN_ORDER,
    );

    expect(state.chain).toBeNull();
  });

  test("multiple spells stack (LIFO)", () => {
    let state = createInteractionState();
    state = addToChain(
      state,
      {
        cardId: "spell-A",
        controller: P1,
        type: "spell",
      },
      TURN_ORDER,
    );
    state = addToChain(
      state,
      {
        cardId: "spell-B",
        controller: P2,
        type: "spell",
      },
      TURN_ORDER,
    );

    expect(state.chain!.items).toHaveLength(2);
    expect(state.chain!.items[0].cardId).toBe("spell-A");
    expect(state.chain!.items[1].cardId).toBe("spell-B");
  });

  test("adding to chain resets passes", () => {
    let state = createInteractionState();
    state = addToChain(
      state,
      {
        cardId: "spell-A",
        controller: P1,
        type: "spell",
      },
      TURN_ORDER,
    );
    state = passPriority(state);

    // P1 passed, now add a Reaction
    state = addToChain(
      state,
      {
        cardId: "reaction-B",
        controller: P2,
        type: "spell",
      },
      TURN_ORDER,
    );

    expect(state.chain!.passedPlayers).toHaveLength(0);
  });
});

describe("Chain: Priority Passing (rules 540.4)", () => {
  test("passing moves priority to next relevant player", () => {
    let state = createInteractionState();
    state = addToChain(
      state,
      {
        cardId: "spell-1",
        controller: P1,
        type: "spell",
      },
      TURN_ORDER,
    );

    expect(state.chain!.activePlayer).toBe(P1);
    state = passPriority(state);
    expect(state.chain!.activePlayer).toBe(P2);
  });

  test("all players passing signals chain resolution (rule 540.4.b)", () => {
    let state = createInteractionState();
    state = addToChain(
      state,
      {
        cardId: "spell-1",
        controller: P1,
        type: "spell",
      },
      TURN_ORDER,
    );

    state = passPriority(state); // P1 passes
    state = passPriority(state); // P2 passes

    expect(allPlayersPassed(state)).toBe(true);
  });

  test("not all passed if only one player passed", () => {
    let state = createInteractionState();
    state = addToChain(
      state,
      {
        cardId: "spell-1",
        controller: P1,
        type: "spell",
      },
      TURN_ORDER,
    );

    state = passPriority(state); // P1 passes

    expect(allPlayersPassed(state)).toBe(false);
  });
});

describe("Chain: Resolution (rules 543-544)", () => {
  test("resolves top item (LIFO)", () => {
    let state = createInteractionState();
    state = addToChain(state, { cardId: "A", controller: P1, type: "spell" }, TURN_ORDER);
    state = addToChain(state, { cardId: "B", controller: P2, type: "spell" }, TURN_ORDER);

    const { resolved, newState } = resolveTopItem(state);
    expect(resolved!.cardId).toBe("B"); // Last in, first resolved
    expect(newState.chain!.items).toHaveLength(1);
    expect(newState.chain!.items[0].cardId).toBe("A");
  });

  test("resolving last item empties the chain", () => {
    let state = createInteractionState();
    state = addToChain(state, { cardId: "A", controller: P1, type: "spell" }, TURN_ORDER);

    const { resolved, newState } = resolveTopItem(state);
    expect(resolved!.cardId).toBe("A");
    expect(newState.chain).toBeNull(); // Chain gone
  });

  test("after resolving, passes reset (rule 543.4)", () => {
    let state = createInteractionState();
    state = addToChain(state, { cardId: "A", controller: P1, type: "spell" }, TURN_ORDER);
    state = addToChain(state, { cardId: "B", controller: P2, type: "spell" }, TURN_ORDER);

    // Both pass
    state = passPriority(state);
    state = passPriority(state);

    // Resolve top
    const { newState } = resolveTopItem(state);
    expect(newState.chain!.passedPlayers).toHaveLength(0); // Reset
  });

  test("full chain lifecycle: play → pass → pass → resolve → repeat", () => {
    let state = createInteractionState();

    // P1 plays a spell
    state = addToChain(state, { cardId: "fireball", controller: P1, type: "spell" }, TURN_ORDER);
    expect(getTurnState(state)).toBe("neutral-closed");

    // P2 responds with a Reaction
    state = addToChain(state, { cardId: "counter", controller: P2, type: "spell" }, TURN_ORDER);
    expect(state.chain!.items).toHaveLength(2);

    // Both pass priority
    state = passPriority(state); // P2 passes
    state = passPriority(state); // P1 passes
    expect(allPlayersPassed(state)).toBe(true);

    // Resolve top: counter resolves first
    let result = resolveTopItem(state);
    expect(result.resolved!.cardId).toBe("counter");
    state = result.newState;

    // Both pass again
    state = passPriority(state);
    state = passPriority(state);

    // Resolve: fireball resolves
    result = resolveTopItem(state);
    expect(result.resolved!.cardId).toBe("fireball");
    state = result.newState;

    // Chain is empty
    expect(state.chain).toBeNull();
    expect(getTurnState(state)).toBe("neutral-open");
  });
});

describe("Showdown: Basic Operations (rules 545-553)", () => {
  test("starting a showdown", () => {
    let state = createInteractionState();
    state = startShowdown(state, "bf-1", P1, [P1, P2], true, P1, P2);

    const showdown = getActiveShowdown(state);
    expect(showdown).not.toBeNull();
    expect(showdown!.active).toBe(true);
    expect(showdown!.battlefieldId).toBe("bf-1");
    expect(showdown!.focusPlayer).toBe(P1);
    expect(showdown!.isCombatShowdown).toBe(true);
    expect(getTurnState(state)).toBe("showdown-open");
  });

  test("passing focus moves to next relevant player (rule 553.5)", () => {
    let state = createInteractionState();
    state = startShowdown(state, "bf-1", P1, [P1, P2], true);

    expect(getActiveShowdown(state)!.focusPlayer).toBe(P1);
    state = passFocus(state);
    expect(getActiveShowdown(state)!.focusPlayer).toBe(P2);
  });

  test("all players passing ends showdown (rule 553.4.a)", () => {
    let state = createInteractionState();
    state = startShowdown(state, "bf-1", P1, [P1, P2], true);

    state = passFocus(state); // P1 passes
    state = passFocus(state); // P2 passes

    expect(isShowdownEnded(state)).toBe(true);
  });

  test("playing a spell during showdown resets passes", () => {
    let state = createInteractionState();
    state = startShowdown(state, "bf-1", P1, [P1, P2], true);

    state = passFocus(state); // P1 passes focus
    // P2 plays a spell instead of passing
    state = resetShowdownPasses(state);
    state = addToChain(
      state,
      { cardId: "combat-trick", controller: P2, type: "spell" },
      TURN_ORDER,
    );

    expect(getActiveShowdown(state)!.passedPlayers).toHaveLength(0);
    expect(getTurnState(state)).toBe("showdown-closed");
  });

  test("ending a showdown cleans up state", () => {
    let state = createInteractionState();
    state = startShowdown(state, "bf-1", P1, [P1, P2], true);
    state = endShowdown(state);

    expect(getActiveShowdown(state)).toBeNull();
    expect(state.showdownStack).toHaveLength(0);
    expect(getTurnState(state)).toBe("neutral-open");
  });
});

describe("Showdown + Chain Interaction", () => {
  test("full showdown with chain: spell → respond → resolve → pass → combat", () => {
    let state = createInteractionState();

    // 1. Showdown starts (units at contested battlefield)
    state = startShowdown(state, "bf-1", P1, [P1, P2], true, P1, P2);
    expect(getTurnState(state)).toBe("showdown-open");

    // 2. P1 (focus) plays an Action spell → creates chain
    state = resetShowdownPasses(state);
    state = addToChain(state, { cardId: "buff-spell", controller: P1, type: "spell" }, TURN_ORDER);
    expect(getTurnState(state)).toBe("showdown-closed");

    // 3. P2 responds with Reaction
    state = addToChain(
      state,
      { cardId: "counter-spell", controller: P2, type: "spell" },
      TURN_ORDER,
    );

    // 4. Both pass chain priority
    state = passPriority(state);
    state = passPriority(state);
    expect(allPlayersPassed(state)).toBe(true);

    // 5. Resolve counter-spell (top of stack)
    let result = resolveTopItem(state);
    state = result.newState;
    expect(result.resolved!.cardId).toBe("counter-spell");

    // 6. Both pass again
    state = passPriority(state);
    state = passPriority(state);

    // 7. Resolve buff-spell
    result = resolveTopItem(state);
    state = result.newState;
    expect(result.resolved!.cardId).toBe("buff-spell");

    // 8. Chain is empty, back to showdown-open
    expect(state.chain).toBeNull();
    expect(getTurnState(state)).toBe("showdown-open");

    // 9. Focus passes back (P1 played, so focus should have moved)
    // For this test, P1 still has focus
    state = passFocus(state); // P1 passes focus
    state = passFocus(state); // P2 passes focus

    // 10. All passed → showdown ends → combat occurs
    expect(isShowdownEnded(state)).toBe(true);
    state = endShowdown(state);
    expect(getTurnState(state)).toBe("neutral-open");
  });
});

describe("Triggered Abilities on Chain (rule 541)", () => {
  test("triggered abilities can be added to existing chain", () => {
    let state = createInteractionState();
    state = addToChain(state, { cardId: "spell-1", controller: P1, type: "spell" }, TURN_ORDER);

    // A triggered ability fires
    state = addToChain(
      state,
      {
        cardId: "trigger-source",
        controller: P2,
        triggered: true,
        type: "ability",
      },
      TURN_ORDER,
    );

    expect(state.chain!.items).toHaveLength(2);
    expect(state.chain!.items[1].triggered).toBe(true);
  });

  // Task 2, edge case 2: a triggered ability queued DURING resolution of another
  // Triggered ability must go on top of the chain (LIFO — last in, resolves first).
  test("triggered ability added during resolution goes on top of chain (LIFO)", () => {
    let state = createInteractionState();
    // Spell on chain
    state = addToChain(state, { cardId: "spell-1", controller: P1, type: "spell" }, TURN_ORDER);
    // Trigger from spell going on
    state = addToChain(
      state,
      { cardId: "trigger-1", controller: P2, triggered: true, type: "ability" },
      TURN_ORDER,
    );
    // A second trigger fires while trigger-1 is on the chain
    state = addToChain(
      state,
      { cardId: "trigger-2", controller: P1, triggered: true, type: "ability" },
      TURN_ORDER,
    );

    // Trigger-2 is the most recent item — must be at index 2 (top of LIFO stack)
    expect(state.chain!.items).toHaveLength(3);
    expect(state.chain!.items[2]!.cardId).toBe("trigger-2");

    // Resolve: trigger-2 should resolve first
    const { resolved: first } = resolveTopItem(state);
    expect(first!.cardId).toBe("trigger-2");
  });

  // Task 2, edge case 1: two triggered abilities from the same event fire in
  // APNAP (turn-player) order. The turn player's trigger is added first, so it
  // Sits at a lower index. With LIFO resolution the NON-turn-player's trigger
  // (added second, higher index) resolves first — then the turn player's.
  // This matches rule 585.2: turn player's triggers are *placed* first, meaning
  // They end up underneath (resolve last of the two).
  test("two simultaneous triggers: addToChain in APNAP order → LIFO resolves opponent trigger first", () => {
    let state = createInteractionState();
    // Add base spell to open the chain
    state = addToChain(state, { cardId: "event-spell", controller: P1, type: "spell" }, TURN_ORDER);

    // P1 is turn player — add P1's trigger first per rule 585.2
    state = addToChain(
      state,
      { cardId: "p1-trigger", controller: P1, triggered: true, type: "ability" },
      TURN_ORDER,
    );
    // Then P2 (non-active player) trigger
    state = addToChain(
      state,
      { cardId: "p2-trigger", controller: P2, triggered: true, type: "ability" },
      TURN_ORDER,
    );

    expect(state.chain!.items).toHaveLength(3);
    // P2's trigger is on top (index 2)
    expect(state.chain!.items[2]!.cardId).toBe("p2-trigger");
    // P1's trigger is beneath (index 1)
    expect(state.chain!.items[1]!.cardId).toBe("p1-trigger");
  });

  // Task 2, edge case 3: passChainPriority with an empty / inactive chain
  // Should no-op gracefully without throwing.
  test("passPriority with no active chain is a graceful no-op", () => {
    const state = createInteractionState();
    // No chain active — should return unchanged state, not throw
    const result = passPriority(state);
    expect(result.chain).toBeNull();
    expect(result).toEqual(state);
  });

  // Additional: passing priority with both players on an empty-chain-ready state
  // Resolves correctly (all passed → chain item popped gracefully).
  test("resolveTopItem on empty chain returns null and null chain", () => {
    const state = createInteractionState();
    const { resolved, newState } = resolveTopItem(state);
    expect(resolved).toBeNull();
    expect(newState.chain).toBeNull();
  });
});
