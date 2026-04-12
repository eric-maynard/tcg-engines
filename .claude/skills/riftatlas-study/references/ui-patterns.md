# Reusable UI Patterns from Rift Atlas

Patterns observed in Rift Atlas that are worth copying. Each includes a brief "how it works" and "why it's good."

## 1. Reserved hover-preview slot

### How
A fixed div on the right side of the sidebar. On hover of any card (hand, board, battlefield, legend, champion), it populates with a large version of that card's face. On mouseleave, clears after ~150ms.

### Why
- Keeps the mouse path short: hover → look same-viewport → no chasing a tooltip
- No layout shift (the slot is always there)
- Works for all card types — hand, board, legend, even tokens
- Doesn't cover other cards — preview has its own area

### Gotcha
The slot takes permanent space (~240×340px on desktop). Worth it.

## 2. Card state overlays instead of rotation

### How
Exhausted / summoning-sick cards get a translucent overlay on top of the card face. Typically a darkened "card back" image at 25-40% opacity.

### Why
- Clearer at small sizes than 90° rotation
- No layout math needed (rotated cards change their bounding box)
- Consistent across card types — units, runes, equipment all use the same treatment
- Two distinct states (sick vs. exhausted) can be visually differentiated via overlay color

## 3. Inline showdown per battlefield

### How
Showdown state lives on the battlefield card itself, not in a modal. The battlefield gains a status banner ("Showdown in progress"), Pass Focus button, and Close button. Waiting state changes the button label to "Waiting...".

### Why
- Preserves board context — you can see other battlefields/zones during the showdown
- Multiple concurrent showdowns each get their own panel
- Status change is localized, not a full-screen interruption

### Anti-pattern warning
Rift Atlas's X "Dismiss" button conflates Cancel with Give-Up-Waiting. Split these into explicit Pass / Conquer / Cancel in your implementation.

## 4. Hold-to-arm modifiers

### How
Press and hold a key (C/B/T/L/E/P). UI enters an "armed" mode with a visual banner. Click a target to apply. Release the key to exit the mode.

### Why
- Zero-click power use — no toolbar click + target click + confirm
- Discoverable through the help modal
- Works with muscle memory (like Photoshop's spacebar for hand tool)
- Scales: each mode can have its own cursor, visual feedback, and target filter

### Implementation notes
- Track "armed" state in a module-level object
- On keydown of a registered key → set armed state + show banner
- On keyup → clear armed state + hide banner
- On click during armed state → call the armed action's handler instead of the default click handler

## 5. Proportional scale-to-fit layout

### How
Game board is a fixed logical size (e.g., 1920×1080). On window resize, compute `scale = min(vw / 1920, vh / 1080)` and apply `transform: scale(N)` with `transform-origin: center center`.

### Why
- Spatial consistency — players build muscle memory for where zones are
- No awkward reflow breakpoints
- Works from 1920px down to ~1024px without issue
- Below the minimum, show a "resize your browser" banner instead of attempting mobile

### Gotcha
Event handlers need to account for scale in coordinate math. Use `getBoundingClientRect()` on the wrapper rather than computing from `event.clientX`.

## 6. Rewind as a logged action

### How
Rewind reverses the last action AND logs its own entry ("Rewound their last action."). The reverted action's log entry stays visible. Every log entry has a `↺` marker for "rewind to here."

### Why
- Transparency — opponent sees the full history including undos
- Discoverable — the log shows you what's rewindable
- Low risk — players can't silently erase history, so competitive play stays fair

### Critical: don't destructively edit history
If rewind silently removes the reverted entry, opponents get confused. Keep both entries visible.

## 7. Match log with rich narration

### How
Every meaningful state transition produces a log line with a timestamp. Lines are concise but narrative — not just "moved X" but "Moved Plundering Poro to Trifarian War Camp."

### Why
- Spectators/reconnects can catch up by reading
- Post-game review is possible
- Rewind-to-point navigation uses the log as the history index

### Examples to copy verbatim
- "Rolled a d20"
- "Rolled 14. rifty rolled 3."
- "Wins initiative (14 vs 3) and decides who plays first."
- "Chose rifty to take the first turn. Both players now mulligan up to 2 cards."
- "Finalized mulligan (2 recycled, 2 redrawn)."
- "Both mulligans are complete. Starting the game."

## 8. Expandable panels for advanced actions

### How
Sidebar features like "Board Actions" (counter, buff, duplicate, label, give control) and "Board Toggles" (auto-score, stop-at-phase) live in collapsible panels. Hidden by default, one click to expand, auto-collapse on click outside.

### Why
- Keeps the sidebar clean for new users
- Power users can expand once and keep it visible
- Avoids the "toolbar with 20 icons" problem

## 9. Per-card Auto Pay button

### How
Every hand card renders with a small "Auto Pay" button next to it. Clicking Auto Pay calculates the cost and taps runes automatically.

### Why
- Single-click path from hand → played
- Doesn't block manual cost payment (you can still tap runes individually)
- The button disappears when the cost cannot be met — clear feedback

## 10. Token panel per zone

### How
Each zone (base, each battlefield) has a `+` button that expands to show token options (Recruit, Mech, Sand Soldier, Sprite, Bird, Gold for base). Clicking a token creates one in that zone.

### Why
- Digital playmat escape hatch for effects the engine doesn't support
- Lets the game "work" even when a rules edge case hits
- Different zones get different token lists (base has Gold, battlefields don't)

### Gotcha
Tokens bypass engine validation. Gate behind a "Sandbox Mode" toggle or clearly label as unvalidated.
