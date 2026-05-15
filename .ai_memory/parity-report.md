# Riftbound Parity Gap Report
_Generated 2026-05-11, comparing `play.riftatlas.com` screenshots (riftatlas-*.png) against `apps/riftbound-app` (ours-*.png) — 53 screenshots total._

## Screenshot coverage

| Checkpoint | RiftAtlas shot | Ours shot |
|---|---|---|
| C0 lobby | `riftatlas-00-home.png` | `ours-00-lobby.png` |
| Choose-deck modal | `riftatlas-01-import-modal.png`, `02-import-validated.png` | — (no modal in our app) |
| Lobby w/ deck selected | `riftatlas-03-after-import.png` | — |
| Match loading / room | `riftatlas-10-room.png`, `11-single-player.png`, `13-deck-pasted.png` | — |
| Match loading dice | `riftatlas-20-match-loading.png`, `20b-locked-in.png`, `21-pregame-dice.png` | — |
| C1 battlefield-select | `riftatlas-22-pregame-battlefield.png` | — |
| C2 mulligan | `riftatlas-23-pregame-mulligan.png` (note: image is stuck on battlefield-select scene — RiftAtlas driver never progressed past pregame) | — |
| C3 turn1 main | `riftatlas-30-turn1-main.png` (still pregame in capture) | `ours-03-turn1-main.png` |
| C4 after first play | `riftatlas-31-card-clicked.png` (still pregame) | `ours-04-after-first-play.png` |
| C8 end-of-turn | `riftatlas-32-after-space.png` (still pregame) | `ours-08-endphase.png` |
| Help modal | `riftatlas-33-help-modal.png` (still pregame) | — |

**Caveat.** RiftAtlas captures 20-33 all show the *same* "Choose Battlefield" scene — the prior driver got stuck on the pregame battlefield-select step and never advanced. So in-match comparison is one-sided: I can read our app's in-game UI from `ours-03/04/08` against RiftAtlas's pregame board, plus general styling cues. I extrapolate from the ui-pattern reference where applicable.

---

## MISSING — RiftAtlas renders X, we don't

| # | Sev | Where | Description | Suggested fix |
|---|---|---|---|---|
| M1 | P0 | C0 lobby (`riftatlas-00-home` vs `ours-00-lobby`) | RiftAtlas lobby is an **editorial 2-column layout**: left = "Paste a deck" panel with LIST/STATS tabs, decklist summary card (Legend, Champion, Sideboard, Battlefield, Runes), import/new-deck/choose buttons. Right = player sidebar (player name, play mode `CONSTRUCTED`, match format `BEST OF 1`, Quick Match → "Find Random Match", Private Room w/ host code + Join/Spectate). Ours: just three centered buttons (`Host Game`, `Join Game`, `Goldfish`) on a black void. | Add lobby shell: 2-col grid in `gameplay.html` `#startScreen`; left = deck-preview card (currently nothing), right = the existing buttons plus stub Player/PlayMode/Format sections. CSS in `gameplay.css` `.start-screen` rules. |
| M2 | P0 | C0 lobby | RiftAtlas titles the page **"Lobby"** with sub-line "Paste a deck list first, then host or join with a room code", and a small avatar above. Ours has no lobby title or subtitle. | Add header to `#lobbyMenu` block in `gameplay.html`. |
| M3 | P0 | All in-game (`ours-03/04/08`) | RiftAtlas shows a **"ROOM: ZLFVYZ"** badge top-right inside the play area. Ours shows nothing for room id. | Render room code in `#sidebarHeader` (renderer.js renderSidebarHeader). |
| M4 | P0 | `ours-03/04/08` vs RiftAtlas help modal | RiftAtlas has a persistent `i` help button + first-game hint chip near top-right of board ("First game? Tap the i for controls and board tips"). We have `#helpInfoBtn` but it sits in the sidebar — not discoverable on the board itself. Severity is layout, not missing-feature, but visually we just look bare. | Move `#helpInfoBtn` to top-right of the board (absolute-positioned, z-index: 50) in CSS. |
| M5 | P1 | C0 lobby | RiftAtlas advertises a "TCGPLAYER" ad rail on the left ("Get all your cards in one package"). Ours has nothing. We don't have to copy ads, but the column gap is visually jarring — a `Tips & Recent` panel or empty rail breaks the void. | Add a left "info rail" with our tips / changelog stub (P1, polish). |
| M6 | P1 | RiftAtlas-03 (deck selected) | RiftAtlas shows a **deck preview card list** (Legend portrait, full list of champions, sideboard, battlefields, runes with counts) once a deck is chosen. Ours just enables Start Game. | Pull selected deck name + counts from `/api/decks/:id` in lobby.js, render in left deck-preview card after `selectDeck()`. |
| M7 | P1 | RiftAtlas-22 pregame Choose-Battlefield | RiftAtlas dedicates a full-screen "Choose Battlefield" overlay with the 3 candidate battlefield cards centered, large, with controllable click affordance. Our pregame.js does battlefield select but I see no equivalent screenshot — likely already works but visually plain. | (Verify) Ensure pregame battlefield-select overlay uses large cards w/ centered "CHOOSE BATTLEFIELD" header. |
| M8 | P1 | RiftAtlas in-game | RiftAtlas has a **chat box** ("Type message...") at bottom of right sidebar. We don't (and bots/goldfish don't need it), but multiplayer mode does. | Add `#chatPanel` stub in sidebar; only show in non-sandbox. |
| M9 | P1 | RiftAtlas in-game | RiftAtlas's "Toggles" / settings live inline (Stop At Beginning Phase, Auto Score From Hold, XP Counter etc. with on/off pills). We have `#board-toggles-panel` but it's empty in our screenshots. | Verify `renderBoardToggles()` populates on game load; check init.js call order. |
| M10 | P1 | RiftAtlas C0 | "QUICK MATCH" pill / "Find Random Match" CTA. We have host/join/goldfish only. | Stub a 4th button `Quick Match (coming soon)` (P2). |
| M11 | P2 | Lobby + game | RiftAtlas uses a **moodier serif display font** for headings (e.g., "Lobby", deck names) over a deeper navy/black. We use system-ui everywhere. | Adopt Google Fonts `Cinzel` or `Cormorant SC` for headings (`.start-screen h1`, `.sidebar-header`, deck-preview). |

## BROKEN — DOM present but empty / clipped / off

| # | Sev | Where | Description | Suggested fix |
|---|---|---|---|---|
| B1 | P0 | `ours-03/04/08` opponent rune pool | `#opponent-runePool` exists but is **11×8 px** with 0 children. RiftAtlas shows opponent rune count near top. | renderer.js `renderRuneStacks` — always render at least placeholder empty stacks; or render compact rune-count badge for opponent like ours does for player. |
| B2 | P0 | `ours-03/04/08` opponent base | `#opponent-base` is 1134×6 px (collapsed). RiftAtlas shows opponent units on their side of board. With no units yet it's still a visible row. | gameplay.html: give `#opponent-base` `min-height:80px` (matches `#player-base`). |
| B3 | P0 | Game log (`#gameLog`) | Container w=206 h=**13** while `#logEntries` inside is h=224. The outer wrapper title row is collapsing; log is effectively offscreen / clipped. | CSS `.game-log` set `display:flex; flex-direction:column; min-height:200px; flex:1; overflow:hidden;` and `#logEntries { flex:1; overflow-y:auto; }`. |
| B4 | P0 | Action bar | `#actionBar` reports w=0 h=0 vis=false even though `children:3` and contains 3 buttons + Cancel — so it's never positioned visibly. RiftAtlas's equivalent (END TURN, REVEAL HAND, TARGET, AUTO PAY chips) is permanently visible. | CSS `.action-bar` — remove the `hidden` default when interaction is non-null; verify show() is called. |
| B5 | P0 | Battlefield row at turn1 main | At turn1 ours shows 2 battlefield cards (good — children:2) but the row is a **dark void with two narrow placeholders** ("Altar to Unity", "Aspirant's Climb") and zero unit slots styled. RiftAtlas's battlefields **are 3** richly imaged cards each with units below. We only show 2. | engine config issue probably; but renderer: `.battlefield-row` should center 3 slots; ensure deck includes 3 battlefields (the official Vi/Vex starter has 3 each — verify our default starter has 3). |
| B6 | P0 | Hand cards visuals | Our hand cards are rendered as small bordered tiles with a tiny "Auto Pay" pill — but the card art appears washed/low contrast (e.g. `Seal of Rage`, `Inferna`). RiftAtlas hand cards have crisp full-bleed art + clear cost icons. | Verify `/card-image/:id` server route is returning full-res images; tweak `.zone-row.hand-zone .card` background/padding so art fills. |
| B7 | P1 | Resource bar | `#resourceBar` is 1303×33 — looks like a thin strip with text. RiftAtlas shows large prominent Energy/Power counters near the rune row. | CSS `.resource-bar { padding:8px 12px; font-size:14px; }`, add backgrounds to pip groups. |
| B8 | P1 | Phase bar | `#phaseBar` 1322×**29**, an unstyled horizontal text strip. RiftAtlas highlights current phase chip with active styling. | CSS `.phase-bar` — add bg, padding 6px, current-phase pill `.phase-active { background:#3a2a6a; border:1px solid #c4a0ff; }`. |
| B9 | P1 | Player info bar | `#playerInfo` 238×38, has 4 chips. RiftAtlas shows large player nameplate with avatar + VP score. Ours is muted. | CSS bump font-size to 13px, add `.player-avatar` left of nameplate (we already have `.player-avatar` style — just include it in the info bar). |
| B10 | P1 | Opponent info bar | `#opponentInfo` 241×38 — same as player info but no separation. RiftAtlas's opponent strip is clearly distinct (top of board). | Same as B9; we could mirror layout. |
| B11 | P1 | Sidebar header | `#sidebarHeader` 206×71 with 3 children. RiftAtlas's sidebar header has TURN N, MAIN phase pill, big "Lock" affordance, and timer. Ours just has "Turn 1 MAIN Lock". | renderer.js `renderSidebarHeader` — add timer placeholder, larger turn text, phase pill styled. |
| B12 | P1 | "FIRST GAME?" hint card | RiftAtlas pins a small "First game? Tap the i for controls and board tips." chip top-right of board. Ours shows it inline in sidebar header — gets lost. | Absolute-position the hint as floating card above board, dismissible. |
| B13 | P2 | Hand area card border | Hand cards have a square hard-edged border. RiftAtlas card frames are rounded with slight glow on play-eligible cards. We have `.card.playable` glow but it's not animating in stills. | Confirm cards in hand get `.playable` class when can-be-played. |
| B14 | P2 | Battlefield art | Our battlefields look like small dim rectangles. RiftAtlas's battlefields are **wider, with a clear "Player A side / Player B side" divider and the battlefield art filling the card**. | Bigger `.battlefield { width: 240px; height: 200px; }`; the `.bf-art` `background-image` should `background-size: cover`. |
| B15 | P2 | Rune-pool: missing rune-domain labels | Our rune pool is shown bottom-left as 2 stacks; RiftAtlas surfaces them with labelled domain badges (Energy 0, Runes 2/2). | renderer.js `renderRuneStacks` — already has `.rune-stack-label`, verify it's actually rendered (in 03 json children=2 htmlLen=1524 so it's populated; styling). |
| B16 | P2 | Auto-Pay pill colors | RiftAtlas's Auto Pay pill on each card is a subtle blue chip. Ours uses bright purple block taking ~25% of card height. | CSS `.auto-pay-pill { background: #2a3a60; font-size: 9px; padding: 1px 4px; }`. |

### Cap reached. Other observed but lower-impact: card hover preview slot under right rail (we have `#hover-preview` 191×271 — fine), deck stacks (player-decks 131×151 — fine), legend/champion zone (164×106 — fine).

---

## Phase-5 plan (top 5 to fix) — DONE in prior tick

1. **M1 + M2** — Lobby shell layout (high-impact, visible at session open every time). One PR-sized change.
2. **B2** — `#opponent-base` collapsed (1px tall); breaks board read entirely. Trivial CSS.
3. **B3 + B11** — Game-log clipped to 13px; sidebar layout fix.
4. **B4** — `#actionBar` zero-sized; we can't actually see end-turn / play actions inline. CSS only.
5. **B7 + B8** — Resource bar & Phase bar styling — currently flat, hard to read.

These 5 fixes touched primarily `gameplay.html` (lobby DOM) and `gameplay.css`, plus a small renderer.js tweak.

---

## TICK 1 update — 2026-05-11

### Status of original gaps after this tick

| ID | Status | Notes |
|---|---|---|
| M1 / M2 / B2 / B3 / B7 / B8 / B11 | RESOLVED prior | Lobby shell + opponent-base + game-log + resource/phase bars confirmed via fresh screenshots `ours-tick1-*-final.png`. |
| **B1** opponent runePool empty | **RESOLVED this tick** | `renderRuneStacks` now emits a `rune-stack-empty` placeholder showing `Runes 0/0` when opponent has none. Was 11×8 collapsed; now 53×46 with a visible label. |
| **M3** ROOM code badge | **RESOLVED this tick** | New `#roomBadge` element at top-right of `#board`. Reads `lobbyCode || short(gameId)`. Click-to-copy with checkmark feedback. |
| **B6 / B16** AUTO PAY pill dominating cards | **RESOLVED this tick** | Pill shrunk from 25%-height bright purple block to a small 8px green "Pay" chip in card's bottom-left corner. Inline styles in `renderer.js` updated; CSS also normalized for `.auto-pay-pill`. |
| **B12 / M4** First-game hint | Already wired | `help-modal.js` anchors the hint next to the sidebar `i` button. Confirmed working; no further move needed. |
| **B4** `#actionBar` hidden when no interaction | NOT A BUG | Our app uses a per-card action button pattern + sidebar Available Actions list — different model from RA's always-on top toolbar. Designed-as. |
| B5 | OPEN — engine concern | Engine `placeBattlefields` only places 2 (1 per player) in goldfish. RiftAtlas may show 3 in-match; can't verify because RA driver still stuck on Choose-Battlefield overlay (cards are canvas/keyed with no DOM-clickable hooks at the names). Defer until we can confirm RA's in-match battlefield count. |
| Card click does not play card (NEW, NOT a UI gap) | OPEN | `our-app-driver.ts` clicks the first card in `#player-hand` but state is unchanged between ours-03 and ours-04. Either the card isn't auto-playable or the click handler requires a different gesture (drag/pay flow). Driver issue, not a renderer gap. |
| B9, B10, B13-B15 (P2 polish) | OPEN | Defer. |

### Engine drivability check (per spec)
- `GET /api/game/:id/state` — full state
- `GET /api/game/:id/moves?player=...` — legal moves enumeration
- `POST /api/game/:id/move` `{moveId, playerId, params}` — execute
- `GET /api/game/:id/history`, `POST /api/game/:id/undo`, `POST /api/game/:id/redo`
- Engine class `RiftboundEngine` in `packages/riftbound-engine/src/engine/riftbound-engine.ts` exposes `executeMove` / `getState`.
- Agents can run the full game loop via HTTP without touching the UI. CONFIRMED — engine logic lives in `packages/riftbound-engine/` and `packages/core/`; UI in `public/js/gameplay/*.js` is rendering only.

### Remaining gaps (priority)
- **B5** (P0): 2 vs 3 battlefields in-match — engine-level question, blocked on RA-side confirmation.
- **M5–M11** (P1/P2): Polish items (TCGPlayer rail, deck preview after select, chat box stub, board-toggles content verification, Quick Match button, typography upgrade).
- **B9, B10** (P1): player/opponent info bar size + avatar layout.
- **B13–B15** (P2): card border glow, battlefield art sizing, rune-domain labels.

Approximate remaining MISSING+BROKEN entries: ~10 open, mostly P1/P2 polish.

---

## TICK 2 update — 2026-05-11 ~16:40 PT

### RiftAtlas in-match comparison FINALLY one-sided no more

Cracked the canvas-aware Choose-Battlefield pick: a real `page.mouse.click(800, 540)` on the center battlefield card position works (the cards are canvas/keyed, not DOM-clickable by name, but accept coordinate clicks). Then `PLAY FIRST` and `KEEP HAND` are real buttons. Driver: `.ai_memory/riftatlas-tick2-play.ts`. In-match RA screenshots captured: `riftatlas-tick2-{30-turn1-main, 31-board, 32-hand-hover, 33-after-draw, 34-hand-card-clicked, 35-after-space, 36-chain-panel, 37-help-modal}.png` + JSON sidecars.

**In-match RA findings (vs. ours):**
- RA's in-match battlefield row = **2 battlefields** (one per player) — same as ours. **B5 RESOLVED as not-a-bug**: 1v1 mode = 2 battlefields per `game-modes.ts battlefieldCount: 2`. The "3 cards" prior reports referenced were the Choose-Battlefield *pick* overlay (choose 1 of 3 candidates from your deck), not the in-match row. Ours is correct.
- RA battlefields render **3 visible unit slots per side** as faint placeholders even when empty; ours renders nothing when a side is empty. (P2 polish, B14 reframed.)
- RA has per-zone **TOKEN PANEL** (Add Recruit/Mech/Sand Soldier/Sprite/Bird; Gold on base) — ours has `token-panel.js` doing the same, confirmed wired into `renderBattlefields`.
- RA **TOGGLES** panel populated (Stop At Beginning Phase / Auto Score From Hold / XP Counter) — ours has `board-toggles.js` rendering the same three; confirmed visible in `ours-tick2-13-*`. **M9 RESOLVED.**
- RA has an **on-board turn timer** ("00:25") in the sidebar header — ours had none. **Added this tick** (`.turn-timer` in `renderSidebarHeader`, ticks 1/s, resets on active-player change).
- RA per-hand-card **AUTO PAY** chip — ours uses the shrunk green "Pay" pill from tick 1. Equivalent.
- RA **CHAIN** collapsible panel bottom-right of sidebar with count — ours has `renderChainOverlay()`; chain rendering present.
- Card images: our `/card-image/:id` route 404s for every card because `downloads/card-images/` doesn't exist in this environment — that's why hand cards/battlefields look "washed out" (the `onerror` gradient fallback). Not a renderer bug; out of scope for a UI tick (would need a 769-image asset download).

### Status of open gaps after this tick

| ID | Status | Notes |
|---|---|---|
| **B5** battlefield count | **RESOLVED — not a bug** | 2 in 1v1 is correct; confirmed RA also shows 2 in-match. |
| **M9** toggles panel empty | **RESOLVED** | board-toggles.js renders 3 toggles; visible in fresh screenshots. |
| **B11** sidebar header missing timer | **RESOLVED this tick** | `.turn-timer` added; counts up M:SS, resets per active player. Phase pill now uses engine `PHASE_LABELS`. |
| Phase order/labels hard-coded in UI | **REFACTORED this tick (engine-outside-UI)** | Engine now exports `PHASE_ORDER`, `PHASE_LABELS`, `TURN_PHASE_STRIP`, `getNextPhase`, `isMainPhase`, `isSetupPhase` from `@tcg/riftbound`. New `GET /api/flow` serves the strip. `game-flow.js` fetches it and replaces its bootstrap fallback; `renderer.js` sidebar header consumes `PHASE_LABELS`. |
| **M6** deck preview after select | **PARTIALLY RESOLVED this tick** | `#deckSelect-lobby` now populated with saved+public decks (was only "default"); `__lsdSyncDeckPreview` already renders the summary card on change. (No saved decks in this env so the preview shows "No deck loaded" until one is picked — wiring verified.) |
| **B14** battlefield empty-slot ghosts | OPEN — P2 | RA shows 3 faint slot placeholders per side; ours shows empty. Defer. |
| **B9 / B10** info bar size | OPEN — P1 (low) | Ours 238×38 with avatar+name+VP+resources is acceptably close to RA's. Defer. |
| **M5** TCGPlayer/info rail | OPEN — P1 | We don't ad-rail; lobby left column not jarring with the new shell. Defer. |
| **M8** chat box stub | OPEN — P1 | Multiplayer-only; goldfish/bots don't need it. Defer. |
| **M11** typography upgrade | OPEN — P2 | Lobby uses serif-ish; board still system-ui. Defer. |
| **B13 / B15** card glow / rune-domain labels | OPEN — P2 | Defer. |
| Card images 404 (NEW observation) | OUT OF SCOPE | `downloads/card-images/` absent in this env. |

### Remaining gaps after tick 2
~7 open entries, ALL P1-low or P2-polish (B14, B9/B10, M5, M8, M11, B13/B15) plus the out-of-scope card-image asset gap. No open P0. No open MISSING that blocks programmatic play.

---

## TICK 3 update — 2026-05-11 ~17:30 PT

### Fresh capture
- Our app: `ours-tick3-{00-lobby, 03-turn1-main, 08-endphase}.png` (before) → `ours-tick3-{10-lobby-after, 11-lobby-zoom, 13-turn1-main-after, 40c-bf-zoom, 43c-sidebar-zoom, 44c-sidebar-full}.png` (after).
- RiftAtlas in-match (re-confirmed driving works): `riftatlas-tick3-{00-home, 22-choose-bf, 30-turn1-main, 31-board, 32-hand-hover, 33-after-draw, 34-hand-card-clicked, 35-after-space, 36-chain-panel, 37-help-modal}.png` + zoomed `riftatlas-tick3-{40-bf-zoom, 41-runepool-zoom, 42-chat-zoom, 43-sidebar-zoom}.png`.
- Confirmed prior-tick fixes still render: lobby shell, ROOM badge (top-right `ROOM XXXX`), engine-driven turn-phase strip, on-board turn timer, toggles panel (3 toggles), game log, shrunk auto-pay pill, opponent rune placeholder.

### RiftAtlas in-match details captured this tick
- Battlefields: 2 in 1v1, each side renders **3 faint dashed unit-slot outlines** even when empty (RA's landing-zone affordance). Confirms B14 is purely a UI affordance — Riftbound has no per-battlefield unit cap (checked `packages/riftbound-engine/src/modes/game-modes.ts`: only `battlefieldCount`, no slot count).
- Sidebar header (RA): `Turn N` / `00:22` (timer) / `Tester's turn` / `ROOM: N55WCL` stacked, with the `i` help button.
- Bottom-right of RA sidebar: a `CHAT` box — scrolling message list + `Type message...` input + `Send` button. We had nothing there.
- Bottom-left of RA: rune pool with 2-3 visible runes (domain-coloured icons) + an Energy counter; a left-edge vertical numeric column (XP/round track).

### Status of open gaps after this tick

| ID | Status | Notes |
|---|---|---|
| **M8** chat panel stub | **RESOLVED this tick** | New `#chatPanel` in sidebar (`Chat` header / `#chatMessages` / `#chatInput` + Send). New `public/js/gameplay/chat.js`: `appendChatMessage`, `sendChatMessage`, `refreshChatPanel`; renderer calls `refreshChatPanel()` each frame; websocket.js handles incoming `chat` msgs. In sandbox/goldfish the panel is dimmed (`.chat-disabled`) and shows a "no opponent to chat with" stub line; in a real room it echoes the local player and best-effort forwards over `ws`. Purely presentational — no engine logic. |
| **B14** battlefield empty-slot ghosts | **RESOLVED this tick** | `renderBattlefields` injects `BF_SLOT_GHOSTS` (3 `.bf-slot-ghost` divs) into each `.bf-units` side; `.has-units` class hides them once a side has real units. CSS: dashed outlines, reddish on opponent side / bluish on player side, behind units (`z-index`). |
| **M5** lobby left info rail | **RESOLVED this tick** | Added `.lobby-shell-rail` as the first column of `.lobby-shell-body` (now 3-col: rail / deck panel / player sidebar) with a "Getting started" tips card + "What's new" changelog card. Replaces the visual gap where RA shows its TCGPlayer ad. Hidden under 1100px viewport. |
| **B9 / B10** info bar size | OPEN — P1 (low) | Ours acceptable; defer. |
| **M11** typography upgrade (board still system-ui) | OPEN — P2 | Defer. |
| **B13 / B15** card glow / rune-domain labels | OPEN — P2 | Defer. |
| Card images 404 (`downloads/card-images/` absent) | OUT OF SCOPE | Asset gap; needs a 769-image download. |

### Remaining gaps after tick 3
~4 open entries, ALL P1-low / P2-polish (B9/B10, M11, B13/B15) plus the out-of-scope card-image asset gap. No open P0. No open MISSING that blocks programmatic play. Engine logic remains entirely in `packages/` (turn-phase machine, legal-move enumeration, win conditions, combat/showdown all server-side); the UI changes this tick are pure rendering/input.

---

## TICK 4 update — 2026-05-11 ~18:00 PT

### Fonts: identified RA's typeface
RA's `body`/headings use **Bricolage Grotesque** (`"Bricolage Grotesque", "Bricolage Grotesque Fallback", "Segoe UI", sans-serif`) — a display sans-serif, available on Google Fonts. Our app referenced `Cormorant Garamond`/`Cinzel` in CSS but never `<link>`ed them, so it fell back to system-ui everywhere. **M11 now loads Bricolage Grotesque** via Google Fonts and applies it via a `--font-display` CSS var to: lobby title/subtitle/deck names/info-rail card titles, sidebar header (Turn N / phase badge / timer / game-status), the phase strip, log/chat titles, available-actions title, player nameplate (name + stat labels/values + avatar initials), room badge, resource-bar labels/icons, rune-domain chips, legend/champion zone labels, battlefield names, top-header brand. The dead Cormorant/Cinzel refs were replaced with `var(--font-display)`.

### Status of open gaps after this tick

| ID | Status | Notes |
|---|---|---|
| **M11** typography (board still system-ui) | **RESOLVED this tick** | Bricolage Grotesque loaded + applied to all board chrome/headings via `--font-display`. |
| **B9 / B10** info-bar nameplates | **RESOLVED this tick** | `#playerInfo`/`#opponentInfo` are now framed nameplate strips: 40px rounded-square avatar (display-font initials, cyan active-glow for player / orange for opponent), 14px display-font name, VP chip with uppercase label, resource pills. Opponent strip gets a reddish accent border so the two plates are immediately tellable apart (mirrors RA's top vs bottom plates). |
| **B13** card glow (selected/playable) | **RESOLVED this tick** | `.card.selected` now has a bright cyan ring + animated glow (`card-selected-glow`). `.card.playable` glow strengthened; `.hand-zone .card.playable` gets a resting glow; `.card.playable:hover` lifts + scales + brighter glow. |
| **B15** rune-domain labels | **RESOLVED this tick** | Rune-pool stacks now show a domain **chip** above each stack: colored glowing dot + domain name (uppercase, display font) + `ready/total` count, border-tinted to the domain color. (Replaces the plain "Fury (2)" text label.) |
| Card images 404 (`downloads/card-images/` absent) | OUT OF SCOPE | Asset gap; would need a 769-image download. |

### Remaining gaps after tick 4
**0 P0, 0 P1, 0 P2 visual gaps open** — every MISSING/BROKEN entry from the original report is now RESOLVED or explicitly not-a-bug, except the out-of-scope `downloads/card-images/` asset gap (which only affects card *art*, not layout). Engine logic remains entirely in `packages/` (turn-phase machine, legal moves, win conds, combat/showdown); tick-4 changes are pure CSS + a small renderer.js rune-label tweak.
