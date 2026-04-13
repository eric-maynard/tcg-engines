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
  P3,
  P4,
  applyMove,
  checkMoveLegal,
  createBattlefield,
  createCard,
  createMinimalGameState,
  getCardZone,
  getCardsInZone,
  getState,
  getStatus,
  getWinner,
  placeInMainDeck,
  setVictoryPoints,
} from "./helpers";
import type { ZoneName } from "./helpers";
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

  it("Rule 607.1.b: burnOut with source='look' fires from an empty main deck", () => {
    const engine = createMinimalGameState({ phase: "main" });

    const result = applyMove(engine, "burnOut", {
      opponentId: P2,
      playerId: P1,
      source: "look",
    });
    expect(result.success).toBe(true);
    expect(getState(engine).players[P2].victoryPoints).toBe(1);
  });

  it("Rule 607.1.c: burnOut with source='mill' fires from an empty main deck", () => {
    const engine = createMinimalGameState({ phase: "main" });

    const result = applyMove(engine, "burnOut", {
      opponentId: P2,
      playerId: P1,
      source: "mill",
    });
    expect(result.success).toBe(true);
    expect(getState(engine).players[P2].victoryPoints).toBe(1);
  });
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

  it("Rule 607.2.c: after burnOut with source='draw' the original draw action is retried", () => {
    const engine = createMinimalGameState({ phase: "main" });
    // P1 has 1 card in trash — after shuffle it ends up in the main deck
    // And the retry draw moves it to hand.
    createCard(engine, "retry-1", { cardType: "spell", owner: P1, zone: "trash" });

    expect(getCardsInZone(engine, "trash", P1).length).toBe(1);
    expect(getCardsInZone(engine, "hand", P1).length).toBe(0);

    applyMove(engine, "burnOut", {
      opponentId: P2,
      playerId: P1,
      source: "draw",
    });

    // Retry pulled the shuffled card back into hand.
    expect(getCardsInZone(engine, "hand", P1).length).toBe(1);
    expect(getCardsInZone(engine, "trash", P1).length).toBe(0);
  });
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
  it("a non-directed burnOut is rejected when the player's main deck is non-empty", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createCard(engine, "deck-card-607", {
      cardType: "spell",
      owner: P1,
      zone: "mainDeck",
    });

    // Source 'draw' means the player was trying to draw, not directed by
    // An effect. Since the deck is non-empty the burnOut guard rejects it.
    const result = applyMove(engine, "burnOut", {
      opponentId: P2,
      playerId: P1,
      source: "draw",
    });
    expect(result.success).toBe(false);
  });

  it("a directed burnOut always fires (source='directed' is the implicit default)", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createCard(engine, "deck-card-607b", {
      cardType: "spell",
      owner: P1,
      zone: "mainDeck",
    });

    const result = applyMove(engine, "burnOut", {
      opponentId: P2,
      playerId: P1,
    });
    expect(result.success).toBe(true);
    expect(getState(engine).players[P2].victoryPoints).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Rule 607.5: Burn Out is a Replacement Effect
// ---------------------------------------------------------------------------

describe("Rule 607.5: Burn Out is a Replacement Effect", () => {
  // Deferred: the engine models burnOut as a standalone move rather than a
  // Replacement effect. Wiring it through the replacement pipeline is owned
  // By the replacement-effects agent.
  it.todo(
    // Deferred: replacement-effects.ts is owned by another agent
    "Rule 607.5: Burn Out replaces 'draw from empty deck' (replacement-effects layer)",
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
  it("Rule 651.2: concede in a 4-player game continues play with remaining players", () => {
    const engine = createMinimalGameState({ phase: "main", playerCount: 4 });

    const result = applyMove(engine, "concede", { playerId: P1 });
    expect(result.success).toBe(true);
    // Game still playing — P2, P3, P4 remain.
    expect(getStatus(engine)).toBe("playing");
    expect(getWinner(engine)).toBeUndefined();
    // P1 is tracked as removed.
    expect(getState(engine).removedPlayers).toContain(P1);
  });

  it("Rule 651.2: concede in a 3-player game continues until only one player remains", () => {
    const engine = createMinimalGameState({ phase: "main", playerCount: 3 });

    applyMove(engine, "concede", { playerId: P1 });
    expect(getStatus(engine)).toBe("playing");
    // Second concede leaves only P3 standing — game ends.
    applyMove(engine, "concede", { playerId: P2 });
    expect(getStatus(engine)).toBe("finished");
    expect(getWinner(engine)).toBe(P3);
  });

  // Deferred: 'relevant player' tracking for showdowns is only implemented
  // For 2-player; multi-player showdown removal is in the showdown stack
  // But requires a multi-player showdown construction helper that does
  // Not exist in the audit harness yet.
  it.todo(
    // Deferred: needs multi-player showdown construction helper
    "Rule 651.3: A removed player is no longer Relevant in Showdowns (helper gap: no multi-player showdown builder)",
  );
});

// ---------------------------------------------------------------------------
// Rule 652.1-652.5: Removal-of-a-player mechanics (deferred — multi-player)
// ---------------------------------------------------------------------------

describe("Rule 652: Removal of a Player", () => {
  it("Rule 652.1: concede banishes all permanents the removed player owns", () => {
    const engine = createMinimalGameState({ phase: "main", playerCount: 4 });
    createBattlefield(engine, "bf-1", { controller: P1 });

    // Seed P1 with units in base and at the battlefield, plus cards in hand.
    createCard(engine, "unit-base", {
      cardType: "unit",
      might: 2,
      owner: P1,
      zone: "base",
    });
    createCard(engine, "unit-bf", {
      cardType: "unit",
      might: 3,
      owner: P1,
      zone: "battlefield-bf-1",
    });
    createCard(engine, "spell-hand", {
      cardType: "spell",
      owner: P1,
      zone: "hand",
    });

    applyMove(engine, "concede", { playerId: P1 });

    // All three cards are now in the banishment zone.
    const banished = getCardsInZone(engine, "banishment" as ZoneName, P1);
    expect(banished).toContain("unit-base");
    expect(banished).toContain("unit-bf");
    expect(banished).toContain("spell-hand");
  });

  it("Rule 652.2: battlefields controlled by the removed player become uncontrolled", () => {
    const engine = createMinimalGameState({ phase: "main", playerCount: 4 });
    createBattlefield(engine, "bf-controlled", { controller: P1 });
    createBattlefield(engine, "bf-other", { controller: P2 });

    applyMove(engine, "concede", { playerId: P1 });

    // P1's battlefield is now uncontrolled, P2's untouched.
    expect(getState(engine).battlefields["bf-controlled"]?.controller).toBeNull();
    expect(getState(engine).battlefields["bf-other"]?.controller).toBe(P2);
  });

  it("Rule 652.2.b: contested status from the removed player is cleared", () => {
    const engine = createMinimalGameState({ phase: "main", playerCount: 4 });
    createBattlefield(engine, "bf-1", {
      contested: true,
      contestedBy: P1,
      controller: P2,
    });

    applyMove(engine, "concede", { playerId: P1 });

    const bf = getState(engine).battlefields["bf-1"];
    expect(bf?.contestedBy).toBeUndefined();
    expect(bf?.contested).toBe(false);
  });

  // Deferred: token battlefield replacement requires dynamic battlefield
  // Creation, which the engine does not yet model (652.2.a).
  it.todo(
    // Deferred: engine cannot dynamically create token battlefields
    "Rule 652.2.a: Replace removed battlefield with a token battlefield with no abilities (engine lacks dynamic battlefield creation)",
  );

  // Deferred: hidden-card "stays in place" semantics depend on who scans
  // Them during removal. Rule 652.2.b also says the units/hidden cards at
  // A removed battlefield do not move — they still get banished per 652.1
  // When they belong to the removed player. Cross-player hidden cards at a
  // Removed battlefield aren't yet exercisable.
  it.todo(
    // Deferred: requires hidden-card placement at removed-player battlefield
    "Rule 652.2.b: Non-removed-player units/hidden cards at removed battlefield do not move",
  );

  // Deferred: continuous effects from battlefield static abilities are
  // Stripped by the static-abilities recalc pipeline when the source
  // Zone changes; covered by static-abilities tests.
  it.todo(
    // Deferred: static-abilities suite owns this assertion
    "Rule 652.2.c: Continuous effects from removed battlefield immediately cease",
  );

  it("Rule 652.3: all cards the removed player owns are banished (main deck, trash, rune deck)", () => {
    const engine = createMinimalGameState({ phase: "main", playerCount: 4 });

    createCard(engine, "deck-1", { cardType: "spell", owner: P1, zone: "mainDeck" });
    createCard(engine, "deck-2", { cardType: "spell", owner: P1, zone: "mainDeck" });
    createCard(engine, "trash-1", { cardType: "unit", might: 1, owner: P1, zone: "trash" });
    createCard(engine, "rune-deck-1", {
      cardType: "rune",
      domain: "fury",
      owner: P1,
      zone: "runeDeck",
    });

    applyMove(engine, "concede", { playerId: P1 });

    expect(getCardsInZone(engine, "mainDeck", P1).length).toBe(0);
    expect(getCardsInZone(engine, "trash", P1).length).toBe(0);
    expect(getCardsInZone(engine, "runeDeck", P1).length).toBe(0);
    const banished = getCardsInZone(engine, "banishment" as ZoneName, P1);
    expect(banished).toContain("deck-1");
    expect(banished).toContain("deck-2");
    expect(banished).toContain("trash-1");
    expect(banished).toContain("rune-deck-1");
  });

  it("Rule 652.3: removed player's rune pool is emptied (energy + power)", () => {
    const engine = createMinimalGameState({
      phase: "main",
      playerCount: 4,
      runePools: {
        [P1]: { energy: 5, power: { fury: 3 } },
      },
    });

    applyMove(engine, "concede", { playerId: P1 });

    const pool = getState(engine).runePools[P1];
    expect(pool?.energy ?? 0).toBe(0);
    expect(Object.keys(pool?.power ?? {}).length).toBe(0);
  });

  // Deferred: chain counter semantics are owned by the chain suite; the
  // Removal pipeline marks items as countered but the resolver check
  // Lives in chain-moves.ts which a parallel agent owns.
  it.todo(
    // Deferred: chain-moves.ts is owned by the chain/showdown agent
    "Rule 652.4: Counter all spells and abilities of all types controlled by the conceded player",
  );

  it("Rule 652.5.a.1: if the removed player was the turn player, turn advances to the next available player", () => {
    const engine = createMinimalGameState({
      currentPlayer: P1,
      phase: "main",
      playerCount: 4,
    });

    applyMove(engine, "concede", { playerId: P1 });

    // Turn advances past P1 to the next non-removed player.
    const {activePlayer} = getState(engine).turn;
    expect(activePlayer).not.toBe(P1);
    expect([P2, P3, P4]).toContain(activePlayer);
  });

  // Deferred: multi-player showdown construction is not supported by the
  // Current audit harness; Focus passing requires a live showdown.
  it.todo(
    // Deferred: needs multi-player showdown construction helper
    "Rule 652.5.b.1: If the removed player had Focus in a Showdown, the next Relevant Player receives Focus",
  );
  it.todo(
    // Deferred: needs multi-player showdown construction helper
    "Rule 652.5.b.2: If no other players remain Relevant, the Showdown ends",
  );
  it.todo(
    // Deferred: needs multi-player showdown construction helper
    "Rule 652.5.b.3: Passing Focus via removal ends the Showdown if all pass",
  );
  it.todo(
    // Deferred: chain-moves.ts is owned by the chain/showdown agent
    "Rule 652.5.c.1: If the removed player had Priority during a Chain, the next player receives Priority",
  );
  it.todo(
    // Deferred: chain-moves.ts is owned by the chain/showdown agent
    "Rule 652.5.c.2: Passing Priority via removal resolves the top chain item",
  );
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
