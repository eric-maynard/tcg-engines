# W9 — Inline Showdown UI per Battlefield

## Context

| Field | Value |
|-------|-------|
| **Date Started** | 2026-04-12 |
| **Branch** | worktree-agent-ab26e75c |
| **Related** | riftatlas-gap-closure-sequenced-plan Section 4 Phase 2 Track B |
| **Author** | AI Agent (Opus) |

## Problem Statement

Showdowns currently render inside the centered `#chainOverlay` element,
which obscures the board and hides which battlefield is actually
contested when multiple future simultaneous showdowns are in play. Rift
Atlas uses a single ambiguous "Dismiss" button — a documented
anti-pattern because it conflates Pass Focus / Conquer / Cancel into one
control.

## Proposed Solution

Render a per-battlefield `.battlefield__showdown-panel` inline inside
each battlefield card when an active showdown targets it. Three
explicit, separately-labeled exits: Pass Focus (W), Conquer (Q), and
Cancel. Stop emitting showdown DOM inside the chain overlay — the chain
overlay continues to render for the spell chain, just not for showdown
state. Hotkeys Q/W are rerouted to whichever battlefield has the active
showdown context.

### Files to Modify

| File | Changes |
|------|---------|
| `apps/riftbound-app/public/js/gameplay/showdown.js` | New file — inline panel renderer + hotkey dispatch helpers |
| `apps/riftbound-app/public/js/gameplay/renderer.js` | Inject panel into battlefield cards; strip showdown DOM from chain overlay |
| `apps/riftbound-app/public/js/gameplay/hotkeys.js` | Route Q/W to active battlefield showdown helpers |
| `apps/riftbound-app/public/css/gameplay.css` | New panel/button classes |
| `apps/riftbound-app/public/gameplay.html` | Script tag for showdown.js |

### Engine State Mapping

Server emits `interaction.showdown` derived from the top of
`showdownStack`. Fields available: `active`, `battlefieldId`,
`focusPlayer`, `relevantPlayers`, `passedPlayers`, `isCombatShowdown`,
`attackingPlayer`, `defendingPlayer`.

- `bothPassed` (Conquer enabled) ≡ `!showdown.active ||
  passedPlayers.length >= relevantPlayers.length`.
- `initiator` is not tracked. For combat showdowns, use
  `attackingPlayer`. For non-combat, fall back to the current turn's
  active player.
- "opponent hasn't acted" is not tracked; proxy is
  `passedPlayers.length === 0`. Cancel is only shown to the initiator
  while the showdown has no pass history.

Cancel dispatches `endShowdown` (no params). Conquer dispatches
`conquerBattlefield { playerId, battlefieldId }`. Pass dispatches
`passShowdownFocus { playerId }`.

## Implementation Log

### 2026-04-12

- [x] Wrote memory log
- [x] Implemented showdown.js
- [x] Rewired renderer.js
- [x] Rewired hotkeys.js (Q/W)
- [x] Added CSS
- [x] Added script tag
- [ ] Live showdown test (no triggering card available in scripted
      smoke — verified no runtime errors in non-showdown flows only)
