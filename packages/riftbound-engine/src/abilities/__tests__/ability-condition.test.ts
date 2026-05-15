/**
 * Ability Condition Evaluator Tests
 *
 * Covers the shapes the trigger-runner condition evaluator now handles
 * beyond the pre-existing `legion`/`while-level` ones (batch 8):
 *   - `score-within` / `opponent-score-within` (controller/opponent victory point gating)
 *   - `control-battlefield` (controller holds any battlefield)
 *   - `while-buffed` / `while-mighty` (source-card-relative; require ctx)
 *   - unknown shapes remain permissive
 */

import { describe, expect, test } from "bun:test";
import { evaluateAbilityCondition } from "../trigger-runner";
import type { RiftboundCardMeta, RiftboundGameState } from "../../types";

function baseState(overrides: Partial<RiftboundGameState> = {}): RiftboundGameState {
  return {
    battlefields: {},
    cardsPlayedThisTurn: { p1: 0, p2: 0 },
    conqueredThisTurn: { p1: [], p2: [] },
    gameId: "test",
    players: {
      p1: { id: "p1", turnsTaken: 1, victoryPoints: 0, xp: 0 },
      p2: { id: "p2", turnsTaken: 1, victoryPoints: 0, xp: 0 },
    },
    runePools: { p1: { energy: 0, power: {} }, p2: { energy: 0, power: {} } },
    scoredThisTurn: { p1: [], p2: [] },
    status: "playing",
    turn: { activePlayer: "p1", number: 1, phase: "main" },
    victoryScore: 8,
    xpGainedThisTurn: { p1: 0, p2: 0 },
    ...overrides,
  } as RiftboundGameState;
}

describe("evaluateAbilityCondition - new shapes", () => {
  test("score-within: passes when controller is within N points of victory", () => {
    const state = baseState({
      players: {
        p1: { id: "p1", turnsTaken: 1, victoryPoints: 6, xp: 0 },
        p2: { id: "p2", turnsTaken: 1, victoryPoints: 0, xp: 0 },
      },
    });
    // 8 - 6 = 2 ≤ 2
    expect(evaluateAbilityCondition({ points: 2, type: "score-within" }, state, "p1")).toBe(true);
    // 8 - 6 = 2 > 1
    expect(evaluateAbilityCondition({ points: 1, type: "score-within" }, state, "p1")).toBe(false);
  });

  test("score-within: respects per-player victoryScoreModifier", () => {
    const state = baseState({
      players: {
        p1: {
          id: "p1",
          turnsTaken: 1,
          victoryPoints: 6,
          victoryScoreModifier: 2,
          xp: 0,
        },
        p2: { id: "p2", turnsTaken: 1, victoryPoints: 0, xp: 0 },
      },
    });
    // Effective threshold = 10, distance = 4
    expect(evaluateAbilityCondition({ points: 2, type: "score-within" }, state, "p1")).toBe(false);
    expect(evaluateAbilityCondition({ points: 4, type: "score-within" }, state, "p1")).toBe(true);
  });

  test("opponent-score-within: true when any opponent is within N", () => {
    const state = baseState({
      players: {
        p1: { id: "p1", turnsTaken: 1, victoryPoints: 0, xp: 0 },
        p2: { id: "p2", turnsTaken: 1, victoryPoints: 7, xp: 0 },
      },
    });
    expect(
      evaluateAbilityCondition({ points: 1, type: "opponent-score-within" }, state, "p1"),
    ).toBe(true);
    expect(
      evaluateAbilityCondition({ points: 0, type: "opponent-score-within" }, state, "p1"),
    ).toBe(false);
  });

  test("control-battlefield: true when controller holds at least one battlefield", () => {
    const state = baseState({
      battlefields: {
        bf1: { contested: false, controller: "p2", id: "bf1" },
        bf2: { contested: false, controller: null, id: "bf2" },
      },
    });
    expect(evaluateAbilityCondition({ type: "control-battlefield" }, state, "p1")).toBe(false);
    expect(evaluateAbilityCondition({ type: "control-battlefield" }, state, "p2")).toBe(true);
  });

  test("while-buffed: needs ctx + source; uses meta.buffed", () => {
    const state = baseState();
    const metas = new Map<string, Partial<RiftboundCardMeta>>([
      ["c1", { buffed: true }],
      ["c2", { buffed: false }],
    ]);
    const ctx = {
      getCardMeta: (id: string) => metas.get(id),
      sourceCardId: "c1",
    };
    expect(evaluateAbilityCondition({ type: "while-buffed" }, state, "p1", ctx)).toBe(true);
    expect(
      evaluateAbilityCondition({ type: "while-buffed" }, state, "p1", { ...ctx, sourceCardId: "c2" }),
    ).toBe(false);
    // Permissive fallback when ctx missing
    expect(evaluateAbilityCondition({ type: "while-buffed" }, state, "p1")).toBe(true);
  });

  test("while-mighty: true iff source has positive runtime might bonus", () => {
    const state = baseState();
    const metas = new Map<string, Partial<RiftboundCardMeta>>([
      ["c1", { mightModifier: 2 }],
      ["c2", { combatMightModifier: 1 }],
      ["c3", { mightModifier: -1, staticMightBonus: 0 }],
      ["c4", { mightModifier: 0, staticMightBonus: 0 }],
    ]);
    const ctx = (id: string) => ({
      getCardMeta: (cid: string) => metas.get(cid),
      sourceCardId: id,
    });
    expect(evaluateAbilityCondition({ type: "while-mighty" }, state, "p1", ctx("c1"))).toBe(true);
    expect(evaluateAbilityCondition({ type: "while-mighty" }, state, "p1", ctx("c2"))).toBe(true);
    expect(evaluateAbilityCondition({ type: "while-mighty" }, state, "p1", ctx("c3"))).toBe(false);
    expect(evaluateAbilityCondition({ type: "while-mighty" }, state, "p1", ctx("c4"))).toBe(false);
  });

  test("unknown shape: permissive (returns true)", () => {
    const state = baseState();
    expect(
      evaluateAbilityCondition({ type: "some-future-unmodelled-thing" }, state, "p1"),
    ).toBe(true);
  });

  test("non-object / undefined / null condition: permissive", () => {
    const state = baseState();
    expect(evaluateAbilityCondition(undefined, state, "p1")).toBe(true);
    expect(evaluateAbilityCondition(null, state, "p1")).toBe(true);
    expect(evaluateAbilityCondition("not-an-object", state, "p1")).toBe(true);
  });

  test("legion + while-level still work (regression)", () => {
    const state = baseState({
      cardsPlayedThisTurn: { p1: 1, p2: 0 },
      players: {
        p1: { id: "p1", turnsTaken: 1, victoryPoints: 0, xp: 6 },
        p2: { id: "p2", turnsTaken: 1, victoryPoints: 0, xp: 0 },
      },
    });
    expect(evaluateAbilityCondition({ type: "legion" }, state, "p1")).toBe(true);
    expect(evaluateAbilityCondition({ type: "legion" }, state, "p2")).toBe(false);
    expect(evaluateAbilityCondition({ threshold: 5, type: "while-level" }, state, "p1")).toBe(true);
    expect(evaluateAbilityCondition({ threshold: 7, type: "while-level" }, state, "p1")).toBe(false);
  });
});
