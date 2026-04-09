# Phase 4: Phase Indicator, End Turn Button, and Game Over UI

## Context

| Field | Value |
|-------|-------|
| **Date Started** | 2026-04-06 |
| **Branch** | `main` |
| **Related Issues** | Riftbound gameplay gaps plan Part 4 |
| **Author** | AI Agent |

## Problem Statement

The Riftbound gameplay page lacks key UX elements:
- Phase info buried in sidebar as a small badge
- End Turn is a generic sidebar button, not prominent
- No game over screen (just small sidebar text)
- No visual phase transition feedback
- No turn timer

## Key Files

| File | Relevance |
|------|-----------|
| `apps/riftbound-app/public/gameplay.html` | Single-file gameplay page (4,327 lines) |

## Proposed Solution

### Approach

Add five UI components to gameplay.html:
1. Phase indicator bar between opponent area and battlefield
2. Prominent End Turn button in lower-right of board
3. Phase transition flash animation
4. Game Over overlay
5. Client-side turn timer

## Implementation Log

### 2026-04-06

- [x] Read and understand gameplay.html structure
- [x] Add CSS for all five components
- [x] Add HTML elements for phase bar, end turn button, game over overlay
- [x] Add JS render functions and wire into render() loop
- [x] Wire keyboard shortcut for end turn
- [x] Add phase change detection for transition animation

## Status

- [x] Memory Bank created
- [x] Implementation complete
