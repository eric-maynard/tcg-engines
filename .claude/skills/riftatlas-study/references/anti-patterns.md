# Rift Atlas Anti-patterns — do NOT copy

Things Rift Atlas does poorly or inconsistently. Our implementation should diverge from these even though we're using Rift Atlas as a general reference.

## 1. The broken Equip button flow

### The bug
Clicking the "Equip X" button on an equipment card on the board:
1. Exhausts the equipment (as cost)
2. Puts the UI into an "equip target" mode
3. Clicking a target unit SHOULD equip — but instead it toggles the target's exhausted state

### Why it happens
The target-click handler isn't routed through the "armed equip" mode. It falls through to the default "click card to toggle exhaust" handler.

### Workaround (for playing)
Drag the equipment directly onto the target unit. Drag works.

### Our fix
When implementing our Auto Pay / equip flow:
- Use drag-to-target as the canonical path
- If we provide an Equip button, it must cleanly route the NEXT click into the equip handler, bypassing the exhaust toggle
- Better: equip from hand directly (drag from hand → unit) in one gesture, skipping the "equipment on base" intermediate state entirely

## 2. "Dismiss Showdown" ambiguity

### The issue
Rift Atlas has an X button on each active showdown that "dismisses" the showdown. But what does dismiss mean?
- Cancel the showdown intent, return to pre-move state?
- Force immediate conquer without waiting for opponent?
- Just close the priority window and leave the unit there (no conquer)?

Observed behavior: the third. "Dismissed showdown at Trifarian War Camp." closes the panel without conquering. The unit stays at the battlefield but no score is awarded.

### Our fix
Split the button into three clearly labeled actions:
- **Pass Focus** — I'm done for now; opponent's turn to react
- **Conquer** — both sides have passed; resolve the showdown now
- **Cancel** — back out; restore pre-showdown state (only available before opponent has acted)

No ambiguous "Dismiss" button.

## 3. Modal-heavy pregame (sideboarding, battlefield selection, mulligan)

### The issue
Sideboarding, battlefield selection, and mulligan are all full-screen modals in Rift Atlas. They block the game view entirely until dismissed.

### Why it's suboptimal
- Breaks spatial continuity with the game board
- Makes "waiting on opponent" feel like a blank screen
- You can't peek at the board state while deciding

### Our fix
Use slide-over panels or bottom sheets that leave the board visible. Blur/dim the board but keep it spatially present.

Specific alternatives:
- **Sideboarding**: slide-in panel from the right, showing main deck on one side and sideboard on the other. Board visible behind at 50% opacity.
- **Battlefield selection**: small dialog with the 6 battlefield cards, anchored to the top-center. No full-screen blocker.
- **Mulligan**: inline "Redraw" buttons on each card in hand; no modal at all.

## 4. No validation on token/counter/buff tools

### The issue
Rift Atlas's sandbox tools (add token, apply counter, buff unit, label card, give control) bypass engine validation. You can add 10 Recruit tokens to a battlefield with no cost or limit.

### Why it's a problem
- Misleads new players — they don't know these aren't "real" moves
- Ruins competitive integrity if used during ranked play
- No audit trail for "wait, how did that token get there?"

### Our fix
- Gate sandbox tools behind a visible "Sandbox Mode" toggle
- Off by default
- When on, show a yellow banner "Sandbox Mode — moves are not engine-validated"
- In ranked/tournament modes, tools are disabled entirely

## 5. Multi-click-exhausts-wrong-thing

### The issue
Clicking a card on the board to EXHAUST it (for cost payment) and clicking a card to SELECT it (for targeting) use the same gesture. Without visual cues for which mode you're in, clicks can accidentally exhaust when you meant to target.

### Our fix
- Always show cursor state for armed modes (target cursor, counter cursor, buff cursor)
- Default click on own card = select for preview, NOT exhaust
- Exhaust requires an explicit gesture: drag downward slightly, or Shift+click, or a dedicated "Exhaust" button
- Auto-Pay button handles all exhaust-for-cost cases, so manual exhaust is rare

## 6. Log entries that assume you know who "they" is

### The issue
Rift Atlas log entries often say "Ended their turn." or "Rewound their last action." — but "their" is implicit on the CURRENT viewer's perspective. If you look at the log mid-game, it's not always clear who "they" refers to.

### Our fix
- Replace "their" with the actual player name: "Eric ended their turn." or "Eric's turn ended."
- Alternatively: prefix each entry with the player color/icon
- On your own actions, show "You" instead of your name for personalization

## 7. Timer shows total match time (confusing)

### The issue
Rift Atlas's timer shows the total elapsed match time (e.g., `1:10:27`). In a 5-minute match, this counter has already hit 10 minutes. It doesn't help players understand how much time they have LEFT.

### Our fix
- Per-turn countdown clock if time controls are enabled
- Otherwise omit the timer entirely
- Optionally: "total match time" as a secondary smaller display

## 8. The info/help modal only covers hotkeys

### The issue
The `i` icon opens a hotkey reference, but nothing else. There's no onboarding for:
- What the score track means
- How showdowns work
- What the different panels do
- How rewind works

### Our fix
- Split into tabs: Hotkeys, Game Flow, Zones, Rewind, Settings
- Include a 2-minute interactive tour on first-ever run
- Make it dismissible but rediscoverable via the `i` icon
