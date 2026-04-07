# Cost System Overhaul

## Context

| Field | Value |
|-------|-------|
| **Date Started** | 2026-04-06 |
| **Branch** | `main` |
| **Related Issues** | N/A |
| **Author** | AI Agent |

## Problem Statement

Cards always pay their base cost with no modification layer. 48 cards use additional costs and 19 cards use cost reduction, but all are currently inert. Need to add cost modifier tracking, effect types, and apply modifiers during cost checks.

## Research & Analysis

### Key Files

| File | Relevance |
|------|-----------|
| `packages/riftbound-engine/src/types/game-state.ts` | Add costModifier to RiftboundCardMeta, additionalCostsPaid to RiftboundGameState |
| `packages/riftbound-engine/src/game-definition/moves/cards.ts` | Apply cost modifiers in deductCost() and canAffordCard() |
| `packages/riftbound-engine/src/abilities/effect-executor.ts` | Add cost-reduction, cost-increase, additional-cost effect types |
| `packages/riftbound-engine/src/abilities/static-abilities.ts` | Add paid-additional-cost condition |
| `packages/riftbound-engine/src/operations/card-lookup.ts` | Registry canAfford/getCostToDeduct used by moves |

### Existing Patterns

- Card meta uses optional fields (e.g., `mightModifier?: number`)
- Effect executor uses switch/case with getTargetIds and resolveAmount helpers
- Static abilities use evaluateCondition with string-based condition types
- Cost checking uses registry.canAfford() and registry.getCostToDeduct()

## Implementation Log

### 2026-04-06

- [x] Add costModifier to RiftboundCardMeta
- [x] Add additionalCostsPaid to RiftboundGameState
- [x] Add cost-reduction effect to effect-executor
- [x] Add cost-increase effect to effect-executor
- [x] Add additional-cost effect to effect-executor
- [x] Add paid-additional-cost condition to static-abilities
- [x] Apply cost modifiers in canAffordCard()
- [x] Apply cost modifiers in deductCost()
- [x] Write tests

## Status

- [x] Memory Bank created
- [x] Implementation complete
- [x] Tests passing (409/409, including 17 new cost-system tests)
- [x] Type check passing (0 new errors; 3 pre-existing errors in playFromChampionZone)
- [x] Format check passing
