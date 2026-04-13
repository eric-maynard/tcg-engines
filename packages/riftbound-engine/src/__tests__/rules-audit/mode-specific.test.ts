/**
 * Rules Audit: Mode-Specific Rules (rules 640-648)
 *
 * Covers the five sanctioned Modes of Play and their per-mode variables:
 *
 *   642 — every mode defines player count, victory score, battlefield count,
 *         setup adjustments, and first-turn process
 *   644 — Duel (1v1, best-of-1)
 *   645 — Match (1v1, best-of-3)
 *   646 — FFA3 Skirmish (3 players)
 *   647 — FFA4 War (4 players)
 *   648 — Magma Chamber (2v2 team)
 *   644.7 / 645.7 — second player channels an extra rune on their first turn
 *                    (KNOWN ENGINE BUG: see failing test notes below)
 *   646.7 / 647.7 / 648.7 — FFA/team first-turn adjustments
 *   648.8 — Team-specific rules for Magma Chamber
 *
 * Most per-mode configuration lives in `packages/riftbound-engine/src/modes/
 * game-modes.ts` as a static `GAME_MODES` table. These rule-audit tests check
 * the config values against the formal rule text and spot-check the one piece
 * of per-mode game logic that actually runs inside the engine flow (rule
 * 644.7 second-player-rune catch-up during channel phase).
 */

import { describe, expect, it } from "bun:test";
import { GAME_MODES, getGameModeConfig } from "../../modes/game-modes";
import type { GameMode } from "../../modes/game-modes";
import {
  P1,
  P2,
  createDeck,
  createMinimalGameState,
  getRunesOnBoard,
  getState,
  runPhaseHook,
} from "./helpers";

const ALL_MODES: readonly GameMode[] = ["duel", "match", "ffa3", "ffa4", "magmaChamber"];

// ---------------------------------------------------------------------------
// Rule 641: There are multiple methods of playing Riftbound.
// ---------------------------------------------------------------------------

describe("Rule 641: Multiple sanctioned modes of play exist", () => {
  it("the engine defines exactly 5 modes matching the rules (Duel, Match, FFA3, FFA4, Magma Chamber)", () => {
    expect(Object.keys(GAME_MODES).toSorted()).toEqual(
      ["duel", "ffa3", "ffa4", "magmaChamber", "match"].toSorted(),
    );
  });
});

// ---------------------------------------------------------------------------
// Rule 642: A Mode of Play must define several variables for the game.
// Rule 642.1 - Number of Players
// Rule 642.3 - Victory Score
// Rule 642.3.a - Victory Scores can be any positive number
// Rule 642.4 - Battlefield Count
// ---------------------------------------------------------------------------

describe("Rule 642.1: Every mode specifies a player count", () => {
  it("duel requires 2 players", () => {
    expect(GAME_MODES.duel.playerCount).toBe(2);
  });
  it("match requires 2 players", () => {
    expect(GAME_MODES.match.playerCount).toBe(2);
  });
  it("ffa3 requires 3 players", () => {
    expect(GAME_MODES.ffa3.playerCount).toBe(3);
  });
  it("ffa4 requires 4 players", () => {
    expect(GAME_MODES.ffa4.playerCount).toBe(4);
  });
  it("magmaChamber requires 4 players", () => {
    expect(GAME_MODES.magmaChamber.playerCount).toBe(4);
  });
});

describe("Rule 642.3: Every mode has a victory score", () => {
  it("all modes have a positive victory score", () => {
    for (const m of ALL_MODES) {
      expect(GAME_MODES[m].victoryScore).toBeGreaterThan(0);
    }
  });

  it("Rule 642.3.a — victory scores are positive integers", () => {
    for (const m of ALL_MODES) {
      expect(Number.isInteger(GAME_MODES[m].victoryScore)).toBe(true);
      expect(GAME_MODES[m].victoryScore).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("Rule 642.4: Every mode specifies a battlefield count", () => {
  it("duel has 2 battlefields on the board", () => {
    expect(GAME_MODES.duel.battlefieldCount).toBe(2);
  });
  it("match has 2 battlefields on the board", () => {
    expect(GAME_MODES.match.battlefieldCount).toBe(2);
  });
  it("ffa3 has 3 battlefields on the board", () => {
    expect(GAME_MODES.ffa3.battlefieldCount).toBe(3);
  });
  it("ffa4 has 3 battlefields on the board (rule 647.4.b: first player contributes none)", () => {
    expect(GAME_MODES.ffa4.battlefieldCount).toBe(3);
  });
  it("magmaChamber has 3 battlefields on the board (rule 648.4.b: first player contributes none)", () => {
    expect(GAME_MODES.magmaChamber.battlefieldCount).toBe(3);
  });
});

describe("Rule 642.5/642.7: first-turn process per mode", () => {
  it("duel: first player does NOT skip draw (rule 644.7 only affects second player channel)", () => {
    expect(GAME_MODES.duel.firstPlayerSkipsDraw).toBe(false);
  });
  it("match: first player does NOT skip draw (rule 645.7)", () => {
    expect(GAME_MODES.match.firstPlayerSkipsDraw).toBe(false);
  });
  it("ffa3: first player skips draw (rule 646.7)", () => {
    expect(GAME_MODES.ffa3.firstPlayerSkipsDraw).toBe(true);
  });
  it("ffa4: first player skips draw (rule 647.7)", () => {
    expect(GAME_MODES.ffa4.firstPlayerSkipsDraw).toBe(true);
  });
  it("magmaChamber: first player skips draw (rule 648.7)", () => {
    expect(GAME_MODES.magmaChamber.firstPlayerSkipsDraw).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Rule 644: 1v1 Duel (best-of-1)
// ---------------------------------------------------------------------------

describe("Rule 644: Duel mode definition", () => {
  const duel = getGameModeConfig("duel");

  it("Rule 644.2: 1v1 with 1 opponent, no teams", () => {
    expect(duel.playerCount).toBe(2);
    expect(duel.teamBased).toBe(false);
  });

  it("Rule 644.6: best-of-1, victory score 8", () => {
    expect(duel.victoryScore).toBe(8);
  });
});

// ---------------------------------------------------------------------------
// Rule 645: 1v1 Match (best-of-3)
// ---------------------------------------------------------------------------

describe("Rule 645: Match mode definition", () => {
  const match = getGameModeConfig("match");

  it("Rule 645.2: 1v1 with 1 opponent, no teams", () => {
    expect(match.playerCount).toBe(2);
    expect(match.teamBased).toBe(false);
  });

  it("Rule 645.6: best-of-3, per-game victory score 8", () => {
    expect(match.victoryScore).toBe(8);
  });

  it("Rule 645.7: same first-turn process as 644.7 (second player gets extra rune)", () => {
    // The engine uses `secondPlayerExtraRune` for both modes.
    // Config-wise, neither mode causes the first player to skip draw.
    expect(match.firstPlayerSkipsDraw).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Rule 646: FFA3 Skirmish
// ---------------------------------------------------------------------------

describe("Rule 646: FFA3 Skirmish mode definition", () => {
  const ffa3 = getGameModeConfig("ffa3");

  it("Rule 646.2: 3 players, each with 2 opponents, no teams", () => {
    expect(ffa3.playerCount).toBe(3);
    expect(ffa3.teamBased).toBe(false);
  });

  it("Rule 646.6: best-of-1, victory score 8", () => {
    expect(ffa3.victoryScore).toBe(8);
  });

  it("Rule 646.7: first player skips draw", () => {
    expect(ffa3.firstPlayerSkipsDraw).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Rule 647: FFA4 War
// ---------------------------------------------------------------------------

describe("Rule 647: FFA4 War mode definition", () => {
  const ffa4 = getGameModeConfig("ffa4");

  it("Rule 647.2: 4 players FFA, 3 opponents each, no teams", () => {
    expect(ffa4.playerCount).toBe(4);
    expect(ffa4.teamBased).toBe(false);
  });

  it("Rule 647.4.b: first player contributes no battlefields (3 total instead of 4)", () => {
    expect(ffa4.battlefieldCount).toBe(3);
  });

  it("Rule 647.6: best-of-1, victory score 8", () => {
    expect(ffa4.victoryScore).toBe(8);
  });

  it("Rule 647.7: first player skips draw", () => {
    expect(ffa4.firstPlayerSkipsDraw).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Rule 648: 2v2 Magma Chamber
// ---------------------------------------------------------------------------

describe("Rule 648: Magma Chamber (2v2) mode definition", () => {
  const magma = getGameModeConfig("magmaChamber");

  it("Rule 648.2: 2v2 with 1 teammate per side", () => {
    expect(magma.playerCount).toBe(4);
    expect(magma.teamBased).toBe(true);
  });

  it("Rule 648.4.b: first player contributes no battlefields (3 total)", () => {
    expect(magma.battlefieldCount).toBe(3);
  });

  it("Rule 648.6: team victory score is 11 (higher than solo modes)", () => {
    expect(magma.victoryScore).toBe(11);
  });

  it("Magma Chamber is the only team-based mode", () => {
    const teamModes = ALL_MODES.filter((m) => GAME_MODES[m].teamBased);
    expect(teamModes).toEqual(["magmaChamber"]);
  });

  it("Rule 648.7: first player skips draw", () => {
    expect(magma.firstPlayerSkipsDraw).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Rule 644.7 / 645.7: Second player channels an extra rune on their first turn.
//
// Fixed 2026-04-12 (commit TBD): setup.ts now only populates firstTurnNumber
// For non-first players. First player is intentionally omitted so the flow's
// Catch-up check (`firstTurnNumber[pid] === turnNumber`) never fires for them.
// Second player's first turn is turn 2 in 1v1, turn 2/3/4 in FFA.
//
// File refs:
//   Packages/riftbound-engine/src/game-definition/moves/setup.ts:373-395
//   Packages/riftbound-engine/src/game-definition/flow/riftbound-flow.ts:333-337
// ---------------------------------------------------------------------------

describe("Rule 644.7: Second player channels an extra rune on their first turn", () => {
  it("with a correct firstTurnNumber map, P2 channels 3 runes on their first turn", () => {
    const engine = createMinimalGameState({
      currentPlayer: P2,
      phase: "main",
      turn: 2,
    });
    // Manually seed the flow state to reflect what a correctly-configured
    // Setup SHOULD produce: P1 first turn = 1, P2 first turn = 2.
    const internal = engine as unknown as {
      currentState: {
        secondPlayerExtraRune: boolean;
        firstTurnNumber: Record<string, number>;
      };
    };
    internal.currentState.secondPlayerExtraRune = true;
    internal.currentState.firstTurnNumber = { [P2]: 2 };

    createDeck(engine, P2, "runeDeck", [
      { cardType: "rune", domain: "fury", id: "r1" },
      { cardType: "rune", domain: "fury", id: "r2" },
      { cardType: "rune", domain: "calm", id: "r3" },
      { cardType: "rune", domain: "calm", id: "r4" },
    ]);

    runPhaseHook(engine, "channel", "onBegin");
    // Rule 644.7: second player's first channel phase = 2 + 1 = 3 runes.
    expect(getRunesOnBoard(engine, P2).length).toBe(3);
    expect(getState(engine).runePools[P2].energy).toBe(3);
  });

  it("first player channels only 2 on their first turn (rule 644.7 does not apply)", () => {
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
    internal.currentState.secondPlayerExtraRune = true;
    internal.currentState.firstTurnNumber = { [P2]: 2 };

    createDeck(engine, P1, "runeDeck", [
      { cardType: "rune", domain: "fury", id: "r1" },
      { cardType: "rune", domain: "fury", id: "r2" },
      { cardType: "rune", domain: "calm", id: "r3" },
    ]);

    runPhaseHook(engine, "channel", "onBegin");
    // Rule 515.3.b: turn player channels exactly 2 runes.
    expect(getRunesOnBoard(engine, P1).length).toBe(2);
  });

  it("second player channels only 2 on their SECOND turn (bonus is one-shot)", () => {
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
    internal.currentState.firstTurnNumber = { [P2]: 2 };

    createDeck(engine, P2, "runeDeck", [
      { cardType: "rune", domain: "fury", id: "r1" },
      { cardType: "rune", domain: "fury", id: "r2" },
      { cardType: "rune", domain: "fury", id: "r3" },
    ]);

    runPhaseHook(engine, "channel", "onBegin");
    expect(getRunesOnBoard(engine, P2).length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Rule 648.8: Magma Chamber team rules (configuration-level only — the
// Engine does not implement team-aware move gating yet).
// ---------------------------------------------------------------------------

describe("Rule 648.8.e: Magma Chamber teammates are relevant by default", () => {
  it("magmaChamber is the only mode where teamBased=true (implies teammates exist)", () => {
    expect(GAME_MODES.magmaChamber.teamBased).toBe(true);
    expect(GAME_MODES.duel.teamBased).toBe(false);
    expect(GAME_MODES.match.teamBased).toBe(false);
    expect(GAME_MODES.ffa3.teamBased).toBe(false);
    expect(GAME_MODES.ffa4.teamBased).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Cross-mode relationships (rule 642 derivations)
// ---------------------------------------------------------------------------

describe("Cross-mode invariants derived from rule 642", () => {
  it("all modes have victory score >= 8 (lowest sanctioned threshold)", () => {
    for (const m of ALL_MODES) {
      expect(GAME_MODES[m].victoryScore).toBeGreaterThanOrEqual(8);
    }
  });

  it("team-based mode has a strictly higher victory score than all solo modes", () => {
    const solo = ALL_MODES.filter((m) => !GAME_MODES[m].teamBased);
    const soloMax = Math.max(...solo.map((m) => GAME_MODES[m].victoryScore));
    expect(GAME_MODES.magmaChamber.victoryScore).toBeGreaterThan(soloMax);
  });

  it("duel and match share the same per-game configuration", () => {
    expect(GAME_MODES.duel.victoryScore).toBe(GAME_MODES.match.victoryScore);
    expect(GAME_MODES.duel.battlefieldCount).toBe(GAME_MODES.match.battlefieldCount);
    expect(GAME_MODES.duel.playerCount).toBe(GAME_MODES.match.playerCount);
    expect(GAME_MODES.duel.teamBased).toBe(GAME_MODES.match.teamBased);
  });

  it("all 4-player modes share 3 battlefields on the board", () => {
    expect(GAME_MODES.ffa4.battlefieldCount).toBe(3);
    expect(GAME_MODES.magmaChamber.battlefieldCount).toBe(3);
  });

  it("ffa3 uses 3 battlefields (one per player)", () => {
    // PlayerCount can be either a single number or a [min, max] range; ffa3
    // Uses a fixed count.
    expect(GAME_MODES.ffa3.playerCount).toBe(3);
    expect(GAME_MODES.ffa3.battlefieldCount).toBe(3);
  });

  it("duel uses 2 battlefields (one per player)", () => {
    expect(GAME_MODES.duel.playerCount).toBe(2);
    expect(GAME_MODES.duel.battlefieldCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Rule 642.8.a: Mode-specific rules may be appended. The engine implements
// None of the 648.8.x sub-rules as runtime behavior yet — document.
// ---------------------------------------------------------------------------

describe("Rule 648.8: Magma Chamber team-aware behaviors (unimplemented)", () => {
  it.todo("Rule 648.8.a: Players may play spells during their teammate's turn");
  it.todo("Rule 648.8.b: Battlefield controls by a teammate do not score the team");
  it.todo("Rule 648.8.c.1: Players may not hide cards at a teammate's battlefield");
  it.todo("Rule 648.8.c.2: Players may not issue standard movement to a teammate's units");
  it.todo("Rule 648.8.d: 'Friendly' includes game objects controlled by a teammate");
  it.todo("Rule 648.8.f.1: Hands remain private information even from teammates");
  it.todo("Rule 648.8.g.1: Final point via Conquer in 2v2 ignores teammate-occupied battlefields");
});

// ---------------------------------------------------------------------------
// Rule 646.7 / 647.7: FFA first-turn adjustments (config-level)
// ---------------------------------------------------------------------------

describe("Rule 646.7 / 647.7: FFA first-turn adjustments", () => {
  it("ffa3 first player skips draw (rule 646.7)", () => {
    expect(GAME_MODES.ffa3.firstPlayerSkipsDraw).toBe(true);
  });

  it("ffa4 first player skips draw (rule 647.7)", () => {
    expect(GAME_MODES.ffa4.firstPlayerSkipsDraw).toBe(true);
  });

  it.todo(
    "Rule 646.7 / 647.7 runtime behavior: last player channels an extra rune on their first turn (not implemented — engine only tracks secondPlayerExtraRune)",
  );
});
