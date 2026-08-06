# @tcg/riftbound-mcp

A stdio **MCP server** that exposes the Riftbound agent harness
(`@tcg/riftbound/harness`, see `docs/harness/HARNESS-DESIGN.md`) so an LLM agent can create and play
Riftbound games headlessly: observe the board, learn exactly what it may decide next (stable option
keys), and answer — one tool call per rules decision.

```
LLM ──MCP/stdio──▶ riftbound-mcp ──▶ GameManager{gameId → harness Game(EngineBackend(RuleEngine))}
```

## Install / run

Bun workspace package; no build step.

```bash
# from the repo root
bun install                                   # workspace links (already present in a dev checkout)
bun packages/riftbound-mcp/src/bin.ts         # speaks MCP (JSON-RPC 2.0, newline-delimited) on stdio
bun packages/riftbound-mcp/src/bin.ts --list-tools
bun test packages/riftbound-mcp               # tests
```

`RIFTBOUND_MCP_DEBUG=1` forwards engine console logging to stderr (stdout is reserved for the protocol).

### Register with Claude Code

```bash
claude mcp add riftbound -- bun /abs/path/to/tcg-engines/packages/riftbound-mcp/src/bin.ts
```

or in `.mcp.json`:

```json
{
  "mcpServers": {
    "riftbound": {
      "command": "bun",
      "args": ["/abs/path/to/tcg-engines/packages/riftbound-mcp/src/bin.ts"]
    }
  }
}
```

## Tools

Every game-scoped response is an envelope `{ ok, gameId, seq, next, … }`. `seq` is the harness step
counter (embedded in decision ids); `next` is a one-line hint saying whose decision it is and its kind,
e.g. `player-1 action/main: 7 options (can end_turn) — Main phase: take an action or end the turn`.
Mutating tools also return `executed[]` (engine moves run, incl. automatic procedures), the next
`decision`, `events` (log lines since the call) and, in goldfish mode, `autoplay` (what the bot did).
Game-level failures return `isError: true` with `{ ok:false, error:{ code, message, detail } }` where
`code` is a harness error code (`STALE_DECISION`, `NOT_YOUR_DECISION`, `UNKNOWN_OPTION`,
`ILLEGAL_ARGS`, `WRONG_ANSWER_KIND`, `ENGINE_REJECTED`, `CARD_NOT_FOUND`, `NO_DECISION`, `GAME_OVER`, …)
or `GAME_NOT_FOUND`. State is untouched on error.

| tool | input | notes |
|---|---|---|
| `create_game` | `{ seed?, mode?: "goldfish"\|"duel", decks?: { p1: {domains:[a,b], strategy?} \| DeckConfig, p2 }, scenario?: ScenarioSpec (partial ok), autoProcedures? }` | → `{ gameId, seats, you, bots, mode, decision, next }` + a text board summary. Goldfish (default): you are player-1, player-2 is a bot that passes / takes forced picks / ends its turn. |
| `list_games` / `close_game` | `{}` / `{ gameId }` | |
| `describe_state` | `{ gameId, seat, detail?: summary\|zones\|full }` | compact text + JSON: turn, points, resources, battlefields+units, **your** hand only, bases, runes, chain, showdown, pendingChoice, decision summary, recent log |
| `current_decision` | `{ gameId, seat? }` | the harness `Decision` (kind, prompt, options with stable keys and `fields` = accepted args + legal values). With `seat`: that seat's own decision / free actions. |
| `list_legal_actions` | `{ gameId, seat, groupBy?: card\|move, flat? }` | action options (or raw engine variants with `flat`) |
| `act` | `{ gameId, seat, answer }` | `answer` = harness Answer or shorthand: `{kind:"action", key, args?:{to,targets,x,repeat,flow,accelerate,payOptional,sacrifice,discard,costTarget,units,domain}}` \| `"<option key>"` \| `["k"]` \| `true/false` \| `3` \| `"pass"` \| `"decline"` \| `{kind:"name",name}` \| `{kind:"distribute",allocation}`; optional `decisionId`. Incomplete bundles come back as `followUp` (pick / integer) — answer with another `act`. |
| `play_card` | `{ gameId, seat, card, to?, targets?, x?, repeat?, flow?, accelerate?, payOptional?, sacrifice?, costTarget? }` | unit / gear / spell / `"champion"` |
| `move_units` | `{ gameId, seat, units, to, gank? }` | standard move (multi-unit), ganking move, recall |
| `activate_ability` | `{ gameId, seat, card, abilityIndex?, sacrifice?, discard?, targets? }` | |
| `tap_rune` / `recycle_rune` | `{ gameId, seat, count?, domain?, rune? }` | +1 energy / +1 power |
| `pass_priority` / `pass_focus` / `pass` | `{ gameId, seat }` | chain priority / showdown focus / whichever applies |
| `end_turn` / `concede` | `{ gameId, seat }` | `end_turn` runs the TurnDriver (end step → next player's awaken/beginning/channel/draw) |
| `settle` | `{ gameId, policy?: passive\|firstOption, maxSteps? }` | drain passes / auto procedures / forced picks (and bot turns); stops at an open decision or an unanswered prompt |
| `advance_turn` | `{ gameId, policy? }` | end the turn and settle into the next open main phase (in goldfish: your next turn) |
| `card_text` | `{ defId? \| name? }` | rules text + parsed-abilities summary from the card pool (no game needed) |
| `card_state` | `{ gameId, card, seat? }` | full `CardState` (redacted for `seat` if hidden) |
| `history` | `{ gameId, sinceSeq?, limit? }` | transcript steps + readable lines |

`undo` is intentionally omitted: the harness backend keeps its own seq/transcript/invariant snapshots and
does not wrap `RuleEngine.undo()`.

Resources: `riftbound://design` (harness design doc), `riftbound://cards/README` (card-test guide /
harness vocabulary), `riftbound://schema/moves` (per-move engine param JSON Schemas, how each move is
reached through the tools, and the list of intentionally-internal moves — guarded by
`src/__tests__/contract.test.ts`).

## Sample session (goldfish)

```text
→ tools/call create_game {"seed":"demo","decks":{"p1":{"domains":["fury","chaos"]},"p2":{"domains":["calm","mind"]}}}
← Game g1-5372d6be (goldfish) seq 2 — turn 1, player-1's main phase — status playing. You are player-1.
  Your pool: energy 0, power - | runes 2/2 ready (chaos 2/2)
  Your hand (5): Tideturner [player-1-main-5-ogn-199-298] (cost 2, might 2, Hidden); Shadow Fiend [player-1-main-18-ven-014-166] (cost 2, might 2); …
  Decision: player-1 action/main: 6 options (can end_turn)
  {"gameId":"g1-5372d6be","seq":2,"next":"player-1 action/main: 6 options (can end_turn) — …", …}

→ tools/call tap_rune {"gameId":"g1-5372d6be","seat":"p1","count":2}
← {"ok":true,"seq":4,"runes":["player-1-rune-7-ogn-166-298","player-1-rune-9-ogn-166-298"],
   "events":["#3 player-1: exhaustRune {…}","#4 player-1: exhaustRune {…}"],
   "next":"player-1 action/main: 6 options (can end_turn) — …"}

→ tools/call list_legal_actions {"gameId":"g1-5372d6be","seat":"p1","groupBy":"move"}
← {"actions":{"playUnit":[{"key":"playUnit:player-1-main-18-ven-014-166","label":"play Shadow Fiend […]",
     "fields":[{"arg":"to","kind":"zone","options":["base"],"required":true}], …}], "endTurn":[…], …}}

→ tools/call play_card {"gameId":"g1-5372d6be","seat":"p1","card":"player-1-main-18-ven-014-166","to":"base"}
← {"ok":true,"seq":5,"executed":[{"moveId":"playUnit","params":{"cardId":"player-1-main-18-ven-014-166","location":"base"},"seat":"player-1"}],
   "next":"player-1 action/main: 4 options (can end_turn) — …"}

→ tools/call end_turn {"gameId":"g1-5372d6be","seat":"p1"}
← {"ok":true,"seq":7,"executed":[{"moveId":"endTurn",…}],"autoplay":{"steps":1},
   "next":"player-1 action/chain: 6 options (can pass) — Priority: respond to Loose Cannon […] or pass"}

→ tools/call settle {"gameId":"g1-5372d6be"}          # pass our start-of-turn trigger window
← {"ok":true,"seq":9,"steps":2,"reason":"open","next":"player-1 action/main: 12 options (can end_turn) — …"}

→ tools/call describe_state {"gameId":"g1-5372d6be","seat":"p1"}
← Game g1-5372d6be (goldfish) seq 9 — turn 3, player-1's main phase — status playing. You are player-1.
  Your pool: energy 0, power - | runes 4/4 ready (chaos 3/3, fury 1/1)
  Your base: Shadow Fiend [player-1-main-18-ven-014-166] (cost 2, might 2)
  Recent: #6 player-1: endTurn | #7 player-2: endTurn | #8 player-1: passChainPriority | #9 player-2: passChainPriority
```

A targeted spell in one call: `act {"seat":"p1","answer":{"kind":"action","key":"playSpell:cleave","args":{"targets":"ally"}}}`.
Omitting `targets` returns `followUp: {kind:"pick", options:[{key:"ally"},{key:"foe"}]}`; answer with
`act {"answer":"foe"}`. Engine prompts (reveal-and-pick, choose-target, opt-in, X…) appear as
`current_decision` → `pick` / `yes-no` / `integer` and are answered the same way.

## Limitations

- **One engine registry per process.** The engine reads card data from a process-global
  `CardDefinitionRegistry`; the server therefore serialises every tool call through a mutex and
  re-`activate()`s the target game's registry before touching it. Many games can be held, but calls never
  run concurrently.
- **EngineBackend only.** No BrowserBackend / WsBackend yet (design §8); pregame (battlefield select /
  mulligan) is skipped as in `createPlayableGame`.
- **No `@modelcontextprotocol/sdk`.** The SDK is available in the configured registry, but a workspace-wide
  `bun add` fails on unrelated `apps/*` dependencies that the registry does not carry, so the protocol is
  implemented in `src/mcp-lite.ts` (initialize · ping · tools/list · tools/call · resources/list ·
  resources/read; newline-delimited JSON-RPC 2.0). `McpServer` mirrors the SDK surface so it can be swapped.
- `buildDefaultDeck` / `DeckConfig` are imported by relative path from
  `riftbound-engine/src/testing/playtest/game-setup` (not re-exported by the engine's package entry
  points); no engine files were changed.
- Engine gaps listed in HARNESS-DESIGN §10 (multi-select, distribute N, ordering, token ids using
  `Date.now()` → non-hash-stable transcripts, …) apply unchanged.
