/**
 * Rules Audit: Scoring (rules 630-632)
 *
 * Wave 2D. Covers the 15 scoring rules mapped by the rule index.
 *
 * Key concepts:
 *   - Conquer (630.1): Gain control of a battlefield you haven't scored
 *     this turn.
 *   - Hold (630.2): You control a battlefield during your Beginning Phase.
 *   - Once per battlefield per turn (631).
 *   - Final point restrictions (632.1.b):
 *       * Hold always scores the final point (632.1.b.1).
 *       * Conquer only scores the final point if every battlefield was
 *         scored this turn; otherwise the player draws a card (632.1.b.2).
 *   - Score triggers (632.2): Conquer and Hold abilities fire once per
 *     battlefield per turn (632.2.c).
 *
 * IMPORTANT: these tests deliberately do NOT rely on `advancePhase(engine,
 * "beginning")` to exercise Hold scoring, because the current flow manager
 * implementation is missing the `awaken/channel/ending` phases and advancing
 * to an already-visited phase fires the Beginning hook multiple times. See
 * the Wave 2D report for details. Instead, we use the `scorePoint` move,
 * which is the canonical entry point the engine uses for both Hold and
 * Conquer scoring.
 *
 * Rule citations reference `.claude/skills/riftbound-rules/references/*.md`.
 */

import { describe, expect, it } from "bun:test";
import {
  P1,
  P2,
  applyMove,
  createBattlefield,
  createMinimalGameState,
  getState,
  getStatus,
  getWinner,
  setVictoryPoints,
} from "./helpers";
import { checkVictory, hasPlayerWon } from "../../game-definition/win-conditions/victory";

// ---------------------------------------------------------------------------
// Rule 630.1: Conquer - gain control of a battlefield not yet scored this turn
// ---------------------------------------------------------------------------

describe("Rule 630.1: Conquer awards a point by gaining control of a battlefield", () => {
  it("conquering an unscored battlefield awards +1 victory point", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createBattlefield(engine, "bf-1", { controller: P1 });

    const before = getState(engine).players[P1].victoryPoints;
    const result = applyMove(engine, "scorePoint", {
      battlefieldId: "bf-1",
      method: "conquer",
      playerId: P1,
    });
    expect(result.success).toBe(true);
    expect(getState(engine).players[P1].victoryPoints).toBe(before + 1);
  });

  it("conquering a battlefield records it in scoredThisTurn", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createBattlefield(engine, "bf-1", { controller: P1 });

    applyMove(engine, "scorePoint", {
      battlefieldId: "bf-1",
      method: "conquer",
      playerId: P1,
    });

    expect(getState(engine).scoredThisTurn[P1]).toContain("bf-1");
  });
});

// ---------------------------------------------------------------------------
// Rule 630.2: Hold - control a battlefield during Beginning Phase
// ---------------------------------------------------------------------------

describe("Rule 630.2: Hold scores at Beginning Phase for each controlled battlefield", () => {
  it("scoring by hold awards +1 VP per held battlefield", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createBattlefield(engine, "bf-1", { controller: P1 });

    const before = getState(engine).players[P1].victoryPoints;
    applyMove(engine, "scorePoint", {
      battlefieldId: "bf-1",
      method: "hold",
      playerId: P1,
    });

    expect(getState(engine).players[P1].victoryPoints).toBe(before + 1);
    expect(getState(engine).scoredThisTurn[P1]).toContain("bf-1");
  });

  it("a player cannot score a battlefield they do not control", () => {
    const engine = createMinimalGameState({ currentPlayer: P1, phase: "main" });
    createBattlefield(engine, "bf-opp", { controller: P2 });

    // P1 is the turn player but does not control bf-opp; scorePoint must reject.
    const result = applyMove(engine, "scorePoint", {
      battlefieldId: "bf-opp",
      method: "hold",
      playerId: P1,
    });
    expect(result.success).toBe(false);
    expect(getState(engine).players[P1].victoryPoints).toBe(0);
  });

  it("holding three battlefields scores one VP per battlefield", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createBattlefield(engine, "bf-1", { controller: P1 });
    createBattlefield(engine, "bf-2", { controller: P1 });
    createBattlefield(engine, "bf-3", { controller: P1 });

    applyMove(engine, "scorePoint", {
      battlefieldId: "bf-1",
      method: "hold",
      playerId: P1,
    });
    applyMove(engine, "scorePoint", {
      battlefieldId: "bf-2",
      method: "hold",
      playerId: P1,
    });
    applyMove(engine, "scorePoint", {
      battlefieldId: "bf-3",
      method: "hold",
      playerId: P1,
    });

    expect(getState(engine).players[P1].victoryPoints).toBe(3);
    expect(getState(engine).scoredThisTurn[P1]).toEqual(
      expect.arrayContaining(["bf-1", "bf-2", "bf-3"]),
    );
  });
});

// ---------------------------------------------------------------------------
// Rule 631: Only one score per battlefield per turn (from either method)
// ---------------------------------------------------------------------------

describe("Rule 631: A player may only Score once per battlefield per turn", () => {
  it("scorePoint on an already-scored battlefield is rejected (no second VP)", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createBattlefield(engine, "bf-1", { controller: P1 });

    applyMove(engine, "scorePoint", {
      battlefieldId: "bf-1",
      method: "conquer",
      playerId: P1,
    });
    const afterFirst = getState(engine).players[P1].victoryPoints;

    const second = applyMove(engine, "scorePoint", {
      battlefieldId: "bf-1",
      method: "conquer",
      playerId: P1,
    });
    expect(second.success).toBe(false);
    expect(getState(engine).players[P1].victoryPoints).toBe(afterFirst);
  });

  it("Hold after Conquer on the same battlefield is also rejected", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createBattlefield(engine, "bf-1", { controller: P1 });

    applyMove(engine, "scorePoint", {
      battlefieldId: "bf-1",
      method: "conquer",
      playerId: P1,
    });
    const first = getState(engine).players[P1].victoryPoints;

    const second = applyMove(engine, "scorePoint", {
      battlefieldId: "bf-1",
      method: "hold",
      playerId: P1,
    });
    expect(second.success).toBe(false);
    expect(getState(engine).players[P1].victoryPoints).toBe(first);
  });
});

// ---------------------------------------------------------------------------
// Rule 632.1: A score earns up to 1 point
// ---------------------------------------------------------------------------

describe("Rule 632.1: Each Score earns up to 1 point", () => {
  it("a single score yields exactly +1 point", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createBattlefield(engine, "bf-1", { controller: P1 });

    applyMove(engine, "scorePoint", {
      battlefieldId: "bf-1",
      method: "hold",
      playerId: P1,
    });

    expect(getState(engine).players[P1].victoryPoints).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Rule 632.1.a: Final Point has additional restrictions (meta-test).
// The specific rule is tested by 632.1.b/b.1/b.2 below.
// ---------------------------------------------------------------------------

describe("Rule 632.1.a: The Final Point has additional restrictions", () => {
  it("P1 at 7 VP via Hold reaches 8 on one more Hold (no restriction)", () => {
    const engine = createMinimalGameState({ phase: "main", victoryScore: 8 });
    setVictoryPoints(engine, P1, 7);
    createBattlefield(engine, "bf-1", { controller: P1 });

    const result = applyMove(engine, "scorePoint", {
      battlefieldId: "bf-1",
      method: "hold",
      playerId: P1,
    });

    expect(result.success).toBe(true);
    expect(getState(engine).players[P1].victoryPoints).toBe(8);
  });
});

// ---------------------------------------------------------------------------
// Rule 632.1.a.1: Points from non-Conquer/non-Hold sources ignore restrictions
// ---------------------------------------------------------------------------

describe("Rule 632.1.a.1: Non-Score point sources ignore Final Point restrictions", () => {
  it("direct VP mutation can push 7 -> 8 (the rules ignore final-point gating here)", () => {
    const engine = createMinimalGameState({ phase: "main", victoryScore: 8 });
    setVictoryPoints(engine, P1, 7);

    // A non-Score source (e.g. Burn Out opponent gain) is equivalent to a
    // Direct VP mutation for purposes of this rule.
    setVictoryPoints(engine, P1, 8);

    expect(hasPlayerWon(getState(engine), P1)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Rule 632.1.b: At 1 point from victory, Score triggers the Final Point branch
// ---------------------------------------------------------------------------

describe("Rule 632.1.b: Final Point branch fires when player is 1 from victoryScore", () => {
  it("P1 at 7 VP scoring via hold wins (victoryScore = 8)", () => {
    const engine = createMinimalGameState({ phase: "main", victoryScore: 8 });
    setVictoryPoints(engine, P1, 7);
    createBattlefield(engine, "bf-1", { controller: P1 });

    const result = applyMove(engine, "scorePoint", {
      battlefieldId: "bf-1",
      method: "hold",
      playerId: P1,
    });
    expect(result.success).toBe(true);
    expect(hasPlayerWon(getState(engine), P1)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Rule 632.1.b.1: Hold always scores the Final Point (no restrictions)
// ---------------------------------------------------------------------------

describe("Rule 632.1.b.1: Hold scores the Final Point unconditionally", () => {
  it("P1 at 7 VP with ONE held battlefield wins via Hold (no 'all scored' requirement)", () => {
    const engine = createMinimalGameState({ phase: "main", victoryScore: 8 });
    setVictoryPoints(engine, P1, 7);
    // Three battlefields exist, only one is held by P1 — Hold does NOT need
    // Every battlefield to be scored.
    createBattlefield(engine, "bf-1", { controller: P1 });
    createBattlefield(engine, "bf-2", { controller: P2 });
    createBattlefield(engine, "bf-3", { controller: null });

    const result = applyMove(engine, "scorePoint", {
      battlefieldId: "bf-1",
      method: "hold",
      playerId: P1,
    });
    expect(result.success).toBe(true);
    expect(getState(engine).players[P1].victoryPoints).toBeGreaterThanOrEqual(8);
    expect(getStatus(engine)).toBe("finished");
    expect(getWinner(engine)).toBe(P1);
  });
});

// ---------------------------------------------------------------------------
// Rule 632.1.b.2: Conquer only scores Final Point if every BF scored this turn
// ---------------------------------------------------------------------------

describe("Rule 632.1.b.2: Final Point via Conquer requires every battlefield scored this turn", () => {
  it.todo(
    "Rule 632.1.b.2 (engine gap): P1 at 7 VP conquering one battlefield while others remain unscored should NOT score the final point and should draw a card instead. The current scorePoint reducer awards the VP unconditionally — see packages/riftbound-engine/src/game-definition/moves/combat.ts scorePoint reducer.",
  );

  it.todo(
    "Rule 632.1.b.2: P1 at 7 VP who has already scored every other battlefield this turn DOES score the final point via Conquer on the last battlefield.",
  );
});

// ---------------------------------------------------------------------------
// Rule 632.2: When a Score occurs, Battlefield score abilities trigger
// ---------------------------------------------------------------------------

describe("Rule 632.2: Score triggers the battlefield's Score ability", () => {
  it("scoring a battlefield records it in scoredThisTurn so trigger logic can consult it", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createBattlefield(engine, "bf-1", { controller: P1 });

    applyMove(engine, "scorePoint", {
      battlefieldId: "bf-1",
      method: "conquer",
      playerId: P1,
    });

    // The Scored flag is the engine's signal that the Score trigger has had
    // An opportunity to fire (rule 632.2.c bounds it to once per turn).
    expect(getState(engine).scoredThisTurn[P1]).toContain("bf-1");
  });
});

// ---------------------------------------------------------------------------
// Rule 632.2.a: Conquer abilities trigger on Conquer
// ---------------------------------------------------------------------------

describe("Rule 632.2.a: Conquer abilities trigger when a battlefield is Conquered", () => {
  it.todo(
    "Rule 632.2.a: a battlefield with an 'on-conquer' trigger fires when its controller changes via conquer. The current scorePoint move does not emit a conquer event; conquer triggers only fire from combat resolution (see combat.ts:399).",
  );
});

// ---------------------------------------------------------------------------
// Rule 632.2.b: Hold abilities trigger on Hold
// ---------------------------------------------------------------------------

describe("Rule 632.2.b: Hold abilities trigger when a battlefield is Held", () => {
  it.todo(
    "Rule 632.2.b: a battlefield with an 'on-hold' trigger fires at the Beginning Phase when its controller is the turn player. Tested via trigger-matcher unit tests (trigger-matcher.test.ts) — the flow-phase hook path requires the `advancePhase(engine, 'beginning')` helper which is currently broken.",
  );
});

// ---------------------------------------------------------------------------
// Rule 632.2.c: Score triggers fire at most once per battlefield per turn
// ---------------------------------------------------------------------------

describe("Rule 632.2.c: Score triggers fire at most once per battlefield per turn", () => {
  it("a second scorePoint on the same battlefield is rejected — no second trigger opportunity", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createBattlefield(engine, "bf-1", { controller: P1 });

    const r1 = applyMove(engine, "scorePoint", {
      battlefieldId: "bf-1",
      method: "conquer",
      playerId: P1,
    });
    expect(r1.success).toBe(true);

    const r2 = applyMove(engine, "scorePoint", {
      battlefieldId: "bf-1",
      method: "conquer",
      playerId: P1,
    });
    expect(r2.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Rule 633: Reaching Victory Score wins immediately
// ---------------------------------------------------------------------------

describe("Rule 633: A player at Victory Score wins the game immediately", () => {
  it("scorePoint that brings P1 to victoryScore finishes the game with P1 as winner", () => {
    const engine = createMinimalGameState({ phase: "main", victoryScore: 8 });
    setVictoryPoints(engine, P1, 7);
    createBattlefield(engine, "bf-final", { controller: P1 });

    const result = applyMove(engine, "scorePoint", {
      battlefieldId: "bf-final",
      method: "conquer",
      playerId: P1,
    });
    expect(result.success).toBe(true);

    const state = getState(engine);
    expect(state.players[P1].victoryPoints).toBeGreaterThanOrEqual(8);
    expect(getStatus(engine)).toBe("finished");
    expect(getWinner(engine)).toBe(P1);
  });

  it("checkVictory returns P1 when P1 has the victory score", () => {
    const engine = createMinimalGameState({ phase: "main", victoryScore: 8 });
    setVictoryPoints(engine, P1, 8);
    expect(checkVictory(getState(engine))).toBe(P1);
    expect(getState(engine).players[P2].victoryPoints).toBe(0);
  });

  it("checkVictory returns null when neither player has reached victoryScore", () => {
    const engine = createMinimalGameState({ phase: "main", victoryScore: 8 });
    setVictoryPoints(engine, P1, 7);
    setVictoryPoints(engine, P2, 7);
    expect(checkVictory(getState(engine))).toBe(null);
  });
});

// ---------------------------------------------------------------------------
// Rule 630.1.a: Teammate-controlled battlefields disqualified from Conquer
// (deferred — team mode setup required)
// ---------------------------------------------------------------------------

describe("Rule 630.1.a (deferred): Teammate-held battlefields can't be Conquered", () => {
  it.todo(
    "Rule 630.1.a: In team modes, a battlefield controlled by a teammate during Beginning Phase is disqualified from Conquer scoring (needs team mode setup).",
  );
});
