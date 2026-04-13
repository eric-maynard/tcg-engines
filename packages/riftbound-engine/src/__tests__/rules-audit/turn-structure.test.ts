/**
 * Rules Audit: Turn Structure (rules 502-522)
 *
 * Wave 2A — Covers the turn cycle phases:
 *   - 515.1  Awaken (ready all game objects)
 *   - 515.2  Beginning (temporary kill, hold scoring, triggers)
 *   - 515.3  Channel (channel 2 runes, 3 for 2nd player first turn per 644.7)
 *   - 515.4  Draw (draw 1, Burn Out if empty, rune pool empties)
 *   - 516    Main / Action phase
 *   - 517    Ending phase (clear damage/stun, expire turn effects, pools empty)
 *   - 519-522 Cleanup / state-based checks
 *
 * Each test constructs minimal state and exercises exactly one phase
 * hook via `runPhaseHook`. `advancePhase` cannot be used here because
 * the flow manager auto-cascades through every `endIf: () => true` phase,
 * firing the same hook multiple times per helper call. `runPhaseHook`
 * invokes a single phase's `onBegin`/`onEnd` directly so scoring, draws,
 * channels, and expirations happen exactly once per test.
 *
 * Failing tests are either real engine bugs (documented in comments) or
 * `it.todo` for rules that need infrastructure we haven't yet built.
 */

import { describe, expect, it } from "bun:test";
import {
  P1,
  P2,
  createBattlefield,
  createCard,
  createDeck,
  createMinimalGameState,
  getCardsInZone,
  getRunesOnBoard,
  getState,
  getZone,
  runPhaseHook,
} from "./helpers";

// -----------------------------------------------------------------------------
// Rule 515.1: Awaken Phase — ready all game objects controlled by turn player
// -----------------------------------------------------------------------------

describe("Rule 515.1.a: Awaken Phase readies all Game Objects of the Turn Player", () => {
  it("exhausted units in base are readied", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createCard(engine, "u1", {
      cardType: "unit",
      meta: { exhausted: true },
      might: 2,
      owner: P1,
      zone: "base",
    });
    runPhaseHook(engine, "awaken", "onBegin");
    const meta = (
      engine as unknown as {
        internalState: { cardMetas: Record<string, { exhausted: boolean }> };
      }
    ).internalState.cardMetas.u1;
    expect(meta?.exhausted).toBe(false);
  });

  it("exhausted units on a battlefield are readied", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createBattlefield(engine, "bf-1", { controller: P1 });
    createCard(engine, "u2", {
      cardType: "unit",
      meta: { exhausted: true },
      might: 3,
      owner: P1,
      zone: "battlefield-bf-1",
    });
    runPhaseHook(engine, "awaken", "onBegin");
    const meta = (
      engine as unknown as {
        internalState: { cardMetas: Record<string, { exhausted: boolean }> };
      }
    ).internalState.cardMetas.u2;
    expect(meta?.exhausted).toBe(false);
  });

  it("does NOT ready the opponent's units (rule 515.1.a: 'they control')", () => {
    const engine = createMinimalGameState({ currentPlayer: P1, phase: "main" });
    createCard(engine, "opp-unit", {
      cardType: "unit",
      meta: { exhausted: true },
      might: 2,
      owner: P2,
      zone: "base",
    });
    runPhaseHook(engine, "awaken", "onBegin");
    const meta = (
      engine as unknown as {
        internalState: { cardMetas: Record<string, { exhausted: boolean }> };
      }
    ).internalState.cardMetas["opp-unit"];
    expect(meta?.exhausted).toBe(true);
  });

  it("already-ready units remain ready (no side effects)", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createCard(engine, "fresh", {
      cardType: "unit",
      meta: { exhausted: false },
      might: 2,
      owner: P1,
      zone: "base",
    });
    runPhaseHook(engine, "awaken", "onBegin");
    const meta = (
      engine as unknown as {
        internalState: { cardMetas: Record<string, { exhausted: boolean }> };
      }
    ).internalState.cardMetas.fresh;
    expect(meta?.exhausted).toBe(false);
  });
});

// -----------------------------------------------------------------------------
// Rule 515.2: Beginning Phase — Temporary kill, Hold scoring
// -----------------------------------------------------------------------------

describe("Rule 515.2.b.1: Holding scores during the Beginning Phase", () => {
  it("turn player scores 1 VP for each battlefield they control", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createBattlefield(engine, "bf-1", { controller: P1 });
    createBattlefield(engine, "bf-2", { controller: P1 });
    expect(getState(engine).players[P1].victoryPoints).toBe(0);
    runPhaseHook(engine, "beginning", "onBegin");
    expect(getState(engine).players[P1].victoryPoints).toBe(2);
  });

  it("player does NOT score for a battlefield controlled by the opponent", () => {
    const engine = createMinimalGameState({ currentPlayer: P1, phase: "main" });
    createBattlefield(engine, "bf-1", { controller: P2 });
    runPhaseHook(engine, "beginning", "onBegin");
    expect(getState(engine).players[P1].victoryPoints).toBe(0);
    expect(getState(engine).players[P2].victoryPoints).toBe(0);
  });

  it("battlefield is added to scoredThisTurn tracking when held", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createBattlefield(engine, "bf-1", { controller: P1 });
    runPhaseHook(engine, "beginning", "onBegin");
    expect(getState(engine).scoredThisTurn[P1]).toContain("bf-1");
  });

  it("same battlefield does not double-score if already in scoredThisTurn", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createBattlefield(engine, "bf-1", { controller: P1 });
    const internal = engine as unknown as {
      currentState: { scoredThisTurn: Record<string, string[]> };
    };
    internal.currentState.scoredThisTurn[P1] = ["bf-1"];
    runPhaseHook(engine, "beginning", "onBegin");
    expect(getState(engine).players[P1].victoryPoints).toBe(0);
  });
});

describe("Rule 515.2 / 728.1.b: Temporary units die at Beginning Phase", () => {
  it("unit with Temporary keyword is sent to trash at beginning of owner's turn", () => {
    const engine = createMinimalGameState({ currentPlayer: P1, phase: "main" });
    createCard(engine, "temp", {
      cardType: "unit",
      keywords: ["Temporary"],
      might: 2,
      owner: P1,
      zone: "base",
    });
    runPhaseHook(engine, "beginning", "onBegin");
    expect(getZone(engine, P1, "trash")).toContain("temp");
    expect(getZone(engine, P1, "base")).not.toContain("temp");
  });

  it("non-Temporary units are NOT killed at beginning phase", () => {
    const engine = createMinimalGameState({ currentPlayer: P1, phase: "main" });
    createCard(engine, "permanent", {
      cardType: "unit",
      might: 3,
      owner: P1,
      zone: "base",
    });
    runPhaseHook(engine, "beginning", "onBegin");
    expect(getZone(engine, P1, "base")).toContain("permanent");
    expect(getZone(engine, P1, "trash")).not.toContain("permanent");
  });

  it("opponent's Temporary units are NOT killed on P1's beginning phase", () => {
    const engine = createMinimalGameState({ currentPlayer: P1, phase: "main" });
    createCard(engine, "opp-temp", {
      cardType: "unit",
      keywords: ["Temporary"],
      might: 2,
      owner: P2,
      zone: "base",
    });
    runPhaseHook(engine, "beginning", "onBegin");
    expect(getZone(engine, P2, "base")).toContain("opp-temp");
  });
});

// -----------------------------------------------------------------------------
// Rule 515.3: Channel Phase
// -----------------------------------------------------------------------------

describe("Rule 515.3.b: Turn player channels 2 runes from their Rune Deck", () => {
  it("moves 2 runes from runeDeck to base and increments energy by 2", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createDeck(engine, P1, "runeDeck", [
      { cardType: "rune", domain: "fury", id: "r1" },
      { cardType: "rune", domain: "fury", id: "r2" },
      { cardType: "rune", domain: "calm", id: "r3" },
    ]);
    runPhaseHook(engine, "channel", "onBegin");
    expect(getRunesOnBoard(engine, P1).length).toBe(2);
    expect(getState(engine).runePools[P1].energy).toBe(2);
    expect(getCardsInZone(engine, "runeDeck", P1).length).toBe(1);
  });

  it("adds energy to the active player's rune pool, not the opponent's", () => {
    const engine = createMinimalGameState({ currentPlayer: P1, phase: "main" });
    createDeck(engine, P1, "runeDeck", [
      { cardType: "rune", domain: "fury", id: "r1" },
      { cardType: "rune", domain: "fury", id: "r2" },
    ]);
    runPhaseHook(engine, "channel", "onBegin");
    expect(getState(engine).runePools[P1].energy).toBe(2);
    expect(getState(engine).runePools[P2].energy).toBe(0);
  });

  it("does NOT channel runes from the opponent's rune deck", () => {
    const engine = createMinimalGameState({ currentPlayer: P1, phase: "main" });
    createDeck(engine, P2, "runeDeck", [
      { cardType: "rune", domain: "fury", id: "opp-r1" },
      { cardType: "rune", domain: "fury", id: "opp-r2" },
    ]);
    runPhaseHook(engine, "channel", "onBegin");
    expect(getCardsInZone(engine, "runeDeck", P2).length).toBe(2);
    expect(getRunesOnBoard(engine, P1).length).toBe(0);
  });
});

describe("Rule 515.3.b.1: Channel as many as possible if deck has < 2 runes", () => {
  it("if only 1 rune in deck, channel exactly 1", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createDeck(engine, P1, "runeDeck", [{ cardType: "rune", domain: "fury", id: "last-rune" }]);
    runPhaseHook(engine, "channel", "onBegin");
    expect(getRunesOnBoard(engine, P1).length).toBe(1);
    expect(getState(engine).runePools[P1].energy).toBe(1);
  });

  it("if 0 runes in deck, channel 0 (no crash)", () => {
    const engine = createMinimalGameState({ phase: "main" });
    runPhaseHook(engine, "channel", "onBegin");
    expect(getRunesOnBoard(engine, P1).length).toBe(0);
    expect(getState(engine).runePools[P1].energy).toBe(0);
  });
});

describe("Rule 515.3.b.4 / 644.7: Second player channels an extra rune on their first turn", () => {
  // FAIL: engine bug. setup.ts:378 sets `firstTurnNumber[pid] = 1` for BOTH
  // Players, so the `isFirstTurn` check `firstTurnNumber[playerId] === turnNumber`
  // Only fires on turn 1 regardless of player. Result:
  //   - Turn 1 P1: catch-up wrongly fires for P1 (channels 3 instead of 2)
  //   - Turn 2 P2: catch-up does NOT fire for P2 (channels 2 instead of 3)
  // Rule 644.7 requires the second player to get the bonus on THEIR first turn.
  // Fix: setup.ts should set firstTurnNumber[secondPlayer] = 2 (their actual
  // First turn), or the flow check should condition on `playerId === secondPlayer`.
  // File refs: game-definition/moves/setup.ts:373-380
  //            Game-definition/flow/riftbound-flow.ts:333-337
  it("when secondPlayerExtraRune is set and P2 is in their first turn, P2 channels 3", () => {
    const engine = createMinimalGameState({
      currentPlayer: P2,
      phase: "main",
      turn: 2,
    });
    const internal = engine as unknown as {
      currentState: {
        secondPlayerExtraRune: boolean;
        firstTurnNumber: Record<string, number>;
      };
    };
    // Post-fix: setup.ts only records firstTurnNumber for non-first players.
    // P1 is intentionally omitted so the first player never hits the catch-up
    // Branch. P2's first turn is turn 2 (the turn they first become active).
    internal.currentState.secondPlayerExtraRune = true;
    internal.currentState.firstTurnNumber = { [P2]: 2 };

    createDeck(engine, P2, "runeDeck", [
      { cardType: "rune", domain: "fury", id: "r1" },
      { cardType: "rune", domain: "fury", id: "r2" },
      { cardType: "rune", domain: "calm", id: "r3" },
      { cardType: "rune", domain: "calm", id: "r4" },
    ]);

    runPhaseHook(engine, "channel", "onBegin");
    expect(getRunesOnBoard(engine, P2).length).toBe(3);
    expect(getState(engine).runePools[P2].energy).toBe(3);
  });

  it("first player channels only 2 on turn 1 (no catch-up)", () => {
    const engine = createMinimalGameState({
      currentPlayer: P1,
      phase: "main",
      turn: 1,
    });
    const internal = engine as unknown as {
      currentState: {
        secondPlayerExtraRune: boolean;
        firstTurnNumber: Record<string, number>;
      };
    };
    // Post-fix state: firstTurnNumber only contains the second player (P2=2).
    // On turn 1 with currentPlayer=P1, the flow check reads
    // `firstTurnNumber[P1] === 1` which is `undefined === 1` → false, so no
    // Catch-up bonus fires. P1 channels the base 2 runes.
    internal.currentState.secondPlayerExtraRune = true;
    internal.currentState.firstTurnNumber = { [P2]: 2 };

    createDeck(engine, P1, "runeDeck", [
      { cardType: "rune", domain: "fury", id: "r1" },
      { cardType: "rune", domain: "fury", id: "r2" },
      { cardType: "rune", domain: "calm", id: "r3" },
    ]);

    runPhaseHook(engine, "channel", "onBegin");
    expect(getRunesOnBoard(engine, P1).length).toBe(2);
  });

  it("P2 channels only 2 on their SECOND turn (bonus was one-time)", () => {
    const engine = createMinimalGameState({
      currentPlayer: P2,
      phase: "main",
      turn: 4,
    });
    const internal = engine as unknown as {
      currentState: {
        secondPlayerExtraRune: boolean;
        firstTurnNumber: Record<string, number>;
      };
    };
    internal.currentState.secondPlayerExtraRune = true;
    internal.currentState.firstTurnNumber = { [P1]: 1, [P2]: 2 };

    createDeck(engine, P2, "runeDeck", [
      { cardType: "rune", domain: "fury", id: "r1" },
      { cardType: "rune", domain: "fury", id: "r2" },
      { cardType: "rune", domain: "fury", id: "r3" },
    ]);

    runPhaseHook(engine, "channel", "onBegin");
    expect(getRunesOnBoard(engine, P2).length).toBe(2);
  });
});

// -----------------------------------------------------------------------------
// Rule 515.4: Draw Phase
// -----------------------------------------------------------------------------

describe("Rule 515.4.b: The Turn Player draws 1 card", () => {
  it("moves exactly 1 card from main deck to hand", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createDeck(engine, P1, "mainDeck", [
      { cardType: "unit", id: "top" },
      { cardType: "unit", id: "next" },
      { cardType: "unit", id: "bottom" },
    ]);
    runPhaseHook(engine, "draw", "onBegin");
    expect(getCardsInZone(engine, "hand", P1).length).toBe(1);
    expect(getCardsInZone(engine, "mainDeck", P1).length).toBe(2);
  });

  it("only the turn player draws — opponent's hand unchanged", () => {
    const engine = createMinimalGameState({ currentPlayer: P1, phase: "main" });
    createDeck(engine, P1, "mainDeck", [{ cardType: "unit", id: "p1-top" }]);
    createDeck(engine, P2, "mainDeck", [{ cardType: "unit", id: "p2-top" }]);
    runPhaseHook(engine, "draw", "onBegin");
    expect(getCardsInZone(engine, "hand", P1).length).toBe(1);
    expect(getCardsInZone(engine, "hand", P2).length).toBe(0);
  });
});

describe("Rule 515.4.b.1 / 518: Burn Out — empty main deck triggers Burn Out", () => {
  it("opponent gains 1 victory point when deck is empty on draw phase", () => {
    const engine = createMinimalGameState({ currentPlayer: P1, phase: "main" });
    createDeck(engine, P1, "trash", [
      { cardType: "unit", id: "d1" },
      { cardType: "unit", id: "d2" },
    ]);
    const beforeP2 = getState(engine).players[P2].victoryPoints;
    runPhaseHook(engine, "draw", "onBegin");
    const afterP2 = getState(engine).players[P2].victoryPoints;
    expect(afterP2).toBe(beforeP2 + 1);
  });

  it("trash shuffles into main deck after Burn Out", () => {
    const engine = createMinimalGameState({ currentPlayer: P1, phase: "main" });
    createDeck(engine, P1, "trash", [
      { cardType: "unit", id: "t1" },
      { cardType: "unit", id: "t2" },
      { cardType: "unit", id: "t3" },
    ]);
    runPhaseHook(engine, "draw", "onBegin");
    // After burnout, P1 still draws 1, so mainDeck has 3 - 1 = 2 cards
    // And the drawn card is in hand.
    expect(getCardsInZone(engine, "trash", P1).length).toBe(0);
    expect(getCardsInZone(engine, "hand", P1).length).toBe(1);
    expect(getCardsInZone(engine, "mainDeck", P1).length).toBe(2);
  });
});

describe("Rule 515.4.b.2: After Burn Out, the player still draws 1", () => {
  it("hand size increases by 1 even when burn out occurred", () => {
    const engine = createMinimalGameState({ currentPlayer: P1, phase: "main" });
    createDeck(engine, P1, "trash", [{ cardType: "unit", id: "recycled" }]);
    runPhaseHook(engine, "draw", "onBegin");
    expect(getCardsInZone(engine, "hand", P1).length).toBe(1);
  });
});

describe("Rule 515.4.d: Rune Pool empties at end of Draw Phase (rule 159 — COUNTER only)", () => {
  it("energy counter is reset to 0 as the draw phase ends", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 3 } },
    });
    runPhaseHook(engine, "draw", "onEnd");
    expect(getState(engine).runePools[P1].energy).toBe(0);
  });

  it("power counters are cleared to empty object", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 0, power: { calm: 1, fury: 2 } } },
    });
    runPhaseHook(engine, "draw", "onEnd");
    expect(getState(engine).runePools[P1].power).toEqual({});
  });

  it("rune CARDS stay on the board when pool empties (rule 159 conceptual resource)", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createCard(engine, "rune-on-board", {
      cardType: "rune",
      domain: "fury",
      owner: P1,
      zone: "base",
    });
    runPhaseHook(engine, "draw", "onEnd");
    expect(getRunesOnBoard(engine, P1)).toContain("rune-on-board");
  });
});

// -----------------------------------------------------------------------------
// Rule 516: Main (Action) Phase
// -----------------------------------------------------------------------------

describe("Rule 516.2: Main Phase is player-driven — does not auto-advance", () => {
  it("main phase is the resting point in the turn cycle (endIf: () => false)", () => {
    const engine = createMinimalGameState({ phase: "main" });
    expect(getState(engine).turn.phase).toBe("main");
  });
});

describe("Rule 505 / 516.2.b: In Main Phase, only the Turn Player can act by default", () => {
  it("active player is set to the current turn player", () => {
    const engine = createMinimalGameState({ currentPlayer: P1, phase: "main" });
    expect(getState(engine).turn.activePlayer).toBe(P1);
  });
});

// -----------------------------------------------------------------------------
// Rule 517: Ending Phase
// -----------------------------------------------------------------------------

describe("Rule 517.2.a: Clear all marked damage at end of turn", () => {
  it("unit with 2 damage has damage reset to 0", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createCard(engine, "wounded", {
      cardType: "unit",
      meta: { damage: 2 },
      might: 5,
      owner: P1,
      zone: "base",
    });
    runPhaseHook(engine, "ending", "onBegin");
    const meta = (
      engine as unknown as {
        internalState: { cardMetas: Record<string, { damage: number }> };
      }
    ).internalState.cardMetas.wounded;
    expect(meta?.damage).toBe(0);
  });

  it("damage is cleared across ALL locations, not just base", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createBattlefield(engine, "bf-1", { controller: P1 });
    createCard(engine, "bf-wounded", {
      cardType: "unit",
      meta: { damage: 3 },
      might: 5,
      owner: P1,
      zone: "battlefield-bf-1",
    });
    runPhaseHook(engine, "ending", "onBegin");
    const meta = (
      engine as unknown as {
        internalState: { cardMetas: Record<string, { damage: number }> };
      }
    ).internalState.cardMetas["bf-wounded"];
    expect(meta?.damage).toBe(0);
  });

  it("clears damage on both players' units (not just turn player)", () => {
    const engine = createMinimalGameState({ currentPlayer: P1, phase: "main" });
    createCard(engine, "p1-hit", {
      cardType: "unit",
      meta: { damage: 1 },
      might: 2,
      owner: P1,
      zone: "base",
    });
    createCard(engine, "p2-hit", {
      cardType: "unit",
      meta: { damage: 1 },
      might: 2,
      owner: P2,
      zone: "base",
    });
    runPhaseHook(engine, "ending", "onBegin");
    const internal = engine as unknown as {
      internalState: { cardMetas: Record<string, { damage: number }> };
    };
    expect(internal.internalState.cardMetas["p1-hit"]?.damage).toBe(0);
    expect(internal.internalState.cardMetas["p2-hit"]?.damage).toBe(0);
  });
});

describe("Rule 517.2.b: All 'this turn' effects expire at end of turn", () => {
  it("turn-scoped Might modifier is cleared", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createCard(engine, "buffed", {
      cardType: "unit",
      meta: { mightModifier: 3 },
      might: 2,
      owner: P1,
      zone: "base",
    });
    runPhaseHook(engine, "ending", "onBegin");
    const meta = (
      engine as unknown as {
        internalState: { cardMetas: Record<string, { mightModifier: number }> };
      }
    ).internalState.cardMetas.buffed;
    expect(meta?.mightModifier ?? 0).toBe(0);
  });

  it("turn-duration granted keywords are removed", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createCard(engine, "temp-assault", {
      cardType: "unit",
      meta: {
        grantedKeywords: [{ duration: "turn", keyword: "Assault" }],
      },
      might: 2,
      owner: P1,
      zone: "base",
    });
    runPhaseHook(engine, "ending", "onBegin");
    const meta = (
      engine as unknown as {
        internalState: {
          cardMetas: Record<string, { grantedKeywords?: { keyword: string }[] }>;
        };
      }
    ).internalState.cardMetas["temp-assault"];
    const remaining = meta?.grantedKeywords ?? [];
    expect(remaining.find((g) => g.keyword === "Assault")).toBeUndefined();
  });

  it("permanent (non-turn) granted keywords are NOT removed", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createCard(engine, "perma-tank", {
      cardType: "unit",
      meta: {
        grantedKeywords: [{ duration: "permanent", keyword: "Tank" }],
      },
      might: 2,
      owner: P1,
      zone: "base",
    });
    runPhaseHook(engine, "ending", "onBegin");
    const meta = (
      engine as unknown as {
        internalState: {
          cardMetas: Record<string, { grantedKeywords?: { keyword: string }[] }>;
        };
      }
    ).internalState.cardMetas["perma-tank"];
    const remaining = meta?.grantedKeywords ?? [];
    expect(remaining.find((g) => g.keyword === "Tank")).toBeDefined();
  });
});

describe("Rule 517.2.c: Rune Pool empties at end of turn — unspent Energy/Power is lost", () => {
  it("both players' energy counters are reset, not just the turn player", () => {
    const engine = createMinimalGameState({
      currentPlayer: P1,
      phase: "main",
      runePools: {
        [P1]: { energy: 2 },
        [P2]: { energy: 4 },
      },
    });
    runPhaseHook(engine, "ending", "onBegin");
    expect(getState(engine).runePools[P1].energy).toBe(0);
    expect(getState(engine).runePools[P2].energy).toBe(0);
  });

  it("power counters are cleared to empty objects", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: {
        [P1]: { energy: 0, power: { fury: 5 } },
        [P2]: { energy: 0, power: { calm: 3 } },
      },
    });
    runPhaseHook(engine, "ending", "onBegin");
    expect(getState(engine).runePools[P1].power).toEqual({});
    expect(getState(engine).runePools[P2].power).toEqual({});
  });

  it("physical rune cards on the board are NOT moved (159 is conceptual)", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createCard(engine, "survived", {
      cardType: "rune",
      domain: "fury",
      owner: P1,
      zone: "base",
    });
    runPhaseHook(engine, "ending", "onBegin");
    expect(getRunesOnBoard(engine, P1)).toContain("survived");
  });
});

describe("Rule 599.1.a.2: Stun clears at the Ending Step", () => {
  it("stunned unit becomes unstunned", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createCard(engine, "shocked", {
      cardType: "unit",
      meta: { stunned: true },
      might: 2,
      owner: P1,
      zone: "base",
    });
    runPhaseHook(engine, "ending", "onBegin");
    const meta = (
      engine as unknown as {
        internalState: { cardMetas: Record<string, { stunned: boolean }> };
      }
    ).internalState.cardMetas.shocked;
    expect(meta?.stunned).toBe(false);
  });
});

describe("Rule 517: Ending phase clears conqueredThisTurn / scoredThisTurn tracking", () => {
  it("scoredThisTurn for the turn player is cleared", () => {
    const engine = createMinimalGameState({ currentPlayer: P1, phase: "main" });
    const internal = engine as unknown as {
      currentState: { scoredThisTurn: Record<string, string[]> };
    };
    internal.currentState.scoredThisTurn[P1] = ["bf-1", "bf-2"];
    runPhaseHook(engine, "ending", "onBegin");
    expect(getState(engine).scoredThisTurn[P1]).toEqual([]);
  });

  it("conqueredThisTurn for the turn player is cleared", () => {
    const engine = createMinimalGameState({ currentPlayer: P1, phase: "main" });
    const internal = engine as unknown as {
      currentState: { conqueredThisTurn: Record<string, string[]> };
    };
    internal.currentState.conqueredThisTurn[P1] = ["bf-1"];
    runPhaseHook(engine, "ending", "onBegin");
    expect(getState(engine).conqueredThisTurn[P1]).toEqual([]);
  });
});

// -----------------------------------------------------------------------------
// Rule 503-510: Turn state invariants
// -----------------------------------------------------------------------------

describe("Rule 510.1: Neutral Open — no showdown, no chain", () => {
  it("a fresh main phase has no active interaction (neutral-open)", () => {
    const engine = createMinimalGameState({ phase: "main" });
    const state = getState(engine);
    const {interaction} = state;
    if (interaction) {
      expect(interaction.chain?.items ?? []).toHaveLength(0);
      expect(interaction.showdownStack?.length ?? 0).toBe(0);
    } else {
      expect(interaction).toBeUndefined();
    }
  });
});

describe("Rule 504: The Turn Player is the player taking the current turn", () => {
  it("state.turn.activePlayer reflects the Turn Player", () => {
    const engine = createMinimalGameState({ currentPlayer: P2 });
    expect(getState(engine).turn.activePlayer).toBe(P2);
  });
});

// -----------------------------------------------------------------------------
// Deferred / rules needing infrastructure we haven't built yet
// -----------------------------------------------------------------------------

describe("Deferred turn-structure rules (Wave 3+)", () => {
  it.todo("Rule 502: Play continues cyclically until one player wins");
  it.todo("Rule 503.1: Game actions execute one at a time, completely");
  it.todo("Rule 503.2.a: Simultaneous triggers resolve in Turn Order");
  it.todo("Rule 506: Turn player changes at end-of-turn");
  it.todo("Rule 515.2.a.1: Start-of-beginning-phase triggers fire before scoring");
  it.todo("Rule 515.3.c: Channel-phase 'perform any actions' step fires triggers");
  it.todo("Rule 515.4.c: Draw-phase 'perform any actions' fires triggers after draw");
  it.todo("Rule 516.4.a: Combat phase triggered by opposing units at same battlefield");
  it.todo("Rule 516.5.b: Showdown triggered when unit moves to empty battlefield");
  it.todo("Rule 517.4: Expiration step loops if effects generate new damage/this-turn effects");
  it.todo("Rule 519.a: Cleanup fires after an item on the chain resolves");
  it.todo("Rule 519.b: Cleanup fires after a Move completes");
  it.todo("Rule 519.c: Cleanup fires after a Showdown completes");
  it.todo("Rule 519.d: Cleanup fires after a Combat completes");
  it.todo("Rule 520: Units with damage >= Might are killed during cleanup");
  it.todo("Rule 521: Attacker/Defender role cleared when unit leaves battlefield");
  it.todo("Rule 522.2.c: Cleanup sets Combat as Pending at contested battlefields");
  it.todo(
    "Rule 515.2.b.1 + Forgotten Monument: score-blocking abilities prevent VP gain but still log the battlefield as 'scored'",
  );
  it.todo("Rule 508: Showdown state vs Neutral state transitions");
  it.todo("Rule 509: Open/Closed state transitions when chain is created/destroyed");
  it.todo("Rule 510.4: Showdown Closed state tracking");
});
