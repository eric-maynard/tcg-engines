---
name: verify
description: Build/launch/drive recipe for verifying riftbound-app (Bun server + vanilla HTML/JS UI) changes end-to-end in a browser.
---

# Verify riftbound-app changes

## Launch

```bash
cd apps/riftbound-app
PORT=3100 SANDBOX_ENABLED=true bun run server.ts   # run in background
```

- Use a port other than 3000 — the user (and other sessions) usually have a dev server there,
  and it serves `public/` straight from disk, so client-only changes show up on it but
  server-side `.ts` changes do not.
- If your shell is sandboxed with its own network namespace, a server started inside it is
  invisible to the browser tool and to later shells. Start it outside the sandbox.
- `SANDBOX_ENABLED=true` unlocks `/play/test` (auto-created goldfish game, mulligan done) and
  `POST /api/game/:id/tutor {defId}` (put any card in hand + grant its cost).

## Drive

- **Board**: open `/play/test`, then in the page: `availableMoves` (array of `{moveId, params, playerId}`),
  `executeMove(id, params, playerId)`, `gameState`, `gameId`, `render()`. Pass priority with
  `passChainPriority`/`passShowdownFocus`, answer prompts with `resolvePendingChoice`, `endTurn`
  hands the turn to the Goldfish (wait ~4-5s). The board is a fixed 1920×1080 logical canvas
  scaled by `--game-scale`; measure with `offsetWidth/offsetHeight` for logical px.
- **Lobby / deck pickers**: `/play` (clear `sessionStorage.rb_game` first or it reconnects to the
  last test game). `#deckSelect` / `#soloDeckSelect` stay in the DOM as hidden native selects;
  the visible picker is `.deck-dd`.
- **Decks page**: `/decks`. **Builder**: `/builder`; to open a saved deck set
  `localStorage.rb_loadDeckId=<id>` and remove `rb_deckSessionId` before navigating.
- **Auth**: without `DEFAULT_USERNAME/DEFAULT_PASSWORD` env there is no dev auto-login;
  `POST /api/auth/register {username,password}` returns `{token}` — put it in
  `localStorage.rb_token` (and the `rb_token` cookie).

## Live layout suite (optional, ~2 min)

```bash
RB_BROWSER_TESTS=1 RB_BROWSER_URL=http://localhost:3100 \
  bun test packages/riftbound-engine/src/__tests__/harness-browser/affordances.test.ts
```

Checks rune piles/legend/battlefield units are never clipped or occluded at 1440×900 and 1920×1080.
