# Why the audit loops missed 8 obvious gameplay bugs

User played goldfish for 2 minutes and hit 8 issues the loops passed. Investigation:

## The 7 blind spots

| # | Blind spot | Effect | Fix |
|---|---|---|---|
| 1 | **Stale rule numbering** — `riftbound-ui-rules-loop.js` CHECKS cite pre-Vendetta rule ids (515/592/594/508/589/596). `rule.ts 515` → "no rule matching" → verifiers auto-REFUTE. | Every rules-via-UI verify pass silently discarded findings. | Map to Vendetta ids: 315.3.b, 413/414, 430, 143.4, 359.2.c. Add a smoke test that every CHECK's cited rule id resolves. |
| 2 | **Stale artifacts** — `/tmp/ui-shots` and `/tmp/rules-shots` predate the goldfish rework by hours. Observer workflows read fixed paths with no freshness check. | Observers audited yesterday's UI. | Drive at the top of every workflow round; assert trace mtime < 5min. |
| 3 | **Headless ≠ server** — `game-setup.ts` hand-mirrors `server.ts:createGameFromDecks/finalizePregame/finalizeEndTurn` and hardcodes `count:2`. | Server-side channel/bf/ready regressions invisible to headless. | Have `game-tracer.ts` drive `server.ts`'s functions directly, or run headless via HTTP against the app. |
| 4 | **Section coverage gap** — `riftbound-rule-observers.js` SECTIONS omits §2 (100–189, where 143.4 "units enter exhausted" lives) and §5 (349–359 Playing Cards). | Bugs 5 and 8 outside observer scope. | Add §2 and §5. |
| 5 | **`compact()` too thin** — `game-tracer.ts` drops base zone, runePool zone, and all cardMetas. | Exact fields bugs 5/8 need are absent from traces. | Emit `base:[{id,exhausted}]` and `runePoolCount`. |
| 6 | **Pregame is a black box** — both UI drivers loop-click through mulligan/bf-select with zero snapshots. | Bugs 1 and 4 live entirely in the skipped window. | Add `snap()` inside the pregame loop; screenshot every pregame step. |
| 7 | **No design-intent input** — cosmetic LENSES check "broken?" not "matches spec?". Unguided visual agents will always pass "hover shows text panel" (it's readable) and "runes are 60px" (not cramped). | Bugs 2, 6, 7 are spec preferences. | Add a `design-intent` lens seeded from a `DESIGN.md` (e.g., "hover = image only", "runes ≈ hand-card size", "no zone-change animation"). |

## Per-bug attribution

| Bug | Should catch | Why not (file:line) |
|---|---|---|
| 1 peek-during-mulligan | cosmetic UI | `ui-drive.ts:52-66` never right-clicks deck; observers.js shot list skips mulligan frames |
| 2 hover text panel | cosmetic UI | LENSES:19 asks "readable?" not "should this exist?" — no design-intent |
| 3 image latency | none | drivers use `waitUntil:networkidle` — latency masked before every shot |
| 4 no bf-select/Bo3 | cosmetic UI | drivers hardcode duel; ui-drive.ts:31 selector broken post-rework |
| 5 units not tapped | rules-via-UI + headless | zone-transitions CHECK doesn't say "enters exhausted"; SECTIONS omits §2; **engine correct, UI display was overlay-only** |
| 6 rune size | cosmetic UI | LENSES:22 asks "cramped?" — 60px isn't cramped; no target-size intent |
| 7 zone animation | none | drivers use `.click()`/`executeMove()` — never drag; static PNGs can't show motion |
| 8 channel 1/turn | rules-via-UI + headless | **stale rule numbers → auto-REFUTED**; game-setup.ts hardcodes 2; `compact()` drops runePool count. **Server was correct (2).** |

## Action items

- [x] Add rotation to `.card--exhausted` (rule 143.4)
- [ ] Update CHECKS/SECTIONS to Vendetta rule ids
- [ ] Add §2/§5 to headless SECTIONS
- [ ] Add `base` + `runePoolCount` to `compact()`
- [ ] Add pregame snapshots to drivers
- [ ] Add `DESIGN.md` + design-intent lens
- [ ] Add drag scenario + video capture
- [ ] Add trace-freshness assertion
