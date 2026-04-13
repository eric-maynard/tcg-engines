---
name: riftatlas-study
description: Side-by-side runtime comparison of play.riftatlas.com and our local riftbound-app. Drives both UIs to equivalent game checkpoints and structurally diffs each region (rune pool, hand, battlefields, log, chain) to flag MISSING features AND BROKEN rendering. Use when auditing UI parity, hunting runtime regressions in our app, or producing a prioritized gap report. NOT for rules questions or for cloning pixel-for-pixel.
---

# Rift Atlas ↔ Riftbound-App Comparison

Drive **both** `play.riftatlas.com` and our `apps/riftbound-app` (goldfish mode) via Playwright, march them to equivalent checkpoints, and structurally diff the rendered UI. Produces a report split into two categories:

- **Missing** — Rift Atlas renders something meaningful, our app renders nothing.
- **Broken** — our app has the DOM container but it is empty, clipped, misaligned, or stale relative to Rift Atlas at the equivalent checkpoint.

**Why this matters.** A prior single-sided study (`.ai_memory/riftatlas-ui-study.md`) documented Rift Atlas in isolation and inferred gaps from memory/code-read of our app. That methodology is **blind to runtime regressions** — e.g., an empty `#player-runePool` at turn 1 looks identical to "not implemented yet" if you never actually boot our app. Always drive both.

## When to use

- Auditing UI parity after any multi-file change to the renderer, game flow, or engine
- Producing a prioritized gap report for UI workstreams
- Hunting a suspected regression in our app's rendering
- Validating that shipped workstreams still hold up vs. Rift Atlas's latest

## When NOT to use

- Rules questions → `riftbound-rules`
- Running automated gameplay QA on our app only → `visual-monkey-test` or `monkey-test`
- Cloning Rift Atlas pixel-for-pixel (we're not)

## Prerequisites

- Playwright available (MCP tools `mcp__playwright__*`, or direct `bun + playwright` scripting — both work)
- **User has an authenticated tab open on `play.riftatlas.com/game`** (we can't log in for them)
- **Our dev server running on `localhost:3000` with `SANDBOX_ENABLED=true`** (goldfish mode)
- User has told us which side they are on Rift Atlas

## The deck problem (read this before writing diff code)

**The two apps will NEVER have identical decks.** Rift Atlas games use the user's deck and opponent's deck; our goldfish uses the default starter. That means comparisons must be **structural**, not card-identity-based:

| ✗ Don't compare | ✓ Do compare |
|---|---|
| "Both apps show 'Mind Rune' in pool" | "Both apps render N ≥ 1 rune card elements in the pool at turn 1 main" |
| "Hand has same 5 cards" | "Hand has ≥ 4 card elements with face images and onclick handlers" |
| "Same battlefield picked" | "Battlefield row has 2 battlefield slots with controller state visible" |
| Pixel diff | Per-region DOM presence, children count, bounding-box non-zero, interactive affordances present |

Anything that requires specific card identity goes in a **manual qualitative note**, not the automated diff.

## Checkpoint model

Both UIs are marched to the same **named checkpoints** — states defined by phase, not by board contents:

| Checkpoint | How we reach it in our app | How the user reaches it in Rift Atlas |
|---|---|---|
| `C0_lobby` | Click Goldfish → pick default deck → Start | (user just opened lobby) |
| `C1_battlefield_select` | wait for pregame | (pregame) |
| `C2_mulligan` | after battlefield pick | (pregame) |
| `C3_turn1_main` | keep hand → land in main phase | after mulligan |
| `C4_after_first_play` | pass focus with 1+ unit in base or on a battlefield | after their own first play |
| `C5_showdown_open` | move unit to opponent battlefield, trigger showdown | after attacking |
| `C6_chain_active` | play a spell with focus to opponent | (when both sides play reactive spells) |
| `C7_conquer` | win a showdown | (after conquer) |
| `C8_endphase` | click End Turn | (end of their turn) |

At each checkpoint, we screenshot both apps and run a **region diff** (next section).

## Region diff: what we compare

For every checkpoint, inspect both DOMs for each region and record presence + populated state. The regions:

| Region | Our selector | What to check |
|---|---|---|
| Opponent hand strip | `#opponent-hand` | child count > 0, card backs visible |
| Opponent resources | `#opponent-runePool`, resource bar region | rune pool children > 0 at turn ≥ 1, energy/power counters present |
| Battlefield row | `#battlefieldRow` | 2 battlefield cards, controller indicator, unit slots |
| Chain panel | `#chainPanel` / sidebar chain | chain items rendered when non-empty |
| Player base | `#player-base` | units rendered with state (exhausted, damaged, etc.) |
| Resource bar | `#resourceBar` | energy/power counters visible |
| **Player rune pool** | `#player-runePool` | **children > 0 at turn ≥ 1 main** — the regression-magnet region |
| Player hand | `#player-hand` | child count > 0, hover preview works, Auto-Pay affordance |
| Main / rune deck | `#player-decks` | both deck stacks rendered with counts |
| Log | `#gameLog` | entries present after any action |
| Phase bar | `#phaseBar` | current phase + active player visible |
| Turn/timer | sidebar | turn number + name visible |

For each region, produce one of five verdicts:

- `✓ present` — our app has it, non-empty, roughly matching Rift Atlas's structural footprint
- `⚠ broken` — we have the container but it is empty / clipped / zero-area / stale
- `✗ missing` — we don't render anything for this region at all
- `+ ours-only` — we render something they don't (rare; note it but don't "fix")
- `○ N/A` — checkpoint doesn't exercise this region

## Workflow

### Phase 0: Boot both apps

1. **Our app**: check `curl -sf http://localhost:3000/ -o /dev/null`. If down, start: `cd apps/riftbound-app && SANDBOX_ENABLED=true bun run server.ts` (run_in_background). Verify `curl -s -X POST http://localhost:3000/api/lobby/create -H 'content-type: application/json' -d '{"sandbox":true}'` returns a lobby code (not a 403).
2. **Rift Atlas**: ask the user to confirm their authed tab is open on `play.riftatlas.com/game`. You cannot log in yourself.
3. Confirm the two Playwright contexts: ours (headless is fine, scripted) + theirs (use the user's existing browser via Playwright MCP, DO NOT reload/clobber their session).

### Phase 1: Drive our app to each checkpoint

Use a `bun` playwright script (template in `references/local-driver.ts` — see reference files) to automate our app through `C0 → C8`. At each checkpoint:

1. Screenshot to `/tmp/riftatlas-compare/ours-<checkpoint>.png`
2. Dump region DOM via `page.evaluate` into `/tmp/riftatlas-compare/ours-<checkpoint>.json`
3. Wait for user's Rift Atlas side to reach the equivalent checkpoint (or note "user-side not yet at C_n, skip" if they're behind)

Our side is deterministic (goldfish plays itself) so this is scriptable end to end. See `references/local-driver.ts` for the concrete script — it inlines `window.__gs = gameState` via `addScriptTag` because classic-script `let` bindings are not attached to `window`.

### Phase 2: Drive / observe Rift Atlas at each checkpoint

Via Playwright MCP against the user's tab:

1. Snapshot DOM + screenshot to `/tmp/riftatlas-compare/theirs-<checkpoint>.png`
2. Dump the same region set into `/tmp/riftatlas-compare/theirs-<checkpoint>.json`
3. **Do not interact on their turn** — observe only

Their side is human-paced. Use the downtime to run the diff on previously-captured checkpoints.

### Phase 3: Diff

For each checkpoint, for each region, run the 5-verdict classifier from the table above. Write one row per region per checkpoint into `.ai_memory/riftatlas-compare.md`:

```markdown
## C3_turn1_main

| Region | Verdict | Notes |
|---|---|---|
| Player rune pool | ⚠ broken | `#player-runePool` container present (151px tall) but 0 children. Rift Atlas shows 2 channeled rune cards. Root cause? channel phase skipped on turn 1? |
| Player hand | ✓ present | 5 cards, hover preview works |
| Battlefield row | ✓ present | 2 battlefields rendered |
| Chain panel | ○ N/A | no chain at this checkpoint |
| ... |
```

### Phase 4: Root-cause triage (optional, only if asked)

Each `⚠ broken` row is a bug we own. For each, briefly note:
- Which file renders that region (`renderer.js:<line>` or equivalent)
- Whether the DOM is empty because game state is wrong (engine bug) or because the renderer is wrong (UI bug)
- Suggested next step: delegate to `visual-monkey-test`, `debugger`, or a targeted rules-audit test

Do NOT attempt the fix inside this skill — the skill's job is to find regressions, not resolve them.

### Phase 5: Write the report

Single-file output: `.ai_memory/riftatlas-compare.md` with:

1. **Run metadata** — date, commit, checkpoints reached, skipped
2. **Summary matrix** — one row per checkpoint × column per region, verdict cells
3. **Missing features** — expanded prose on every `✗ missing` (prioritized)
4. **Broken rendering** — expanded prose on every `⚠ broken`, with file pointers (highest priority — these are regressions)
5. **Manual qualitative notes** — things that need human eyes (animations, timing, discoverability)
6. **Delta from last run** — if previous `.ai_memory/riftatlas-compare.md` exists, note which verdicts changed

### Phase 6: Chat summary

Keep it short:

```
Rift Atlas ↔ Riftbound-App comparison (8 checkpoints)

BROKEN (regressions — fix first):
  1. <region> @ <checkpoint> — <one-line reason>
  2. ...

MISSING (feature gaps):
  1. <region> — <effort>
  2. ...

Report: .ai_memory/riftatlas-compare.md
```

## Relationship to other artifacts

- `.ai_memory/riftatlas-ui-study.md` — **single-sided study from 2026-04-10.** Kept as historical reference but superseded by this skill. Do NOT treat its "MASSIVE gaps" list as current truth — re-verify every item through a real comparison run. Its first gap ("rune identity shown on board") for example conflated *missing feature* with what we now know to be a *broken render*.
- `.ai_memory/riftatlas-ui-implementation-plan.md` — implementation workstream plan. Still valid as a roadmap, but gap status should be refreshed from new comparison runs, not assumed.
- `visual-monkey-test` / `monkey-test` — automated QA for our app alone. Run those after this skill identifies a `⚠ broken` verdict to get deeper runtime signal.

## Reference files

- `references/local-driver.ts` — the Playwright script that drives our app to each checkpoint
- `references/hotkeys.md` — observed Rift Atlas keymap (cached; refresh on major updates)
- `references/ui-patterns.md` — reusable patterns worth copying
- `references/anti-patterns.md` — things Rift Atlas does poorly
- `references/future-two-agent.md` — future two-agent design

## Rules of engagement on the shared Rift Atlas board

The user's session is a real game visible to their opponent:

- Never interact on their turn
- Never spam peek / rewind / emote — those are visible
- Never reload or navigate their tab
- If you cause a visible action by accident, tell the user immediately

## Common pitfalls

### "Our app's `gameState` isn't on `window`"
Correct — it's a top-level `let` in a classic script, so it's in script-scope but not on `window`. Use `page.addScriptTag({ content: "setInterval(() => { window.__gs = typeof gameState !== 'undefined' ? gameState : null; }, 100)" })` to mirror it. See `references/local-driver.ts`.

### "Goldfish lobby start button never appears"
The start button is gated on `lobby.host.hasDeck && lobby.guest.hasDeck`. You must `selectOption('#deckSelect', 'default')` AFTER clicking Goldfish and BEFORE clicking Start.

### "The checkpoints drift out of sync between the two apps"
That's fine. March each app independently through its own checkpoints, tag each snapshot with `(checkpoint, app)`, and diff only equivalent pairs. If the user-side never reaches `C6_chain_active`, mark that row skipped and move on.

### "Decks differ so hand contents differ"
By design. Compare **child counts**, **region sizes**, **affordance presence** — not card identity. See "The deck problem" section above.

### "I can't tell if a region is broken or just empty at this checkpoint"
Look at the equivalent Rift Atlas screenshot. If their version of that region is also empty at the same checkpoint, it's not broken — it's `○ N/A`. The rune pool at `C3_turn1_main` is the canonical stress test: Rift Atlas shows channeled runes, so ours should too.

## Completion report

```
Rift Atlas Comparison complete
==============================

Checkpoints reached: ours N/8, theirs M/8
Regions compared: R
Verdicts:
  ✓ present: N
  ⚠ broken: N  ← these are REGRESSIONS
  ✗ missing: N
  + ours-only: N

Top broken (fix first):
  1. <region> @ <checkpoint> — <pointer to code>
  2. ...

Top missing (feature gaps):
  1. ...

Report: .ai_memory/riftatlas-compare.md
```
