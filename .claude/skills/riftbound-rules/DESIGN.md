# Riftbound App — Design Intent

Product decisions the visual observer agents must check FOR (not just "is it broken?").

## Play menu
- 4 mode cards: Host Lobby, Join Lobby, Goldfish, VS AI (disabled)
- Goldfish/VS AI skip the lobby entirely — deck picker → Play → mulligan (no code, no d20)
- Solo picker offers Bo1/Bo3; Bo3 shows battlefield selection in pregame FIRST, then the d20 roll (see §Pregame order)
- Solo picker **Opponent** selector: *Goldfish — Passive (auto-passes)* (default; the server's Goldfish driver plays
  player-2: passes priority/focus, resolves its prompts, ends its turn), *Goldfish — Active (you play both seats)*, then the
  Claude models. Remembered in `localStorage["rb-opponent"]` (`goldfish` | `goldfish-active` | model key); sent as
  `opponent: {kind:"goldfish", mode:"passive"|"active"}` (default passive; anything else → 400). **Active** = hot seat: the
  server attaches NO driver to player-2, marks the lobby/session `hotSeat`, never auto-picks player-2's pregame choices
  (battlefield, sideboard lock, mulligan, go-first when player-2 wins the roll — the host answers all of them), and lets the
  game socket `{type:"switch_seat", playerId}` re-bind to either seat (refused outside hot-seat games). The client FOLLOWS the
  seat that owes the next decision (turn / priority / focus / prompt owner; pregame chooser): it switches seat automatically,
  flips the whole board to that seat's perspective, and shows a persistent top strip **"Acting as Player 2 (Goldfish —
  active)"** with a **Switch seat** button (`Tab`; the sidebar seat buttons too). Hidden information stays honest: each
  seat's view is the server's per-seat snapshot, so acting as player-2 you see player-2's hand and player-1's hand as card
  BACKS (and vice versa). Rewind takes back one action of whichever seat made it. Log lines name the seat ("Player 2 …").
  The Opponent's-deck selector applies to player-2 in both modes.
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
- What a menu OFFERS for a permanent (hand, Champion Zone, facedown flip) is exactly what the engine ACCEPTS and what it
  CHARGES (`moves/play/play-options.ts`, one model for every origin): every destination × every optional-cost election
  (each priced shape, each legal object / subset) that is legal AND payable from the CURRENT pool as one assignment
  (specific-Domain pips from their Domain or pooled [A]; any-Domain pips from whatever is left — which of two equally
  stocked Domains pays an any-Domain pip is the engine's pick, not the player's). An election the pool cannot cover
  together with the rest of the cost is absent (never "accepted, then silently dropped"); a raw move naming anything
  outside that set is refused with the state untouched. Each variant carries a `quote` (energy / pips / any / xp) a UI
  may show.
- Pays demanded while an ability RESOLVES or FINALIZES (a trigger's "you may pay [C] to …", a spell's /
  activation's "pay [1] to …", a leading "you may pay [C]. If you do, …" — rule 205: not a cost, a Pay performed
  on resolution, 444.2 — an instructed play's confirm, an elected optional additional cost, a [Deflect] surcharge
  the trigger's own choice owes, or a counter's ransom) keep their prompt OPEN; the player taps / recycles runes
  while it is open and only then answers — still manual, nothing auto-tapped. One place decides which prompts
  those are: `moves/prompt-cost.ts promptPayableCost`, used both to keep `exhaustRune` / `recycleRune` legal
  during the prompt and to price it. Such a prompt reports `canAccept:true` with `needsAdd {energy, power, reason}`
  whenever the pool as it stands cannot pay but the seat's Reaction [Add] abilities could — so "yes" is shown
  (disabled, with "tap an [order] rune first") instead of hidden, and nobody has to guess the cost and pre-tap
  before the ability is offered. Accepting is still refused until the pool actually covers it; `canAccept:false`
  now means genuinely unpayable. Automatic policies (`settle`, the harness `first` policy) treat `needsAdd` as
  "decline" — they never pay on the player's behalf.
- Still pool-only, and NOT covered by the above: [Deflect]-taxed target picks (`choose-target` / `pick-many` with
  `deflectTax`). Each producer filters candidates against the pool when the prompt is raised and never re-derives
  the list, so a rune added mid-prompt cannot make a filtered-out target reappear; widening those budgets needs a
  pick-time payability gate to replace the filter.
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
- Hover on any card (hand, board, battlefield, legend/champion, runes, prompt tiles, trash top) → floating preview with the enlarged art PLUS name/type and full rules text (+ state chips); position:fixed, pointer-events:none, never shifts layout, auto-hides on mouseout/detach/modal (user request 2026-08-10: 'mouse over battlefield to see more clearly should work')
- No fly-animation on zone change — cards appear at destination immediately
- Drag from hand/base directly to a target zone (no click-then-click)
- Click a rune to exhaust it (turn sideways + energy +1)
- Right-click rune = recycle. Recycling an untapped rune auto-taps it first for +1 energy (you'd always do this), shown as a +1 float.
- Targeted spells/abilities enter a targeting mode: legal targets glow, click to choose, Esc cancels. Never auto-pick a target.
- Card zoom (double-click) never sits above a modal: opening the chain / pending-choice / play-cost modal closes it, Esc or backdrop click closes it, and it won't open while a modal is up.

## Rewind (undo / redo)
- Sidebar **Rewind** (`R` / `Backspace` / `Ctrl/Cmd+Z`, or the ↺ on a log line) and **Redo** (`Ctrl+Shift+Z` / `Ctrl+Y`).
  Rewind = enabled iff `snapshot.canUndo`, Redo iff `snapshot.canRedo` (the engine's history cursor).
- ONE Rewind takes back one player-facing ACTION: the move plus every automatic procedure the server ran after it
  (combat resolution, showdown close, chain resolve) — never half of it. It restores the COMPLETE position: board,
  hands/decks (order included), rune pools, phase/turn/priority/focus, open prompt, chain contents and bound targets,
  the RNG (a rewound shuffle re-deals the same cards on Redo), "this turn" trackers, and a finished game's result.
  Works mid-prompt (lands before the move that opened the prompt), mid-chain, mid-showdown, across End Turn.
- Redo re-applies exactly what was rewound; taking any NEW action after a Rewind discards the redo branch (standard).
- The pregame (deck setup, mulligans) is never rewindable: "Nothing to rewind" at the first action of the game.
- Goldfish practice: a Rewind takes back the HUMAN's last action and silently skips every Goldfish action that followed
  it, including priority passes the Goldfish driver made on your behalf (Rewind right after End Turn = your End Turn
  AND the Goldfish's whole turn come back in one click; if start-of-turn triggers made YOU pass priority since, those
  passes are your actions and come back first, one per click). Redo replays them the same way. The Goldfish never
  acts on a rewind and the board is never parked on the Goldfish's turn, so it never "runs away".
- VS Claude: one action per Rewind (Claude's included). Claude is re-armed ~3 s after the LAST Rewind/Redo click
  (debounce, so several clicks land first) and any decision it was computing for the pre-rewind position is thrown
  away, never applied to the rewound board. Rewinding into Claude's turn lets it reconsider (it may play differently).
- Match log: narration of rewound moves disappears (it is derived from the applied history) together with its side
  lines ("Turn passed to …", "Combat resolved …", 🤖 lines); every Rewind appends "Rewound their last action." (Redo:
  "Move redone.") as the newest line — the client clears targeting/armed hotkeys and flashes the board on it.
- OPEN DESIGN QUESTION — "Rewind allowed in duel / vs-AI?": today ANY seat may Rewind/Redo ANY action (the opponent's
  too) while the game is `playing`; the sandbox (Goldfish / VS Claude) may additionally take back the winning move of a
  finished game, a duel may not. Whether hosted duels should restrict Rewind (own actions only / opponent consent /
  off) is undecided — do not change who may undo without a decision here.

## Pregame
- Mulligan: 4 large cards, hover for full image, Keep/Send-back
- No other modals (peek dialog, help, etc.) may appear over the pregame overlay
- Battlefield selection (rule 485.5 / 486.5): in a real (non-sandbox) Duel / Bo1 the GAME picks 1 of each
  player's 3 battlefields at RANDOM (engine move `selectRandomBattlefield`, seeded engine RNG — same seed ⇒ same
  board) and places both at once; there is NO battlefield-choice UI — the mulligan overlay just states
  "Battlefield selected at random: X" (+ the opponent's). Match / Bo3 keeps the manual `battlefield_select`
  picker (486.5). Sandbox is unchanged: its solo picker offers Bo1 (random) or Bo3 (manual pick).
- **Match (Bo3) pregame ORDER** — battlefields FIRST, then who goes first, then the hand (rules 113 → 117):
  `battlefield_select` (113 / 486.5; game 2–3: battlefields used in a game somebody won are shown disabled "Used this
  match" and refused, 486.5) → `sideboard` (game 2+ only) → `initiative` (115: game 1 = the d20 roll overlay
  `#coinOverlay` shown AFTER both battlefields are locked — never before Play like a Bo1; games 2–3 = the previous game's
  LOSER chooses "I'll go first / Opponent goes first" (`#initiativeStep`), a bot chooser elects to go first) → hands drawn
  (116) → mulligan (117). The battlefield picker therefore never says who goes first ("First player is decided after
  battlefields are locked"). Bo1 keeps its order (lobby roll → random battlefields → mulligan).

## Match play (Bo1 duel / Bo3 match) — apps/riftbound-app/server/match.ts, public/js/gameplay/match.js
- Sidebar header: Bo3 shows a chip "Bo3 · Game N · a–b" and TWO buttons **Concede game** (opponent wins this game, match
  goes on unless that decides it) and **Concede match** (ends everything now); Bo1 shows one **Concede**. Each opens a
  confirm (`#confirmConcede`) whose title/text names WHICH ("Concede game 2?" / "Concede the match?"). The engine's
  `concede` entry is no longer listed under "Other" in the actions panel.
- Game over in a Bo3 that is not decided: `#gameOverBox[data-format=bo3][data-decided=0]` — "Game N · Best of 3",
  Victory!/Defeat for THIS game, VP boxes, "Match: You a–b Opp", **Continue to game N+1** (`#goContinueBtn`; both humans
  must continue, any one seat in a sandbox; "Waiting for your opponent to continue…") and **Leave match**. Continue ⇒ the
  next game's pregame (battlefield pick) replaces the box; NOTHING of the previous board survives; Rewind cannot cross it.
- Match decided (2 wins, or a match concession, or any Bo1 game end): `data-decided=1` — "You win the match!" / "X wins the
  match" (+ "— X conceded the match"), **Back to menu** (`#goMenuBtn`) and **Rematch** (`#goRematchBtn`, all humans; new
  match, game 1, 0–0, registered decks). A match conceded BETWEEN games shows the same box over the (dropped) pregame.

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
