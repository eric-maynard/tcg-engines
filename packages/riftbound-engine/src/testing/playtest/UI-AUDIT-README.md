# UI Audit

Two scripts that verify the riftbound-app UI agrees with the engine state it renders.

## `ui-audit.ts` — full Playwright audit

Launches headless chromium, loads `http://localhost:3000/play`, and drives:

1. Lobby → **Goldfish** → select `default` deck → **Start Game**
2. Pregame loop: coin flip → battlefield select → mulligan **Keep**
3. Turn-1 initial board
4. Five iterations of *play first hand card* → *End Turn / pass*

At every step it writes `/tmp/ui-audit/step-N.png` + `state-N.json` and runs four cross-checks:

| Check | DOM source | Engine source |
|---|---|---|
| Hand card IDs match | `#player-hand [data-card-id]` | `__rbGameState.zones.hand` filtered by `owner === __rbViewingPlayer` |
| VP counter visible & matches | `#playerInfo .stat-value.vp` text | `__rbGameState.players[<viewer>].victoryPoints` |
| `#player-hand` renders | bounding rect > 0 & child count > 0 | hand non-empty |
| Phase bar reflects a phase | `#phaseBar` text + rect | `__rbGameState.turn.phase` |

Findings roll up into `/tmp/ui-audit/report.md`; page console + errors go to `console.log`. Exit code is non-zero on any FAIL.

**State access.** `apps/riftbound-app/public/js/gameplay/state.js` already defines `window.__rbGameState` / `window.__rbViewingPlayer`. The script also injects a 100 ms poller that aliases them to `window.__gs` / `window.__vp` so dumps stay compatible with `.claude/skills/riftatlas-study/references/local-driver.ts`.

**Playwright resolution.** `riftbound-engine` doesn't declare `playwright` as a dep, so a bare `import "playwright"` won't resolve. The script tries the bare import first, then falls back to scanning `node_modules/.bun/playwright@*` and `~/.bun/install/cache/playwright@*` for a build whose `chromium-headless-shell` revision is actually present under `~/.cache/ms-playwright` (same shim as `local-driver.ts`).

### Run on the devbox

```bash
coo ssh emaynard-tcg
cd ~/tcg/tcg-engines
bunx playwright install chromium          # one-time
bun packages/riftbound-engine/src/testing/playtest/ui-audit.ts
ls /tmp/ui-audit/
```

Override target or output dir with `RIFTBOUND_URL` / `UI_AUDIT_OUT`.

## `ui-audit-lite.ts` — no-browser structural check

`fetch`es `/play`, parses the served HTML with Bun's `HTMLRewriter`, and asserts:

- HTTP 200 + looks like HTML
- All board-region element IDs are present (`#board`, `#phaseBar`, `#battlefieldRow`, `#player-hand`, `#player-runePool`, `#resourceBar`, `#playerInfo`, `#opponentInfo`, `#actionBar`, `#gameLog`, lobby controls…)
- Gameplay `<script src>` tags — including `state.js` — are referenced
- `/api/cards` returns a non-empty list

Runs anywhere that can reach the server (no chromium). To run against the devbox from the homespace, forward the port first:

```bash
ssh -N -L 3000:localhost:3000 emaynard-tcg &   # or: coo ssh emaynard-tcg -- -L 3000:localhost:3000
bun packages/riftbound-engine/src/testing/playtest/ui-audit-lite.ts
```

or run it on the devbox directly the same way as the full audit.
