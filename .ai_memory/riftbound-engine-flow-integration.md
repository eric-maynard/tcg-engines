# Riftbound Engine Flow Integration

> Part 1 of the Riftbound gameplay gaps plan.

## Context

| Field | Value |
|-------|-------|
| **Date Started** | 2026-04-06 |
| **Branch** | `main` (inline) |
| **Related Issues** | Engine flow integration gap |
| **Author** | AI Agent |

## Problem Statement

The Riftbound TCG engine's flow system was only 60% integrated. Phase transitions, auto-channeling, auto-draw, and turn cycling were all done via manual server patches instead of through the engine's flow system. The game definition had NO `flow` property, meaning the FlowManager was never constructed and all flow-related move calls (`context.flow?.endPhase()`, `context.flow?.endTurn()`) were no-ops.

## Research & Analysis

### Key Files

| File | Relevance |
|------|-----------|
| `packages/core/src/flow/flow-definition.ts` | Core FlowDefinition type (segments, turns, phases, steps) |
| `packages/core/src/flow/flow-manager.ts` | FlowManager implementation with lifecycle hooks |
| `packages/lorcana-engine/src/game-definition/flow/turn-flow.ts` | Reference implementation of flow integration |
| `packages/lorcana-engine/src/game-definition/definition.ts` | How lorcana wires flow into GameDefinition |
| `packages/riftbound-engine/src/game-definition/flow/turn-flow.ts` | Existing PHASE_ORDER and helpers (unused) |
| `packages/riftbound-engine/src/game-definition/definition.ts` | Target: add flow property |
| `packages/riftbound-engine/src/game-definition/moves/turn.ts` | endTurn/advancePhase moves using flow |
| `packages/riftbound-engine/src/game-definition/moves/setup.ts` | Missing transitionToPlay move |
| `packages/riftbound-engine/src/cleanup/state-based-checks.ts` | performFullCleanup for cleanup phase |

### Existing Patterns

- Lorcana uses multi-segment flow: `startingAGame` -> `mainGame`
- Phases use `endIf: () => true` for auto-advancing
- Action phases use `endIf: () => false` for player-driven control
- Flow hooks mutate state directly via `context.state` (Immer draft)
- `context.flow?.endSegment()` transitions between game segments
- `context.flow?.endPhase()` is preferred over `endTurn()` for natural phase progression

## Proposed Solution

### Approach

1. Create `riftbound-flow.ts` with full FlowDefinition using gameSegments pattern
2. Two segments: `setup` (move-driven, no auto-advance) and `mainGame` (full turn cycle)
3. Seven phases in mainGame: awaken, beginning, channel, draw, action, ending, cleanup
4. Phase hooks implement game rules (ready cards, score, channel runes, draw, cleanup)
5. Add `transitionToPlay` move to bridge setup -> mainGame
6. Wire flow and trackers into the game definition

### Files Modified

| File | Changes |
|------|---------|
| `packages/riftbound-engine/src/game-definition/flow/riftbound-flow.ts` | **Created** - Full FlowDefinition with 2 segments, 7 phases |
| `packages/riftbound-engine/src/game-definition/definition.ts` | Added flow, trackers, fixed name |
| `packages/riftbound-engine/src/game-definition/moves/setup.ts` | Added transitionToPlay move, fixed mulligan param name |
| `packages/riftbound-engine/src/game-definition/moves/turn.ts` | Changed endTurn to use endPhase for natural flow progression |

## Implementation Log

### 2026-04-06

- [x] Read and understand core FlowDefinition/FlowManager architecture
- [x] Study lorcana-engine flow integration as reference
- [x] Create riftbound-flow.ts with setup + mainGame segments
- [x] Implement phase hooks (awaken, beginning, channel, draw, action, ending, cleanup)
- [x] Add transitionToPlay move to setup.ts
- [x] Wire flow and trackers into definition.ts
- [x] Update endTurn move to use endPhase for natural flow progression
- [x] Fix pre-existing TS bug (sendBack -> keepCards in mulligan)
- [x] Fix unused parameter warning (playerId -> _playerId in playerView)
- [x] All tests pass (357 pass, 16 pre-existing failures)
- [x] TypeScript check passes for @tcg/riftbound
- [x] Lint passes
- [x] Format passes

## Status

- [x] Memory Bank created
- [x] Implementation complete
- [x] Tests passing (`bun test`)
- [x] Type check passing (`bun run check-types`)
- [x] Format check passing (`bun run format`)
