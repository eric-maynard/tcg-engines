# Future: Two-Agent Mode

**Status: not yet implemented.** This file documents the design for when we upgrade the skill to run two agents playing against each other instead of agent-vs-human.

## Why

Current mode requires a human operator on the other side of the game. This is slow and blocks sessions on a single person's availability. Two-agent mode lets observation sessions run 24/7 with no human in the loop.

## Design

### Architecture

```
┌──────────────┐   shared Playwright browser   ┌──────────────┐
│   Agent A    │ ───────── tab 1 ─────────► │   Tab 1      │
│  (rifty)     │                             │ (rifty's UI) │
└──────────────┘                             └──────────────┘
                                                      │
                                                      ▼
                                                 play.riftatlas.com
                                                      ▲
                                                      │
┌──────────────┐                             ┌──────────────┐
│   Agent B    │ ───────── tab 2 ─────────► │   Tab 2      │
│   (eric)     │                             │ (eric's UI)  │
└──────────────┘                             └──────────────┘
```

Both agents share the same Playwright browser instance but operate on separate tabs. Each tab is logged in as a different Rift Atlas account. The agents coordinate via a shared state file in `/tmp/riftatlas-two-agent-state.json` to know whose turn it is.

### Coordination protocol

Both agents write to and read from `/tmp/riftatlas-two-agent-state.json`:

```json
{
  "currentTurn": "rifty" | "eric",
  "lastAction": "...",
  "observations": [...],
  "gameOver": false
}
```

Agent A checks `currentTurn === "rifty"` before acting. When done with its turn, updates `currentTurn = "eric"`. Agent B does the opposite.

Lockstep ensures the agents don't step on each other's snapshots or trigger simultaneous actions.

### Observation splitting

Agent A observes:
- rifty's perspective (hand, hotkeys, clicks)
- All log entries
- Opponent state changes as visible from rifty's side

Agent B observes:
- eric's perspective (hand, hotkeys, clicks)
- All log entries
- Opponent state changes as visible from eric's side

Both write to a shared observation log `.ai_memory/riftatlas-two-agent-observations.md`, prefixing entries with the observer name: `[rifty] Clicked Plundering Poro` or `[eric] Saw Plundering Poro move to Trifarian War Camp`.

### Prerequisites for implementation

1. **Two pre-authenticated accounts** on `play.riftatlas.com` — can't automate login
2. **Playwright MCP with tab management** — open tabs, select tabs (already available)
3. **Lobby coordination** — Agent A creates a lobby, reads the code from the URL, Agent B joins via code
4. **Deck selection** — both agents pick the same deck or pre-configured decks
5. **Timeout handling** — if one agent hangs, the other should detect and terminate gracefully
6. **Divergence detection** — if the two observations disagree about game state, flag for investigation

### Open questions

- **Agent personalities?** Should one agent play aggressively and the other defensively to cover more scenarios?
- **Deck diversity?** Run the same two-agent session with different deck archetypes to observe variance in UI usage?
- **Game length?** Likely 15-30 minutes for a full match; need to budget for that.
- **Failure recovery?** If one agent crashes mid-game, how do we continue without abandoning the match?

## Implementation checklist

When we're ready to build this:

- [ ] Add a `mode: "two-agent" | "human-operator"` parameter to the skill
- [ ] Document the Rift Atlas account setup (username/password in `.env` not committed)
- [ ] Create lockstep coordinator at `/tmp/riftatlas-two-agent-state.json`
- [ ] Add a "leader" agent that creates the lobby and broadcasts the code
- [ ] Add a "follower" agent that reads the code and joins
- [ ] Test with a single-game match first, then Bo3
- [ ] Add kill-switches if the agents diverge or hang
- [ ] Log everything verbosely — this mode should produce richer observation data than human-operator mode

## Near-term workaround

Until two-agent mode is built, the skill runs in human-operator mode. The user authenticates once and then mostly lets the agent play, stepping in only when the human side needs to act.
