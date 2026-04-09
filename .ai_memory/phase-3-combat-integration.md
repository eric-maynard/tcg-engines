# Phase 3: Combat Integration

## Context

| Field | Value |
|-------|-------|
| **Date Started** | 2026-04-06 |
| **Branch** | `main` |
| **Related Issues** | Part of Riftbound gameplay gaps plan |
| **Author** | AI Agent (Claude) |

## Problem Statement

The Riftbound engine has a complete combat resolver (`combat-resolver.ts`) but the combat moves (`combat.ts`) never call it. The `resolveCombat` move only clears the contested flag. The `assignDamage` move just adds a damage counter. Combat never actually resolves through the proper combat flow.

## Research & Analysis

### Key Files

| File | Relevance |
|------|-----------|
| `packages/riftbound-engine/src/combat/combat-resolver.ts` | Complete resolver with `resolveCombat()`, `distributeDamage()`, `calculateSideMight()` |
| `packages/riftbound-engine/src/game-definition/moves/combat.ts` | Combat moves that need the new `resolveFullCombat` move |
| `packages/riftbound-engine/src/game-definition/moves/movement.ts` | Movement moves where auto-contest could be added |
| `packages/riftbound-engine/src/cleanup/state-based-checks.ts` | Already detects combatPending (Step 6, rule 524) |
| `packages/riftbound-engine/src/types/moves.ts` | Move type definitions (needs `resolveFullCombat` type) |
| `packages/riftbound-engine/src/types/game-state.ts` | State types, BattlefieldState, RiftboundCardMeta |
| `packages/riftbound-engine/src/operations/card-lookup.ts` | CardDefinitionRegistry for card data (might, keywords) |

### Existing Patterns

- Moves follow `reducer: (draft, context) => { ... }` pattern
- Context provides `zones`, `cards`, `counters` APIs
- Card metadata accessed via `context.cards.getCardMeta(cardId)`
- Zone cards accessed via `context.zones.getCardsInZone(zoneId)`
- Card ownership via `context.cards.getCardOwner(cardId)`
- State-based checks already handle auto-contest detection (rule 524)

## Proposed Solution

### Approach

1. Add `resolveFullCombat` move type to `RiftboundMoves` interface
2. Implement `resolveFullCombat` reducer that calls the existing combat resolver
3. Auto-contest is already handled by state-based checks (step 6 of `performCleanup`)
4. Write comprehensive tests

### Files to Modify

| File | Changes |
|------|---------|
| `packages/riftbound-engine/src/types/moves.ts` | Add `resolveFullCombat` move type |
| `packages/riftbound-engine/src/game-definition/moves/combat.ts` | Add `resolveFullCombat` move implementation |
| `packages/riftbound-engine/src/__tests__/combat-integration.test.ts` | New test file |

## Implementation Log

### 2026-04-06

- [x] Step 1: Read all relevant files
- [x] Step 2: Add resolveFullCombat type to moves.ts
- [x] Step 3: Implement resolveFullCombat in combat.ts
- [x] Step 4: Write tests
- [x] Step 5: Run tests and type checks

## Notes

- Auto-contest on movement is already handled by state-based checks (step 6 of `performCleanup`, rule 524). The check detects `combatPending` and reports it in the result. The game flow layer acts on this. No changes to `movement.ts` were needed.
- Dynamic battlefield zones (e.g., `battlefield-bf-1`) are not auto-created by `placeBattlefields`. This is a pre-existing gap. Tests use mock contexts (same pattern as `engine-gaps-phase2.test.ts`) to bypass this limitation.
- The `resolveFullCombat` move is automatically included in the moves index via the existing `...combatMoves` spread.
- The existing `resolveCombat` move (which only clears contested) is preserved for backward compatibility; `resolveFullCombat` is the new automated combat resolution.

## Status

- [x] Memory Bank created
- [x] Implementation complete
- [x] Tests passing (19/19 new tests pass; 16 pre-existing failures in other files)
- [x] Type check passing (`@tcg/riftbound` clean; failures in `@tcg/riftbound-cards` are pre-existing)
- [x] Format check passing
- [x] Lint check passing
