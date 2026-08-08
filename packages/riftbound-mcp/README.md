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

### Info tools (read-only lookups; `src/info-tools.ts`)

Compact string answers (≤ ~1.5k chars; long lists end with `…(+N more; refine your query)`). The same
specs (`infoToolSpecs`: `{ name, description, input_schema, handler(ctx, args) }`) are exported for the
web app's Claude opponent (`@tcg/riftbound-mcp/info-tools` → `bindInfoTools` / `infoToolsForModel`),
so an MCP client and the in-app AI see identical lookups.

| tool | input | notes |
|---|---|---|
| `rules_toc` | `{}` | Core Rules top-level sections `S1…S12` with rule ranges — the root of the rules tree |
| `rule` | `{ id }` | one rule (`"323.12"`, `"809.1.c"`) or section (`"S9"`): text + ancestor chain (section › heading › parents) + immediate children (id + first line) |
| `rule_children` | `{ id, offset? }` | children of a rule / heading / section, paged |
| `rule_search` | `{ query, limit? }` | term-match search → ids + one-line snippets, best first |
| `search_cards` | `{ text?, name?, domain?\|domains?, type?, energy?:{min,max}\|n, power?, might?, keyword?, set?, champion?\|tag?, timing?, includeTokens?, limit?, sort? }` | rows `id · name · type · cost (2+[chaos]) · might · domains · keywords · text`; `type` ∈ unit spell gear equipment legend champion battlefield rune token |
| `card` | `{ id? \| name? }` | full definition text; name lookup is case-insensitive with fuzzy fallback (exact → prefix → contains) and lists other matches |
| `list_keywords` / `list_sets` / `list_domains` | `{}` | valid filter values (keywords link their glossary rule, e.g. `Deflect — rule 809`) |
| `zone` | `{ gameId, seat, zone, player? }` | one zone as `seat` sees it: `hand` (yours listed; opponent's = count), `deck` (count only), `trash`, `banishment`, `base`, `legend`, `champion`, `runes`, `pool`, `points`, `board`, `battlefield:<id>`, `facedown:<id>` (identity only if you control it); `player` = `me` (default) \| `opponent` \| id |
| `opponent_summary` | `{ gameId, seat, player? }` | legend/champion (+ whether it left the champion zone), points, pool, runes by domain, hand & deck counts, trash/banishment names, units by location |
| `battlefields` | `{ gameId, seat }` | each battlefield: text, controller, contested, showdown marker, units per side (might/damage/exhausted/keywords), facedown count |
| `chain_status` | `{ gameId, seat }` | turn state, chain items top-first (controller, targets, mode), priority / passes, active showdown (focus, attacker/defender), pending choice, whose decision |

Game-scoped info tools derive everything from the seat's redacted `Observation` (`backend.view(seat)`), so
opponent hand contents, deck order and foreign facedown identities cannot appear (guarded by
`src/__tests__/info-tools.test.ts › PRIVACY`).

```text
→ tools/call search_cards {"domain":"chaos","type":"spell","energy":{"min":2,"max":3}}
← 26 cards match type=spell domain=chaos energy={"min":2,"max":3} — id · name · type · cost · might · domains · keywords · text:
  unl-131-219 · Abandon · spell · 2 · chaos · [Reaction] (Play any time, even before spells and abilities resolve.)…
  unl-139-219 · Bone Skewer · spell · 2+[chaos] · chaos · Hidden · [Hidden] (Hide now for [rainbow] to react with later …
  …(+16 more; refine your query or raise limit)

→ tools/call rule {"id":"340"}
← 340 — Chains & Showdowns  [path: S4 Chains & Showdowns]
  Step 4: Resolve
  children (4):
    340.1 · The newest Finalized Chain Item resolves. Execute its game effects in their entiret…
    340.2 · If the Chain is empty, play proceeds in an Open State. (+1)
    …

→ tools/call opponent_summary {"gameId":"g1-…","seat":"p1"}
← player-2 — legend: Daughter of the Void (fury/mind) | champion: Kai'Sa, Survivor [p2champ] in champion zone (not yet played) | 3/8 points
  pool: energy 2, power fury:1 | runes 2/3 ready (fury 2/2, mind 0/1) | rune deck 4
  hand 1 (hidden) | main deck 5 | trash (2): Cleave×2 | banishment (1): Banished Bob
  board:
    base: Public Base Unit [p2base] 1M
    bf1 [bf1] (controls): Public Defender [p2def] 3M exhausted | facedown card (hidden by player-2)
```

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
- **EngineBackend only (for now).** Pregame (battlefield select / mulligan) is skipped as in
  `createPlayableGame`. A `BrowserBackend` now exists in the engine harness (`@tcg/riftbound/harness/browser`,
  HARNESS-DESIGN §13) — see "Pointing the MCP at a browser game" below.
- **No `@modelcontextprotocol/sdk`.** The SDK is available in the configured registry, but a workspace-wide
  `bun add` fails on unrelated `apps/*` dependencies that the registry does not carry, so the protocol is
  implemented in `src/mcp-lite.ts` (initialize · ping · tools/list · tools/call · resources/list ·
  resources/read; newline-delimited JSON-RPC 2.0). `McpServer` mirrors the SDK surface so it can be swapped.
- `buildDefaultDeck` / `DeckConfig` are imported by relative path from
  `riftbound-engine/src/testing/playtest/game-setup` (not re-exported by the engine's package entry
  points); no engine files were changed.
- Engine gaps listed in HARNESS-DESIGN §10 (multi-select, distribute N, ordering, token ids using
  `Date.now()` → non-hash-stable transcripts, …) apply unchanged.

## Pointing the MCP at a browser game (design note)

The harness ships a second L0 backend, `BrowserBackend`, that drives the LIVE web app through Playwright
(`Game.fromBrowser({ baseUrl, mode: "test"|"goldfish", actMode: "semantic"|"visual" })`, HARNESS-DESIGN §13).
`Game`/`SeatHandle` run unchanged on top of it, so the tool layer here needs no protocol change to expose it;
what a `create_game { backend: "browser", baseUrl?, mode?, actMode? }` option has to account for:

- `GameManager` must build the game with `Game.fromBrowser(...)` instead of decks/scenario (`scenario` and
  `decks` are engine-only; on the browser the setup vocabulary is goldfish game → `backend.tutor(defId)` →
  `backend.addResources`), and `close_game` must `await backend.close()` (kills Chromium).
- The goldfish is the *server's* sandbox autoplay, not this package's bot driver — skip `botSeats` and read
  `executed[]` entries with `moveId:"sandboxAutoPlay"` as the autoplay report.
- `seq` is the server's frame counter (advances on goldfish/tutor frames too); `history`/`transcript` hashes
  are snapshot hashes; `undo` stays omitted; invariants are not evaluated.
- Runtime requirements: Playwright resolvable (`RB_PLAYWRIGHT_MODULE` or `/tmp/pwtest/node_modules/playwright`),
  `node` on PATH for the default bridge transport (`RB_BROWSER_TRANSPORT=bun` to run in-process), and an app
  with `SANDBOX_ENABLED=true` answering on `baseUrl`.
- The per-process registry mutex still applies (BrowserBackend keeps its own registry and `activate()`s it).

Not wired yet to keep this package hermetic (its tests must not need a browser or a running app).
