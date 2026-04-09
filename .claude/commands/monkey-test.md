# Monkey Test: Two-Agent Riftbound QA System

Run a goldfish game against the Riftbound server using two specialized agents working in parallel: a **Testing Monkey** that plays the game and tries random/aggressive moves, and a **Rules Observer** that watches every game state and move for rules violations, illegal plays, and card text mismatches.

## Instructions

You are the orchestrator. You will launch two agents and coordinate their work.

### Phase 1: Start the Server

1. Check if the server is already running on port 3000: `curl -s http://localhost:3000/ | head -c 100`
2. If not running, start it in background: `cd /home/emaynard/tcg-engines/apps/riftbound-app && bun run server.ts` (use run_in_background)
3. Wait for it to be ready (poll with curl, max 10 seconds)

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
> 1. **Load the rules** — Read the Riftbound rules from:
>    - `/home/emaynard/tcg-engines/.claude/skills/riftbound-rules/references/01_20_Riftbound_Core_Rules_2025_06_02.md`
>    - `/home/emaynard/tcg-engines/.claude/skills/riftbound-rules/references/21_40_Riftbound_Core_Rules_2025_06_02.md`
>    - `/home/emaynard/tcg-engines/.claude/skills/riftbound-rules/references/41_60_Riftbound_Core_Rules_2025_06_02.md`
>    - `/home/emaynard/tcg-engines/.claude/skills/riftbound-rules/references/61_65_Riftbound_Core_Rules_2025_06_02.md`
>
> 2. **Load card definitions** — For every card that was played during the game, look up its definition:
>    - Card data: `/home/emaynard/tcg-engines/packages/riftbound-cards/src/data/sets/` (JSON files)
>    - Card source files: `/home/emaynard/tcg-engines/packages/riftbound-cards/src/cards/` (TypeScript files)
>    - Read the `rulesText` for each card that appeared in the game
>
> 3. **Validate each move** — For every move in the log, check:
>    - **Timing legality**: Was this move legal in the current phase/chain state? (rules 510, 532-544)
>    - **Cost validation**: Did the player have enough energy? Was the rune pool correct?
>    - **Target legality**: If a spell/ability targeted something, was it a legal target? Does the card text match what happened?
>    - **Card text compliance**: Read the EXACT rulesText of each card played. Did the effect match what the card says?
>      - e.g., "Move up to 2 friendly units to base" — were there friendly units to move? Were non-friendly units moved?
>    - **Turn structure**: Did phases happen in order? (Awaken → Beginning → Channel → Draw → Action → Ending)
>    - **Combat rules**: Was damage calculated correctly? (rule 626 — mutual simultaneous damage)
>    - **Chain rules**: Did priority pass correctly? Did spells resolve in LIFO order?
>    - **Scoring rules**: Were victory points awarded correctly? (Hold scoring, conquer scoring)
>
> 4. **Check for missing validations** — For each state snapshot, check:
>    - Were any moves AVAILABLE that shouldn't have been? (e.g., endTurn while chain active, play spell with no targets)
>    - Were any moves MISSING that should have been available?
>    - Were any cards playable that shouldn't have been given the game state?
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
>    - Card text: "exact text from card"
>    - What happened: (description)
>    - What should have happened: (description)
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
> - Turn 2: ...
>
> ## Summary
> - Total moves audited: X
> - Rules violations: X
> - Card text mismatches: X
> - Missing validations: X
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
