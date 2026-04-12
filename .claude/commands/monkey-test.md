# Monkey Test: Two-Agent Riftbound QA System

Run a goldfish game against the Riftbound server using two specialized agents working in parallel: a **Testing Monkey** that plays the game and tries random/aggressive moves, and a **Rules Observer** that watches every game state and move for rules violations, illegal plays, and card text mismatches.

## Instructions

You are the orchestrator. You will launch two agents and coordinate their work.

### Phase 1: Start the Server

1. **Clean up stale data files from previous runs:** Delete all temp files from previous test runs: `rm -f /tmp/visual-monkey-*.json /tmp/observer-*.json /tmp/handler-*.json /tmp/monkey-*.json /tmp/game-state-*.json`
2. Check if the server is already running on port 3000: `curl -s http://localhost:3000/ | head -c 100`
3. If not running, start it in background: `cd /home/emaynard/tcg-engines/apps/riftbound-app && bun run server.ts` (use run_in_background)
4. Wait for it to be ready (poll with curl, max 10 seconds)

### Phase 2: Set Up the Game

1. **Get available decks**: `GET /api/saved-decks` — pick the first two decks (or the same deck twice). If no saved decks, use `GET /api/deck/prebuilt` for prebuilt decks.
2. **Create a lobby**: `POST /api/lobby/create` with `{ "playerName": "Monkey-P1", "deckId": <id> }`
3. **Join with player 2**: `POST /api/lobby/join` with `{ "lobbyCode": <code>, "playerName": "Monkey-P2", "deckId": <id> }`
4. **Start the game** from the lobby (check lobby API for how to start)
5. If the lobby flow is too complex, try the direct game creation: `POST /api/game/create` with deck configs.

### Phase 3: Launch Both Agents in Parallel

Launch BOTH agents simultaneously using the Agent tool. They will share the same game but have different roles.

---

#### Agent 1: Testing Monkey

**Description:** "Monkey test player - play game"

**Prompt for this agent:**

> You are a chaotic testing monkey. Your job is to play a Riftbound game via WebSocket and try every move you can, including edge cases. You are Player 1. Player 2 is a goldfish (just ends turn).
>
> **Game ID:** {gameId}
> **Server:** ws://localhost:3000/ws/game/{gameId}
>
> Write a bun script at `/tmp/monkey-player.ts` that:
>
> 0. **At startup, MUST delete any existing `/tmp/monkey-log.json`, `/tmp/monkey-states.json`, `/tmp/monkey-available-moves.json`, `/tmp/monkey-summary.json`, and `/tmp/game-state-final.json`** before connecting — stale data from previous runs causes false failures
> 1. Connects WebSocket for player-1 and player-2
> 2. Handles pregame: pick first battlefield if prompted, keep all cards for mulligan (sendBack: [])
> 3. Plays up to 10 turns total (5 per player)
> 4. For Player 1, on EACH turn:
>    - First exhaust ALL available runes (send all exhaustRune moves)
>    - Then play cards from hand: try EVERY playable card (units, spells, gear) — cheapest first
>    - Move units to battlefields (standardMove/gankingMove)
>    - Attack with any available units (declareAttack, contestBattlefield)
>    - Conquer undefended battlefields (conquerBattlefield)
>    - Score points when available (scorePoint)
>    - Try some INTENTIONALLY WRONG moves too: wrong params, wrong player, duplicate moves
>    - End turn when nothing else to do
> 5. For Player 2: just endTurn (or pass if needed)
> 6. After EVERY move (success or failure), log to a JSON file at `/tmp/monkey-log.json`:
>    - `{ turn, phase, moveId, params, result: "success"|"rejected"|"error", serverResponse, timestamp, gameStateSummary }`
>    - gameStateSummary should include: active player, turn phase, chain state, each player's hand size, board card count, VP, rune pool energy
> 7. Also log the FULL game state after every state_update to `/tmp/monkey-states.json` (array of snapshots)
> 8. Also log the full list of availableMoves at each decision point to `/tmp/monkey-available-moves.json`
> 9. When game ends or after 10 turns, write a summary to `/tmp/monkey-summary.json`
>
> Run the script with: `bun run /tmp/monkey-player.ts`
>
> **IMPORTANT:**
> - Wait for the sync/state_update response before sending the next move
> - If a move is rejected, log it and move on. Don't retry the same move.
> - If stuck for 3 consecutive attempts, end the turn
> - Track: total moves attempted/succeeded/failed, turns completed, final score

---

#### Agent 2: Rules Observer

**Description:** "Rules observer - validate game state"

**Prompt for this agent:**

> You are a Riftbound rules expert and game observer. Your job is to audit a completed monkey test game for rules violations by analyzing the game log, state snapshots, and available moves against the official rules and card text.
>
> ## CRITICAL: Rules Primer — Read This Before Auditing Anything
>
> You MUST understand these core game concepts before making ANY rules judgment. Many rule terms have specific definitions that differ from their colloquial meaning. When in doubt, read the actual rule text — do NOT guess based on rule numbers alone.
>
> ### Rune System & Resource Model (rules 153-161)
>
> Riftbound uses an **accumulating resource system** (like lands in MTG):
>
> - **Rune cards** live in the **Rune Deck** (12 cards per player). During the **Channel phase**, 2 runes move from Rune Deck → Board. They STAY on the board permanently (until explicitly Recycled by a game effect).
> - **Exhausting** a rune (tapping it) adds Energy or Power to the player's **Rune Pool**.
> - **Rune Pool** (rule 159) is a **conceptual abstraction** — it is the *Energy and Power available to spend*, NOT a physical zone of cards. Rule 159: "The Rune Pool is a conceptual collection of a player's available Energy and Power."
> - **"Rune Pool empties"** (rules 515.4.d, 517.2.c, 160) means **unspent Energy and Power are lost** — the counters reset to 0. It does NOT mean rune cards return to the deck. Rule 160.1: "Any unspent Energy or Power are lost."
> - **Rune cards stay on the board** across turns. Rule 154.1.a: "despite remaining on the Board until Recycled or otherwise removed from the board, [a Rune] is not a Permanent."
> - **Resource curve**: Turn 1 = 2 runes, Turn 2 = 4, Turn 3 = 6, etc. This is intended — players need increasing energy for higher-cost cards.
> - **Recycling** (rule 594) is a SPECIFIC game action where a card goes to the bottom of its deck. Runes are only recycled when a game effect explicitly instructs it (e.g., "Recycle this: Add [C]"). Pool emptying is NOT recycling.
>
> **COMMON MISTAKE:** Do NOT flag rune cards accumulating on the board as a bug.
>
> ### Key Distinctions
>
> | Concept | What It Means | What It Does NOT Mean |
> |---------|---------------|----------------------|
> | "Rune Pool empties" | Energy/Power counters reset to 0 | Rune cards return to deck |
> | "Recycle" | Specific game action putting cards on bottom of a deck | Any time cards leave a zone |
> | "Contested" | Units from one player at a battlefield they don't control | Any battlefield with units |
> | "Showdown" | Priority window for spells before conquer | Automatic combat |
> | "Channel" | Move runes from deck to board (permanent) | Temporary energy generation |
>
> ### Before Flagging a Violation
>
> For EVERY potential violation, before writing it up:
> 1. Read the EXACT rule text (not just the number) — check the video guide first for conceptual understanding
> 2. Read all sub-rules and cross-references
> 3. Check if the rule uses a defined term (like "Rune Pool") and read THAT definition too
> 4. Consider whether the behavior matches the GAME DESIGN intent
> 5. If uncertain, flag it as "UNCERTAIN — needs human review" rather than asserting a violation
>
> **Wait for the monkey test to complete** — poll for `/tmp/monkey-summary.json` to exist (check every 5 seconds, timeout after 5 minutes).
>
> Once the game data is available, read these files:
> - `/tmp/monkey-log.json` — every move attempted and its result
> - `/tmp/monkey-states.json` — full game state after every move
> - `/tmp/monkey-available-moves.json` — available moves at each decision point
> - `/tmp/monkey-summary.json` — game summary
>
> **Your audit process:**
>
> 1. **Load the rules** — Start with the video guide, then read the formal rules:
>    - `/home/emaynard/tcg-engines/.claude/skills/riftbound-rules/references/riftbound-rules-video-guide.md` **(READ THIS FIRST — most accessible and comprehensive overview)**
>    - `/home/emaynard/tcg-engines/.claude/skills/riftbound-rules/references/01_20_Riftbound_Core_Rules_2025_06_02.md`
>    - `/home/emaynard/tcg-engines/.claude/skills/riftbound-rules/references/21_40_Riftbound_Core_Rules_2025_06_02.md`
>    - `/home/emaynard/tcg-engines/.claude/skills/riftbound-rules/references/41_60_Riftbound_Core_Rules_2025_06_02.md`
>    - `/home/emaynard/tcg-engines/.claude/skills/riftbound-rules/references/61_65_Riftbound_Core_Rules_2025_06_02.md`
>
>    **How to use both sources:** The video guide gives you the conceptual framework and game design intent. The formal rules give you precise rule numbers for citations. When making a judgment, first check if the video guide explains the concept — it will help you avoid misinterpreting formal rule text. Then cite the specific rule number from the formal reference.
>
>    When you cite a rule, read the FULL surrounding context (at least 5 rules before and after). Many rules have sub-rules that change the meaning of the parent.
>
> 2. **Load card definitions** — For every card that was played during the game, look up its definition:
>    - Card data: `/home/emaynard/tcg-engines/packages/riftbound-cards/src/data/sets/` (JSON files)
>    - Card source files: `/home/emaynard/tcg-engines/packages/riftbound-cards/src/cards/` (TypeScript files)
>    - Read the `rulesText` for each card that appeared in the game
>
> **CRITICAL: Do NOT trust the engine's legality checks.** The engine may say a move is legal when it shouldn't be. You must INDEPENDENTLY validate every move against the rules.
>
> 3. **Validate each move** — For every move in the log, check:
>    - **Timing legality**: Was this move legal in the current phase/chain state? (rules 510, 532-544)
>    - **Cost validation**: Did the player have enough energy? Was the rune pool (Energy/Power) correct?
>    - **Target legality — INDEPENDENT VALIDATION**: Do NOT trust the engine's target resolution. For every spell or ability that targets something:
>      - Read the card's rulesText to determine what it targets
>      - Independently check the board state: are there ACTUAL valid targets in the correct zones?
>      - "The board" means base + battlefields. It does NOT include champion zone or legend zone.
>      - If a spell requires a target and NO valid targets exist on the board, the spell should NOT have been playable — flag this even if the engine accepted the move.
>    - **Spell-playing process**: Per rules 554-563, targets must be chosen BEFORE the spell goes on the chain (rule 559.3.c). If the engine skips target selection or auto-resolves at resolution time, flag this.
>    - **Card text compliance**: Read the EXACT rulesText of each card played. Did the effect match what the card says?
>      - e.g., "Move up to 2 friendly units to base" — were there friendly units to move? Were non-friendly units moved?
>    - **Turn structure**: Did phases happen in order? (Awaken → Beginning → Channel → Draw → Action → Ending)
>    - **Combat rules**: Was damage calculated correctly? (rule 626 — attacker distributes first, then defender; both deal full Might)
>    - **Chain rules**: Did priority pass correctly? Did spells resolve in LIFO order?
>    - **Scoring rules**: Were victory points awarded correctly? Check final point restrictions (rule 632.1.b).
>    - **Resource system**: Verify rune cards accumulate correctly on the board (2 per turn). Do NOT flag accumulation as a bug. Verify Energy/Power resets between turns.
>
> 4. **Check for missing validations** — For each state snapshot, check:
>    - Were any moves AVAILABLE that shouldn't have been? Specifically check:
>      - Spells playable with no valid targets on the board (engine may wrongly include champion/legend zone as targets)
>      - Legend activated abilities that should be available but aren't
>      - endTurn while chain active
>    - Were any moves MISSING that should have been available?
>    - Were any cards playable that shouldn't have been given the game state?
>
>    **Zone targeting rules for independent validation:**
>    - Base + battlefield zones = "on the board" = valid targets
>    - Champion zone = NOT on the board (must be played first) = NOT valid targets
>    - Legend zone = NOT on the board (cannot leave) = NOT valid targets for unit/permanent effects
>    - Hand, deck, trash = NOT valid targets unless card says so
>
> 5. **Cross-reference card text** — For EVERY card played:
>    - Read the card's rulesText from the card definition
>    - Read the card's parsed abilities from the JSON data
>    - Check if the parsed abilities correctly represent the rulesText
>    - Check if the effect execution matched the parsed abilities
>    - Flag any mismatches between rulesText and what actually happened
>
> **Output your findings to `/tmp/observer-report.md`** with this structure:
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
>    - Confidence: HIGH/MEDIUM/LOW
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
> - Turn 2: ...
>
> ## Summary
> - Total moves audited: X
> - Rules violations: X (Critical/High/Medium/Low)
> - Card text mismatches: X
> - Missing validations: X
> - Uncertain findings (needs human review): X
> ```

---

### Phase 4: Compile Final Report

After BOTH agents complete, read their outputs:
- `/tmp/monkey-summary.json` — game stats from the monkey
- `/tmp/monkey-log.json` — move log
- `/tmp/observer-report.md` — rules audit from the observer

Combine into a final report:

```
## Monkey Test Report (Two-Agent)

### Game Summary
- Turns completed: X/10
- Moves attempted: X (succeeded: X, rejected: X)
- Final score: P1=X VP, P2=X VP
- Game ended: (finished/stuck/timeout)

### Rules Violations (from Observer)
[list from observer report]

### Card Text Mismatches (from Observer)
[list from observer report]

### Available Moves Issues (from Observer)
[list from observer report]

### Engine/API Issues (from Monkey)
[issues from monkey log — rejected moves, errors, unexpected behavior]

### Recommendations
- Prioritized list of fixes needed, grouped by:
  1. Rules violations (highest priority)
  2. Card text mismatches
  3. Missing validations
  4. API/integration issues
```
