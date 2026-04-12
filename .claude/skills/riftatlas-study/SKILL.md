---
name: riftatlas-study
description: Play a Riftbound game on play.riftatlas.com via Playwright and document every UI feature to identify gaps between their UI and our riftbound-app. Use when the goal is to study Rift Atlas's UI patterns for implementation reference — NOT to clone the game. Output is a structured observation log with prioritized gaps and an implementation plan.
---

# Rift Atlas UI Study

Play a live game against a human operator on `play.riftatlas.com` via Playwright, observe every UI feature, and write a structured gap analysis. The goal is to inform improvements to our `apps/riftbound-app`, which has a stronger rules engine but worse UI.

## When to use

- User wants to study Rift Atlas's UI/UX patterns for reference
- User wants to identify specific features we should implement
- User wants to produce an actionable plan for UI improvement work
- User wants screenshots + a narrative log of gameplay flow

## When NOT to use

- For rules questions → use `riftbound-rules` skill
- For clone/reimplementation — we're studying, not copying pixel-for-pixel
- For running automated QA on our own app → use `monkey-test` or `visual-monkey-test`

## Mode: human operator vs. two-agent (future)

**Current mode: human operator.** You play one side through Playwright; a human operator (logged in on a separate machine) plays the other side. You wait for their moves, observe the opponent state, and continue your own turns.

**Future mode: two-agent** (not yet implemented). Two Claude instances, each controlling one side, playing against each other. This unlocks 24/7 observation sessions without a human in the loop. See the `future-two-agent.md` reference.

## Prerequisites

- Playwright MCP tools available (check for `mcp__playwright__*`)
- User has authenticated and opened a game on `play.riftatlas.com/game` (you cannot authenticate yourself — the login flow is handled by the user)
- User has told you which side you are (typically "rifty" or "Eric" — ask if unclear)

## Artifacts you produce

1. **`.ai_memory/riftatlas-ui-study.md`** — the observation log, phase by phase
2. **`riftatlas-*.png`** in repo root — screenshots at each major UI moment
3. **`.ai_memory/riftatlas-ui-implementation-plan.md`** — the actionable gaps report, only on first run or when explicitly refreshing
4. **Final summary in conversation** — top 5 gaps prioritized

## Workflow

### Phase 0: Orient

1. Ask the user:
   - Which tab has the game? (they may have multiple tabs open)
   - Which side are you playing? ("rifty" / "Eric" / other — whoever is logged in on this browser)
   - Is a game already in progress or do they want you to help create/join one?
2. Navigate or switch tabs to `https://play.riftatlas.com/game`
3. Take a screenshot + snapshot to confirm state.

### Phase 0.5: Read OUR current app state (CRITICAL — do not skip)

**Before you flag any gap, you must know what OUR app currently does.** The whole point of this skill is to compare Rift Atlas against the current state of `apps/riftbound-app/` — not against a cached snapshot.

Before taking any Rift Atlas observations, skim our current implementation:

1. **`apps/riftbound-app/public/js/gameplay/renderer.js`** — what zones we render, state indicators, hover behavior
2. **`apps/riftbound-app/public/js/gameplay/interactions.js`** — click/drag handlers
3. **`apps/riftbound-app/public/js/gameplay/hotkeys.js`** (if exists) — keybindings
4. **`apps/riftbound-app/public/js/gameplay/help-modal.js`** (if exists) — help UI
5. **`apps/riftbound-app/public/js/gameplay/layout.js`** (if exists) — responsive strategy
6. **`apps/riftbound-app/public/js/gameplay/auto-pay.js`** (if exists) — cost solver
7. **`apps/riftbound-app/public/js/gameplay/drag-drop.js`** (if exists) — drag infrastructure
8. **`apps/riftbound-app/public/css/gameplay.css`** — scan for `.card--exhausted`, `.hover-preview`, `#game-scale-wrapper`, `.armed-mode`, etc.
9. **`apps/riftbound-app/public/gameplay.html`** — check for `#hover-preview`, `#helpInfoBtn`, `#game-scale-wrapper`
10. **`apps/riftbound-app/server.ts`** — scan for narration emit hooks, `/api/game/:id/move`, rewind endpoint

Build a mental checklist: "We already have X, Y, Z. We don't yet have A, B, C." Then during Rift Atlas observation, only flag features in the "don't yet have" bucket.

**A feature that exists in our code is NOT a gap, even if it's wired differently or less polished.** Note it as "implemented — consider polish" rather than a gap.

### Also read the implementation plan for deferred items

`.ai_memory/riftatlas-ui-implementation-plan.md` lists the workstreams we planned. Anything marked as merged/completed in git history (check `git log --grep 'feat(riftbound-app)' --oneline`) is done. Anything NOT yet merged is a real gap.

As of the most recent audit (2026-04-12), W1–W7 are merged. W8 (rewind), W9 (inline showdown), W10 (token/meta panels) are still deferred. New audits should confirm W1–W7 still hold up in our codebase, and focus new gap-hunting on W8+, plus anything Rift Atlas has added since.

### Phase 1: Establish observation targets

Before any interaction, scan the DOM for these phase markers and document each as you encounter them:

- **Sideboarding** (`Lock In Sideboard` button present)
- **Battlefield selection** (`Choose Battlefield` modal)
- **Mulligan** (`Choose Your Mulligan` modal, `Keep Hand` button)
- **Main game board** (Turn indicator, hand, battlefields, score tracks)
- **Chain / Showdown active** (Chain panel count > 0, or `Showdown in progress` banner)

### Phase 2: Open the hotkey reference

**CRITICAL FIRST STEP in main game:** Click the `i` icon in the sidebar (or `Show game info and hotkeys` button). This reveals the full keymap in one dialog. Copy the keymap to your observation log immediately — it answers 80% of "how do I do X" questions without needing to explore.

### Phase 3: Play turn by turn with observation

On each of your turns:
1. Take a screenshot at turn start
2. Snapshot DOM
3. Interact (click a card, drag to zone, press hotkey)
4. Screenshot after action
5. Compare before/after state in the log

On opponent's turns:
1. Wait for their action (poll via `browser_wait_for time`)
2. Snapshot DOM
3. Note any UI changes (new cards, log entries, chain items)
4. Do NOT interact during opponent turn — your actions are visible in their log and can cause confusion

### Phase 4: Test specific features (one at a time)

Each of these deserves its own experiment:

| Feature | How to test | What to observe |
|---|---|---|
| Hotkeys | Open help modal via `i` icon | Copy the full keymap |
| Rewind | Take any action, click Rewind button | Does it log as its own entry? Does history stay visible? |
| Peek top | Right-click main deck | What actions are offered (Play, Recycle, On Top, To hand)? |
| Hover preview | Hover any card in hand | Does a large preview appear in a reserved slot? |
| Token panel | Click `+` on a zone | What tokens are offered per zone? |
| Counter/buff | Press and hold C or B | Does the UI enter an "armed" mode? |
| Emote wheel | Press and hold E | Does a radial menu appear? |
| Ping | Press and hold P, click a card | Does it ping the card for the opponent? |
| Resize | Ask the user to resize the window | Does the UI reflow or scale? Document which |
| Drag to play | Drag a hand card to base | Does it play? To a battlefield? |
| Drag to equip | Drag equipment to a unit | Does it equip? Is there an explicit Equip button too? |

### Phase 5: Respect the shared board

**Rules of engagement** (you are a visible participant, not a silent observer):

- Every action you take is logged and visible to the human opponent
- Do NOT spam actions during their turn
- Do NOT peek at your deck repeatedly — it's visible in their log
- If you make a mistake, Rewind and explain in chat (or let the user know so they can reset)
- If you're stuck waiting for the opponent, document what you're seeing rather than interacting

### Phase 6: Write the observation log

Structure `.ai_memory/riftatlas-ui-study.md` by phase:

```markdown
# Rift Atlas UI Study

**Goal:** (one line)
**Method:** (one line)
**Context:** (one paragraph)

## Phase 1: Sideboarding Screen
### Layout (what elements exist)
### Background (what's visible behind modal)
### Gaps vs. our app (compare to apps/riftbound-app)

## Phase 2: ...
```

After each major observation, add a **Gaps vs. our app** subsection that lists concrete differences you can name. Err on the side of specificity — "their log shows rune identity on board" is more useful than "they have a richer log."

**Critical: before writing any gap, verify it by inspecting OUR current code (Phase 0.5).** If we already have the feature, write "✓ already implemented in <file>:<symbol>" instead of flagging a gap. This keeps the study file honest on re-runs: new gaps surface, old solved gaps don't reappear as noise.

### Phase 7: Produce the implementation plan

Only on first run or when the user asks for a refresh, write `.ai_memory/riftatlas-ui-implementation-plan.md` with:

1. **Ground rules** for implementation agents
2. **Workstream dependency graph** (ASCII diagram)
3. **One workstream per feature** with:
   - Priority tier (1 = biggest impact, 3 = polish)
   - Effort estimate (small / medium / large)
   - Dependencies on other workstreams
   - Files to touch
   - Spec (numbered steps)
   - Acceptance criteria
   - Rift Atlas reference (screenshot filename)
4. **Anti-patterns** — things Rift Atlas does poorly that we should NOT copy
5. **Work ordering recommendations** for both single-agent and multi-agent execution
6. **Delivery checklist** per workstream

### Phase 8: Top 5 summary for the user

End the session by posting a concise summary to the user in chat:

```
Rift Atlas UI Study — top 5 gaps

1. <feature name> — <why it matters> — <effort>
2. ...
5. ...

Observation log: .ai_memory/riftatlas-ui-study.md
Implementation plan: .ai_memory/riftatlas-ui-implementation-plan.md
Screenshots: riftatlas-*.png in repo root
```

## Common issues and fixes

### "I'm stuck waiting for the opponent"
Normal. The human operator may be doing other things. Options:
- Use the downtime to re-read DOM snapshots and extract observations you missed
- Write the gap analysis prose while waiting
- Do NOT spam clicks or reload the page

### "The turn indicator says Eric's turn but I'm Eric"
Turn indicator shows whose turn it is. If it shows the name of the player you are, IT'S YOUR TURN. Confirm with the user if unclear.

### "Refs keep going stale"
Playwright refs change after every DOM mutation. Take a fresh `mcp__playwright__browser_snapshot` before every click if it's been more than one action since your last snapshot.

### "I accidentally triggered a visible action (peek, rewind, emote)"
Apologize in conversation, note the action in the log for documentation value, and move on. The human operator can see the log and will understand it's you testing.

### "A button has no ref"
Not all elements expose refs (especially dynamic nested buttons like "Equip X"). Options:
1. Get the parent ref and use that
2. Use `page.getByRole('button', { name: 'X' })` via a direct Playwright call
3. Drag instead — drag usually works on any visible card

### "Equip button doesn't equip when I click the target"
**Known Rift Atlas UX bug.** The Equip button exhausts the equipment, but clicking the target unit toggles its exhausted state instead of equipping. **Workaround: drag the equipment directly onto the target unit.** Document this as a gap we can fix in our implementation.

## Reference files

This skill includes reference files in `references/`:

- `hotkeys.md` — full keymap observed from the in-game help modal
- `ui-patterns.md` — reusable UI patterns (hold-to-arm, hover preview slot, inline showdown)
- `anti-patterns.md` — things Rift Atlas does poorly — DO NOT copy
- `future-two-agent.md` — design notes for future two-agent mode (not yet implemented)

Read these as needed — they cache observations from prior runs so you don't have to re-discover everything.

## Completion report format

```
Rift Atlas Study complete
=========================

Duration: ~N minutes
Turns observed: N
Screenshots captured: N
Observation log: .ai_memory/riftatlas-ui-study.md (updated)
Implementation plan: .ai_memory/riftatlas-ui-implementation-plan.md (updated / created)

New observations this run:
- <bullet 1>
- <bullet 2>

Top 5 prioritized gaps:
1. <gap> — <tier> — <effort>
2. ...

Suggested next action: dispatch agent for Workstream <N> (see implementation plan)
```
