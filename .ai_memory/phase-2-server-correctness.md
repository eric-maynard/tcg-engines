# Phase 2: Server Correctness

## Context

| Field | Value |
|-------|-------|
| **Date Started** | 2026-04-06 |
| **Branch** | `main` |
| **Related Issues** | Riftbound gameplay gaps plan Part 2 |
| **Author** | AI Agent |

## Problem Statement

The Riftbound server (`apps/riftbound-app/server.ts`) has four correctness issues:
1. Saved decks are never loaded - `buildDefaultDeck()` always used regardless of selection
2. `finalizePregame()` uses raw patches instead of the `transitionToPlay` move
3. `finalizeEndTurn()` manually channels runes, duplicating flow system logic
4. No phase change events in WebSocket messages

## Key Files

| File | Relevance |
|------|-----------|
| `apps/riftbound-app/server.ts` | Main server with all four issues |
| `apps/riftbound-app/src/db/deck-repo.ts` | Deck CRUD with `getDeck()` returning `FullDeck` |
| `packages/riftbound-engine/src/game-definition/moves/setup.ts` | `transitionToPlay` move definition |
| `packages/riftbound-engine/src/game-definition/flow/riftbound-flow.ts` | Flow system with channel/draw phase hooks |

## Proposed Solution

### Approach

1. Load saved decks using `getDeck()` from deck-repo, convert `DeckCardEntry[]` to `DeckConfig`
2. Replace `applyPatches` in `finalizePregame()` with `transitionToPlay` move, setting `setup.firstPlayer` via patch first
3. Remove manual `channelRunes` from `finalizeEndTurn()`, keep safety-net as warning
4. Add `phaseChange` field to WebSocket messages when phase changes

## Implementation Log

### 2026-04-06

- [x] Step 1: Load saved decks in `start_game` handler
- [x] Step 2: Use `transitionToPlay` in `finalizePregame()`
- [x] Step 3: Simplify `finalizeEndTurn()`
- [x] Step 4: Add phase change events to WebSocket messages
- [x] Step 5: Test (server compiles, engine tests pass, pre-existing failures only)

## Status

- [x] Memory Bank created
- [x] Implementation complete
- [x] Tests passing (pre-existing failures only, none related to changes)
- [x] Type check passing (pre-existing failure in riftbound-cards only)
