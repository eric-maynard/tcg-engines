/**
 * Rules Audit (Unleashed / CR 2026-03-30) — batch b24 re-scan.
 *
 * Continues the rules-text rescan series (b12-b18, b24 here). Targets a small
 * cluster of victory/winning-point primitives in `win-conditions/victory.ts`
 * that have ample integration coverage but whose unit-level boundary semantics
 * are not yet pinned. After b13's strong coverage of `decideWinningPoint` and
 * b14's coverage of `hasPlayerWonStrict` / `checkVictoryAtCleanup`, the
 * remaining gaps are:
 *
 *   - Rule 466.1.b interaction with `victoryScoreModifier` (rule 470-series
 *       — "Aspirant's Climb"-style modifiers raise the effective threshold).
 *       `decideWinningPoint` uses `getEffectiveVictoryScore` internally —
 *       a player whose printed VPs == 8 but whose `victoryScoreModifier == 1`
 *       has threshold = 9, so a Conquer at current=7 (current+1 = 8 < 9)
 *       should fall through to the "below threshold" branch and just gain,
 *       NOT trigger the all-bfs-scored rider. We lock this — the rider must
 *       fire on the *effective* threshold, not the raw `state.victoryScore`.
 *
 *   - Rule 466.1.b overshoot — `current >= threshold` already (rare under
 *       normal play, but reachable via simultaneous-gain abilities like
 *       multi-target `score` effects, or via `victoryScoreModifier` dropping
 *       *after* a gain). `current + 1 < threshold` evaluates to false in
 *       this branch, so the rider DOES fire. For Conquer-without-all-bfs,
 *       the answer is "draw". This is the symmetric boundary to b13's
 *       "below threshold always gains" test.
 *
 *   - `isAtMatchPoint` — has no unit coverage. Pins: returns true iff
 *       `score === threshold - 1`. The off-by-one at threshold (returns
 *       false) and at threshold-2 (returns false) are both locked.
 *       Threshold respects the per-player modifier.
 *
 *   - `checkVictory` (non-strict) — iteration order. Pins: iterates
 *       `Object.keys(state.players)` in insertion order and returns the
 *       FIRST player past the threshold. With ties, the seat that was
 *       inserted first wins this predicate. (The *strict* path —
 *       `hasPlayerWonStrict` / `checkVictoryAtCleanup` — is the
 *       cleanup-time tie-breaker and returns null on ties; the non-strict
 *       path is documented as instant-gain bookkeeping and must remain
 *       deterministic.) Locks the iteration semantics that integrations
 *       rely on.
 *
 *   - `isGameOver` — decoupled from `checkVictory`. Pins: returns true
 *       whenever `state.status === "finished"`, EVEN IF no player meets
 *       the threshold (e.g. concession, timeout, or external termination).
 *       Conversely, returns true when threshold is met even if status was
 *       never flipped (legacy callsite recovery).
 *
 *   - `getPlayerScore` for a missing player returns 0 (default-safe). This
 *       is the contract every UI/bot path relies on — calling
 *       `getPlayerScore(state, "nonexistent" as PlayerId)` must NOT throw.
 *
 * Methodology: minimal state → one input → assert the rule-correct outcome
 * → cite the rule number. No per-card if-statements; only the
 * `win-conditions/victory.ts` engine primitives are exercised, so any card
 * or effect that consults them benefits automatically.
 */

import { describe, expect, test } from "bun:test";
import {
  checkVictory,
  decideWinningPoint,
  getEffectiveVictoryScore,
  getPlayerScore,
  isAtMatchPoint,
  isGameOver,
} from "../../game-definition/win-conditions/victory";
import type { PlayerId, RiftboundGameState } from "../../types";

// ---------------------------------------------------------------------------
// Helper: bare-minimum state shape for victory primitives. They only read
// `players[*].victoryPoints`, `players[*].victoryScoreModifier`, and
// `state.victoryScore` / `state.status`. No zones, registry, or moves needed.
// ---------------------------------------------------------------------------

interface MinPlayer {
  id: PlayerId;
  victoryPoints: number;
  victoryScoreModifier?: number;
  xp: number;
}

function makeState(args: {
  players: MinPlayer[];
  victoryScore?: number;
  status?: "active" | "finished";
}): RiftboundGameState {
  const players: Record<string, MinPlayer> = {};
  for (const p of args.players) {
    players[p.id] = p;
  }
  return {
    battlefields: {},
    players,
    status: args.status ?? "active",
    victoryScore: args.victoryScore ?? 8,
  } as unknown as RiftboundGameState;
}

// ===========================================================================
// Rule 466.1.b × Rule 470 (victoryScoreModifier) — rider fires on EFFECTIVE
// Threshold, not raw `state.victoryScore`.
// ===========================================================================

describe("decideWinningPoint respects victoryScoreModifier (rule 466.1.b + 470)", () => {
  test("modifier raises threshold: Conquer at raw-threshold-1 with modifier=+1 just gains (still below effective)", () => {
    const state = makeState({
      players: [
        { id: "p1" as PlayerId, victoryPoints: 7, victoryScoreModifier: 1, xp: 0 },
        { id: "p2" as PlayerId, victoryPoints: 0, xp: 0 },
      ],
      victoryScore: 8,
    });
    // Raw VP=8; effective threshold = 8 + 1 = 9. current+1 = 8 < 9, so
    // Rule 466.1.b does NOT fire — just "gain" regardless of bfsScored.
    expect(getEffectiveVictoryScore(state, "p1" as PlayerId)).toBe(9);
    expect(decideWinningPoint(state, "p1" as PlayerId, "conquer", 0, 3)).toBe("gain");
    expect(decideWinningPoint(state, "p1" as PlayerId, "conquer", 1, 3)).toBe("gain");
  });

  test("modifier raises threshold: at effective winning-point line, Conquer-without-all-bfs returns 'draw' (rule 466.1.b.2)", () => {
    const state = makeState({
      players: [
        { id: "p1" as PlayerId, victoryPoints: 8, victoryScoreModifier: 1, xp: 0 },
        { id: "p2" as PlayerId, victoryPoints: 0, xp: 0 },
      ],
      victoryScore: 8,
    });
    // Current = 8, effective threshold = 9. current+1 = 9 == threshold —
    // ON the winning-point line. With 2-of-3 bfs scored, must draw.
    expect(decideWinningPoint(state, "p1" as PlayerId, "conquer", 2, 3)).toBe("draw");
    // All 3 bfs scored → gain.
    expect(decideWinningPoint(state, "p1" as PlayerId, "conquer", 3, 3)).toBe("gain");
    // Hold always gains regardless (rule 466.1.b.1).
    expect(decideWinningPoint(state, "p1" as PlayerId, "hold", 1, 3)).toBe("gain");
  });
});

// ===========================================================================
// Rule 466.1.b overshoot — current already >= threshold (defensive boundary).
// ===========================================================================

describe("decideWinningPoint when current already meets or exceeds threshold (rule 466.1.b boundary)", () => {
  test("current == threshold: rider still fires (Conquer-without-all-bfs returns 'draw')", () => {
    const state = makeState({
      players: [
        { id: "p1" as PlayerId, victoryPoints: 8, xp: 0 },
        { id: "p2" as PlayerId, victoryPoints: 0, xp: 0 },
      ],
      victoryScore: 8,
    });
    // Current+1 = 9, not < threshold (8) — falls into the gate.
    expect(decideWinningPoint(state, "p1" as PlayerId, "conquer", 1, 3)).toBe("draw");
    expect(decideWinningPoint(state, "p1" as PlayerId, "conquer", 3, 3)).toBe("gain");
    expect(decideWinningPoint(state, "p1" as PlayerId, "hold", 0, 3)).toBe("gain");
  });

  test("current > threshold (overshoot): rider still fires", () => {
    const state = makeState({
      players: [
        { id: "p1" as PlayerId, victoryPoints: 10, xp: 0 },
        { id: "p2" as PlayerId, victoryPoints: 0, xp: 0 },
      ],
      victoryScore: 8,
    });
    // Way past threshold; the rider is "1 point from VS or higher" — still
    // Fires. Conquer-without-all-bfs draws; Hold gains.
    expect(decideWinningPoint(state, "p1" as PlayerId, "conquer", 1, 3)).toBe("draw");
    expect(decideWinningPoint(state, "p1" as PlayerId, "hold", 0, 3)).toBe("gain");
  });

  test("bfsScored > totalBattlefields (defensive): still treated as 'all scored' → gain", () => {
    // The implementation uses `>=`, so any overshoot is fine.
    const state = makeState({
      players: [
        { id: "p1" as PlayerId, victoryPoints: 7, xp: 0 },
        { id: "p2" as PlayerId, victoryPoints: 0, xp: 0 },
      ],
      victoryScore: 8,
    });
    expect(decideWinningPoint(state, "p1" as PlayerId, "conquer", 5, 3)).toBe("gain");
  });

  test("totalBattlefields = 0 (degenerate mode): every Conquer attempt satisfies the all-scored gate", () => {
    // 0 bfs in mode-of-play is degenerate but the helper is total-agnostic;
    // BfsScored (0) >= totalBattlefields (0) is true, so gate opens.
    const state = makeState({
      players: [
        { id: "p1" as PlayerId, victoryPoints: 7, xp: 0 },
        { id: "p2" as PlayerId, victoryPoints: 0, xp: 0 },
      ],
      victoryScore: 8,
    });
    expect(decideWinningPoint(state, "p1" as PlayerId, "conquer", 0, 0)).toBe("gain");
  });
});

// ===========================================================================
// IsAtMatchPoint — bot/AI hint predicate, no unit coverage yet.
// ===========================================================================

describe("isAtMatchPoint — true iff score === threshold - 1 (rule 466.1.b feeder)", () => {
  test("score = threshold - 1 → true", () => {
    const state = makeState({
      players: [{ id: "p1" as PlayerId, victoryPoints: 7, xp: 0 }],
      victoryScore: 8,
    });
    expect(isAtMatchPoint(state, "p1" as PlayerId)).toBe(true);
  });

  test("score = threshold → false (already past the line; not 'at match point')", () => {
    const state = makeState({
      players: [{ id: "p1" as PlayerId, victoryPoints: 8, xp: 0 }],
      victoryScore: 8,
    });
    expect(isAtMatchPoint(state, "p1" as PlayerId)).toBe(false);
  });

  test("score = threshold - 2 → false", () => {
    const state = makeState({
      players: [{ id: "p1" as PlayerId, victoryPoints: 6, xp: 0 }],
      victoryScore: 8,
    });
    expect(isAtMatchPoint(state, "p1" as PlayerId)).toBe(false);
  });

  test("respects victoryScoreModifier — at 7 with modifier=+1, threshold=9, NOT at match point", () => {
    const state = makeState({
      players: [
        { id: "p1" as PlayerId, victoryPoints: 7, victoryScoreModifier: 1, xp: 0 },
      ],
      victoryScore: 8,
    });
    // Threshold becomes 9; at-match-point line is 8, not 7.
    expect(isAtMatchPoint(state, "p1" as PlayerId)).toBe(false);
  });

  test("respects victoryScoreModifier — at 8 with modifier=+1, threshold=9, IS at match point", () => {
    const state = makeState({
      players: [
        { id: "p1" as PlayerId, victoryPoints: 8, victoryScoreModifier: 1, xp: 0 },
      ],
      victoryScore: 8,
    });
    expect(isAtMatchPoint(state, "p1" as PlayerId)).toBe(true);
  });
});

// ===========================================================================
// CheckVictory (non-strict) — iteration semantics for instant-gain paths.
// ===========================================================================

describe("checkVictory (non-strict) — first-keys-iter winner for instant-gain bookkeeping", () => {
  test("only one player past threshold → returns that player", () => {
    const state = makeState({
      players: [
        { id: "p1" as PlayerId, victoryPoints: 8, xp: 0 },
        { id: "p2" as PlayerId, victoryPoints: 0, xp: 0 },
      ],
      victoryScore: 8,
    });
    expect(checkVictory(state)).toBe("p1");
  });

  test("two players past threshold (tie) → returns FIRST inserted (Object.keys order)", () => {
    // Insertion order: p1 first.
    const state = makeState({
      players: [
        { id: "p1" as PlayerId, victoryPoints: 8, xp: 0 },
        { id: "p2" as PlayerId, victoryPoints: 8, xp: 0 },
      ],
      victoryScore: 8,
    });
    // Non-strict returns the first one it finds; cleanup-time tie-breaker is
    // `checkVictoryAtCleanup` which would return null. This predicate exists
    // For instant-gain sites that want a "did anyone cross?" answer.
    expect(checkVictory(state)).toBe("p1");
  });

  test("nobody past threshold → returns null", () => {
    const state = makeState({
      players: [
        { id: "p1" as PlayerId, victoryPoints: 4, xp: 0 },
        { id: "p2" as PlayerId, victoryPoints: 7, xp: 0 },
      ],
      victoryScore: 8,
    });
    expect(checkVictory(state)).toBeNull();
  });

  test("victoryScoreModifier raises bar — at 8 with modifier=+1, not past threshold", () => {
    const state = makeState({
      players: [
        { id: "p1" as PlayerId, victoryPoints: 8, victoryScoreModifier: 1, xp: 0 },
      ],
      victoryScore: 8,
    });
    expect(checkVictory(state)).toBeNull();
  });
});

// ===========================================================================
// IsGameOver — status flag OR threshold (decoupled).
// ===========================================================================

describe("isGameOver — true if status==finished OR threshold met (rule 467 fallback)", () => {
  test("status='finished' → true even if no player crossed threshold (concession/timeout)", () => {
    const state = makeState({
      players: [
        { id: "p1" as PlayerId, victoryPoints: 3, xp: 0 },
        { id: "p2" as PlayerId, victoryPoints: 5, xp: 0 },
      ],
      status: "finished",
      victoryScore: 8,
    });
    expect(isGameOver(state)).toBe(true);
  });

  test("status='active' but a player crossed threshold → true (legacy callsite recovery)", () => {
    const state = makeState({
      players: [
        { id: "p1" as PlayerId, victoryPoints: 8, xp: 0 },
        { id: "p2" as PlayerId, victoryPoints: 0, xp: 0 },
      ],
      status: "active",
      victoryScore: 8,
    });
    expect(isGameOver(state)).toBe(true);
  });

  test("status='active' and nobody past threshold → false", () => {
    const state = makeState({
      players: [
        { id: "p1" as PlayerId, victoryPoints: 3, xp: 0 },
        { id: "p2" as PlayerId, victoryPoints: 7, xp: 0 },
      ],
      victoryScore: 8,
    });
    expect(isGameOver(state)).toBe(false);
  });
});

// ===========================================================================
// GetPlayerScore — default-safe for missing players.
// ===========================================================================

describe("getPlayerScore — default-safe contract", () => {
  test("missing player returns 0 (does not throw)", () => {
    const state = makeState({
      players: [{ id: "p1" as PlayerId, victoryPoints: 5, xp: 0 }],
      victoryScore: 8,
    });
    expect(getPlayerScore(state, "ghost" as PlayerId)).toBe(0);
  });

  test("player with explicit 0 returns 0", () => {
    const state = makeState({
      players: [{ id: "p1" as PlayerId, victoryPoints: 0, xp: 0 }],
      victoryScore: 8,
    });
    expect(getPlayerScore(state, "p1" as PlayerId)).toBe(0);
  });
});

// ===========================================================================
// GetEffectiveVictoryScore — modifier defaulting.
// ===========================================================================

describe("getEffectiveVictoryScore — modifier defaulting (rule 470)", () => {
  test("missing modifier defaults to 0 (returns raw victoryScore)", () => {
    const state = makeState({
      players: [{ id: "p1" as PlayerId, victoryPoints: 0, xp: 0 }],
      victoryScore: 8,
    });
    // No victoryScoreModifier field on p1 — should default to 0.
    expect(getEffectiveVictoryScore(state, "p1" as PlayerId)).toBe(8);
  });

  test("negative modifier lowers threshold (rule 470 — modifier can go either way)", () => {
    // Some future battlefield could decrease the score; engine should permit
    // Any integer modifier without clamping.
    const state = makeState({
      players: [
        { id: "p1" as PlayerId, victoryPoints: 0, victoryScoreModifier: -2, xp: 0 },
      ],
      victoryScore: 8,
    });
    expect(getEffectiveVictoryScore(state, "p1" as PlayerId)).toBe(6);
  });

  test("missing player → returns raw victoryScore (no modifier addition)", () => {
    const state = makeState({
      players: [{ id: "p1" as PlayerId, victoryPoints: 0, xp: 0 }],
      victoryScore: 8,
    });
    expect(getEffectiveVictoryScore(state, "ghost" as PlayerId)).toBe(8);
  });
});
