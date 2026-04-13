---
name: engine-rules-audit
description: Exhaustively audit the Riftbound engine against the formal rules by generating targeted unit tests that exercise specific rule numbers. Use when you need deep rule compliance verification beyond what a playthrough test (visual monkey) can provide. Produces a per-rule compliance report and a persistent test suite that runs in CI.
---

# Engine Rules Audit Skill

This skill systematically tests the Riftbound engine against the **formal rules document** (rules 100-660+) by generating one targeted unit test per rule. Unlike the visual monkey test (which plays a single goldfish game and trusts the engine's move legality), this audit:

- **Does not trust the engine.** Each test constructs a minimal game state, applies a specific input, and asserts the exact expected output based on the rules text.
- **Covers every rule, not just the ones a single playthrough happens to exercise.** A 10-turn monkey game touches maybe 15% of the rules. This skill targets 100%.
- **Produces a persistent compliance suite** that runs on every CI build, preventing regressions.
- **Cites rule numbers directly** so failures point to the exact rule that's broken.

## When to Use This Skill

Use this skill when:
- You suspect the engine has rule-compliance bugs the monkey test can't find (like target resolution bugs, timing violations, missed triggers in specific zones)
- Before a major release — run the audit and fix any failing rules
- After landing significant engine changes to verify no rules regressed
- When building a CI gate for rule-compliance

**Don't use this skill for:**
- Testing UI/visual behavior (use visual monkey test)
- Testing full-game flow (use monkey test)
- Parser-only improvements (use improve-parser skill)

## How It Works

The skill runs in **four phases**, typically across 4-8 parallel agents.

### Phase 1: Rule Indexing (1 agent, ~5 min)

An "indexer" agent reads all four rules reference files and produces a structured JSON list of every testable rule:

```json
{
  "515.4.d": {
    "section": "Turn Structure",
    "subsection": "Draw Phase",
    "text": "As the Draw Phase ends, each player's Rune Pool empties.",
    "testable": true,
    "testType": "state-transition",
    "complexity": "simple",
    "relatedRules": ["159", "160.1", "517.2.c"]
  },
  "159": {
    "section": "Runes & Pools",
    "text": "The Rune Pool is a conceptual collection of a player's available Energy and Power available to pay Costs.",
    "testable": false,
    "reason": "definitional, not behavioral"
  }
}
```

Not every rule is testable — definitional rules (what a zone is, what a keyword means) don't need tests. The indexer marks each rule as `testable: true/false` and categorizes by test type:

- `state-transition` — rule describes what changes when X happens
- `legality` — rule describes when a move is/isn't legal
- `trigger-firing` — rule describes when a triggered ability must fire
- `effect-semantics` — rule describes how an effect resolves
- `invariant` — rule describes a state that must always hold

Output: `/tmp/rule-index.json` with ~300-500 testable rules.

### Phase 2: Test Scaffold Generation (4-8 parallel agents, ~10 min each)

Each agent takes one section of the rules (Turn Structure, Combat, Chain, Scoring, etc.) and generates test files following this template:

```typescript
// packages/riftbound-engine/src/__tests__/rules-audit/turn-structure.test.ts
import { describe, expect, it } from "bun:test";
import { createMinimalGameState, advancePhase, applyMove } from "./helpers";

describe("Rule 515.4.d: Rune Pool empties at end of Draw Phase", () => {
  it("resets energy counter to 0", () => {
    const state = createMinimalGameState({
      turn: 1,
      phase: "draw",
      runePools: { "player-1": { energy: 3, power: { fury: 1 } } },
    });
    advancePhase(state, "main"); // triggers draw.onEnd
    expect(state.runePools["player-1"].energy).toBe(0);
    expect(state.runePools["player-1"].power).toEqual({});
  });

  it("does NOT empty rune cards from the board (rule 159)", () => {
    const state = createMinimalGameState({
      turn: 1,
      phase: "draw",
      runesOnBoard: { "player-1": 4 },
    });
    advancePhase(state, "main");
    // Rule 159: Rune Pool is a *conceptual* pool, not the zone of cards
    expect(getRunesOnBoard(state, "player-1").length).toBe(4);
  });
});
```

Each test file groups tests by rule number. Every test name starts with `Rule <number>:` for traceability.

Agents use these helpers in `packages/riftbound-engine/src/__tests__/rules-audit/helpers.ts`:

- `createMinimalGameState(overrides)` — builds a game state with sensible defaults
- `createCard(id, overrides)` — puts a specific card in a specific zone
- `advancePhase(state, targetPhase)` — runs all phase hooks until target phase
- `applyMove(state, moveName, params)` — runs a move through the engine
- `assertTriggered(state, cardId, triggerType)` — verifies a triggered ability fired
- `getZone(state, player, zone)` — reads a zone's card list

If these helpers don't exist, Phase 2's first task is to create them.

### Phase 3: Execution + Fix Loop (1 agent, ~20 min)

An executor agent runs the full audit suite (`bun test packages/riftbound-engine/src/__tests__/rules-audit/`) and for each failing test:

1. Reads the test and the cited rule
2. Determines whether the bug is in the test or the engine
3. If engine: reports it with rule number, expected behavior, actual behavior, and file:line of the engine code that's wrong
4. If test: fixes the test

The executor produces `/tmp/rules-audit-failures.md` with a list of engine bugs. **The executor does NOT fix engine bugs automatically** — those need human review because each bug could be a deep rule interpretation.

### Phase 4: Compliance Report (1 agent, ~5 min)

Reads `/tmp/rule-index.json`, the test files, and the failure report. Produces `/tmp/rules-audit-report.md`:

```markdown
# Riftbound Engine Rules Audit Report

## Summary
- Rules indexed: 412
- Testable rules: 287
- Tests written: 287
- Tests passing: 279 (97.2%)
- Tests failing: 8 (2.8%)
- Rules not yet covered: 0

## Coverage by Section
| Section | Rules | Covered | Passing | Failing |
|---------|-------|---------|---------|---------|
| Turn Structure | 42 | 42 | 41 | 1 |
| Combat | 28 | 28 | 28 | 0 |
| Chain | 35 | 35 | 33 | 2 |
| Scoring | 18 | 18 | 18 | 0 |
| ...

## Failing Rules (Priority)
### CRITICAL
1. Rule 548.2 (Showdown on move to uncontrolled battlefield)
   - Expected: Showdown initiated when unit moves to empty uncontrolled battlefield
   - Actual: Conquer available immediately, no showdown state entered
   - File: packages/riftbound-engine/src/game-definition/moves/movement.ts:214
   - Impact: Opponents cannot play Reactions before conquer resolves

### HIGH
2. Rule 632.2.b (Hold abilities trigger at a Battlefield that was Held)
   - ...
```

## Required Project Context

The agent running this skill must know:
- Engine API surface (reading game-state.ts, moves, flow definition)
- Formal rules location: `.claude/skills/riftbound-rules/references/*.md`
- Test infrastructure: bun test, `@tcg/core/testing` helpers if available
- **The rules primer** (see references/rules-primer.md) — same primer the visual monkey observer uses to avoid misinterpreting rule terms

## Execution Command

Typical invocation:

```bash
# Run this skill as a slash command
/engine-rules-audit

# Or target a specific section
/engine-rules-audit combat
/engine-rules-audit chain
```

The skill orchestrates phases 1-4 and reports the final compliance rate.

## Differences from Other Skills

| Skill | Focus | Trusts engine? | Depth |
|-------|-------|---------------|-------|
| `visual-monkey-test` | UI behavior + one game flow | Yes (reads move lists from engine) | Shallow (1 game) |
| `monkey-test` | Full-game via WebSocket | Yes | Shallow (1 game) |
| `improve-parser` | Card text → ability structure | N/A | Card-by-card |
| **`engine-rules-audit`** | **Every formal rule vs engine behavior** | **No — independently asserts outcomes** | **Deep (every rule)** |

## References

- `references/rules-primer.md` — rules definitions to avoid misinterpretation (same as observer primer)
- `references/test-template.md` — canonical test file template
- `references/helper-api.md` — what the test helpers should support
- `references/rule-categories.md` — how to group rules into test files
