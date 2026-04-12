# Card Ability Parser Improvement Plan

## Status: In Progress
## Date: 2026-04-10

## Context

The enrichment pipeline bug (`.map(a => a.ability)` → `undefined`) was fixed. Now 495/769 cards have working abilities. But 476 cards still have broken or missing abilities — 218 with `raw` effects (parser recognizes structure but can't convert effect text), 260 where the parser fails entirely.

## Strategy

**Parser improvements over manual overrides.** Each parser pattern fix cascades to many cards. The top 8 patterns cover 321 of 476 broken cards (67%).

## Pattern Groups (ordered by impact)

| # | Pattern | Cards | Approach |
|---|---------|-------|----------|
| 1 | buff/modify-might | 86 | Parser: "Give X +N Might this turn" |
| 2 | damage | 37 | Parser: "Deal N damage to X" |
| 3 | draw | 33 | Parser: "Draw N" and conditional draw |
| 4 | ready | 29 | Parser: "Ready X" |
| 5 | equip/attach | 26 | Parser: equipment attachment patterns |
| 6 | exhaust-target | 24 | Parser: "Exhaust X" |
| 7 | move | 23 | Parser: "Move X to Y" |
| 8 | add-resource | 20 | Parser: "Add X energy/power" |
| 9 | return-to-hand | 17 | Parser: "Return X to hand" |
| 10 | banish | 14 | Parser: "Banish X" |
| 11 | kill | 14 | Parser: "Kill X" |
| 12 | grant-keyword | 11 | Parser: "Give X keyword" |
| 13 | recycle | 11 | Parser: "Recycle X" |
| 14 | stun | 11 | Parser: "Stun X" |
| 15 | discard | 9 | Parser: "Discard X" |
| 16 | other/complex | 42 | Manual overrides for unique cards |

## Swarm Assignment

### Wave 1 (highest impact — 4 agents)
- Agent A: buff/modify-might (86 cards)
- Agent B: damage + kill (51 cards)
- Agent C: draw + discard (42 cards)
- Agent D: ready + exhaust-target (53 cards)

### Wave 2 (medium impact — 4 agents)
- Agent E: move + return-to-hand (40 cards)
- Agent F: equip/attach (26 cards)
- Agent G: add-resource + recycle (31 cards)
- Agent H: grant-keyword + stun + banish (36 cards)

### Wave 3 (manual overrides for complex cards)
- Remaining 42 "other/complex" cards — manual overrides as needed

## Success Metric

Before: 495/769 cards with working abilities (64%)
Target: 700+/769 cards with working abilities (91%+)
