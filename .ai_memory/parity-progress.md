# Riftbound Parity Workstream — Progress

## 2026-05-11 ~12:05 PT — Phase 0 / kickoff (prior agent)
- Read riftatlas-study SKILL.md + references.
- Started dev server: `cd apps/riftbound-app && SANDBOX_ENABLED=true bun run server.ts` — UP.
- chrome-control SW failed mid-run; prior agent recovered enough to capture 53 screenshots before crashing.

## 2026-05-11 ~14:43 PT — Phases 1-3 (prior agent, captured)
- Decklists pulled (Vi/Vex starters) → `parity-decklists.txt`, `parity-decklists-riftatlas.txt`.
- RiftAtlas screenshots: 33 PNGs (`riftatlas-00..33-*.png`). NOTE: 20-33 are all stuck on the "Choose Battlefield" pregame scene — the RiftAtlas driver never advanced past sideboard-lock-in. So in-match comparison is one-sided (we can read our app's in-game UI vs. RA's pregame).
- Our app screenshots: 4 PNGs (`ours-00,03,04,08-*.png`) with JSON sidecars containing per-region DOM stats.

## 2026-05-11 ~15:30 PT — Phase 4 (this session, complete)
- **Output**: `.ai_memory/parity-report.md` — 11 MISSING entries, 16 BROKEN entries.
- Top P0 gaps: (M1+M2) editorial lobby shell missing; (B2) `#opponent-base` collapsed to 6px; (B3) `#gameLog` clipped to 13px due to oversized hover-preview; (B4) `#actionBar` zero-sized; (B5) battlefield row only 2 slots, no unit zones styled; (B7,B8) thin resource/phase bars.

## 2026-05-11 ~15:45 PT — Phase 5 (this session, complete)
Implemented top-5 fixes (mix of P0/P1, focused on lobby + board layout):

1. **M1+M2 — Lobby shell** (HIGH-IMPACT, multi-file)
   - `apps/riftbound-app/public/gameplay.html`: replaced `#lobbyMenu` (3 centered buttons on a void) with a 2-column editorial shell: left = "Paste a deck" panel with LIST/STATS tabs + deck-preview card + Import/New/Choose buttons; right = sidebar with Player name, Play Mode pills, Match Format pills, Host/Join CTAs, Quick Match stub, Goldfish under Practice section. All wired to existing `hostLobby/showJoinForm/hostSandbox`.
   - `apps/riftbound-app/public/css/gameplay.css`: added ~260 lines of `.lobby-shell*`, `.lsd-*`, `.lss-*` styles (radial-gradient background, serif title in Cormorant Garamond fallback, pill rows, CTA gradients). All preserve original IDs so `lobby.js` still works.
   - `apps/riftbound-app/public/js/gameplay/lobby.js`: appended `window.__lsdSyncDeckPreview(deckId)` to populate the deck-preview card when user picks a deck from the lobby's preview-only selector. Falls back to "default" hard-coded info or fetches `/api/decks/:id`.

2. **B2 — `#opponent-base` collapsed** (P0, trivial CSS)
   - `gameplay.css`: added `#opponent-base { min-height: 100px; border: 1px dashed; padding: 4px 8px; }` + empty-state pseudo. Matches `#player-base`.

3. **B3+B11 — Game log clipped to 13px** (P0, CSS only)
   - `gameplay.css`: `.hover-preview` reduced from 340px to 260px to free up space.
   - `gameplay.css`: `.game-log { flex: 1 1 180px; min-height: 160px; border-top: 1px solid #2a2740; background: #0e0d18; }`.

4. **B7 — Resource bar thin** (P1, CSS only)
   - `gameplay.css`: `.resource-bar` got vertical gradient, accent border-top/border-bottom, `padding: 8px 14px`, `min-height: 44px`, inset shadow.

5. **Start-screen ambience** (P2 polish, supports M1)
   - `gameplay.css`: `.start-screen` background now layers two soft radial gradients (purple top-left, crimson bottom-right) over the near-black, mirroring RiftAtlas's moody dark palette.

### Files touched (this session)
- `apps/riftbound-app/public/gameplay.html` — `#lobbyMenu` block replaced (one section, ~75 lines)
- `apps/riftbound-app/public/css/gameplay.css` — appended ~270 lines lobby-shell + 4 targeted edits (opponent-base, hover-preview, game-log, resource-bar, start-screen bg)
- `apps/riftbound-app/public/js/gameplay/lobby.js` — appended `__lsdSyncDeckPreview` (~50 lines)

### Build verification
- No `build` script in `apps/riftbound-app/package.json` — app is a Bun-served static site.
- Sanity checks performed:
  - `bun --eval` syntax-check on `lobby.js` → OK
  - All 13 original IDs referenced by JS (deckSelect, lobbyMenu, lobbyRoom, joinForm, lobbyCode, sandboxOption, lobbyStartBtn, lobbyHost, lobbyGuest, lobbyStatus, modeDuel, modeMatch, modeSinglePlayer) still present in gameplay.html → OK
  - Booted `server.ts`, fetched `/play` (200, 18200B), `/css/gameplay.css` (200, 105578B), `/js/gameplay/lobby.js` (200, 15901B); server log clean: "Loaded 769 cards" + "Riftbound App running" → OK
  - Pre-existing `tsc --noEmit` errors on `server.ts` (moduleResolution config) are unchanged and unrelated to this work.

## TODO — next iteration
- B1 opponent rune pool placeholder render (engine output check first)
- B4 action-bar zero-sized — confirm it's just because no interaction is active, not actually broken
- B5 only 2 battlefields rendered — verify default starter deck includes 3 battlefields; if so this is a renderer issue
- B6 hand-card art washed-out — confirm `/card-image/:id` returns full-res and `.zone-row.hand-zone .card` background-size
- M3 ROOM code badge top-right of board
- M9 board-toggles panel currently empty — verify board-toggles.js init order
- M11 typography upgrade — load a serif display font via Google Fonts or self-host

## 2026-05-11 ~16:00 PT — TICK 1 (this session)

**Gaps targeted:** B1 (opponent runePool collapsed), M3 (ROOM code badge), B6/B16 (AUTO PAY pill dominating hand cards), plus re-confirmed prior fixes still landing.

**Re-screenshot:** Re-ran `our-app-driver.ts` (after patching its `#sandboxOption` locator post-lobby-shell refactor). Captured fresh in-match shots at `ours-tick1-{00-lobby, 03-turn1-main, 04-after-first-play, 08-endphase}.png` and post-fix shots at `ours-tick1-03c-final.png` / `ours-tick1-04c-final.png` / `ours-tick1-08c-final.png`.

**RiftAtlas in-match diagnosis:** Still blocked at Choose-Battlefield. New `riftatlas-tick1-play.ts` tries DOM heuristics + coordinate clicks at the three battlefield card positions, but `count:0` of candidate elements found and coordinate clicks at `(800, 400)` don't advance the state. RA's battlefield-select cards appear to be canvas-rendered or keyed in a way that doesn't expose to standard DOM selectors. Captured `riftatlas-tick1-22-pregame-battlefield.{png,json}` as the latest stuck state. In-match RA comparison remains one-sided.

**Files touched (UI):**
- `apps/riftbound-app/public/js/gameplay/renderer.js` — `renderRuneStacks` callers now emit an empty-pool placeholder for opponent (B1); new `renderRoomBadge()` function (M3) called from main render loop; shrunk `card-auto-pay-btn` inline styles (B6/B16).
- `apps/riftbound-app/public/gameplay.html` — added `#roomBadge` element near top of `#board`.
- `apps/riftbound-app/public/css/gameplay.css` — appended `.room-badge*`, `.first-game-hint*` (unused, kept for future), `.rune-stack-empty`, normalized `.auto-pay-pill` rules.

**Files touched (engine):** NONE this tick — all fixes were UI-renderer concerns. Engine drivability confirmed via existing HTTP endpoints (`/api/game/:id/{state,moves,move,history,undo,redo}`).

**Before/after screenshot pairs:**
- B1: `ours-03-turn1-main.png` (0-children pool) → `ours-tick1-03c-final.png` (Runes 0/0 visible top-right of opponent area).
- M3: prior `ours-03-turn1-main.png` (no badge) → `ours-tick1-03c-final.png` (ROOM XXXX top-right of board).
- B6: prior `ours-03-turn1-main.png` (big AUTO PAY purple block) → `ours-tick1-03c-final.png` (compact green "Pay" pill).

**Build verification:** `bun build --target=browser renderer.js` → clean. `curl /play`, `/css/gameplay.css`, `/js/gameplay/renderer.js` all 200. Server stays UP across reload.

**Total remaining gap count:** ~10 open entries in `parity-report.md` — mostly P1/P2 polish (M5-M11, B9, B10, B13-B15) plus 1 open P0 (B5 — battlefield count, engine-level, blocked on RA in-match confirmation).

## 2026-05-11 ~16:45 PT — TICK 2 (this session)

**Gaps targeted:** B11 (sidebar header missing turn timer), engine-outside-UI refactor of phase order/labels, M6 (lobby deck-preview selector unpopulated), plus B5/M9 re-confirmation via real RiftAtlas in-match comparison.

**RiftAtlas in-game CRACKED.** Canvas-aware Choose-Battlefield pick now works: a real `page.mouse.click(800, 540)` on the center battlefield-card coordinate selects it (the cards are canvas/keyed, no DOM name hooks, but accept coordinate clicks); then `PLAY FIRST` + `KEEP HAND` are ordinary buttons. New driver `.ai_memory/riftatlas-tick2-play.ts`. Captured 8 in-match RA screenshots (`riftatlas-tick2-30..37-*.png`). Key finding: **RA's in-match battlefield row is 2, same as ours** — B5 was never a bug (1v1 = 2 battlefields; the "3" was the pick overlay). Also confirmed RA's TOGGLES/TOKEN PANEL/CHAIN all have our equivalents → M9 resolved.

**Engine refactor (logic out of UI):** added `PHASE_LABELS` + `TURN_PHASE_STRIP` to `packages/riftbound-engine/src/game-definition/flow/turn-flow.ts`; exported `PHASE_ORDER, PHASE_LABELS, TURN_PHASE_STRIP, getNextPhase, isMainPhase, isSetupPhase` from `packages/riftbound-engine/src/index.ts`; new `GET /api/flow` in `apps/riftbound-app/server.ts` serving the engine-defined strip. `public/js/gameplay/game-flow.js` now `fetch("/api/flow")`s and replaces its bootstrap-fallback `PHASE_ORDER`/`PHASE_LABELS`; `renderer.js` sidebar header uses `PHASE_LABELS`.

**Files touched — engine:** `turn-flow.ts`, `index.ts` (riftbound-engine). **Files touched — UI:** `server.ts` (route), `game-flow.js` (fetch flow), `renderer.js` (turn timer + phase label + 1s tick), `lobby.js` (populate `#deckSelect-lobby`), `css/gameplay.css` (`.turn-timer`).

**Before/after screenshots:** `ours-tick2-{00-lobby,03-turn1-main,08-endphase}.png` (before) → `ours-tick2-{10-lobby-after,13-turn1-main-after,18-endphase-after}.png` (after — turn timer visible next to phase pill, phase strip uses engine labels). RA in-match: `riftatlas-tick2-31-board.png` etc.

**Build verification:** `bun build` clean on changed engine + UI files; `bun x tsc --noEmit` adds no new errors in changed files (pre-existing test-file errors only); `bun -e` import of new exports works; server boots clean; `/play`, `/api/flow`, `/js/gameplay/game-flow.js` all 200.

**Remaining gap count:** ~7 open, all P1-low / P2-polish (B14, B9/B10, M5, M8, M11, B13/B15) + the out-of-scope `downloads/card-images/` asset gap. No open P0; nothing blocking programmatic play.

## 2026-05-11 ~17:35 PT — TICK 3 (this session)

**Gaps targeted:** M8 (chat-panel stub), B14 (battlefield empty-slot ghosts), M5 (lobby left info-rail) — tick 2's named focus. Re-confirmed all prior-tick fixes still render and re-confirmed RiftAtlas in-match driving (canvas battlefield-pick → PLAY FIRST → KEEP HAND → match) still works.

**RiftAtlas in-match capture:** `riftatlas-tick3-{00-home,22-choose-bf,30-turn1-main,31-board,32-hand-hover,33-after-draw,34-hand-card-clicked,35-after-space,36-chain-panel,37-help-modal}.png` + zooms `riftatlas-tick3-{40-bf-zoom,41-runepool-zoom,42-chat-zoom,43-sidebar-zoom}.png`. Confirmed: RA battlefields render 3 faint dashed unit-slot outlines per side even when empty (pure affordance — no engine slot cap, checked `modes/game-modes.ts`); RA sidebar bottom-right has a `CHAT` box (header + msg list + `Type message...` + Send); RA sidebar header stacks `Turn N` / `00:22` timer / `X's turn` / `ROOM: code`.

**Files touched — engine:** NONE this tick (turn-phase machine / legal moves / combat / win-conds already live in `packages/`; tick changes are pure rendering+input).
**Files touched — UI:** `public/gameplay.html` (#chatPanel block + chat.js script tag + lobby-shell-rail column), new `public/js/gameplay/chat.js` (~120 lines: appendChatMessage / sendChatMessage / refreshChatPanel), `public/js/gameplay/renderer.js` (BF_SLOT_GHOSTS const + injected into bf-units sides + has-units class; calls refreshChatPanel() each frame), `public/js/gameplay/websocket.js` (incoming `chat` msg case), `public/css/gameplay.css` (chat-panel styles, bf-slot-ghost styles, game-log flex shrink, lobby 3-col grid + lsr-* info-rail + 1100px responsive).

**Before/after screenshots:** `ours-tick3-{00-lobby,03-turn1-main,08-endphase}.png` (before) → `ours-tick3-{10-lobby-after,11-lobby-zoom,13-turn1-main-after,40c-bf-zoom,43c-sidebar-zoom,44c-sidebar-full}.png` (after — chat panel visible at sidebar bottom, battlefield sides show 3 ghost slots, lobby is 3-col with info rail).

**Build verification:** `bun build --target=browser` clean on chat.js / renderer.js / websocket.js. `/play`, `/js/gameplay/chat.js`, `/css/gameplay.css`, `/api/flow` all 200. Server stayed UP across edits.

**Remaining gap count:** ~4 open — all P1-low / P2-polish (B9/B10 info-bar size, M11 board typography, B13/B15 card glow + rune-domain labels) + the out-of-scope `downloads/card-images/` asset gap. No open P0, no MISSING blocking programmatic play.

## 2026-05-11 ~18:05 PT — TICK 4 (this session)

**Gaps targeted (all 4 remaining):** M11 (board typography), B9/B10 (info-bar nameplates), B13 (selected/playable card glow), B15 (rune-domain labels). All RESOLVED this tick.

**RiftAtlas font identified:** RA uses **Bricolage Grotesque** (`"Bricolage Grotesque", "Bricolage Grotesque Fallback", "Segoe UI", sans-serif` — confirmed via devtools on `play.riftatlas.com` body + headings). Our app referenced `Cormorant Garamond`/`Cinzel` in CSS but never actually `<link>`ed a webfont, so it rendered system-ui. **Fixed:** `gameplay.html` now loads Bricolage Grotesque from Google Fonts (opsz 12-96, weights 400-800); `gameplay.css` defines `--font-display` / `--font-body` vars and applies `--font-display` to all board chrome/headings (lobby title/sub/deck names/info-rail titles, sidebar header Turn/phase/timer/status, phase strip, log/chat titles, available-actions title, player nameplate name + stat labels/values + avatar initials, room badge, resource-bar labels/icons, rune-domain chips, legend/champion labels, battlefield names, top-header brand). Dead Cormorant/Cinzel refs replaced with `var(--font-display)`.

**B9/B10:** `#playerInfo`/`#opponentInfo` are now framed nameplate strips — 40px rounded-square avatar (display-font initials; cyan active-glow for player, orange for opponent), 14px display-font name, VP chip w/ uppercase label, resource pills; opponent strip gets a reddish accent border so the two plates read distinctly (mirrors RA's top vs bottom plates).

**B13:** `.card.selected` → bright cyan ring + animated `card-selected-glow`; `.card.playable` glow strengthened; `.hand-zone .card.playable` resting glow; `.card.playable:hover` lifts/scales/brighter.

**B15:** rune-pool stacks now show a domain **chip** above each stack — colored glowing dot + uppercase domain name (display font) + `ready/total` count, border-tinted to the domain color (replaces plain "Fury (2)" text).

**Files touched — engine:** NONE (turn-phase machine, legal moves, win conds, combat/showdown already live in `packages/`; this tick is pure CSS + a small renderer rune-label tweak).
**Files touched — UI:** `public/gameplay.html` (Google Fonts `<link>`s), `public/css/gameplay.css` (`:root` font vars + display-font selector block, `.player-info`/`.player-avatar`/`.player-name`/`.player-stat` rewrite, `.card.selected`/`.card.playable` glow upgrades, `.rune-stack`/`.rune-stack-label`/`.rune-domain-*` badge styles, replaced 3 Cormorant refs), `public/js/gameplay/renderer.js` (`renderRuneStacks` emits dot+name+count chip instead of bare label).

**Before/after screenshots:** `ours-tick4-{00-lobby,03-turn1-main,04-after-first-play,08-endphase}.png` (before) → `ours-tick4-{10-lobby-after,13-turn1-main-after,40c-runepool-zoom,41c-playerinfo-zoom,42c-opponentinfo-zoom,43c-sidebar-zoom,44c-battlefield-zoom,46c-hand-selected-zoom}.png` (after). RA in-match re-confirmed driving works: `riftatlas-tick4-{00-home,30-turn1-main,31-board}.png` + `riftatlas-tick4-geo.json` (RA DOM geometry of bottom-left rune-deck/floating cluster).

**Build verification:** `bun build --target=browser renderer.js` clean; server boots clean (769 cards); `/play`, `/api/flow`, `/css/gameplay.css`, `/js/gameplay/renderer.js` all 200; Bricolage Grotesque confirmed loaded in Chrome (`document.fonts.check` → true), no console errors.

**Remaining gap count:** 0 visual MISSING/BROKEN open. Only the out-of-scope `downloads/card-images/` asset gap remains (affects card *art* only, not layout — would need a 769-image download). Engine logic stays entirely in `packages/`.
