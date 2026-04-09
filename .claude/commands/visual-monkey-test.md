# Visual Monkey Test: UI-Only Riftbound QA

Play a goldfish game against the Riftbound server using ONLY the browser UI — no direct API calls, no WebSocket messages, no HTTP requests. All interaction must go through Chromium via Playwright MCP tools (clicking, typing, screenshots). This tests the real user experience while a Rules Observer simultaneously audits game mechanics via the API.

## Architecture: Three Agents

### Agent 1: Visual Monkey (the player)

The monkey interacts with the game EXCLUSIVELY through the browser. It may ONLY use these tools:
- `mcp__playwright__browser_navigate`
- `mcp__playwright__browser_snapshot`
- `mcp__playwright__browser_take_screenshot`
- `mcp__playwright__browser_click`
- `mcp__playwright__browser_type`
- `mcp__playwright__browser_press_key`
- `mcp__playwright__browser_hover`
- `mcp__playwright__browser_drag`
- `mcp__playwright__browser_fill_form`
- `mcp__playwright__browser_select_option`
- `mcp__playwright__browser_wait_for`
- `mcp__playwright__browser_console_messages`
- `mcp__playwright__browser_tabs`
- `mcp__playwright__browser_resize`
- `Read` (only to read its own log files)
- `Write` (only to write log files to /tmp/)
- `Bash` (ONLY to start the server if needed — no curl, no API calls)

**ABSOLUTELY FORBIDDEN for the Visual Monkey:**
- `curl`, `wget`, or any HTTP client commands
- Any `fetch()` or XHR calls
- Direct WebSocket connections
- Any `/api/` endpoint access
- The `WebFetch` tool
- Any Bash command that contacts localhost:3000 (except the initial server start)

### Agent 2: Handler/Observer (the enforcer)

The handler watches the monkey's behavior and validates the UI. It:
- Reviews the monkey's log for any rule violations (API usage)
- Takes independent screenshots to verify game state
- Audits visual issues (cropping, overflow, missing elements, broken layouts)
- Reports accessibility and usability issues
- **Kills the monkey if it breaks the UI-only rule** (reports violation and stops)

## Instructions

You are the orchestrator. Follow these phases:

### Phase 1: Start the Server

1. Check if the server is already running on port 3000: `curl -s http://localhost:3000/ | head -c 100`
2. If not running, start it in background: `cd /home/emaynard/tcg-engines/apps/riftbound-app && bun run server.ts` (use run_in_background)
3. Wait for it to be ready (poll with curl, max 10 seconds)

### Phase 2: Launch All Three Agents in Parallel

Launch ALL THREE agents simultaneously.

---

#### Agent 1: Visual Monkey

**Description:** "Visual monkey - UI-only game test"

**Prompt:**

> You are a Visual Monkey — a QA tester who plays Riftbound ONLY through the browser UI. You are NOT allowed to use any APIs, curl commands, WebSocket connections, or direct HTTP requests. ALL interaction must go through Playwright browser tools (click, type, screenshot, etc.).
>
> **CRITICAL CONSTRAINT:** You may ONLY interact via the browser. If you use curl, fetch, WebSocket, or any API call, the Handler agent will terminate you. The Handler is watching your every move.
>
> ### Setup
> 1. Navigate to `http://localhost:3000` using `mcp__playwright__browser_navigate`
> 2. Take a screenshot to see the landing page
> 3. Take a browser snapshot to understand the DOM structure
>
> ### Create a Game (through the UI)
> 1. Find and click the "Play" or game creation button
> 2. Enter a player name (e.g., "VisualMonkey")
> 3. Select a deck from the deck selector
> 4. Create or join a lobby through the UI
> 5. If the UI supports local/solo play, use that
> 6. Take screenshots at each step and log what you see
>
> ### Play the Game (through the UI)
> 1. Handle pregame: click through battlefield selection, mulligan (keep all cards by clicking the keep button)
> 2. Take a screenshot at the START of every turn
> 3. Take a browser snapshot to understand available UI elements
> 4. For each turn:
>    - Look at the visible cards and buttons
>    - Click on rune cards to exhaust them (tap for energy)
>    - Click on hand cards to play them (drag or click to play)
>    - Click on units to move/attack
>    - Click battlefield buttons to contest/conquer
>    - Press spacebar to pass priority or end turn
>    - Take a screenshot AFTER every action
> 5. For the opponent's turn: press spacebar or click "End Turn"
> 6. Play for up to 10 turns total
>
> ### Document Everything
> Write a log to `/tmp/visual-monkey-log.json` with entries for each action:
> ```json
> {
>   "turn": 1,
>   "action": "clicked card X",
>   "screenshot": "turn1-action3.png",
>   "result": "card moved to base",
>   "uiState": "what buttons/elements are visible",
>   "gameUrl": "current browser URL (include this on EVERY entry — the Rules Observer needs the game ID)"
> }
> ```
>
> ### Visual Issues to Watch For
> As you play, actively look for and report:
> - Cards being cropped or cut off
> - Elements overflowing their containers
> - Missing cards that should be visible (legend, champion, runes)
> - Buttons that don't respond or are hidden
> - Text that's unreadable or overlapping
> - Animations that break the layout
> - Incorrect card counts between zones
> - Confusing UI states (what should I click?)
>
> Write visual findings to `/tmp/visual-monkey-issues.json`.
>
> When done, write a summary to `/tmp/visual-monkey-summary.json`.

---

#### Agent 2: Handler/Observer

**Description:** "Handler - enforce UI-only rule and audit visuals"

**Prompt:**

> You are the Handler — a strict enforcer and visual auditor for the Visual Monkey test. You have two jobs:
>
> ### Job 1: Enforce the UI-Only Rule
>
> The Visual Monkey is ONLY allowed to interact with the game through the browser UI (Playwright tools). Monitor its behavior by reading `/tmp/visual-monkey-log.json` periodically. If you detect ANY of these violations, report them immediately:
> - curl, wget, or HTTP client usage
> - Direct API calls to localhost:3000/api/
> - WebSocket connections
> - fetch() or XHR in browser console
> - Any Bash command that contacts the server (except initial startup)
>
> If you detect a violation, write to `/tmp/handler-verdict.json`:
> ```json
> { "verdict": "KILLED", "reason": "Monkey used curl to call API", "evidence": "..." }
> ```
>
> ### Job 2: Visual Audit
>
> Wait for the monkey to start playing (poll for `/tmp/visual-monkey-log.json` every 5 seconds, timeout after 3 minutes). Once the game is underway:
>
> 1. Take your OWN independent screenshots of the game at key moments
> 2. Take browser snapshots to audit the DOM structure
> 3. For each screenshot, analyze:
>    - **Layout**: Are all zones visible? (hand, base, rune pool, legend, champion, battlefields)
>    - **Card visibility**: Are any cards cropped, overlapping incorrectly, or hidden?
>    - **Rune display**: Can you see ALL runes? Are they stacked properly?
>    - **Legend/Champion**: Are both visible with labels?
>    - **Text readability**: Can you read card names, costs, stats?
>    - **Button visibility**: Are action buttons (end turn, pass, etc.) visible and clickable?
>    - **Responsive behavior**: Does the layout handle different card counts gracefully?
>    - **Chain overlay**: When spells are on the chain, is the overlay clear and usable?
>    - **Resource bar**: Are energy/power counts accurate and visible?
>
> 4. Cross-reference what the UI shows against what the game state should be:
>    - Check browser console messages for errors
>    - Count visible cards vs expected cards
>    - Verify rune pool energy matches displayed value
>
> ### Output
>
> Write your findings to `/tmp/handler-report.md`:
>
> ```
> # Handler Report
>
> ## UI-Only Rule Compliance
> - Verdict: PASS/KILLED
> - Violations found: X
>
> ## Visual Audit
>
> ### Layout Issues
> 1. [SEVERITY] Description + screenshot reference
>
> ### Card Visibility Issues
> 1. [SEVERITY] Description
>
> ### Interaction Issues
> 1. [SEVERITY] Description — element was not clickable/visible when expected
>
> ### Accessibility Concerns
> 1. Description
>
> ## Screenshot Analysis
> - Screenshot 1 (turn X): [findings]
> - Screenshot 2 (turn X): [findings]
>
> ## Console Errors
> - [list any JS errors from browser console]
>
> ## Recommendations
> - Prioritized list of UI fixes needed
> ```

---

#### Agent 3: Rules Observer

**Description:** "Rules observer - validate game mechanics during visual monkey test"

**Prompt:**

> You are a Riftbound rules expert and game observer. Your job is to audit the game the Visual Monkey is playing for rules violations, illegal plays, card text mismatches, and missing ability triggers — by connecting directly to the game API.
>
> ### Step 1: Discover the Game ID
>
> The Visual Monkey creates a game through the browser UI. You need to find the active game ID:
> 1. Poll `GET http://localhost:3000/api/games` every 5 seconds (timeout after 3 minutes)
> 2. If that endpoint doesn't exist, try reading the monkey's log at `/tmp/visual-monkey-log.json` — it may contain the game URL or ID
> 3. As a fallback, check the browser URL via the monkey's screenshots or log for `/game/<id>` patterns
>
> ### Step 2: Connect to the Game
>
> Once you have the game ID:
> 1. Write a bun script at `/tmp/rules-observer.ts` that:
>    - Connects via WebSocket to `ws://localhost:3000/ws/game/{gameId}?player=spectator` (or player-1 for read access)
>    - Logs EVERY `state_update` message to `/tmp/observer-states.json`
>    - Logs all available moves at each decision point to `/tmp/observer-moves.json`
>    - Runs until the game ends or 5 minutes elapse
> 2. Run the script with `bun run /tmp/rules-observer.ts`
> 3. Also poll `GET /api/game/{gameId}/state` periodically as a backup data source
>
> ### Step 3: Load the Rules
>
> Read the Riftbound rules from:
> - `/home/emaynard/tcg-engines/.claude/skills/riftbound-rules/references/01_20_Riftbound_Core_Rules_2025_06_02.md`
> - `/home/emaynard/tcg-engines/.claude/skills/riftbound-rules/references/21_40_Riftbound_Core_Rules_2025_06_02.md`
> - `/home/emaynard/tcg-engines/.claude/skills/riftbound-rules/references/41_60_Riftbound_Core_Rules_2025_06_02.md`
> - `/home/emaynard/tcg-engines/.claude/skills/riftbound-rules/references/61_65_Riftbound_Core_Rules_2025_06_02.md`
>
> ### Step 4: Load Card Definitions
>
> For every card that appears during the game, look up its definition:
> - Card data: `/home/emaynard/tcg-engines/packages/riftbound-cards/src/data/sets/` (JSON files)
> - Card source files: `/home/emaynard/tcg-engines/packages/riftbound-cards/src/cards/` (TypeScript files)
> - Read the `rulesText` for each card that appeared
>
> ### Step 5: Audit Everything
>
> For every move and state transition, validate:
>
> 1. **Timing legality**: Was this move legal in the current phase/chain state? (rules 510, 532-544)
> 2. **Cost validation**: Did the player have enough energy? Was the rune pool correct?
> 3. **Target legality**: If a spell/ability targeted something, was it a legal target?
> 4. **Card text compliance**: Read the EXACT rulesText of each card played. Did the effect match what the card says?
> 5. **Turn structure**: Did phases happen in order? (Awaken → Beginning → Channel → Draw → Main → Ending)
> 6. **Combat rules**: Was damage calculated correctly? (rule 626 — mutual simultaneous damage)
> 7. **Chain rules**: Did priority pass correctly? Did spells resolve in LIFO order?
> 8. **Scoring rules**: Were victory points awarded correctly?
> 9. **Triggered abilities**: Did ALL triggered abilities that should have fired actually fire? Check EVERY card on board (including legend zone and champion zone) for triggers that match game events.
> 10. **Static abilities**: Are continuous effects being applied correctly? Check legend and champion cards too.
> 11. **Legend abilities**: Specifically check — can legend abilities activate? Do triggered abilities on legends fire? Are legends included in the game's ability scanning?
> 12. **Missing moves**: Were any moves AVAILABLE that shouldn't have been? Were any moves MISSING that should have been available? Pay special attention to legend/champion ability activation.
>
> ### Output
>
> Write findings to `/tmp/observer-report.md`:
>
> ```
> # Rules Observer Report
>
> ## Cards Audited
> | Card Name | ID | Rules Text | Parsed Correctly | Effect Executed Correctly |
>
> ## Rules Violations Found
> 1. [SEVERITY] Turn X, Move Y: Description
>    - Rule reference: (rule number)
>    - Card text: "exact text from card"
>    - What happened: (description)
>    - What should have happened: (description)
>
> ## Triggered Abilities Audit
> 1. Card "Name" in Zone: Trigger "when X" — fired: YES/NO — correct: YES/NO
>
> ## Legend/Champion Ability Audit
> 1. Legend "Name": Abilities available to activate: YES/NO
> 2. Legend "Name": Triggered ability fired when expected: YES/NO
>
> ## Available Moves Audit
> 1. Turn X: Move Y was available but shouldn't have been because...
> 2. Turn X: Move Y was missing but should have been available because...
>
> ## Card Text vs Implementation Mismatches
> 1. Card "Name" (ID): rulesText says X, but parsed ability does Y
>
> ## Turn Structure Validation
> - Turn 1: [phases in order, any skipped/duplicated]
>
> ## Summary
> - Total moves audited: X
> - Rules violations: X (Critical/High/Medium/Low)
> - Card text mismatches: X
> - Missing triggers: X
> - Legend ability issues: X
> ```

---

### Phase 3: Compile Final Report

After ALL THREE agents complete, read their outputs:
- `/tmp/visual-monkey-summary.json`
- `/tmp/visual-monkey-issues.json`
- `/tmp/handler-report.md`
- `/tmp/observer-report.md`

Combine into a final report:

```
## Visual Monkey Test Report

### Compliance
- UI-Only Rule: PASS/FAIL

### Game Summary
- Turns completed: X/10
- Actions taken: X
- Game ended: (finished/stuck/timeout)

### Rules Violations (from Rules Observer)
[list from observer report — highest priority]

### Card Text Mismatches (from Rules Observer)
[list from observer report]

### Triggered Ability Issues (from Rules Observer)
[missed triggers, legend ability problems]

### Available Moves Issues (from Rules Observer)
[moves that were available but shouldn't be, or missing but should exist]

### Visual Issues Found
[from both monkey issues and handler audit]

### Interaction Issues
[elements that were hard to find, click, or use]

### Layout Problems
[cropping, overflow, missing elements]

### Recommendations
- Prioritized fixes grouped by:
  1. Rules violations (highest priority)
  2. Card text / ability mismatches
  3. Missing triggers / legend issues
  4. Visual / layout issues
  5. Interaction / UX issues
```
