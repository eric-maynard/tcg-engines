# Riftbound Game Server Logging & Archival System

## Context

| Field | Value |
|-------|-------|
| **Date Started** | 2026-04-06 |
| **Branch** | `main` |
| **Related Issues** | N/A |
| **Author** | AI Agent |

## Problem Statement

The Riftbound game server (`apps/riftbound-app/server.ts`) has minimal logging: a few `console.log` calls for startup and WebSocket connect/disconnect events, plus `console.warn` for fallback deck loading and `console.error` for pregame crashes. There is no persistent file-based logging, no structured game event logging, no archival system, and no way to retrieve game logs via API for replay or debugging.

## Research & Analysis

### Key Files

| File | Relevance |
|------|-----------|
| `apps/riftbound-app/server.ts` | Main server - needs logging integration |
| `apps/riftbound-app/src/game-logger.ts` | New file - GameLogger class |

### Current Logging (Audit)

**What IS logged:**
- Startup: card count loaded (console.log)
- Lobby WS: host/guest connect/disconnect (console.log)
- Game WS: connect with connId/playerId/gameId (console.log)
- Game WS: disconnect with code/reason (console.log)
- Deck loading fallbacks (console.warn)
- Flow state mismatch after endTurn (console.warn)
- finalizePregame crash (console.error)

**What is NOT logged:**
- Game creation (players, mode, deck IDs, seed)
- Every move executed (type, player, params, success/fail, timestamp)
- Move rejections (reason)
- Game state transitions (setup -> playing -> finished)
- Game completion (winner, scores, duration)
- Lobby creation/join events
- Structured error context
- No persistent file logging at all

## Proposed Solution

### Approach

1. Create `GameLogger` class with JSONL file output + console logging
2. Integrate logging calls at every key point in server.ts
3. Add `GET /api/logs/:gameId` endpoint for log retrieval
4. Add `POST /api/archive-logs` endpoint for archival

## Implementation Log

### 2026-04-06

- [x] Audit current logging in server.ts
- [x] Create GameLogger class
- [x] Integrate into server.ts
- [x] Add archive endpoint
- [x] Add log viewer endpoint

## Status

- [x] Memory Bank created
- [x] Implementation complete
- [x] Format check passing
- [x] Lint check passing
