# riftbound-app

Bun server (`server.ts` + `server/*.ts`) and vanilla-JS client (`public/`) for playing Riftbound on the
`@tcg/riftbound` engine: deck builder, lobbies (host/join), Goldfish practice, and a Claude-driven opponent.

```bash
cd apps/riftbound-app
SANDBOX_ENABLED=true bun run server.ts      # http://localhost:3000/play
bun test server/__tests__/                  # server unit tests
```

## Playing vs Claude

Play → **VS Claude** → pick a deck and an opponent (**Claude Haiku 4.5 · Claude Sonnet 5 · Claude Opus 5**) → Play.
Claude takes the `player-2` seat with the starter deck; you always win the initiative roll.

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
`opponent: {kind:"goldfish"} | {kind:"claude", model:"haiku"|"sonnet"|"opus", apiKey?}` (unknown models → 400).
