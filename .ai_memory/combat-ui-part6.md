# Part 6: Combat UI

## Context

| Field | Value |
|-------|-------|
| **Date Started** | 2026-04-06 |
| **Branch** | `main` |
| **Related Issues** | Riftbound gameplay gaps plan, Part 6 |
| **Author** | AI Agent (Claude) |

## Problem Statement

The Riftbound gameplay page's combat showdown overlay was minimal -- it showed the battlefield name, side labels, and pass/resolve buttons, but the side-units containers were never populated with actual unit cards. There was no damage visualization, no combat preview, and no combat outcome animation.

## Research & Analysis

### Key Files

| File | Relevance |
|------|-----------|
| `apps/riftbound-app/public/gameplay.html` | Main gameplay UI (vanilla HTML/CSS/JS) |
| `packages/riftbound-engine/src/types/game-state.ts` | Card meta, granted keywords, battlefield state |
| `packages/riftbound-engine/src/chain/chain-state.ts` | ShowdownState interface |

### Existing Patterns

- `renderCardElement()` renders cards at 72x100px in battlefield zones
- `showCoinFlip()` and `showChannelBanner()` use overlay animation patterns
- `.toast` CSS class for temporary notifications
- `animateCardFly()` for card movement animations
- Card keywords from `rulesText` use `[Keyword N]` bracket syntax
- `meta.grantedKeywords` for runtime keyword grants

## Proposed Solution

### Approach

1. Add CSS for showdown cards, combat preview, outcome overlay, and damage animations
2. Enhance `renderChainOverlay()` to populate showdown sides with rendered unit cards
3. Add combat preview bar showing Might comparison and prediction text
4. Add combat result detection by comparing previous/current game state
5. Add floating damage numbers and destroyed card overlays
6. Add combat outcome announcement banner
7. Ensure non-combat showdowns still work correctly

### Files Modified

| File | Changes |
|------|---------|
| `apps/riftbound-app/public/gameplay.html` | Added CSS, enhanced renderChainOverlay, added 6 new functions, added combatOutcome DOM element |

## Implementation Log

### 2026-04-06

- [x] Added CSS for showdown cards (`.showdown-card`), keyword badges (`.kw-badge`), combat preview (`.combat-preview`), combat outcome overlay (`.combat-outcome`), floating damage (`.floating-damage`), destroyed overlay (`.destroyed-overlay`)
- [x] Enhanced `renderChainOverlay()` to populate showdown sides with unit cards and combat preview
- [x] Added `renderShowdownCard()` for compact card rendering with keyword badges
- [x] Added `getCardKeywords()` to extract keywords from rulesText and grantedKeywords
- [x] Added `calculateCombatPreview()` for Might comparison with Assault/Shield bonuses
- [x] Added `detectCombatResult()` to detect combat resolution from state transitions
- [x] Added `showCombatDamage()` for floating damage numbers and destroyed overlays
- [x] Added `showCombatOutcome()` for center-screen combat result announcement
- [x] Added `previousGameState` variable and tracking in move_accepted/state_update handlers
- [x] Added `combatOutcome` DOM element
- [x] Non-combat showdowns still work with correct labeling

## Status

- [x] Memory Bank created
- [x] Implementation complete
- [ ] Tests passing (`bun test`)
- [ ] Type check passing (`bun run check-types`)
- [ ] Format check passing (`bun run format`)
- [ ] PR merged
