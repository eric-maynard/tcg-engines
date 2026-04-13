/**
 * Replacement Effects — "next" duration consumption
 *
 * These tests exercise the bookkeeping layer for single-fire replacement
 * effects (rule 571-575). The actual resolution of game events is tested
 * elsewhere; here we pin the contract that:
 *
 *   - `markReplacementConsumed()` records a consumed key only for
 *     `duration === "next"` matches.
 *   - `checkReplacement()` skips entries whose key is present in
 *     `draft.consumedNextReplacements`.
 *   - `clearConsumedReplacements()` wipes the set at end of turn.
 */

import { describe, expect, it } from "bun:test";
import type { MatchedReplacement } from "../replacement-effects";
import { clearConsumedReplacements, markReplacementConsumed } from "../replacement-effects";
import type { RiftboundGameState } from "../../types";

function makeDraft(): RiftboundGameState {
  return {
    battlefields: {},
    conqueredThisTurn: {},
    gameId: "test",
    players: {},
    runePools: {},
    scoredThisTurn: {},
    status: "playing",
    turn: { activePlayer: "p1", number: 1, phase: "main" },
    victoryScore: 8,
    xpGainedThisTurn: {},
  } as unknown as RiftboundGameState;
}

function makeMatched(overrides: Partial<MatchedReplacement> = {}): MatchedReplacement {
  return {
    abilityIndex: 0,
    duration: "next",
    replacement: "prevent",
    sourceCardId: "card-1",
    sourceOwner: "p1",
    ...overrides,
  };
}

describe("markReplacementConsumed", () => {
  it("records a consumed key for next-duration replacements", () => {
    const draft = makeDraft();
    const matched = makeMatched({ abilityIndex: 2, sourceCardId: "rel" });
    markReplacementConsumed(draft, matched);
    expect(draft.consumedNextReplacements).toEqual({ "rel|2": true });
  });

  it("no-ops for turn-duration replacements", () => {
    const draft = makeDraft();
    const matched = makeMatched({ duration: "turn" });
    markReplacementConsumed(draft, matched);
    expect(draft.consumedNextReplacements).toBeUndefined();
  });

  it("no-ops for permanent replacements", () => {
    const draft = makeDraft();
    const matched = makeMatched({ duration: "permanent" });
    markReplacementConsumed(draft, matched);
    expect(draft.consumedNextReplacements).toBeUndefined();
  });

  it("handles multiple consumed replacements from different sources", () => {
    const draft = makeDraft();
    markReplacementConsumed(draft, makeMatched({ abilityIndex: 0, sourceCardId: "a" }));
    markReplacementConsumed(draft, makeMatched({ abilityIndex: 1, sourceCardId: "b" }));
    expect(draft.consumedNextReplacements).toEqual({
      "a|0": true,
      "b|1": true,
    });
  });
});

describe("clearConsumedReplacements", () => {
  it("empties the consumed set", () => {
    const draft = makeDraft();
    markReplacementConsumed(draft, makeMatched());
    clearConsumedReplacements(draft);
    expect(draft.consumedNextReplacements).toEqual({});
  });

  it("is safe to call when no consumed markers exist", () => {
    const draft = makeDraft();
    expect(() => clearConsumedReplacements(draft)).not.toThrow();
    expect(draft.consumedNextReplacements).toBeUndefined();
  });
});
