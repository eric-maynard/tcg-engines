# Riftbound App — Design Intent

Product decisions the visual observer agents must check FOR (not just "is it broken?").

## Play menu
- 4 mode cards: Host Lobby, Join Lobby, Goldfish, VS AI (disabled)
- Goldfish/VS AI skip the lobby entirely — deck picker → Play → mulligan (no code, no d20)
- Solo picker offers Bo1/Bo3; Bo3 shows battlefield selection in pregame
- Solo modes — the bot's deck: under the Opponent (Goldfish / Claude model) selector the picker has an
  **Opponent's deck** dropdown (same rich deck picker as the player's: name, "Legend · Champion" chip, domain
  pips) with, in order: *Same as mine (mirror)* (chip follows the player's pick), *Random from my decks* (only
  when the user has saved decks), **Your Saved Decks**, **Public Decks**, **Default starter**. The choice is
  remembered in `localStorage` (`rb-opponent-deck`). It travels as `opponent.deck = {mode: mirror|random-mine|
  deck|default, deckId?}` on `POST /api/lobby/create`; the server accepts only the requester's own decks,
  public decks or the starter (ownership from the session cookie, never the body), validates the deck like a
  human's, and seats player-2 with it BEFORE the game is created — so battlefield options / the Bo1 random
  pick, sideboarding and the mulligan all use it, for Goldfish and Claude seats alike (Claude's system prompt
  lists ITS deck). A rejected deck leaves no lobby behind and the reason shows in the picker's status line.
  The hosted lobby's **Single Player** mode shows the same dropdown to the host (WS `select_opponent_deck`),
  and the Goldfish card reads "Solo Opponent · <deck>".

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
- Pays demanded while an ability RESOLVES (a spell's / activation's "pay [1] to …", a trigger's LATER "then you may
  pay …", a leading "you may pay [C]. If you do, …" — rule 205: not a cost, a Pay performed on resolution, 444.2 —
  or a counter's ransom) keep their prompt open; the player may tap runes while it is open and then answer — still
  manual, nothing auto-tapped. (Known gap: `effects/conditional.ts` skips the question outright when the POOL cannot
  pay, without crediting untapped runes; a finalization-cost prompt does credit them via `canPayOptInCost`.)
- Trigger optional/cost timing follows ONE model (`E/abilities/optional-kind.ts`, core-rules test
  `optional-instructions-timing.test.ts`): "you may [cost] TO Y" = base cost decided+paid at FINALIZATION (383.3.a/b,
  204.3.a); "you may Y" / "you may X. If you do, Y" = decided at FINALIZATION, X/Y performed at RESOLUTION (205, 444.2,
  383.3.a.1: no second "may"); a later "you may"/"pay … to" = RESOLUTION (383.3.a.3). No deviation — the ~28 riftjudge
  rulings that put a leading may/cost at resolution predate the Unleashed CR and are annotated RULING-CONFLICT.
- Exception class that MUST work (and does): printed cost ALTERNATIVES / replacements are always enumerated from
  the cost model, even with an empty pool, and choosing one charges no Energy —
  - "you may spend a buff as an additional cost. If you do, ignore this spell's cost" (Wallop ogn-146,
    Call to Glory ogn-207): with 0 energy + a buffed unit the cast is offered (spend-buff variants only);
  - "spend any number of buffs … reduce my cost by [C] for each" (Kraken Hunter ogn-150);
  - "Spend my buff:" activations (Sett ogn-164, Udyr ogn-157) — the buff is the whole cost;
  - The Boss (ogn-269) "you may pay [rainbow], exhaust me, and spend its buff … instead": offered when a buffed
    friendly unit would die and the [rainbow] POWER is in the pool (Energy irrelevant); unpayable → never asked.

## Trigger ordering
Rule 383.3.d ("the controller selects the order to place simultaneous triggers on the Chain") is a SOFT offer.
- When one move leaves ≥2 finalized, non-interchangeable triggered items of the same controller on the Chain, the
  engine sets `pendingTriggerOrder` (an `order` decision, `defaultable: true`) for that player. Answering
  `resolvePendingChoice{orderedKeys}` rearranges them (first key = bottom of the Chain, LAST key = top → resolves
  first); taking ANY other action (pass, play, Space…) silently accepts the listed scan order. Nobody is ever
  blocked on it; finalization questions ("you may exhaust me…") are asked BEFORE the offer, in scan order.
- UI: an in-board, draggable STACK POPUP (`#triggerOrderPopup`, Arena-style, no backdrop) listing the controller's
  triggers TOP OF CHAIN FIRST with live "resolves 1st/2nd/…" numbers; rows reorder by drag-and-drop or ↑/↓
  (keyboard: focus a row, ArrowUp/ArrowDown); "Confirm order" dispatches the arrangement, "Use default" the listed
  order. It never covers the hand, can be dragged by its header, and disappears the moment the engine stops
  offering the order. The sidebar only keeps a compact hint ("Reorder N triggers in the chain popup…" + "Keep this
  order").

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
- Battlefield selection (rule 485.5 / 486.5): in a real (non-sandbox) Duel / Bo1 the GAME picks 1 of each
  player's 3 battlefields at RANDOM (engine move `selectRandomBattlefield`, seeded engine RNG — same seed ⇒ same
  board) and places both at once; there is NO battlefield-choice UI — the mulligan overlay just states
  "Battlefield selected at random: X" (+ the opponent's). Match / Bo3 keeps the manual `battlefield_select`
  picker (486.5). Sandbox is unchanged: its solo picker offers Bo1 (random) or Bo3 (manual pick).

## Performance
- All deck card images preloaded at first sync — no blank cards after t+1s

## Battlefield control
The timing of losing / gaining control follows the Core Rules text exactly (190.4, 323.6 = Cleanup step 4 in an OPEN
State with nothing ongoing there, 348.2.a, 466.5 — `packages/riftbound-engine/src/operations/battlefield-control.ts`,
FIXER-PRIMER § BATTLEFIELD CONTROL TIMING). Two deliberate points:
- **Presence shortcut (deviation)**: in a NEUTRAL Open Cleanup, a battlefield that is not Contested, has no showdown,
  whose recorded controller has no unit there and where exactly ONE other player has units is taken by that player
  immediately (a Conquer, scored if not yet scored this turn) instead of that player applying Contested and a
  Non-Combat Showdown being staged (190.3.a / 323.11.a / 344.2). Real arrivals always apply Contested via `noteArrival`
  and DO get their showdown; the shortcut only fires for states real play does not produce (seeded test boards,
  simultaneous swaps). In a Showdown-Open Cleanup the controller lapses normally and the occupant applies Contested.
- **Seeded control** (harness / sandbox): `controller` on a battlefield with no unit of that player is real control and
  lapses at the first Open-State Cleanup like any other; durable control needs a unit or token there.
- Community rulings that predate the "1.1"/Unleashed control rules (control lost mid-combat, or mid-chain for Baited
  Hook / Cruel Patron / Arcane Shift, or "hidden card lost before a lone Deathknell resolves") are NOT followed; their
  test facets carry `// RULING-CONFLICT` and assert the CR behaviour.
