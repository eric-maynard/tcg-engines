# User-reported UI issues (2026-08-04)

From ~60s of manual play:

1. Images load too slowly — **fixed** (799MB→31MB webp)
2. Text superimposed over card images — **fixed** (`.card-name{display:none}`)
3. Hover detail behind mulligan overlay — **fixed** (z-index 1000→10000)
4. d20 shows 21 in goldfish — **fixed** (rig 20 not 21)
5. Runes bunched too tight vs riftatlas
6. Runes: click-to-exhaust doesn't rotate 90° like tabletop
7. Cards don't enter exhausted (summoning sickness visual?)
8. Battlefield entry animation is unnecessary
9. Hover on battlefields doesn't show preview
10. Battlefields too small to read
11. Annie deck shows Kai'Sa legend/champ, yellow runes — **root cause**: `buildDefaultDeck` picks first legend matching *either* domain, not both; runes ignore legend's actual domains

Visual-observer workflow round 1 (32 agents, 8 screenshots × 4 lenses): 106 findings in `UI-FINDINGS-R1.json`. Top HIGH: mulligan preview covers Keep button, `[rainbow]` token not icon-substituted in tooltip, opponent-hand hover leak (sandbox-only intentional, but non-sandbox path also leaks via right-rail inspector).

**Loop**: `ui-drive.ts` (Playwright) → `/tmp/ui-shots/*.png` → `riftbound-ui-observers.js` → fix → repeat.
