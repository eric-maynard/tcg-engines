/**
 * Phase B batch 14 — monkey-rescan finding X-2: the Beginning-phase
 * Hold-scoring path increments `victoryPoints` without checking the
 * win condition, so games where a player accumulates VP exclusively
 * via Hold (i.e. holding a battlefield across multiple turns) never
 * end — the player's VP grows to 9, 10, 12, 15 with `status` still
 * `"playing"`.
 *
 * Discovered by the random-monkey harness (batch 14) with synthetic
 * move enumeration enabled. Across 50 seeds the monkey produced
 * multiple games where one player reached vp ∈ {9, 10, 12, 15} with
 * no `status: "finished"` ever firing — see e.g. seed `s12`:
 *
 *     step 56: P1 vp 5 → 6  via resolveFullCombat (combat path, gated)
 *     ...    : P1 vp 6 → 15 via Beginning-phase Hold scoring (UNGATED)
 *     step 124: state still "playing" with P1.vp = 15.
 *
 * Compare with three other VP-grant sites that DO check
 * `hasPlayerWonStrict` and write `state.status = "finished"`:
 *
 *   1. `combat.ts:1445` — scorePoint move (Conquer + Hold via move)
 *   2. `combat.ts:474`  — resolveFullCombat attacker-wins branch
 *   3. `riftbound-flow.ts:748` — Burn-Out (deck-empty) VP-to-opponent
 *
 * The fix: at the end of the Beginning-phase scoring step, iterate
 * every player and finish the game if any player satisfies
 * `hasPlayerWonStrict`. Generic, no per-card ifs.
 */

import { describe, expect, test } from "bun:test";
import {
  P1,
  advancePhase,
  createMinimalGameState,
} from "../rules-audit/helpers";

describe("monkey-b14 finding X-2: Beginning-phase Hold scoring must check the win condition", () => {
  test("when a player at vp = victoryScore - 1 holds a battlefield through the Beginning phase, the game finishes", () => {
    const engine = createMinimalGameState({
      battlefields: ["bf-1", "bf-2"],
      currentPlayer: P1,
      phase: "awaken",
      turn: 2,
    });

    // Stage the pre-Hold state: P1 at 7 VP, P1 controls bf-1, bf-1 not yet
    // Scored this turn. With the default victoryScore = 8, the next Hold
    // Tick will push P1 to 8 VP.
    const internal = engine as unknown as {
      currentState: {
        players: Record<string, { victoryPoints: number }>;
        battlefields: Record<string, { controller?: string | null }>;
        scoredThisTurn: Record<string, string[]>;
        status: string;
        winner?: string;
      };
    };
    internal.currentState.players[P1]!.victoryPoints = 7;
    internal.currentState.battlefields["bf-1"]!.controller = P1;
    internal.currentState.scoredThisTurn[P1] = [];

    // Drive the flow through the Beginning phase so the Hold-scoring
    // Step in `riftbound-flow.ts` runs.
    advancePhase(engine, "main");

    const state = engine.getState();
    expect(state.players[P1]!.victoryPoints).toBeGreaterThanOrEqual(8);
    // FIX: the win check should have fired during the Hold-score step.
    expect(state.status).toBe("finished");
    expect((state as { winner?: string }).winner).toBe(P1);
  });

  test("Hold scoring still grants VP normally when below threshold (regression guard)", () => {
    const engine = createMinimalGameState({
      battlefields: ["bf-1", "bf-2"],
      currentPlayer: P1,
      phase: "awaken",
      turn: 2,
    });

    const internal = engine as unknown as {
      currentState: {
        players: Record<string, { victoryPoints: number }>;
        battlefields: Record<string, { controller?: string | null }>;
        scoredThisTurn: Record<string, string[]>;
        status: string;
      };
    };
    internal.currentState.players[P1]!.victoryPoints = 0;
    internal.currentState.battlefields["bf-1"]!.controller = P1;
    internal.currentState.scoredThisTurn[P1] = [];

    advancePhase(engine, "main");

    const state = engine.getState();
    // Hold-scoring SHOULD grant at least 1 VP for the bf-1 we controlled.
    expect(state.players[P1]!.victoryPoints).toBeGreaterThanOrEqual(1);
    // But under the threshold, the game must still be "playing".
    expect(state.status).toBe("playing");
  });
});
