# riftbound-app

Bun server (`server.ts` + `server/*.ts`) and vanilla-JS client (`public/`) for playing Riftbound on the
`@tcg/riftbound` engine: deck builder, lobbies (host/join), Goldfish practice, and a Claude-driven opponent.

```bash
cd apps/riftbound-app
SANDBOX_ENABLED=true bun run server.ts      # http://localhost:3000/play
bun test server/__tests__/                  # server unit tests
```

## Playing vs Claude

Play → **VS Claude** → pick a deck, an opponent (**Claude Haiku 4.5 · Claude Sonnet 5 · Claude Opus 5**) and the
**Opponent's deck** → Play. Claude takes the `player-2` seat; you always win the initiative roll.

**Goldfish — Passive / Active.** The solo picker's *Opponent* selector offers *Goldfish — Passive (auto-passes)* (default:
the server's Goldfish driver plays `player-2` — passes, answers its prompts, ends its turn) and *Goldfish — Active (you play
both seats)*: no driver is attached, the session is a **hot seat** (`opponent: {kind:"goldfish", mode:"active"}` on
`POST /api/lobby/create`; default `"passive"`, other values → 400). In active mode the browser follows whichever seat owes the
next decision — it re-binds its game socket with `{type:"switch_seat", playerId}` (answered by that seat's own `sync`; refused
with `NOT_HOT_SEAT` in any other game), flips the board to that seat, shows a top strip *"Acting as Player 2 (Goldfish —
active)"* with **Switch seat** (`Tab`), and answers the pregame for both seats (Bo3 battlefield pick, sideboard lock, mulligan,
and the go-first choice when player-2 wins the roll). Each seat's view is the per-seat snapshot (the other seat's hand/decks are
card backs); Rewind takes back one action of whichever seat made it. Server: `server/ws-game.ts` (`switch_seat`),
`server/routes-lobby.ts` / `server/pregame.ts` (`hotSeat`), client `public/js/gameplay/hotseat.js`; test
`server/__tests__/goldfish-mode.test.ts`.

**The bot's deck (Goldfish and Claude alike).** The *Opponent's deck* dropdown under the Opponent selector offers
*Same as mine (mirror)*, *Random from my decks*, any of **Your Saved Decks**, **Public Decks**, or the **Default
starter**; the choice is remembered in this browser. The server only accepts decks you own or public decks
(ownership comes from your session, never from the request body — someone else's private deck id answers
"Opponent deck not found" and no lobby is created), checks only that the list is *playable* (main-deck cards +
runes — construction legality is advisory, see §Deck legality; nothing is dropped), and seats player-2
with it before the game exists, so its battlefields (Bo3 picker / Bo1 random pick), sideboarding and mulligan all
come from that deck. Claude's system prompt includes a short "YOUR DECK" list of its own registered deck. A hosted
lobby switched to **Single Player** shows the same dropdown to the host (`{type:"select_opponent_deck", deck}` on
the lobby socket); `select_deck` on that socket follows the same ownership rule.

**API key.** The server needs an Anthropic API key for Claude seats, in this order of precedence:

1. A key saved in the browser: ⚙ (next to the Opponent selector) → *Anthropic API key*. It is stored in
   `localStorage`, shown as `••••last4`, sent only inside the game-create request, and held by the server in memory
   for that game only (never logged, persisted, or echoed in snapshots).
2. `ANTHROPIC_API_KEY` in the environment — copy `.env.example` to `apps/riftbound-app/.env` (gitignored; Bun loads
   it from the working directory, and the server also reads that file / the repo-root `.env` when started elsewhere).

`GET /api/ai/status` reports `{envKey, mock, models}` (no key material) so the client can enable the options; without
any key the Claude entries are disabled with a hint.

**How it plays.** Whenever the cursor belongs to the AI seat (its turn in an open state, priority on the chain, focus
in a showdown, or a prompt addressed to it) the server builds a prompt from the AI seat's own view of the game — its
hand with card text, runes/pool, both boards, battlefields/control/points, chain and showdown status; your hand and
facedown cards appear only as counts — plus a numbered list of its legal actions (including synthesized
"Pay & play <card>" entries that tap/recycle the right runes first). The model answers with a forced tool call
(`choose {index, rationale}` or `answer {…}` for prompts); the reply is validated against the *current* legal list and
applied through the same `applySessionMove` path your own moves use, then pushed to your browser one action at a time
(~0.6 s apart) with a match-log line such as `🤖 Sonnet: Play Yasuo to Base — 'develop before contesting'`.
A "Claude is thinking…" pill shows next to the opponent's name while it decides.
Beside the decision tool the model is offered the read-only MCP info tools (`@tcg/riftbound-mcp/info-tools`:
`search_cards`, `card`, `rule`/`rule_search`, `opponent_summary`, `zone`, `battlefields`, `chain_status`, …) bound to
its own seat's redacted view; it may call up to 3 per decision (each answered with a `tool_result` and re-asked), after
which `choose`/`answer` is forced.

**Fallbacks and limits.** Invalid output is re-asked twice with a note, then that single step falls back to the
Goldfish policy (pass / resolve prompt / end turn), logged with `(fallback)`. API errors retry with backoff
(5xx/529/timeouts, 2 retries); a 4xx (bad key) disables the seat for the rest of the game and the Goldfish plays on.
Steps with nothing to decide (a lone "Pass priority", a single forced pick) are answered locally without a call. Per
turn segment the seat takes at most 40 actions; each call is capped at 45 s and 300 output tokens.

**Cost (rough).** ~2–4k input tokens per decision and 5–15 decisions per turn ⇒ ~15–50k input tokens per AI turn:
on the order of $0.02–0.05/turn with Haiku 4.5, ~$0.05–0.15 with Sonnet, ~$0.25–0.75 with Opus (output is negligible).
Latency is ~1–3 s per action for Haiku, more for larger models, plus the 0.6 s pacing.

**Testing without a key.** `RB_AI_MOCK=1` swaps in a first-legal-action provider through the same code path (menu
index 0 / first option), which is also what `server/__tests__/ai-opponent.test.ts` injects.

REST clients can pass the same field to `POST /api/game/create` / `POST /api/lobby/create`:
`opponent: {kind:"goldfish", mode?:"passive"|"active"} | {kind:"claude", model:"haiku"|"sonnet"|"opus", apiKey?}` (unknown models / modes → 400).
On `/api/lobby/create` (sandbox lobbies) `opponent.deck` picks the practice seat's deck:
`{mode:"default"}` (starter, also when absent) | `{mode:"mirror"}` (the host's pick) | `{mode:"random-mine"}` (one of
the caller's playable saved decks; 401 anonymous / 400 none) | `{mode:"deck", deckId}` (own or public deck; 404
otherwise, 400 if not playable). `/api/game/create` takes full `deck1` / `deck2` configs instead.

## Deck legality (advisory)

Construction rules — rule 103 (≥ 40-card main deck counting the Chosen Champion, ≤ 3 copies per name across
champion + main + sideboard, Domain Identity, champion tag, Signature limits, exactly 12 in-identity runes, 3 distinct
battlefields) plus the sideboard policy below — are **checked and reported, never enforced by default**. The numbers
live in one place, `server/deck-rules.ts` `DECK_RULES` (`mainMin 40 · copyLimit 3 · sideboardMax 10 · runeCount 12 ·
battlefieldCount 3`), and are served to clients as `GET /api/config → deckRules` (the builder and the pregame overlay
read caps from there). `validateDeckConfig()` returns `{legal, problems:[{code, message, severity, cardIds?}]}`;
`severity:"warning"` marks checks that could not be verified because card data is incomplete (e.g.
`CHAMPION_TAG_UNKNOWN`, `SIGNATURE_DATA_UNKNOWN`, `BATTLEFIELDS_NOT_SET`) and never makes a deck illegal.

- **Import / save / edit always succeed.** The builder session is lenient (a 4th copy, an 11th sideboard card or an
  off-identity card is accepted and listed in the *Legal ✓ / ⚠ Not tournament-legal (n issues)* panel);
  `POST /api/deck/:session/import` and `POST /api/saved-decks/import {text, name?}` answer **200** with `errors`
  holding only unrecognized lines and `legality` holding the report; a list without a legend / champion gets sensible
  defaults (`warnings`). Saved-deck rows carry `legality` so `/decks` and the lobby pickers badge each deck.
- **Play always succeeds** in goldfish / sandbox / hot-seat / vs-Claude and ordinary duel lobbies: `loadDeckConfig`
  keeps every copy and the whole sideboard, `createGameFromDecks` seats the deck and adds one shared-log line
  *"⚠ X's deck is not tournament-legal (n issues: CODES) — allowed in this game"* (codes only — lists stay private).
  In the lobby both seats see the flag (`lobby.host|guest.legality`: your own seat gets full messages, the other seat
  codes + count). Only decks that cannot be seated at all are refused: an empty main deck (engine and server), or a
  saved deck with no main-deck cards / no runes (falls back to the starter).
- **`enforceLegality`** (lobby option on `POST /api/lobby/create`, host-togglable with `{type:"set_enforce_legality",
  enabled}` while waiting; default **false**) is the tournament switch: when on, `start_game` refuses and returns
  `{type:"lobby_error", error, problems:[{seat, code, message}]}` to the host (and a note to the guest).
- Server-side ownership checks (own / public decks only) are unrelated to legality and stay enforced.

Tests: `server/__tests__/deck-legality.test.ts` (10-card sideboard import → legal; 4-of + 12 sideboard → 200,
saved, flagged, plays; lobby warn-both / enforce-refuse), `decks.test.ts`, `pregame-sideboard.test.ts`, and the engine's
`core-rules/setup-decks-and-mulligan.test.ts` ("Construction legality is a REPORT").

## Sideboarding

**Rules source / assumptions.** The Core Rules do not define a sideboard (rule 103 lists Legend, Main Deck, Rune Deck,
Battlefields; 485/486 define Bo1/Bo3) and no tournament-rules digest ships in this repo, so the app implements the
widely published organized-play policy and states its assumptions here and at the top of `server/pregame.ts`:

- A deck may register a **sideboard of up to 10 cards** (`DECK_RULES.sideboardMax`), Main Deck types only (units /
  spells / gear — no legend, champion slot, battlefields or runes). The 3-copies-per-name limit (rule 103.2.b, Chosen
  Champion included) is counted across main deck + sideboard. Both are advisory like every construction rule (§Deck
  legality): an oversized sideboard still loads, swaps and plays, flagged `SIDEBOARD_TOO_LARGE`.
- Sideboarding happens **only between the games of a match** (before game 2 / game 3 of a Bo3) — **never before
  game 1**: a Bo3 game 1, a Bo1 duel and practice games all go straight from the reveal to the mulligan even with
  sideboards registered (they ride along in `session.decks` for the next game). The only exception is the explicit
  lobby / `POST /api/game/create` option `sideboardBeforeGame1: true` (default false; lobby WS `set_sideboard_before_game1`),
  a kitchen-table / testing switch.
- When the window is open (game ≥ 2, or that opt-in): after both players' legends, chosen champions and this game's
  battlefields are revealed (Bo1: the random pick; Bo3: after battlefield selection) and **before opening hands /
  mulligans**, each player may swap cards **1-for-1** between main deck and sideboard (sizes never change),
  simultaneously and hidden — the opponent sees only *Sideboarding… / Locked in*, never counts or cards. No timer: play
  continues when both lock in; each main deck is then rebuilt from the post-swap list, shuffled with the engine RNG,
  and 4-card hands are drawn for the mulligan.
- The phase appears **only if some seat has a non-empty sideboard** (starter decks have none, so default flows are
  unchanged). Seats with nothing to swap and the practice opponent (Goldfish / Claude) lock in immediately
  (TODO: model-driven sideboarding for the Claude seat). Swaps are per game — nothing is written to the deck DB.
- **Bo3 between games (TODO):** `session.postSideboardDecks` holds each seat's post-swap main/side and
  `session.gameNumber` the game just played; the game-2 flow (not wired end-to-end yet) should call
  `createGameFromDecks(post[P1] ?? decks[P1], post[P2] ?? decks[P2], seed, { …, gameNumber: n + 1 })` —
  `gameNumber > 1` is what opens the window (`sideboardWindowOpen`), so between-game sideboarding arrives with that flow.

**Try it.** Deck builder (`/builder`): turn on **Add to: Sideboard** above the Sideboard list and click cards (or
import a list with a `Sideboard:` section — export writes it back), save, then create the game with
`sideboardBeforeGame1: true` (until the Bo3 game-2 flow lands, that is the only way to reach the phase). After the
battlefield reveal the pregame overlay shows *Sideboarding*: dense Main | Side lists, one row per distinct card with a
quantity and **−** / **+** steppers (Main: − sends one copy to the sideboard, + pulls one back / in; Side symmetric).
Rows never move or re-sort during the step — copies arriving in the other column show as ghost rows at its bottom
("+2 Disintegrate ← side"); a summary strip lists the swaps ("−1 Cleave · +1 Disintegrate") with **Reset**, and
**Lock in (N swaps)** is enabled only once the main deck is back to its size (it sends one `sideboard_lock` frame
carrying the swap batch). ↑/↓ select a row, −/+ or ←/→ adjust. Practice games offer a *Skip sideboarding* checkbox
(remembered in `localStorage`); `GET /play/test?sideboard=1` (sandbox) drops you straight onto the step.

Wire protocol: server → client `pregame.phase === "sideboard"` with `you: {main, side, swaps, locked, …}` (own seat
only) and `opponent: {legend, champion, battlefields, status}`; client → server `{type:"sideboard_swap", out, in}` and
`{type:"sideboard_lock"}`. REST: `DeckConfig.sideboardCardIds` on `POST /api/game/create`; builder
`POST /api/deck/:session/sideboard/add|remove {cardId}`; saved decks keep `zone: "sideboard"` entries.
Tests: `server/__tests__/pregame-sideboard.test.ts`, `server/__tests__/decks.test.ts` (sideboard block), and the gated
live test `packages/riftbound-engine/src/__tests__/harness-browser/sideboard.test.ts` (`RB_BROWSER_TESTS=1`).
