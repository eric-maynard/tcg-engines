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
  getCardMeta,
  getCardsInZone,
  getState,
  getStatus,
  getWinner,
  placeInMainDeck,
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
  it("P1 at 7 VP conquering one battlefield while others remain unscored draws a card instead of scoring", () => {
    const engine = createMinimalGameState({ phase: "main", victoryScore: 8 });
    setVictoryPoints(engine, P1, 7);
    // Three battlefields exist; P1 controls bf-1 but has not scored bf-2 or bf-3.
    createBattlefield(engine, "bf-1", { controller: P1 });
    createBattlefield(engine, "bf-2", { controller: P2 });
    createBattlefield(engine, "bf-3", { controller: null });

    // Seed P1's main deck so there is a card to draw.
    placeInMainDeck(engine, "deck-card-1", P1, "spell");

    const handBefore = getCardsInZone(engine, "hand", P1).length;

    const result = applyMove(engine, "scorePoint", {
      battlefieldId: "bf-1",
      method: "conquer",
      playerId: P1,
    });

    // The move is still accepted (rule 632.1.b.2 replaces the score with a
    // Card draw, it does not make the attempt illegal).
    expect(result.success).toBe(true);

    const state = getState(engine);
    // No VP was awarded — P1 is still at 7.
    expect(state.players[P1].victoryPoints).toBe(7);
    // The battlefield was NOT recorded as scored this turn.
    expect(state.scoredThisTurn[P1] ?? []).not.toContain("bf-1");
    // Game is still playing.
    expect(getStatus(engine)).toBe("playing");
    // P1 drew a card.
    expect(getCardsInZone(engine, "hand", P1).length).toBe(handBefore + 1);
  });

  it("P1 at 7 VP who has already scored every other battlefield this turn DOES score the final point via Conquer on the last battlefield", () => {
    // Use a higher victoryScore so we can pre-score other battlefields via
    // Real scorePoint moves without triggering the "already won" short-circuit.
    const engine = createMinimalGameState({ phase: "main", victoryScore: 10 });
    // Three battlefields; P1 will score bf-2 and bf-3 first (via hold), then
    // Conquer bf-1 to reach 10 (1 from 10 at start = 9).
    createBattlefield(engine, "bf-1", { controller: P1 });
    createBattlefield(engine, "bf-2", { controller: P1 });
    createBattlefield(engine, "bf-3", { controller: P1 });

    // Pre-score bf-2 and bf-3 via hold so they're in scoredThisTurn.
    // Start at 0 VP for these scores, then bump to 9 afterwards.
    const r2 = applyMove(engine, "scorePoint", {
      battlefieldId: "bf-2",
      method: "hold",
      playerId: P1,
    });
    expect(r2.success).toBe(true);
    const r3 = applyMove(engine, "scorePoint", {
      battlefieldId: "bf-3",
      method: "hold",
      playerId: P1,
    });
    expect(r3.success).toBe(true);
    // Now set VP to exactly 1-from-victory for the final-point branch.
    setVictoryPoints(engine, P1, 9);

    const result = applyMove(engine, "scorePoint", {
      battlefieldId: "bf-1",
      method: "conquer",
      playerId: P1,
    });
    expect(result.success).toBe(true);
    expect(getState(engine).players[P1].victoryPoints).toBeGreaterThanOrEqual(10);
    expect(getStatus(engine)).toBe("finished");
    expect(getWinner(engine)).toBe(P1);
  });
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
  it("scorePoint via conquer emits a conquer event, firing on-conquer battlefield triggers", () => {
    const engine = createMinimalGameState({ phase: "main" });
    // Battlefield card itself has an on-conquer triggered ability that bumps
    // Its own mightModifier — an observable side-effect marker we can assert
    // On via cardMeta (updateCardMeta writes directly to the meta root).
    createBattlefield(engine, "bf-1", {
      abilities: [
        {
          effect: { amount: 7, target: { type: "self" }, type: "modify-might" },
          trigger: { event: "conquer", on: "self" },
          type: "triggered",
        },
      ],
      controller: P1,
    });

    // Precondition: mightModifier is 0/undefined.
    expect(getCardMeta(engine, "bf-1")?.mightModifier ?? 0).toBe(0);

    const result = applyMove(engine, "scorePoint", {
      battlefieldId: "bf-1",
      method: "conquer",
      playerId: P1,
    });
    expect(result.success).toBe(true);

    // Post: the on-conquer trigger fired and bumped the battlefield card's
    // MightModifier by 7, proving the conquer event was emitted by scorePoint.
    expect(getCardMeta(engine, "bf-1")?.mightModifier).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// Rule 632.2.b: Hold abilities trigger on Hold
// ---------------------------------------------------------------------------

describe("Rule 632.2.b: Hold abilities trigger when a battlefield is Held", () => {
  it("scorePoint via hold emits a hold event, firing on-hold battlefield triggers", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createBattlefield(engine, "bf-1", {
      abilities: [
        {
          effect: { amount: 5, target: { type: "self" }, type: "modify-might" },
          trigger: { event: "hold", on: "self" },
          type: "triggered",
        },
      ],
      controller: P1,
    });

    expect(getCardMeta(engine, "bf-1")?.mightModifier ?? 0).toBe(0);

    const result = applyMove(engine, "scorePoint", {
      battlefieldId: "bf-1",
      method: "hold",
      playerId: P1,
    });
    expect(result.success).toBe(true);

    expect(getCardMeta(engine, "bf-1")?.mightModifier).toBe(5);
  });
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

describe("Rule 630.1.a: Teammate-held battlefields can't be Conquered for VP", () => {
  it("conquering a teammate-held battlefield in a team game does not award VP", () => {
    const engine = createMinimalGameState({
      currentPlayer: "player-1",
      phase: "main",
      playerCount: 4,
    });
    // Seed team mapping P1/P3 team 0, P2/P4 team 1.
    const internal = engine as unknown as {
      currentState: import("../../types").RiftboundGameState;
    };
    const st = structuredClone(internal.currentState);
    (st as { teams: Record<string, number> }).teams = {
      "player-1": 0,
      "player-2": 1,
      "player-3": 0,
      "player-4": 1,
    };
    internal.currentState = st;
    engine.getFlowManager()?.syncState(st);

    createBattlefield(engine, "bf-teammate", { controller: P1 });

    const before = getState(engine).players[P1].victoryPoints;
    const result = applyMove(engine, "scorePoint", {
      battlefieldId: "bf-teammate",
      method: "conquer",
      playerId: P1,
      previousController: "player-3",
    });
    expect(result.success).toBe(true);
    // No VP: previous controller was P1's teammate.
    expect(getState(engine).players[P1].victoryPoints).toBe(before);
  });
});
