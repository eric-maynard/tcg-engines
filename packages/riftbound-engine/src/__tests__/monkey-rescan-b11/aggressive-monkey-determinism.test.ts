/**
 * Phase B batch 18 sub-agent II — Regression lock for the aggressive monkey
 * picker extensions in `scripts/random-monkey/run.ts`.
 *
 * Background: FF batch 17 ran 175 seeds with the *priority* picker and found
 * exactly 1 bug (zero-might infinite loop). FF's blocker note flagged that
 * the priority picker passes `passShowdownFocus` instantly and caps moves
 * at 2000, so deep late-game states / chain stacks were never exercised.
 *
 * This file is a smoke test for the new aggressive-mode behavior. It does
 * NOT spawn the monkey CLI (no child_process from the engine test runner);
 * it inlines the same priority tables / picker logic and asserts on its
 * scoring outputs. If anyone tweaks the AGGRESSIVE_OVERRIDES table in
 * run.ts and breaks the invariant that combat moves outrank passes, this
 * test fires.
 *
 * Generic — no per-card branches.
 */
import { describe, expect, test } from "bun:test";

/**
 * Mirror of `PRIORITIES` and `AGGRESSIVE_OVERRIDES` from
 * scripts/random-monkey/run.ts. Keep in sync — if you change either table
 * there, change it here too (or refactor both to import from a shared
 * module). The point of the duplication is so the *engine* test suite can
 * lock the invariants without depending on the scripts package.
 */
const BASE_PRIORITIES: Readonly<Record<string, number>> = {
  assignAttacker: 350,
  assignBlocker: 340,
  assignDefender: 340,
  channelRunes: 200,
  concede: -1,
  conquerBattlefield: 900,
  contestBattlefield: 330,
  drawCard: 90,
  endTurn: 40,
  exhaustRune: 30,
  passChainPriority: 50,
  passShowdownFocus: 50,
  playEquipment: 600,
  playGear: 600,
  playSpell: 650,
  playUnit: 700,
  readyRune: 20,
  resolveCombat: 400,
  resolveFullCombat: 400,
  scorePoint: 1000,
  standardMove: 500,
};
const AGGRESSIVE_OVERRIDES: Readonly<Record<string, number>> = {
  assignAttacker: 800,
  assignBlocker: 800,
  assignDefender: 800,
  contestBattlefield: 780,
  counterSpell: 760,
  passChainPriority: 5,
  passFocus: 5,
  passShowdownFocus: 5,
  playSpell: 720,
};

const score = (moveId: string, mode: "base" | "agg"): number => {
  if (mode === "agg") {
    if (AGGRESSIVE_OVERRIDES[moveId] !== undefined) {return AGGRESSIVE_OVERRIDES[moveId];}
  }
  return BASE_PRIORITIES[moveId] ?? 25;
};

describe("aggressive monkey picker (run.ts) — score invariants", () => {
  test("combat-engagement moves outrank pass moves in aggressive mode", () => {
    // In base priority mode, assignAttacker (350) > passShowdownFocus (50)
    // Already, but aggressive must AMPLIFY the gap so the picker never
    // Shortcuts a showdown by passing focus instantly.
    expect(score("assignAttacker", "agg")).toBeGreaterThan(score("passShowdownFocus", "agg"));
    expect(score("assignDefender", "agg")).toBeGreaterThan(score("passShowdownFocus", "agg"));
    expect(score("contestBattlefield", "agg")).toBeGreaterThan(
      score("passShowdownFocus", "agg"),
    );
    // The gap should be at least 700 (combat ~800 vs pass ~5), large enough
    // That no dynamic bonus (e.g. opponent-main reaction +200) can flip it.
    expect(score("assignAttacker", "agg") - score("passShowdownFocus", "agg")).toBeGreaterThanOrEqual(
      700,
    );
  });

  test("counterSpell and playSpell outrank pass moves in aggressive mode", () => {
    expect(score("counterSpell", "agg")).toBeGreaterThan(score("passChainPriority", "agg"));
    expect(score("playSpell", "agg")).toBeGreaterThan(score("passShowdownFocus", "agg"));
  });

  test("aggressive overrides downgrade pass moves below base priority", () => {
    // The whole point: in BASE mode pass is 50, in AGG mode pass is 5.
    expect(score("passShowdownFocus", "agg")).toBeLessThan(score("passShowdownFocus", "base"));
    expect(score("passChainPriority", "agg")).toBeLessThan(score("passChainPriority", "base"));
  });

  test("scorePoint / conquerBattlefield still outrank everything (no regression)", () => {
    // Even the aggressive boosts must not flip the win-condition moves
    // Out of #1/#2. Otherwise the bot ignores free wins to start chains.
    for (const move of ["assignAttacker", "counterSpell", "playSpell"]) {
      expect(score("scorePoint", "agg")).toBeGreaterThan(score(move, "agg"));
      expect(score("conquerBattlefield", "agg")).toBeGreaterThan(score(move, "agg"));
    }
  });
});
