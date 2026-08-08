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

## Paying costs
Paying is MANUAL — a deliberate deviation from rules 357.1.a / 429.3 / 204.4.b.1 (the "Add during payment"
sub-step is intentionally not implemented; see `moves/play/cost-model.ts`).
- The engine only OFFERS a play, an activation or a taxed move (Mageseeker-style applied cost) when the
  CURRENT pool covers its total cost. Ready runes, an uncracked Gold, a Seal etc. are never credited and never
  auto-exhausted — even when they could obviously cover the shortfall. The player taps / recycles / cracks first,
  then plays. Consequence: the set of legal targets is pool-only too (a [Deflect] unit is not offered until the
  extra [A] is actually in the pool).
- The single convenience is the app's right-click Recycle: recycling an untapped rune auto-taps it for +1 Energy
  first. That resource lands in the pool BEFORE any play starts, so it is ordinary pool affordability.
- Pays demanded while an ability RESOLVES ("you may pay [1] to …", a counter's ransom) keep their prompt open;
  the player may tap runes while it is open and then answer — still manual, nothing auto-tapped.
- Exception class that MUST work (and does): printed cost ALTERNATIVES / replacements are always enumerated from
  the cost model, even with an empty pool, and choosing one charges no Energy —
  - "you may spend a buff as an additional cost. If you do, ignore this spell's cost" (Wallop ogn-146,
    Call to Glory ogn-207): with 0 energy + a buffed unit the cast is offered (spend-buff variants only);
  - "spend any number of buffs … reduce my cost by [C] for each" (Kraken Hunter ogn-150);
  - "Spend my buff:" activations (Sett ogn-164, Udyr ogn-157) — the buff is the whole cost;
  - The Boss (ogn-269) "you may pay [rainbow], exhaust me, and spend its buff … instead": offered when a buffed
    friendly unit would die and the [rainbow] POWER is in the pool (Energy irrelevant); unpayable → never asked.

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
