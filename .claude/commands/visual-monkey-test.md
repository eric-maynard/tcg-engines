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

1. **Clean up stale data files from previous runs:** Delete all temp files from previous test runs: `rm -f /tmp/visual-monkey-*.json /tmp/observer-*.json /tmp/handler-*.json /tmp/monkey-*.json /tmp/game-state-*.json`
2. Check if the server is already running on port 3000: `curl -s http://localhost:3000/ | head -c 100`
3. If not running, start it in background: `cd /home/emaynard/tcg-engines/apps/riftbound-app && bun run server.ts` (use run_in_background)
4. Wait for it to be ready (poll with curl, max 10 seconds)

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
> ## CRITICAL: Rules Primer — Read This Before Auditing Anything
>
> You MUST understand these core game concepts before making ANY rules judgment. Many rule terms have specific definitions that differ from their colloquial meaning. When in doubt, read the actual rule text from the reference files — do NOT guess based on rule numbers alone.
>
> ### Rune System & Resource Model (rules 153-161)
>
> Riftbound uses an **accumulating resource system** (like lands in MTG or ink in Lorcana):
>
> - **Rune cards** are physical cards that live in the **Rune Deck** (12 cards per player).
> - **Channel phase** (rule 515.3): Each turn, 2 runes move from Rune Deck → Board. They STAY on the board permanently (until explicitly Recycled by a game effect).
> - **Exhausting** a rune (tapping it) adds Energy or Power to the player's **Rune Pool**.
> - **Rune Pool** (rule 159) is a **conceptual abstraction** — it is the *Energy and Power available to spend*, NOT a physical zone of cards. Rule 159 says: "The Rune Pool is a conceptual collection of a player's available Energy and Power."
> - **"Rune Pool empties"** (rules 515.4.d, 517.2.c, 160) means **unspent Energy and Power are lost** — the counters reset to 0. It does NOT mean rune cards return to the deck. Rule 160.1 confirms: "Any unspent Energy or Power are lost."
> - **Rune cards stay on the board** across turns. Rule 154.1.a: "despite remaining on the Board until Recycled or otherwise removed from the board, [a Rune] is not a Permanent."
> - **Awaken phase** (rule 515.1): All runes are readied (untapped), so you can exhaust them again next turn.
> - **Resource curve**: Turn 1 = 2 runes, Turn 2 = 4 runes, Turn 3 = 6 runes, etc. This is the intended progression — players need increasing energy to play higher-cost cards.
> - **Recycling** (rule 594) is a SPECIFIC game action where a card is placed on the bottom of its corresponding deck. Runes are only recycled when a game effect explicitly instructs it (e.g., the basic rune ability "Recycle this: Add [C]"). Rune Pool emptying is NOT recycling.
>
> **COMMON MISTAKE:** Do NOT flag rune cards accumulating on the board as a bug. This is correct behavior. If you see 10+ rune cards on the board by mid-game, that is the resource system working as designed.
>
> ### Turn Structure (rules 515-517)
>
> ```
> Awaken   → Ready all cards, clear stun (rule 515.1)
> Beginning → Kill Temporary units, Hold scoring, start-of-turn triggers (rule 515.2)
> Channel  → Channel 2 runes from rune deck to board (rule 515.3)
> Draw     → Draw 1 card, Burn Out if deck empty, Rune Pool empties (rule 515.4)
> Main     → Player actions: play cards, activate abilities, move, combat (rule 516)
> Ending   → Clear damage, expire turn-scoped effects, Rune Pools empty (rule 517)
> ```
>
> First player channels 2 runes on turn 1. Second player channels 3 runes on their first turn (rule 644.7 — catch-up rule).
>
> ### Scoring System (rules 630-632)
>
> - **Conquer** (rule 630.1): Gain control of a battlefield you haven't scored this turn.
> - **Hold** (rule 630.2): You control a battlefield during your Beginning Phase.
> - **Score** (rule 632): Awards up to 1 VP per battlefield per turn.
> - **Final Point** (rule 632.1.b): Extra restrictions when 1 point from winning:
>   - Hold: Always scores the final point (632.1.b.1).
>   - Conquer: Only scores if you scored EVERY battlefield this turn (632.1.b.2); otherwise draw a card.
> - **Score triggers** (rule 632.2): Conquer and Hold each trigger their respective battlefield abilities. These trigger only once per battlefield per turn (632.2.c).
>
> ### Showdowns (rules 545-553)
>
> - **Rule 548:** A Showdown begins when Control of a Battlefield is Contested and the turn is in a Neutral Open State.
> - **Rule 548.2:** If the Battlefield is uncontrolled when it becomes Contested, a Showdown opens during Cleanup at end of that Move.
> - **Rule 516.5.b:** A Showdown occurs when units move to an empty battlefield (non-combat showdown).
> - Showdowns are windows where both players can play Action/Reaction spells before the conquer resolves.
> - Against a Goldfish (auto-pass), showdowns resolve instantly — but they should still be entered for correctness.
>
> ### Combat (rule 626)
>
> - **Attacker distributes damage first** (rule 626.1.d), then defender.
> - Both sides deal their **full Might** as damage — NOT "winner deals excess."
> - **Tank** units must be assigned lethal damage first (626.1.d.1).
> - **Lethal damage** = damage equaling or exceeding the unit's Might (626.1.d.1.a).
> - Damage must be assigned in full to one unit before moving to the next (626.1.d.2).
> - Outcome: all defenders dead + attacker survives → conquer; otherwise → attacker recalled.
>
> ### Chain System (rules 532-544)
>
> - LIFO spell stack with priority passing.
> - Neutral Closed → opponent can respond with Reaction → chain grows.
> - When both pass → top item resolves → priority resets → repeat until empty.
>
> ### Triggered Abilities (rule 583)
>
> - Fire when their condition is met (e.g., "When you hold here", "When you conquer", "When you play me").
> - Check ALL cards on board including legend zone and champion zone.
> - Optional triggers ("you may") must still be OFFERED to the player even if the player might decline.
>
> ### Key Distinctions to Get Right
>
> | Concept | What It Means | What It Does NOT Mean |
> |---------|---------------|----------------------|
> | "Rune Pool empties" | Energy/Power counters reset to 0 | Rune cards return to deck |
> | "Recycle" | Specific game action putting cards on bottom of a deck | Any time cards leave a zone |
> | "Contested" | Units from one player at a battlefield they don't control | Any battlefield with units |
> | "Showdown" | Priority window for spells before conquer | Automatic combat |
> | "Channel" | Move runes from deck to board (permanent) | Temporary energy generation |
>
> ## Step 1: Discover the Game ID
>
> The Visual Monkey creates a game through the browser UI. You need to find the active game ID:
> 1. Poll `GET http://localhost:3000/api/games` every 5 seconds (timeout after 3 minutes)
> 2. If that endpoint doesn't exist, try reading the monkey's log at `/tmp/visual-monkey-log.json` — it may contain the game URL or ID
> 3. As a fallback, check the browser URL via the monkey's screenshots or log for `/game/<id>` patterns
>
> ## Step 2: Connect to the Game
>
> Once you have the game ID:
> 1. Write a bun script at `/tmp/rules-observer.ts` that:
>    - **At startup, MUST delete any existing `/tmp/observer-states.json`, `/tmp/observer-moves.json`, and `/tmp/game-state-final.json`** before connecting — stale data from previous runs causes false failures
>    - Connects via WebSocket to `ws://localhost:3000/ws/game/{gameId}?player=spectator` (or player-1 for read access)
>    - Logs EVERY `state_update` message to `/tmp/observer-states.json`
>    - Logs all available moves at each decision point to `/tmp/observer-moves.json`
>    - Runs until the game ends or 5 minutes elapse
> 2. Run the script with `bun run /tmp/rules-observer.ts`
> 3. Also poll `GET /api/game/{gameId}/state` periodically as a backup data source
>
> ## Step 3: Load the Rules
>
> **Start with the video guide** — it explains rules in plain language with game design intent:
> - `/home/emaynard/tcg-engines/.claude/skills/riftbound-rules/references/riftbound-rules-video-guide.md` **(READ THIS FIRST — it is the most accessible and comprehensive overview)**
>
> Then read the formal rules reference for precise rule numbers and edge cases:
> - `/home/emaynard/tcg-engines/.claude/skills/riftbound-rules/references/01_20_Riftbound_Core_Rules_2025_06_02.md`
> - `/home/emaynard/tcg-engines/.claude/skills/riftbound-rules/references/21_40_Riftbound_Core_Rules_2025_06_02.md`
> - `/home/emaynard/tcg-engines/.claude/skills/riftbound-rules/references/41_60_Riftbound_Core_Rules_2025_06_02.md`
> - `/home/emaynard/tcg-engines/.claude/skills/riftbound-rules/references/61_65_Riftbound_Core_Rules_2025_06_02.md`
>
> **How to use both sources:** The video guide gives you the conceptual framework and game design intent. The formal rules give you precise rule numbers for citations. When making a judgment, first check if the video guide explains the concept — it will help you avoid misinterpreting formal rule text. Then cite the specific rule number from the formal reference.
>
> When you cite a rule, read the FULL surrounding context (at least 5 rules before and after). Many rules have sub-rules that change the meaning of the parent. For example, rule 159 defines what "Rune Pool" actually means — reading only rule 515.4.d ("Rune Pool empties") without reading 159 will lead to wrong conclusions.
>
> ## Step 4: Load Card Definitions
>
> For every card that appears during the game, look up its definition:
> - Card data: `/home/emaynard/tcg-engines/packages/riftbound-cards/src/data/sets/` (JSON files)
> - Card source files: `/home/emaynard/tcg-engines/packages/riftbound-cards/src/cards/` (TypeScript files)
> - Read the `rulesText` for each card that appeared
>
> ## Step 5: Audit Everything
>
> **CRITICAL: Do NOT trust the engine's legality checks.** The engine may say a move is legal when it shouldn't be. You must INDEPENDENTLY validate every move against the rules — not just check that the engine accepted it.
>
> For every move and state transition, validate:
>
> 1. **Timing legality**: Was this move legal in the current phase/chain state? (rules 510, 532-544)
> 2. **Cost validation**: Did the player have enough energy? Was the rune pool (Energy/Power) correct?
> 3. **Target legality — INDEPENDENT VALIDATION**: Do NOT trust the engine's target resolution. For every spell or ability that targets something:
>    - Read the card's rulesText to determine what it targets (e.g., "a friendly unit")
>    - Independently check the board state: are there ACTUAL valid targets in the correct zones?
>    - "The board" means base + battlefields. It does NOT include champion zone (champions must be played first) or legend zone (legends can't leave their zone).
>    - If a spell requires a target (e.g., "Give a friendly unit +1 Might") and NO valid targets exist on the board, the spell should NOT have been playable. Flag this as a violation even if the engine accepted the move.
>    - Check rule 559.3.c (target selection) and rule 562 (legality check): targets must be legal when the spell is played.
> 4. **Spell-playing process — VERIFY SUB-STEPS**: Per rules 554-563, playing a spell requires:
>    - Announce the spell
>    - Choose targets (rule 559.3.c) — targets must be selected BEFORE the spell goes on the chain
>    - Pay costs (rule 561)
>    - Spell goes on the chain
>    - If the engine skips target selection (auto-resolving targets at resolution time instead of announcement time), flag this as a process violation. In a real game, the opponent needs to know what is being targeted before deciding to respond.
> 5. **Card text compliance**: Read the EXACT rulesText of each card played. Did the effect match what the card says?
> 6. **Turn structure**: Did phases happen in order? (Awaken → Beginning → Channel → Draw → Main → Ending)
> 7. **Combat rules**: Was damage calculated correctly? (rule 626 — attacker distributes first, then defender; both deal full Might)
> 8. **Chain rules**: Did priority pass correctly? Did spells resolve in LIFO order?
> 9. **Scoring rules**: Were victory points awarded correctly? Check final point restrictions (rule 632.1.b).
> 10. **Triggered abilities**: Did ALL triggered abilities that should have fired actually fire? Check EVERY card on board (including legend zone and champion zone) for triggers that match game events.
> 11. **Static abilities**: Are continuous effects being applied correctly? Check legend and champion cards too.
> 12. **Legend abilities**: Specifically check — can legend abilities activate? Do triggered abilities on legends fire? Are legends included in the game's ability scanning? Legends can have activated abilities (e.g., Daughter of the Void: "[Exhaust]: [Reaction] — [Add] [rainbow]"). If a legend has an activated ability but it never appears as an available move, flag this.
> 13. **Missing moves**: Were any moves AVAILABLE that shouldn't have been? Were any moves MISSING that should have been available? Pay special attention to:
>     - Spells playable with no valid targets on the board (engine may wrongly include champion/legend zone cards as targets)
>     - Legend activated abilities that should be available but aren't
>     - Champion abilities that shouldn't be activatable before the champion is played
> 14. **Resource system**: Verify rune cards accumulate correctly on the board (2 per turn). Do NOT flag rune accumulation as a bug. Verify Energy/Power resets between turns.
> 15. **Showdown compliance**: When a unit moves to an uncontrolled battlefield, is a showdown entered before conquer?
>
> ### Zone Targeting Rules (for independent validation)
>
> When independently validating targets, use these zone rules:
> - **Base**: Cards here are "on the board" — valid targets for board-targeting effects
> - **Battlefield zones**: Cards here are "on the board" — valid targets
> - **Champion zone**: Cards here are NOT on the board yet — they must be played (paid for) to enter base first. NOT valid targets for "friendly unit" effects.
> - **Legend zone**: Cards here are NOT on the board — legends cannot leave their zone. NOT valid targets for unit/permanent effects. But legends CAN have activated/triggered abilities that work from the legend zone.
> - **Hand, deck, trash, banishment**: Cards here are NOT valid targets for board-targeting effects (unless a card specifically says "from hand/trash/etc.")
>
> ### Before Flagging a Violation
>
> For EVERY potential violation you find, before writing it up:
> 1. Read the EXACT rule text (not just the number)
> 2. Read all sub-rules and cross-references
> 3. Check if the rule uses a defined term (like "Rune Pool") and read THAT definition too
> 4. Consider whether the behavior matches the GAME DESIGN intent, not just your initial interpretation
> 5. If uncertain, flag it as "UNCERTAIN — needs human review" rather than asserting a violation
>
> ## Output
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
>    - Full rule text: "exact quote from rules document"
>    - Card text (if applicable): "exact text from card"
>    - What happened: (description)
>    - What should have happened: (description)
>    - Confidence: HIGH/MEDIUM/LOW (how certain are you this is a real violation?)
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
> ## Resource System Validation
> - Rune accumulation correct: YES/NO (expected X runes on board by turn Y)
> - Energy resets between turns: YES/NO
> - Power resets between turns: YES/NO
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
> - Uncertain findings (needs human review): X
> ```

---

### Phase 3: Compile Final Report

After ALL THREE agents complete, call `mcp__playwright__browser_close` to release the shared Playwright browser (the monkey and handler leave the page open when they finish). Then read their outputs:
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
