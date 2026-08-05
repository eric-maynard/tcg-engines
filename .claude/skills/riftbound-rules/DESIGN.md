# Riftbound App — Design Intent

Product decisions the visual observer agents must check FOR (not just "is it broken?").

## Play menu
- 4 mode cards: Host Lobby, Join Lobby, Goldfish, VS AI (disabled)
- Goldfish/VS AI skip the lobby entirely — deck picker → Play → mulligan (no code, no d20)
- Solo picker offers Bo1/Bo3; Bo3 shows battlefield selection in pregame

## Board layout
- Rune-stack cards ≈ hand-card size (~110×154px minimum)
- Exhausted cards rotate 90° (physical "tap") + dark overlay
- Legend/Champion always visible for both players
- Battlefield art fills its slot

## Resource management
- Playing a card requires `pool.energy >= cost` — ready runes are NOT auto-counted or auto-exhausted. The player must explicitly tap runes first.

## Interactions
- Hover on any card → floating enlarged card image ONLY (no name/type/rules-text panel)
- No fly-animation on zone change — cards appear at destination immediately
- Drag from hand/base directly to a target zone (no click-then-click)
- Click a rune to exhaust it (turn sideways + energy +1)
- Right-click rune = recycle. Recycling an untapped rune auto-taps it first for +1 energy (you'd always do this), shown as a +1 float.
- Targeted spells/abilities enter a targeting mode: legal targets glow, click to choose, Esc cancels. Never auto-pick a target.
- Card zoom (double-click) never sits above a modal: opening the chain / pending-choice / play-cost modal closes it, Esc or backdrop click closes it, and it won't open while a modal is up.

## Pregame
- Mulligan: 4 large cards, hover for full image, Keep/Send-back
- No other modals (peek dialog, help, etc.) may appear over the pregame overlay

## Performance
- All deck card images preloaded at first sync — no blank cards after t+1s
