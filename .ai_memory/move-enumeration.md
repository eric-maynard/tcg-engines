# Move Enumeration for Riftbound Engine

## Context

| Field | Value |
|-------|-------|
| **Date Started** | 2026-04-06 |
| **Branch** | `main` |
| **Related Issues** | N/A |
| **Author** | AI Agent (Claude Code) |

## Problem Statement

The Riftbound engine's move definitions only had `reducer` functions. The core engine supports `condition` (validates if a move is legal) and `enumerator` (generates all valid parameter combinations), but these were not implemented. As a result, `engine.enumerateMoves()` returned nothing useful, and the server (`apps/riftbound-app/server.ts`) had a manual `buildAvailableMoves()` function that duplicated game logic.

## Research & Analysis

### Key Files

| File | Relevance |
|------|-----------|
| `packages/core/src/game-definition/move-definitions.ts` | Defines `GameMoveDefinition` with condition/enumerator signatures |
| `packages/core/src/moves/move-enumeration.ts` | `MoveEnumerationContext` type and `EnumeratedMove` result |
| `packages/core/src/moves/move-system.ts` | `MoveContext`, `ConditionFailure` types |
| `packages/riftbound-engine/src/types/moves.ts` | `RiftboundMoves` parameter types |
| `packages/riftbound-engine/src/types/game-state.ts` | `RiftboundGameState` structure |
| `packages/riftbound-engine/src/operations/card-lookup.ts` | `CardDefinitionRegistry` for card data |
| `apps/riftbound-app/server.ts` | Server-side `buildAvailableMoves` to replace |

## Implementation Log

### 2026-04-06

- [x] Added `condition` and `enumerator` to `turn.ts` (endTurn, pass, advancePhase, concede, readyAll, emptyRunePool)
- [x] Added `condition` and `enumerator` to `resources.ts` (exhaustRune, recycleRune, channelRunes, addResources, spendResources)
- [x] Added `condition` and `enumerator` to `movement.ts` (standardMove, gankingMove, recallUnit)
- [x] Added `condition` and `enumerator` to `combat.ts` (contestBattlefield, conquerBattlefield, scorePoint)
- [x] Enhanced existing `condition` and `enumerator` in `cards.ts` (playUnit, playGear, playSpell) with proper type/affordability filtering
- [x] Replaced `buildAvailableMoves` in `server.ts` with `engine.enumerateMoves()`
- [x] Updated 3 tests in `game-flow.test.ts` that relied on missing validation
- [x] All 392 riftbound-engine tests pass
- [x] Lint and format clean

## Status

- [x] Memory Bank created
- [x] Implementation complete
- [x] Tests passing (`bun test`)
- [x] Format check passing (`bun run format`)
