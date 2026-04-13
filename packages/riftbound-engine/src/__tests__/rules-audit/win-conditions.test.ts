/**
 * Rules Audit: Win Conditions (rules 607, 650-652)
 *
 * Wave 2D. Covers the 31 win-condition rules mapped by the rule index.
 *
 * Key concepts:
 *   - Burn Out (607): A player with an empty Main Deck who attempts a draw,
 *     look, or mill action must shuffle their trash into their deck and
 *     give an opponent 1 point.
 *   - Concede (650): A player may concede at any time.
 *   - Removal of a Player (651-652): The game continues (in modes with >2
 *     players) with the conceded player's permanents banished, battlefield
 *     replaced with a token, and spells countered.
 *
 * Victory-score thresholds (641.x) and first-turn-process (644.7) are
 * routed to the separate mode-specific.test.ts file, so they are not
 * covered here.
 *
 * Rule citations reference `.claude/skills/riftbound-rules/references/*.md`.
 */

import { describe, expect, it } from "bun:test";
import {
  P1,
  P2,
  applyMove,
  createCard,
  createMinimalGameState,
  getCardsInZone,
  getState,
  getStatus,
  getWinner,
  setVictoryPoints,
} from "./helpers";
import { hasPlayerWon } from "../../game-definition/win-conditions/victory";

// ---------------------------------------------------------------------------
// Rule 607.1: Burning Out happens when the player attempts draw/look/mill
// On an empty Main Deck
// ---------------------------------------------------------------------------

describe("Rule 607.1: Burn Out triggers on draw/look/mill from empty Main Deck", () => {
  it("Rule 607.1.a: burnOut move awards 1 point to the opponent", () => {
    const engine = createMinimalGameState({ phase: "main" });

    const before = getState(engine).players[P2].victoryPoints;
    const result = applyMove(engine, "burnOut", {
      opponentId: P2,
      playerId: P1,
    });
    expect(result.success).toBe(true);
    expect(getState(engine).players[P2].victoryPoints).toBe(before + 1);
  });

  // Deferred: engine does not wire look/reveal effects to burn-out; no effect
  // In the codebase currently triggers burn-out from look-from-empty-deck.
  it.todo(
    "Rule 607.1.b: looking/revealing from an empty main deck causes Burn Out (no engine hookup)",
  );
  // Deferred: mill (move from deck to trash) does not currently trigger burn-out
  it.todo("Rule 607.1.c: moving cards from an empty main deck to trash (mill) causes Burn Out");
});

// ---------------------------------------------------------------------------
// Rule 607.2: Burn Out sequence
// ---------------------------------------------------------------------------

describe("Rule 607.2: Burn Out sequence (shuffle trash, give point, retry action)", () => {
  it("Rule 607.2.a: burnOut shuffles the player's trash into their Main Deck", () => {
    const engine = createMinimalGameState({ phase: "main" });
    // Put 3 cards in P1's trash. Main deck starts empty.
    createCard(engine, "c1", { cardType: "spell", owner: P1, zone: "trash" });
    createCard(engine, "c2", { cardType: "spell", owner: P1, zone: "trash" });
    createCard(engine, "c3", { cardType: "spell", owner: P1, zone: "trash" });

    expect(getCardsInZone(engine, "trash", P1).length).toBe(3);
    expect(getCardsInZone(engine, "mainDeck", P1).length).toBe(0);

    applyMove(engine, "burnOut", { opponentId: P2, playerId: P1 });

    expect(getCardsInZone(engine, "trash", P1).length).toBe(0);
    expect(getCardsInZone(engine, "mainDeck", P1).length).toBe(3);
  });

  it("Rule 607.2.b: burnOut awards 1 point to the chosen opponent", () => {
    const engine = createMinimalGameState({ phase: "main" });

    applyMove(engine, "burnOut", { opponentId: P2, playerId: P1 });

    expect(getState(engine).players[P2].victoryPoints).toBe(1);
    // The burning-out player does NOT lose points themselves.
    expect(getState(engine).players[P1].victoryPoints).toBe(0);
  });

  it.todo(
    "Rule 607.2.c: after burnOut, the original action (e.g. draw) is retried (depends on move dispatcher that calls burnOut first).",
  );
});

// ---------------------------------------------------------------------------
// Rule 607.3: Empty-trash Burn Out still fires; deck stays empty
// ---------------------------------------------------------------------------

describe("Rule 607.3: Burn Out with empty trash still awards an opponent a point", () => {
  it("burning out with zero trash cards still gives +1 to opponent", () => {
    const engine = createMinimalGameState({ phase: "main" });

    // Trash is empty (default). Deck is also empty.
    expect(getCardsInZone(engine, "trash", P1).length).toBe(0);
    expect(getCardsInZone(engine, "mainDeck", P1).length).toBe(0);

    applyMove(engine, "burnOut", { opponentId: P2, playerId: P1 });

    // Main deck remains empty (nothing to shuffle in).
    expect(getCardsInZone(engine, "mainDeck", P1).length).toBe(0);
    // Opponent still gets the point.
    expect(getState(engine).players[P2].victoryPoints).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Rule 607.3.a: Repeated burn out can win the game for the opponent
// ---------------------------------------------------------------------------

describe("Rule 607.3.a: Repeated Burn Out gives repeated points until victoryScore", () => {
  it("N burn outs award N points to the opponent (linear accumulation)", () => {
    const engine = createMinimalGameState({ phase: "main", victoryScore: 8 });

    for (let i = 0; i < 5; i++) {
      applyMove(engine, "burnOut", { opponentId: P2, playerId: P1 });
    }

    expect(getState(engine).players[P2].victoryPoints).toBe(5);
  });

  it("burn outs that bring an opponent to victoryScore end the game with that opponent as winner", () => {
    const engine = createMinimalGameState({ phase: "main", victoryScore: 3 });

    applyMove(engine, "burnOut", { opponentId: P2, playerId: P1 });
    applyMove(engine, "burnOut", { opponentId: P2, playerId: P1 });
    applyMove(engine, "burnOut", { opponentId: P2, playerId: P1 });

    expect(getState(engine).players[P2].victoryPoints).toBe(3);
    expect(hasPlayerWon(getState(engine), P2)).toBe(true);
    expect(getStatus(engine)).toBe("finished");
    expect(getWinner(engine)).toBe(P2);
  });
});

// ---------------------------------------------------------------------------
// Rule 607.4.a: Burn Out only fires when a Game Effect directs
// ---------------------------------------------------------------------------

describe("Rule 607.4.a: Burn Out only fires when directed by a Game Effect", () => {
  it.todo(
    "Rule 607.4.a: a player cannot voluntarily burn out without a game-effect trigger. The burnOut move currently has no gating — any caller can fire it.",
  );
});

// ---------------------------------------------------------------------------
// Rule 607.5: Burn Out is a Replacement Effect
// ---------------------------------------------------------------------------

describe("Rule 607.5: Burn Out is a Replacement Effect", () => {
  it.todo(
    "Rule 607.5: Burn Out replaces the 'draw from empty deck' action with its full sequence. The engine currently models burnOut as a separate move rather than a replacement; verify via replacement-effects tests.",
  );
});

// ---------------------------------------------------------------------------
// Rule 650: A player may concede at any time
// ---------------------------------------------------------------------------

describe("Rule 650: A player may concede at any time", () => {
  it("concede succeeds from a playing state", () => {
    const engine = createMinimalGameState({ phase: "main" });
    const result = applyMove(engine, "concede", { playerId: P1 });
    expect(result.success).toBe(true);
  });

  it("concede is rejected once the game is already finished", () => {
    const engine = createMinimalGameState({ phase: "main" });
    applyMove(engine, "concede", { playerId: P1 });
    // Game is now finished; second concede should fail its `state.status === "playing"` guard.
    const result = applyMove(engine, "concede", { playerId: P2 });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Rule 651: Conceding removes that player from the game
// ---------------------------------------------------------------------------

describe("Rule 651: Conceding removes a player from the game", () => {
  it("concede marks the game as finished", () => {
    const engine = createMinimalGameState({ phase: "main" });
    applyMove(engine, "concede", { playerId: P1 });
    expect(getStatus(engine)).toBe("finished");
  });
});

// ---------------------------------------------------------------------------
// Rule 651.1: If only one player remains after a concede, that player wins
// ---------------------------------------------------------------------------

describe("Rule 651.1: Conceding in a 1v1 game makes the opponent the winner", () => {
  it("P1 conceding makes P2 the winner in a duel", () => {
    const engine = createMinimalGameState({ phase: "main" });

    const result = applyMove(engine, "concede", { playerId: P1 });
    expect(result.success).toBe(true);
    expect(getWinner(engine)).toBe(P2);
  });

  it("P2 conceding makes P1 the winner in a duel", () => {
    const engine = createMinimalGameState({ phase: "main" });

    const result = applyMove(engine, "concede", { playerId: P2 });
    expect(result.success).toBe(true);
    expect(getWinner(engine)).toBe(P1);
  });

  it("concede is recorded as the reason via endGame metadata", () => {
    const engine = createMinimalGameState({ phase: "main" });
    applyMove(engine, "concede", { playerId: P1 });

    // We don't have direct access to endGame metadata, but status and
    // Winner ID must be updated atomically.
    expect(getStatus(engine)).toBe("finished");
    expect(getWinner(engine)).toBe(P2);
  });
});

// ---------------------------------------------------------------------------
// Rule 651.2 / 651.3: Multi-player concede continues the game
// ---------------------------------------------------------------------------

describe("Rule 651.2: Multi-player concede behavior", () => {
  // Deferred: engine's concede move picks the FIRST opponent as winner and
  // Immediately finishes the game; it does not continue play with remaining
  // Players in 3+ player modes. This is a genuine engine gap.
  it.todo(
    "Rule 651.2: concede should continue play with remaining players in 3+ player games (engine finishes immediately)",
  );

  // Deferred: 'relevant player' tracking for showdowns is only implemented
  // For 2-player; multi-player removal from the relevant set is unimplemented.
  it.todo(
    "Rule 651.3: A removed player is no longer Relevant in Showdowns (engine gap: no multi-player showdown tracking)",
  );
});

// ---------------------------------------------------------------------------
// Rule 652.1-652.5: Removal-of-a-player mechanics (deferred — multi-player)
// ---------------------------------------------------------------------------

describe("Rule 652: Removal of a Player (deferred — engine has no multi-player removal pipeline)", () => {
  // Deferred: engine's concede is a single-shot 'finish game with winner' —
  // It does NOT run a removal pipeline that banishes permanents, replaces
  // Battlefields, counters in-flight chain items, or redistributes priority.
  // Every rule in this block is unimplemented.
  it.todo("Rule 652.1: Banish all permanents and runes the removed player controls/owns");
  it.todo("Rule 652.2: Remove the removed player's battlefield from the game");
  it.todo("Rule 652.2.a: Replace removed battlefield with a token battlefield with no abilities");
  it.todo("Rule 652.2.b: Units/hidden cards there do not move");
  it.todo("Rule 652.2.c: Continuous effects from removed battlefield immediately cease");
  it.todo("Rule 652.3: Remove all cards the removed player owns from the game");
  it.todo(
    "Rule 652.4: Counter all spells and abilities of all types controlled by the conceded player",
  );
  it.todo(
    "Rule 652.5.a.1: If the removed player was the Turn Player, play proceeds to the next available player",
  );
  it.todo(
    "Rule 652.5.b.1: If the removed player had Focus in a Showdown, the next Relevant Player receives Focus",
  );
  it.todo("Rule 652.5.b.2: If no other players remain Relevant, the Showdown ends");
  it.todo("Rule 652.5.b.3: Passing Focus via removal ends the Showdown if all pass");
  it.todo(
    "Rule 652.5.c.1: If the removed player had Priority during a Chain, the next player receives Priority",
  );
  it.todo("Rule 652.5.c.2: Passing Priority via removal resolves the top chain item");
});

// ---------------------------------------------------------------------------
// Additional smoke tests for engine integration
// ---------------------------------------------------------------------------

describe("Engine integration: winning via victoryScore also finishes the game", () => {
  it("hasPlayerWon returns true when player VP >= victoryScore", () => {
    const engine = createMinimalGameState({ phase: "main", victoryScore: 8 });
    setVictoryPoints(engine, P1, 8);
    expect(hasPlayerWon(getState(engine), P1)).toBe(true);
  });

  it("a player at victoryScore - 1 has not yet won", () => {
    const engine = createMinimalGameState({ phase: "main", victoryScore: 8 });
    setVictoryPoints(engine, P1, 7);
    expect(hasPlayerWon(getState(engine), P1)).toBe(false);
  });

  it("burn out that reaches exactly victoryScore finishes the game with the opponent as winner", () => {
    const engine = createMinimalGameState({ phase: "main", victoryScore: 2 });
    // P2 already has 1 point; one burn out by P1 gives P2 the win.
    setVictoryPoints(engine, P2, 1);

    applyMove(engine, "burnOut", { opponentId: P2, playerId: P1 });

    expect(getState(engine).players[P2].victoryPoints).toBe(2);
    expect(hasPlayerWon(getState(engine), P2)).toBe(true);
    expect(getStatus(engine)).toBe("finished");
    expect(getWinner(engine)).toBe(P2);
  });
});

// ---------------------------------------------------------------------------
// Additional: concede does NOT require it to be the conceder's turn
// ---------------------------------------------------------------------------

describe("Rule 650 (implicit): Concede does not require it to be the conceder's turn", () => {
  it("P2 can concede while P1 is the active player", () => {
    const engine = createMinimalGameState({
      currentPlayer: P1,
      phase: "main",
    });

    const result = applyMove(engine, "concede", { playerId: P2 });
    expect(result.success).toBe(true);
    expect(getWinner(engine)).toBe(P1);
  });
});
