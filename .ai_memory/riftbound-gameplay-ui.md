# Riftbound Gameplay UI

## Context

| Field | Value |
|-------|-------|
| **Date Started** | 2026-04-03 |
| **Branch** | `feature/riftbound-gameplay-ui` |
| **Author** | AI Agent (Claude) |

## Implementation Phases

### Phase 1: Card Interaction Foundation ← NEXT
- Larger cards (120x168 board, 140x196 hand)
- Card type color coding (unit=blue, spell=purple, gear=green, rune=gold)
- Card zoom modal on click
- Empty zone placeholders
- Battlefield layout with tinted player/opponent sides

### Phase 2: Interaction Model
- Selection state machine (idle→selectSource→selectTarget→confirm)
- Drag-and-drop for playing cards
- Rune exhaust/recycle buttons on rune cards
- Unit movement (click unit → click destination)

### Phase 3: Combat & Showdown UI
- Showdown detection overlay
- Attacker/defender assignment
- Combat resolution display
- Focus/priority indicator

### Phase 4: Setup Flow
- Roll for first, choose first, mulligan UI
- Lobby deck loading from saved decks
- Server-side game creation from real decks

### Phase 5: Visual Polish
- CSS animations (play, destroy, turn start)
- Sound effects (Web Audio API)
- Resource display overhaul
- Graveyard viewer, game over screen, turn timer

### Phase 6: Server Flow Fix
- Proper turn rotation via flow system
- Remove sandbox energy hack once rune UI works

### Phase 7: Extended Features
- Targeting system for spells
- Spectator mode
- Game replay

## Completed Work

### 2026-04-03

- [x] Server API routes (REST + WebSocket)
- [x] Board layout (mirrored, battlefields center)
- [x] Card rendering with images, cost/might badges
- [x] Lobby system (host/join codes, deck select, game launch)
- [x] WebSocket multiplayer with auto-reconnect
- [x] Ping/highlight system
- [x] **Core bug fix**: FlowManager state sync (getGameState + sync back)
- [x] **Core bug fix**: Cascading checkEndConditions
- [x] **Core bug fix**: setCurrentPlayer in transitionToPlay
- [x] Play link in all page headers
- [x] All 417 tests passing

## Status

- [x] Memory Bank created
- [x] Core flow bugs fixed
- [ ] Phase 1: Card Foundation
- [ ] Phase 2: Interaction Model
- [ ] Phase 3: Combat UI
- [ ] Phase 4: Setup Flow
- [ ] Phase 5: Visual Polish
- [ ] Phase 6: Server Flow Fix
- [ ] Phase 7: Extended Features
