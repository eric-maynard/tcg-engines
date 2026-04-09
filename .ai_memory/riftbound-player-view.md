# Riftbound Player View (Information Hiding)

> Implements the playerView function for the Riftbound TCG engine.

## Context

| Field | Value |
|-------|-------|
| **Date Started** | 2026-04-02 |
| **Branch** | `main` |
| **Related Issues** | N/A |
| **Author** | AI Agent |

## Problem Statement

The Riftbound game definition currently has a no-op playerView that returns the full state:
`playerView: (state, _playerId) => state`. This exposes all game state to all players, violating
the information hiding rules defined in the Riftbound rulebook (rules 124, 127).

## Research & Analysis

### Key Files

| File | Relevance |
|------|-----------|
| `packages/riftbound-engine/src/game-definition/definition.ts` | Game definition with playerView to update |
| `packages/riftbound-engine/src/types/game-state.ts` | RiftboundGameState type |
| `packages/riftbound-engine/src/zones/zone-configs.ts` | Zone visibility already configured |
| `packages/core/src/game-definition/game-definition.ts` | playerView signature: `(state, playerId) => state` |

### Existing Patterns

- Core engine example: filters `players` array, hiding opponent hand/deck
- Zone configs already define visibility (secret, private, public)
- Zone filtering handled by core engine via zone configs
- Game-specific state (runePools, battlefields, etc.) needs filtering in playerView

### Visibility Rules

| Zone | Visibility | Notes |
|------|-----------|-------|
| Hand | Private | Owner sees cards, others see count only |
| Main Deck | Secret | No one sees order |
| Rune Deck | Secret | No one sees order |
| Trash | Public | All see |
| Banishment | Public | All see |
| Base | Public | All see |
| Rune Pool | Public | Runes face-up on board |
| Battlefields | Public | All see |
| Facedown zones | Private | Only controller sees |
| Legend Zone | Public | All see |
| Champion Zone | Public | All see |
| Chain | Public | All see |

## Proposed Solution

### Approach

The `playerView` function filters the `RiftboundGameState` for a specific player. Since zone
contents are managed by the core engine (not in RiftboundGameState), most zone filtering is
already handled by zone configs. The playerView needs to handle game-specific state:

1. All game-specific state in `RiftboundGameState` is public (rune pools, battlefields, VP, turn state)
2. Card metadata (damage, exhausted, etc.) is public for visible cards
3. The `hidden` flag on card meta tracks facedown cards - the core handles zone-level visibility

The function returns a filtered copy of state.

### Files to Create/Modify

| File | Changes |
|------|---------|
| `packages/riftbound-engine/src/views/player-view.ts` | New - createPlayerView function |
| `packages/riftbound-engine/src/views/index.ts` | New - barrel export |
| `packages/riftbound-engine/src/__tests__/player-view.test.ts` | New - tests |
| `packages/riftbound-engine/src/game-definition/definition.ts` | Update playerView |
| `packages/riftbound-engine/src/index.ts` | Add views export |

## Implementation Log

### 2026-04-02

- [x] Research existing codebase patterns
- [x] Create memory bank log
- [x] Create player-view.ts with createPlayerView function
- [x] Create views/index.ts barrel export
- [x] Create player-view.test.ts with comprehensive tests (27 tests)
- [x] Update definition.ts to use createPlayerView
- [x] Update main index.ts to export views
- [x] Verify types and tests pass (60 tests, 0 failures)

## Status

- [x] Memory Bank created
- [x] Implementation complete
- [x] Tests passing (60/60)
- [x] Type check passing
- [x] Format check passing
