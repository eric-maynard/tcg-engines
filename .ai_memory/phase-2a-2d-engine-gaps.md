# Phase 2: Fix Engine Gaps for Parsed Abilities

## Context

| Field | Value |
|-------|-------|
| **Date Started** | 2026-04-03 |
| **Branch** | `main` |
| **Related Issues** | Riftbound card implementation Phase 2 |
| **Author** | AI Agent |

## Problem Statement

The ability parser already produces structured ability data for Riftbound cards, but the engine lacks support for several keywords (Ambush, Backline, Hunt), trigger events (play-card, win-combat, choose, hide), the `enter-ready` effect, and dynamic AmountExpression resolution. This phase bridges those gaps.

## Implementation Log

### 2026-04-03

- [x] Task 2A: Add Ambush, Backline, Hunt keywords to types and engine definitions
- [x] Task 2A: Add sortByBacklinePriority() and integrate into combat resolver
- [x] Task 2B: Add play-card, win-combat, choose, hide events to GameEvent union
- [x] Task 2B: Add new events to EVENT_MAP in trigger-matcher
- [x] Task 2B: Fire play-card from playUnit, playGear, playSpell reducers
- [x] Task 2B: Fire hide from hideCard reducer
- [x] Task 2C: Add enter-ready effect handler in effect-executor
- [x] Task 2D: Add resolveAmount() helper for AmountExpression
- [x] Task 2D: Update damage, draw, and other effect cases to use resolveAmount
- [x] Write tests for all additions

## Status

- [x] Memory Bank created
- [x] Implementation complete
- [ ] Tests passing (`bun test`)
- [ ] Type check passing (`bun run check-types`)
- [ ] Format check passing (`bun run format`)
