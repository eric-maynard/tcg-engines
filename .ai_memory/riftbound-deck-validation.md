# Riftbound Deck Validation

> Phase 11 from IMPLEMENTATION-PLAN.md: Enforce deck construction rules.

## Context

| Field | Value |
|-------|-------|
| **Date Started** | 2026-04-02 |
| **Branch** | `main` |
| **Related Issues** | Phase 11 in riftbound-rules/IMPLEMENTATION-PLAN.md |
| **Author** | AI Agent |

## Problem Statement

Riftbound decks must be validated before gameplay according to rules 101-103. There is currently no deck validation logic in the riftbound-engine package. Players need to know if their deck is legal before starting a game.

## Research & Analysis

### Key Files

| File | Relevance |
|------|-----------|
| `packages/riftbound-types/src/cards/card-types.ts` | Card type definitions (UnitCard, LegendCard, RuneCard, etc.) |
| `packages/riftbound-types/src/abilities/cost-types.ts` | Domain type definition (includes "rainbow") |
| `packages/riftbound-engine/src/validators/move-validators.ts` | Existing validation pattern to follow |
| `packages/riftbound-engine/src/types/moves.ts` | Domain type (without "rainbow") |
| `riftbound-rules/version-2025-06-02/100-game-concepts.md` | Authoritative rules source |

### Existing Patterns

- Validators use `ValidationResult` with `isValid` and `errors` array
- Error objects have `code` and `message` fields
- Type-only imports used throughout
- Card types imported from `@tcg/riftbound-types/cards`

## Proposed Solution

### Approach

Create a `validateDeck` function that checks all 9 deck construction rules, returning all errors (not failing fast on the first). Use the Domain type from riftbound-types (which includes "rainbow") for domain matching.

### Files to Modify

| File | Changes |
|------|---------|
| `packages/riftbound-engine/src/validators/deck-validators.ts` | New file: deck validation logic |
| `packages/riftbound-engine/src/validators/index.ts` | Export new validators |
| `packages/riftbound-engine/src/__tests__/deck-validation.test.ts` | New file: comprehensive tests |

## Implementation Log

### 2026-04-02

- [x] Create memory bank log
- [x] Implement deck-validators.ts
- [x] Implement deck-validation.test.ts
- [x] Export from validators/index.ts
- [x] Verify types compile
- [x] Verify tests pass

## Status

- [x] Memory Bank created
- [x] Implementation complete
- [x] Tests passing (`bun test`) - 44 tests, 69 assertions
- [x] Type check passing (`tsc --noEmit`)
- [x] Format check passing (`oxfmt`)
- [x] Lint clean on source (0 warnings), test file has standard test-only warnings
