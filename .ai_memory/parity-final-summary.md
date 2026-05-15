# Riftbound App ↔ play.riftatlas.com — Parity Final Summary
_2026-05-11. After 4 ticks of UI parity work on `apps/riftbound-app/`._

## Verdict
**DONE.** Every MISSING and non-trivial BROKEN entry from `parity-report.md` is RESOLVED or shown to be not-a-bug. A fresh side-by-side at the same checkpoints (lobby `ours-tick4-10-lobby-after` vs `riftatlas-tick4-00-home`; in-match `ours-tick4-13-turn1-main-after` vs `riftatlas-tick4-31-board`) shows our UI mirrors RA's structure: editorial 2-col lobby with deck panel + player sidebar + info rail; in-match a right sidebar (Turn N / timer / phase badge / help `i` / available actions / toggles / log / chat / player switcher), a phase strip, two battlefields with empty-slot ghosts + token panels, framed player/opponent nameplates with avatars, a domain-labelled rune pool, deck stacks, resource bar, room badge. Typography now matches RA (Bricolage Grotesque). The two genuinely-remaining differences are both intentional/out-of-scope (see below).

## What's intentionally different
1. **Brand palette** — ours is a purple/violet dark theme; RA's is navy/blue. Deliberate brand identity, not a parity bug.
2. **Card art** — `apps/riftbound-app/downloads/card-images/` is absent in this environment, so `/card-image/:id` 404s and cards fall back to gradient placeholders. RA ships card art. Closing this needs a ~769-image asset download; it affects card *art* only, not layout, and is out of scope for a UI tick.
3. **Engine-feature superset** — our board exposes more than RA's: a sandbox action panel (Add Counters / Apply Buff / Duplicate / Label / Emote), per-zone token panels, a full enumerated available-actions list, undo/redo, board toggles. This is the point — the `@tcg/core`+`@tcg/riftbound` engine is fully driveable headlessly and the UI surfaces all of it.

## Engine-outside-UI refactors (done during this work)
- **Turn-phase model moved into the engine** (tick 2): `packages/riftbound-engine/src/game-definition/flow/turn-flow.ts` now exports `PHASE_ORDER`, `PHASE_LABELS`, `TURN_PHASE_STRIP`, `getNextPhase`, `isMainPhase`, `isSetupPhase`; re-exported from `packages/riftbound-engine/src/index.ts`. New `GET /api/flow` (in `server.ts`) serves the engine-defined strip. `public/js/gameplay/game-flow.js` fetches it (replacing its bootstrap fallback); `renderer.js` consumes `PHASE_LABELS`.
- Everything else that must live outside the UI already did and was confirmed: legal-move enumeration (`GET /api/game/:id/moves`), card-effect resolution / win-condition checks / combat / showdown (all in `packages/riftbound-engine/src/engine/`), deck-build validation, history/undo/redo. Agents can run the entire game loop over HTTP with no UI.

## Gaps closed, by tick
- **Tick 1:** B1 (opponent runePool placeholder), M3 (ROOM-code badge), B6/B16 (auto-pay pill shrunk).
- **Tick 2:** B5 (not-a-bug — 2 battlefields in 1v1 is correct, RA matches), M9 (toggles panel), B11 (sidebar turn timer), M6-partial (deck-preview selector); turn-phase engine refactor; lobby deck preview.
- **Tick 3:** M8 (multiplayer chat panel — `chat.js`, `#chatPanel`, ws `chat` handler), B14 (battlefield empty-slot ghosts), M5 (lobby left info rail → 3-col editorial lobby).
- **Tick 4:** M11 (Bricolage Grotesque webfont + `--font-display` applied to all board chrome/headings; dead Cormorant/Cinzel refs replaced), B9/B10 (framed player/opponent nameplates: rounded-square avatars w/ active-glow, display-font names, VP chips, resource pills, reddish-accented opponent strip), B13 (bright cyan animated glow on `.card.selected`, strengthened `.playable` glow + hover lift), B15 (rune-pool domain chips: glowing dot + domain name + ready/total).
- **Earlier (pre-tick) phase 5:** M1/M2 (lobby shell), B2 (opponent base), B3+B11 (game log), B7 (resource bar), B8 (phase bar), start-screen ambience.

## Files touched (cumulative, UI)
- `apps/riftbound-app/public/gameplay.html` — lobby shell DOM (3-col editorial), `#roomBadge`, `#chatPanel`, Google Fonts `<link>`s, chat.js script tag.
- `apps/riftbound-app/public/css/gameplay.css` — ~600 lines added across ticks: lobby-shell/info-rail, opponent-base, game-log flex, resource/phase bars, room badge, auto-pay pill, rune-stack-empty, chat panel, bf-slot ghosts, `--font-display` vars + display-font selector block, player nameplate rewrite, card-glow upgrades, rune-domain chips.
- `apps/riftbound-app/public/js/gameplay/renderer.js` — opponent rune placeholder, `renderRoomBadge`, shrunk auto-pay pill, turn timer + `PHASE_LABELS`, bf-slot ghosts, `refreshChatPanel` call, rune-domain chip markup.
- `apps/riftbound-app/public/js/gameplay/game-flow.js` — fetches `/api/flow`.
- `apps/riftbound-app/public/js/gameplay/lobby.js` — `__lsdSyncDeckPreview`, populate `#deckSelect-lobby`.
- `apps/riftbound-app/public/js/gameplay/websocket.js` — incoming `chat` message case.
- `apps/riftbound-app/public/js/gameplay/chat.js` — NEW (~120 lines): appendChatMessage / sendChatMessage / refreshChatPanel.
- `apps/riftbound-app/server.ts` — `GET /api/flow` route.

## Files touched (cumulative, engine)
- `packages/riftbound-engine/src/game-definition/flow/turn-flow.ts` — `PHASE_LABELS`, `TURN_PHASE_STRIP`.
- `packages/riftbound-engine/src/index.ts` — re-exports of the above + `PHASE_ORDER`, `getNextPhase`, `isMainPhase`, `isSetupPhase`.

## Build / verification
- No `build` script (Bun-served static app). `bun build --target=browser` clean on all changed JS. `bun x tsc --noEmit` adds no new errors in changed files (pre-existing test-file errors only). Server boots clean ("Loaded 769 cards"). `/play`, `/api/flow`, `/css/gameplay.css`, `/js/gameplay/*.js` all 200. Bricolage Grotesque confirmed loaded in Chrome. No console errors. RiftAtlas in-match driving (canvas Choose-Battlefield pick → PLAY FIRST → KEEP HAND → match) re-confirmed working each tick.
