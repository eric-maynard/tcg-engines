---
name: Riftbound MCP Server Plan
description: Plan for implementing an MCP (Model Context Protocol) server that exposes the Riftbound engine as a tool for AI clients, with a strategy for keeping it feature-complete as the engine evolves.
type: project
---

# Riftbound MCP Server — Implementation Plan

## Goal

Expose the Riftbound TCG engine as an MCP server so AI clients (Claude, other LLMs, game UIs) can:
- Create and manage games
- Execute moves with validation
- Query game state
- Get available moves for a player
- Run bot strategies

## Architecture

```
┌─────────────────────────────┐
│     MCP Client (Claude)     │
└──────────┬──────────────────┘
           │ MCP Protocol (JSON-RPC over stdio/SSE)
           ▼
┌─────────────────────────────┐
│    Riftbound MCP Server     │
│  packages/riftbound-mcp/    │
│                             │
│  Tools:                     │
│  - game.create              │
│  - game.state               │
│  - game.moves               │
│  - game.execute             │
│  - game.undo                │
│  - deck.validate            │
│  - deck.build               │
│  - bot.suggest              │
│  - cards.search             │
│  - cards.lookup             │
└──────────┬──────────────────┘
           │ Direct imports
           ▼
┌─────────────────────────────┐
│   @tcg/riftbound (engine)   │
│   @tcg/riftbound-cards      │
│   @tcg/riftbound-types      │
└─────────────────────────────┘
```

## Phase 1: Core MCP Server (MVP)

### 1A. Package Setup

Create `packages/riftbound-mcp/` with:
```
packages/riftbound-mcp/
├── src/
│   ├── index.ts              # MCP server entry point
│   ├── server.ts             # Server setup and tool registration
│   ├── tools/
│   │   ├── game-tools.ts     # Game lifecycle tools
│   │   ├── move-tools.ts     # Move execution tools
│   │   ├── query-tools.ts    # State query tools
│   │   ├── deck-tools.ts     # Deck validation tools
│   │   └── card-tools.ts     # Card lookup tools
│   ├── state/
│   │   └── game-manager.ts   # In-memory game session management
│   └── types.ts              # MCP-specific types
├── __tests__/
│   └── integration.test.ts   # End-to-end MCP tool tests
├── package.json
└── tsconfig.json
```

### 1B. MCP Tools

#### Game Lifecycle

| Tool | Input | Output |
|------|-------|--------|
| `game.create` | `{ mode: "duel", players: [{id, name}], seed? }` | `{ gameId, status }` |
| `game.state` | `{ gameId, playerId? }` | Full game state (filtered by player view if playerId) |
| `game.destroy` | `{ gameId }` | `{ success }` |

#### Move Execution

| Tool | Input | Output |
|------|-------|--------|
| `game.moves` | `{ gameId, playerId }` | `{ moves: [{ type, params, description }] }` |
| `game.execute` | `{ gameId, moveType, params }` | `{ success, newState, events }` |
| `game.undo` | `{ gameId }` | `{ success, newState }` |

#### Card & Deck

| Tool | Input | Output |
|------|-------|--------|
| `cards.search` | `{ query, filters }` | `{ cards: [...] }` |
| `cards.lookup` | `{ cardId }` | Full card definition with abilities |
| `deck.validate` | `{ legend, mainDeck, runeDeck, battlefields, mode }` | `{ valid, errors }` |
| `deck.build` | `{ legendId, constraints }` | Suggested deck list |

#### Bot

| Tool | Input | Output |
|------|-------|--------|
| `bot.suggest` | `{ gameId, playerId, strategy }` | `{ suggestedMove, reasoning }` |
| `bot.play` | `{ gameId, playerId, strategy }` | Execute one bot move |

### 1C. Game Session Manager

```typescript
class GameManager {
  private games = new Map<string, RuleEngine>();
  
  createGame(config: GameConfig): string;
  getState(gameId: string, playerId?: string): GameState;
  executeMove(gameId: string, move: MoveInput): MoveResult;
  getAvailableMoves(gameId: string, playerId: string): AvailableMove[];
  destroyGame(gameId: string): void;
}
```

## Phase 2: Feature Completeness Strategy

### The Problem
The engine is actively evolving (new effects, parser improvements, keywords). The MCP server must stay in sync.

### Solution: Auto-Generated Tool Schemas

Instead of manually defining tool parameters, derive them from the engine's type system:

1. **Move tools auto-derive from `RiftboundMoves`**: Each key in `RiftboundMoves` becomes a valid `moveType` parameter. The params type for each move is read from the interface.

2. **Effect types auto-derive from `ExecutableEffect`**: The `type` field's union becomes the valid set of effect types.

3. **Event types auto-derive from `GameEvent`**: The trigger event types come from the union.

### Solution: Contract Tests

Create a test file that imports directly from the engine and verifies the MCP server covers all capabilities:

```typescript
// packages/riftbound-mcp/__tests__/feature-completeness.test.ts

import type { RiftboundMoves } from "@tcg/riftbound";
import { REGISTERED_MCP_MOVES } from "../src/tools/move-tools";

test("MCP covers all engine moves", () => {
  const engineMoves = Object.keys({} as RiftboundMoves);
  const mcpMoves = Object.keys(REGISTERED_MCP_MOVES);
  
  for (const move of engineMoves) {
    expect(mcpMoves).toContain(move);
  }
});
```

This test fails whenever a new move is added to the engine but not to the MCP server.

### Solution: CI Check

Add to `bun run ci-check`:
```bash
bun test packages/riftbound-mcp  # Includes completeness tests
```

Any PR that adds moves/effects/events to the engine must also update the MCP server or the CI fails.

## Phase 3: Advanced Features

### 3A. Game Replay / History

- `game.history` tool returns the full move log
- `game.replay` tool replays a game from a move log
- Useful for analysis, debugging, and training

### 3B. Streaming State Updates

- MCP resources for game state (server-sent updates)
- Clients can subscribe to game state changes
- Enables real-time game UIs

### 3C. Multi-Game Tournament

- `tournament.create` with bracket management
- `tournament.pairings` for current round
- Integrates with deck validation

### 3D. Card Database Resource

- MCP resource exposing full card database
- Searchable by name, type, domain, cost, keywords
- Includes parsed abilities and rules text

## Implementation Order

| Phase | Deliverable | Depends On |
|-------|-------------|-----------|
| **1A** | Package scaffold, server setup | Nothing |
| **1B** | Core tools (create, state, moves, execute) | 1A |
| **1C** | Game session manager | 1A |
| **2** | Contract tests + CI integration | 1B |
| **3A** | History/replay | 1B |
| **3B** | Streaming resources | 1B |
| **3C** | Tournament mode | 3A |
| **3D** | Card database resource | 1A |

## Key Design Decisions

1. **Stateful server**: Games persist in memory during the server session. Each game gets a unique ID. This is simpler than stateless (where the client sends full state each call).

2. **Player view filtering**: When `playerId` is provided, state is filtered through `createPlayerView()` to hide opponent's hand, deck order, etc.

3. **Move validation**: The MCP server delegates ALL validation to the engine's condition system. The MCP layer just forwards and reports errors.

4. **Error handling**: MCP errors map to engine errors. Invalid moves return structured error objects, not exceptions.

5. **Deterministic seeds**: Games can be created with a seed for reproducible gameplay (testing, replays).

## Dependencies

- `@modelcontextprotocol/sdk` — MCP server SDK
- `@tcg/riftbound` — Game engine
- `@tcg/riftbound-cards` — Card definitions
- `@tcg/riftbound-types` — Type definitions
