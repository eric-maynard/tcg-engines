# UI Parity Gaps — Batch 26 III

Comparing `riftatlas-tick4-31-board.png` vs our SPA after batch 26 III CSS pass.
These are component-level (NOT pure-CSS) gaps that need new components or
JSX changes — out of scope for batch 26 III's CSS lane.

## Component-creation TODOs

1. **Right-side floating sidebar panel** (RiftAtlas top-right corner).
   - Contains "FIRST GAMES?" tutorial card + a small turn timer + an end-turn
     CTA. Currently our move log is in `.board-side` but lacks the welcome
     /tutorial card and clean panel chrome (no border-rounded inner card).
   - Suggested component: `SidebarPanel.tsx` wrapping MoveLog + a
     dismissible help card.

2. **Phase indicator clock-ring** (top-left corner of RiftAtlas).
   - Small circular badge with the phase letter (e.g. "M" for Main) inside.
   - Currently we render a horizontal `.phase-strip` of pill labels. Needs
     a `PhaseRing.tsx` component or at minimum a vertical compact variant.

3. **Deck-pile visualization** (left and right edges of RiftAtlas board).
   - RiftAtlas shows a small card-back stack with a number on top
     ("10" / "34") representing deck size.
   - Currently we have only a text "Deck: 30" field in PlayerPanel stats.
   - Suggested component: `DeckPile.tsx` with stacked card-back divs +
     size badge.

4. **Power/Energy glyph row** (under each player area in RiftAtlas).
   - Small colored circle icons (one per power type) instead of text
     "Energy: 3". RiftAtlas shows these as a tight row of color swatches.
   - Suggested: extend PlayerPanel hand-mat with a `PowerRow` strip.

5. **Player avatar circle + VP badge** (RiftAtlas leftmost edge).
   - Circular avatar with the player's VP count as a prominent badge
     overlay. Currently rendered as plaintext "VP: 0 / 8" in a `<ul>`.
   - Suggested: `PlayerAvatar.tsx` (circle div + VP badge corner).

6. **Battlefield card art slots** (the actual cards on the mat in RiftAtlas).
   - RiftAtlas shows real card-art mini-tiles inside each battlefield lane.
   - Currently we render `.bf-unit` as a thin text row with might badge.
   - Suggested: enhance `BattlefieldList` to render units as
     `.bf-unit-card` (small card-tile variant of the new `.hand-chip`
     styling from this batch).

7. **Chat / message input strip** (bottom-right of RiftAtlas).
   - Out of scope for parity-screenshot tick4 — but tick3 shows a small
     "Type message…" input. Not currently in our SPA. Possibly NEVER
     needed since we don't have multiplayer chat.

## Open question for batch 27 lead

Should we wire actual card-art images (PNG asset path from the engine's
card definitions) into hand chips and bf units, or stay text-only? This
is the biggest single visual gap remaining but requires asset pipeline
wiring (image directory, fallback handling) likely outside the SPA's lane.
