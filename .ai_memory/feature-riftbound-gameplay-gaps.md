# Riftbound Gameplay Gaps - 6-Part Feature

> Implementation of 6 critical gameplay systems to close gaps in the Riftbound TCG gameplay page.

## Context

| Field | Value |
|-------|-------|
| **Date Started** | 2026-04-06 |
| **Branch** | `feature/riftbound-gameplay-gaps` |
| **Related Issues** | Gameplay page integration |
| **Author** | AI Agent (Claude) |
| **Status** | Starting Part 1: Engine Flow Integration |

## Problem Statement

The Riftbound TCG gameplay page has incomplete integration of core gameplay systems. Players cannot:
1. Progress through game phases via flow system
2. Properly save/load decks and transition to play
3. Execute combat with visual feedback
4. See current phase or end their turn
5. Navigate resource payment for card abilities
6. View combat matchups or damage calculations

These gaps prevent functional gameplay and create a disjointed user experience. Each part addresses a specific system integration needed for complete gameplay flow.

## Research & Analysis

### Key Files

| File | Relevance |
|------|-----------|
| `packages/riftbound-engine/src/game-definition/` | Game definition, moves, zones |
| `packages/riftbound-engine/src/types/moves.ts` | Move definitions and types |
| `packages/riftbound-engine/src/types/game-state.ts` | Game state structure |
| `packages/riftbound-engine/src/index.ts` | Public exports |
| `packages/riftbound-cards/src/parser/` | Card ability parsing |
| `packages/riftbound-cards/src/data/index.ts` | Card data exports |
| Game definitions (moves, setup) | Flow system and phase handling |

### Existing Patterns

- Game state uses Immer for immutable updates
- Moves defined declaratively with `canMake` and `execute`
- Zones managed through core zone operations
- Card abilities parsed from text descriptions
- Flow system for phase progression

## Proposed Solution

### Approach

**6-Part Sequential Implementation:**

1. **Engine Flow Integration** - Wire the flow system for automatic phase advancement
2. **Server Correctness** - Implement saved deck loading, transition to play, phase events
3. **Combat Integration** - Wire combat resolver into executable moves
4. **Phase/EndTurn/GameOver UI** - Add visible phase bar and end turn button
5. **Resource Payment Flow** - Implement guided rune exhaustion when playing cards
6. **Combat UI** - Add showdown unit display and damage preview

Each part builds on the previous. Parts 1-3 focus on backend/engine correctness. Parts 4-6 focus on frontend/UI integration.

### Files to Modify

| File | Changes |
|------|---------|
| `packages/riftbound-engine/src/game-definition/moves/` | Add/update move definitions |
| `packages/riftbound-engine/src/game-definition/setup.ts` | Flow system initialization |
| `packages/riftbound-engine/src/types/moves.ts` | Move parameter types |
| `packages/riftbound-engine/src/types/game-state.ts` | Game state extensions if needed |
| `packages/riftbound-engine/src/index.ts` | Exports for new moves |
| Frontend gameplay components | Phase display, buttons, combat UI |

### Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Implement all 6 parts in single PR | Fewer PRs, comprehensive | Too large, harder to review, higher risk | **Rejected** - do steering PR then iterate |
| Sequential PRs per part | Small, reviewable, lower risk | More PRs, requires coordination | **Chosen** - steering PR + 6 focused PRs |
| Hardcode phase flow in UI | Faster initial implementation | Violates core/engine separation, brittle | **Rejected** - use flow system |

### Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Flow system coupling errors | Thorough testing of phase transitions, validate with existing test patterns |
| Incomplete game state during transitions | Ensure all state updates complete before next phase, use Immer properly |
| Combat resolver performance issues | Profile combat calculations, optimize if needed post-implementation |
| Frontend/backend sync issues | Clear move definitions, comprehensive test coverage for move validation |

## Implementation Log

### 2026-04-06

- [ ] Part 1: Engine Flow Integration
  - [ ] Review existing flow system in game-definition
  - [ ] Understand phase progression mechanism
  - [ ] Wire automatic phase advancement
  - [ ] Write tests for phase transitions
  
- [ ] Part 2: Server Correctness
  - [ ] Implement saved deck loading
  - [ ] Implement transitionToPlay move
  - [ ] Wire phase change events
  - [ ] Test deck loading -> play transition

- [ ] Part 3: Combat Integration
  - [ ] Review combat resolver logic
  - [ ] Create combat execution move
  - [ ] Wire resolver into move execution
  - [ ] Test combat move validation

- [ ] Part 4: Phase/EndTurn/GameOver UI
  - [ ] Add phase bar component
  - [ ] Wire current phase display
  - [ ] Implement end turn button
  - [ ] Handle game over state

- [x] Part 5: Resource Payment Flow
  - [x] Add "costPayment" interaction mode to state machine
  - [x] Enhanced enterHandCardSelected() with costPayment entry
  - [x] handleCostPaymentRuneClick() for inline rune actions
  - [x] showCostPaymentRuneChoice() for exhaust/recycle decision
  - [x] reevaluateCostPayment() after state updates
  - [x] Domain-specific recycle labels in showRuneActionBar()
  - [x] Resource delta floating animation (showResourceDelta)
  - [x] Auto-highlight tappable runes (.rune-tappable CSS class)
  - [x] Preserve costPayment mode across move_accepted WS events

- [ ] Part 6: Combat UI
  - [ ] Create showdown unit display
  - [ ] Implement damage preview
  - [ ] Wire combat visuals to resolver
  - [ ] Test UI integration

## Review Checklist (The Gauntlet)

Before submitting for review, ensure your code passes all three checks:

### Style (Linter Agent)

- [ ] Follows `.claude/rules/code-style.md`
- [ ] No TypeScript `any` types
- [ ] Proper import ordering (type imports first)
- [ ] Oxc formatting applied (`bun run format`)
- [ ] No unused variables or imports
- [ ] Immutable state updates via Immer

### Logic (Analyst Agent)

- [ ] Game rules correctly implemented per `.claude/rules/domain-concepts.md`
- [ ] Phase transitions follow correct order
- [ ] Card payment mechanics follow Riftbound rules
- [ ] Combat calculations accurate
- [ ] Edge cases handled (empty hand, no valid moves, etc.)
- [ ] Tests cover happy path and error cases (95%+ coverage target)

### Architecture (Tech Lead Agent)

- [ ] No code duplication (DRY principle)
- [ ] Follows declarative move pattern
- [ ] Core vs game engine logic correctly separated
- [ ] Zone operations use core framework
- [ ] Proper error handling with Result types
- [ ] State changes only through Immer

## Status

- [ ] Memory Bank created
- [ ] Plan approved (Steering PR if needed)
- [ ] Part 1 complete
- [ ] Part 2 complete
- [ ] Part 3 complete
- [ ] Part 4 complete
- [ ] Part 5 complete
- [ ] Part 6 complete
- [ ] All tests passing (`bun test`)
- [ ] Type check passing (`bun run check-types`)
- [ ] Format check passing (`bun run format`)
- [ ] PR merged
