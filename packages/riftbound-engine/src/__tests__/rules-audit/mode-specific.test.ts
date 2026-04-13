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
  areAllies,
  createDefault2v2Teams,
  getTeammate,
  getTeammates,
  isTeamGame,
  isTeammate,
} from "../../operations/teams";
import {
  P1,
  P2,
  P3,
  P4,
  applyMove,
  createBattlefield,
  createCard,
  createDeck,
  createMinimalGameState,
  getRunesOnBoard,
  getState,
  runPhaseHook,
} from "./helpers";
import type { AuditEngine } from "./helpers";
import type { RiftboundGameState } from "../../types";

/**
 * Seed a team mapping directly onto the engine's current state. Mirrors
 * what a 2v2 Magma Chamber setup would produce: P1/P3 on team 0, P2/P4 on
 * team 1. The helper clones the immer-frozen state and swaps it back
 * through the internal view, so subsequent reads see the new teams.
 */
function seedTeams(engine: AuditEngine, teams: Record<string, number>): void {
  const internal = engine as unknown as { currentState: RiftboundGameState };
  const st = structuredClone(internal.currentState) as RiftboundGameState;
  (st as { teams: Record<string, number> }).teams = teams;
  internal.currentState = st;
  engine.getFlowManager()?.syncState(st);
}

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
    // Channel places runes on the board (runePool zone) but does NOT
    // Auto-exhaust for energy (that's the exhaustRune move).
    expect(getRunesOnBoard(engine, P2).length).toBe(3);
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

describe("Rule 648.8: Magma Chamber team-aware behaviors", () => {
  it("createDefault2v2Teams: [P1,P2,P3,P4] -> {P1:0, P2:1, P3:0, P4:1}", () => {
    const teams = createDefault2v2Teams([P1, P2, P3, P4]);
    expect(teams[P1]).toBe(0);
    expect(teams[P2]).toBe(1);
    expect(teams[P3]).toBe(0);
    expect(teams[P4]).toBe(1);
  });

  it("isTeamGame: returns true when teams mapping is non-empty", () => {
    const engine = createMinimalGameState({ phase: "main", playerCount: 4 });
    expect(isTeamGame(getState(engine))).toBe(false);
    seedTeams(engine, createDefault2v2Teams([P1, P2, P3, P4]));
    expect(isTeamGame(getState(engine))).toBe(true);
  });

  it("getTeammate/getTeammates: P1 and P3 are teammates, P2 and P4 are teammates", () => {
    const engine = createMinimalGameState({ phase: "main", playerCount: 4 });
    seedTeams(engine, createDefault2v2Teams([P1, P2, P3, P4]));
    const state = getState(engine);
    expect(getTeammate(state, P1)).toBe(P3);
    expect(getTeammate(state, P3)).toBe(P1);
    expect(getTeammate(state, P2)).toBe(P4);
    expect(getTeammate(state, P4)).toBe(P2);
    expect(getTeammates(state, P1)).toEqual([P3]);
  });

  it("areAllies: teammates are allies; cross-team players are not", () => {
    const engine = createMinimalGameState({ phase: "main", playerCount: 4 });
    seedTeams(engine, createDefault2v2Teams([P1, P2, P3, P4]));
    const state = getState(engine);
    expect(areAllies(state, P1, P3)).toBe(true);
    expect(areAllies(state, P2, P4)).toBe(true);
    expect(areAllies(state, P1, P2)).toBe(false);
    expect(areAllies(state, P1, P4)).toBe(false);
    // Self is always allied with self.
    expect(areAllies(state, P1, P1)).toBe(true);
  });

  it("isTeammate: excludes the player themselves; includes their teammate", () => {
    const engine = createMinimalGameState({ phase: "main", playerCount: 4 });
    seedTeams(engine, createDefault2v2Teams([P1, P2, P3, P4]));
    const state = getState(engine);
    expect(isTeammate(state, P1, P3)).toBe(true);
    expect(isTeammate(state, P1, P1)).toBe(false);
    expect(isTeammate(state, P1, P2)).toBe(false);
  });

  it("Rule 648.8.b / 630.1.a: Conquering a teammate-held battlefield awards no VP", () => {
    // Setup: 4-player team game where P1 is active. P1 conquers bf-1 which
    // Was previously held by P3 (their teammate). Per rule 630.1.a, no VP
    // Is awarded because the team already controlled it.
    const engine = createMinimalGameState({
      currentPlayer: P1,
      phase: "main",
      playerCount: 4,
    });
    seedTeams(engine, createDefault2v2Teams([P1, P2, P3, P4]));
    // Battlefield is currently controlled by P1 (as if already conquered
    // In-state) but the previousController of the scorePoint call is P3.
    createBattlefield(engine, "bf-1", { controller: P1 });

    const before = getState(engine).players[P1].victoryPoints;
    const result = applyMove(engine, "scorePoint", {
      battlefieldId: "bf-1",
      method: "conquer",
      playerId: P1,
      previousController: P3,
    });
    expect(result.success).toBe(true);
    // No VP for conquering your teammate's battlefield.
    expect(getState(engine).players[P1].victoryPoints).toBe(before);
    // Still marked as scored this turn to prevent exploitation.
    expect(getState(engine).scoredThisTurn[P1]).toContain("bf-1");
  });

  it("Rule 648.8.b / 630.1.a: Conquering an opponent-held battlefield DOES award VP in team mode", () => {
    const engine = createMinimalGameState({
      currentPlayer: P1,
      phase: "main",
      playerCount: 4,
    });
    seedTeams(engine, createDefault2v2Teams([P1, P2, P3, P4]));
    createBattlefield(engine, "bf-1", { controller: P1 });

    const before = getState(engine).players[P1].victoryPoints;
    const result = applyMove(engine, "scorePoint", {
      battlefieldId: "bf-1",
      method: "conquer",
      playerId: P1,
      previousController: P2, // Opponent on the other team
    });
    expect(result.success).toBe(true);
    expect(getState(engine).players[P1].victoryPoints).toBe(before + 1);
  });

  // Deferred: playSpell/hideCard team gating lives in cards.ts which is
  // Owned by the card-flow agent; these rules require move-time team
  // Checks that aren't wired yet.
  it.todo(
    // Deferred: cards.ts playSpell validator is off-limits for this agent
    "Rule 648.8.a: Players may play spells during their teammate's turn (cards.ts gate not wired)",
  );
  it.todo(
    // Deferred: cards.ts hideCard validator is off-limits for this agent
    "Rule 648.8.c.1: Players may not hide cards at a teammate's battlefield (cards.ts gate not wired)",
  );

  it("Rule 648.8.c.2: standardMove already rejects moving a teammate's units (owner-equality check)", () => {
    // StandardMove's condition enforces `owner === playerId` for every
    // Unit being moved. In a team game this means teammates' units are
    // Automatically rejected without needing an explicit team gate.
    const engine = createMinimalGameState({
      currentPlayer: P1,
      phase: "main",
      playerCount: 4,
    });
    seedTeams(engine, createDefault2v2Teams([P1, P2, P3, P4]));
    createBattlefield(engine, "bf-1", { controller: null });

    // P3 (teammate of P1) owns a unit in their base. P1 tries to move it.
    createCard(engine, "teammate-unit", {
      cardType: "unit",
      might: 2,
      owner: P3,
      zone: "base",
    });

    const result = applyMove(engine, "standardMove", {
      destination: "bf-1",
      playerId: P1,
      unitIds: ["teammate-unit"],
    });
    expect(result.success).toBe(false);
  });

  // Deferred: 'friendly' target resolution is wired by the target-resolver
  // Which now should include teammates' units. The target-resolver tests
  // Own that assertion; here we spot-check the helper predicate.
  it("Rule 648.8.d: 'friendly' predicate (areAllies) includes teammates in team games", () => {
    const engine = createMinimalGameState({ phase: "main", playerCount: 4 });
    seedTeams(engine, createDefault2v2Teams([P1, P2, P3, P4]));
    const state = getState(engine);
    // P1 and P3 are friendly to each other; P2 and P4 are not friendly to P1.
    expect(areAllies(state, P1, P3)).toBe(true);
    expect(areAllies(state, P1, P2)).toBe(false);
    expect(areAllies(state, P1, P4)).toBe(false);
  });

  // Deferred: private-hand information-hiding lives in the views layer
  // And is not gated on team membership in the current engine.
  it.todo(
    // Deferred: information hiding/views layer not in scope of this agent
    "Rule 648.8.f.1: Hands remain private information even from teammates (views layer)",
  );

  // Deferred: final-point conquer restriction interaction with teammate
  // Exemption requires stacking rule 632.1.b.2 (all BFs scored) with
  // 648.8.b (teammate-held exemption). The engine exempts teammate-held
  // Conquers from scoring entirely, but does not yet treat them as
  // "already scored" for the final-point branch.
  it.todo(
    // Deferred: final-point interaction with teammate-exempt scoring
    "Rule 648.8.g.1: Final point via Conquer in 2v2 ignores teammate-occupied battlefields",
  );
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

  // Deferred: engine only tracks `secondPlayerExtraRune` and does not model
  // 'last player' adjustment for FFA3/FFA4 first-turn channeling.
  it.todo(
    "Rule 646.7 / 647.7 runtime: last player channels an extra rune on their first turn (engine gap)",
  );
});
