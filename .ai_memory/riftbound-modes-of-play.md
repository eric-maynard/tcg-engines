# Riftbound Modes of Play

## Context

| Field | Value |
|-------|-------|
| **Date Started** | 2026-04-02 |
| **Branch** | `main` |
| **Related Issues** | Rules 640-648 |
| **Author** | AI Agent |

## Problem Statement

The Riftbound engine currently hardcodes `victoryScore: 8` for 1v1 duels. The rules document (640-648) defines five sanctioned modes of play with different player counts, battlefield counts, victory scores, and first-turn rules. We need a game modes module to configure these variants.

## Research & Analysis

### Key Files

| File | Relevance |
|------|-----------|
| `packages/riftbound-engine/src/types/game-state.ts` | Has `victoryScore` field on `RiftboundGameState` |
| `packages/riftbound-engine/src/game-definition/setup/game-setup.ts` | Hardcodes `victoryScore: 8` in `createInitialState` |
| `packages/riftbound-engine/src/game-definition/definition.ts` | Wires setup into the game definition |
| `packages/riftbound-engine/src/index.ts` | Main barrel exports |
| `riftbound-rules/version-2025-06-02/640-modes-of-play.md` | Authoritative rules for all modes |

### Existing Patterns

- Types use `readonly` fields
- Files are kebab-case
- Tests use `bun:test` with `describe`/`test` blocks
- Barrel exports via `index.ts`
- Type-only imports with `import type`

## Proposed Solution

### Approach

1. Create `game-modes.ts` with `GameMode` type, `GameModeConfig` interface, and `GAME_MODES` constant
2. Create barrel export `modes/index.ts`
3. Update `game-setup.ts` to accept an optional `GameMode` parameter
4. Add comprehensive tests
5. Export from main `index.ts`

### Files to Modify

| File | Changes |
|------|---------|
| `packages/riftbound-engine/src/modes/game-modes.ts` | New: mode configs |
| `packages/riftbound-engine/src/modes/index.ts` | New: barrel export |
| `packages/riftbound-engine/src/__tests__/game-modes.test.ts` | New: tests |
| `packages/riftbound-engine/src/game-definition/setup/game-setup.ts` | Update: accept mode param |
| `packages/riftbound-engine/src/index.ts` | Update: export modes |

## Implementation Log

### 2026-04-02

- [x] Create memory bank log
- [x] Create game-modes.ts with all mode configurations
- [x] Create modes/index.ts barrel export
- [x] Create game-modes.test.ts
- [x] Update game-setup.ts to use modes
- [x] Update main index.ts exports
- [x] Verify types and tests pass

## Status

- [x] Memory Bank created
- [ ] Implementation complete
- [ ] Tests passing (`bun test`)
- [ ] Type check passing (`bun run check-types`)
- [ ] Format check passing (`bun run format`)
