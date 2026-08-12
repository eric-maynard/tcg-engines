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
  then plays. Consequence: the set of legal targets is pool-only too — except that a [Deflect] unit whose surcharge
  a rune Add could still fund IS offered (dimmed, unselectable until paid: see the surcharged-pick bullet below).
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
- SURCHARGED target picks (`choose-target` / `pick-many` with `deflectTax` — a [Deflect] tax, 809.1.c.1, or a
  keyword surcharge a static imposes) work the same way, gated at PICK time rather than filtered at raise time.
  Every candidate whose surcharge is reachable stays in the option list carrying `surcharge` and, while the pool is
  short, `needsAdd {energy, power, reason}`; the ANSWER is what gets refused (state untouched) until the pool covers
  it. `promptPayableCost` counts these prompts as Pay steps, so rune Adds stay legal with the prompt open and every
  Add re-derives each option's payable state (`moves/prompt-cost.ts surchargedOptions` / `surchargePayability`, used
  by all six producers). A multi-target set is priced as a whole, so a second pick can be unaffordable where the
  first was fine (355.14.d). Still pool-only in the one way that matters: a surcharge NOTHING could fund is not a
  legal choice at all (809.1.d) and that candidate is dropped, exactly as an unfundable "yes" is only declinable.
  The app shows an unaffordable target dimmed with "needs [A] — recycle a rune", never hidden.
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

## Choices and when they are made (2026-08-12; do not re-litigate)
Every card that asks "is this choice made at finalization or at resolution?" gets the SAME answer, and it is not a
per-card judgement call. **A specific Game Object that the item's own text tells its CONTROLLER to choose is chosen
in the Make Relevant Choices step — step 2 of playing a card (355.5) or of finalizing an ability (402.2) — and
locked there (355.15).** Resolution never re-chooses it.

There is no separate "resolution-time choice" doctrine to weigh against that. Rule 355.10 is a CLOSED list of
carve-outs, and a choice reaches resolution only by matching one of them:

| carve-out | rule | what defers, and to whom |
|---|---|---|
| the object sits in a non-Public zone | 355.10.a / 355.10.a.1 | hand, deck, banishment. **Trashes, bases, battlefields, Legend/Champion/Facedown zones are PUBLIC**, so "recycle cards from trashes" and "a spell in a trash" are ordinary targets chosen at finalization. |
| named only as a restriction on another choice | 355.10.b | "at a battlefield" in *"kill a unit at a battlefield"*. But *"kill ALL units at a battlefield"* targets the battlefield. |
| part of a cost / trigger condition / replacement | 355.10.c, 355.10.c.1 | "[do X] to [do Y]" — X names nothing. Note costs are paid in step 4, AFTER the step-2 choices (357.2). |
| programmatic — criteria, not selection | 355.10.d, 355.10.d.1 | "each unit here", "all gear". **355.10.d.2: being the only legal option is NOT programmatic** — see the section below. |
| chosen wholly or partly by another player | 355.10.e | "each player kills a unit they control" — each player picks as it resolves. |
| an instruction a player "must" complete | 355.10.f | "you MUST recycle one of your runes". Contrast "recycle a rune you control", which targets. |
| a trigger the finalizing item generates | 355.5.b | delayed / reflexive triggers make their own choices when THAT ability is finalized, not now. |
| the choice depends on what an earlier instruction of the SAME resolution produces | 355.16 | "discard a card; if it was a unit, …" — the branch is not knowable yet, so nothing inside it pre-locks. |

Two things that look like deferrals and are not:
- **"You may <verb> a <descriptor>" defers the DECISION, never the OBJECT.** Rule 355.12 is explicit: if a spell says
  a player may perform a Game Action on some number of Game Objects, *all choices are considered targeted and chosen
  independently of the decision to perform the Game Action.* So Relentless Pursuit's Equipment, Zenith Blade's
  friendly mover and Moonfall's "up to one enemy unit" are all named as the card is played; only the yes/no waits
  (383.3.a.3 / 204.3.b for the trigger form).
- **Move destinations are choices of PLAYING** (355.4), one per Move the item will perform, valid = a location other
  than the mover's current one (355.4.a). "That unit's battlefield" is resolved and frozen at that instant; it is
  never re-derived at resolution.

What genuinely IS left for resolution, and nothing else: how much of a split is dealt to each already-chosen target
(355.14.e / 355.14.h), choosing a legal SUBSET of the original targets when a group restriction broke (355.11.b),
and the "you may" decision itself. Everything the chosen set does then runs under 359.3.e — an illegal target is
simply unaffected (359.3.e.5) and is **never replaced** (355.15); a newcomer can never be added.

**Playability follows from the same rule, at the front.** 355.8 / 402.3: valid choices must exist for *all* targets
before the item can go on the chain — so a card with no legal option for a REQUIRED choice is absent from the
offered set, not offered-then-rejected. "Up to N" / "any number" may legally be answered with zero (355.13) and so
never blocks a play. This is why Relentless Pursuit is unplayable with no friendly Equipment and Shuriken Flip is
unplayable with no friendly unit. For a triggered item that has no legal choice, 402.4 removes it from the chain
(and 402.4.a: that is not being countered).

Engine shape: `play/make-choices.ts` is the single enumerator — it walks an item's effect tree once and returns the
ordered `ChoicePlan`, each entry tagged `PLAY` / `FIN` / `RES` with the rule that put it there. Every raiser
(`play-time-modes.ts`, `play-time-destinations.ts`, `abilities/target-slots.ts`) reads that plan rather than
re-deriving its own answer, and the harness `Decision.timing` is the entry's tag. When a plan entry grows
affordability state it reuses the fleet vocabulary rather than a second one — `needsAdd {energy?, power?, reason}`
from `harness/types.ts`, `reason` built with `decision.ts describeShortfall`, reachability only from
`cost.ts reachableRuneAdds` — and keeps `payableNow` distinct from `reachable`, because a 402.2 auto-bind of a sole
option may only use `payableNow` (auto-binding a merely *reachable* option would commit a payment behind the
player's back).

### Two different shapes name a second object — do not try to unify them
A spell that names MORE than one caster-chosen object comes in two structurally different forms, and the
Make-Choices step covers only the first. Keeping them apart is deliberate; folding the second into the general
mechanism turns it into a pile of special cases.

- **A descriptor nested under a follow-up clause** (`move.then…`) — sfd-184-221 Relentless Pursuit's Equipment.
  The second object hangs off the FIRST instruction ("…to IT"), so it has no positional slot of its own. This is
  what `make-choices.ts collectNestedDescriptorSlots` finds and `bindNestedDescriptorSlots` stamps as `_bound` on
  its own node, recorded on the item as a `targetSlots` entry so `stripSlotIds` keeps it out of `boundTargets` and
  `legalBoundIds` re-checks it at resolution. General: it works for any follow-up naming anything new.
- **A two-SLOT sequence** — ven-140-166 Shuriken Flip ("Deal 2 to up to one enemy unit at a battlefield, THEN move
  a friendly unit"). Both objects are ordinary positional slots of a `sequence`; what made it hard is that the
  OPTIONAL slot is the lead and the mandatory one is second, which the enumerator's `secondTgt` admission did not
  allow (`leadOptional` now does), and that a skipped "up to one" slot compacts the flat list so `moverForNode` has
  to map surviving picks onto the MANDATORY slots rather than positionally. That is sequence-slot bookkeeping in
  `play-spell.ts` / `play-time-destinations.ts`, not a nested-descriptor problem, and the nested mechanism does not
  and should not subsume it.

Both end in the same place — every object named at play, locked by 355.15, re-checked at resolution — which is the
point. They just get there through different code, because the effect trees genuinely differ.

### The verdicts, so these ten cards are not re-argued (settled 2026-08-12)
Every row below follows from the table above; the "why" column names the carve-out that does or does not apply.

| card | verdict | why |
|---|---|---|
| Zenith Blade ogn-262-298 — "You may move a friendly unit to that enemy unit's battlefield" | mover FIN (355.12); anchor FROZEN at play (355.4 / 355.15) — **implemented**, `lockTargetBattlefieldDestinations` | the anchor answers WHERE, never WHETHER: with the linked stun ignored the move is still ignored (359.3.e.14.a) |
| Relentless Pursuit sfd-184-221 — "You may attach an Equipment … to it" | unit AND Equipment both FIN; **no friendly Equipment ⇒ unplayable** (355.8) | 355.12 — "you may" defers the decision, not the object; ruling 4283ca02526c0650 agrees |
| Shuriken Flip — friendly mover + destination | both locked at play; **no friendly unit ⇒ unplayable** | same 355.12 + 355.4 pair; ruling b6531d2345e9ef12 |
| Moonfall unl-198-219 — "Choose a battlefield … up to one enemy unit … enemy units there −2" | anchor FIN and gating; mover FIN, non-gating (355.13); the −2 is programmatic and prompts nothing | 355.10.b names the battlefield a target; 355.10.d silences the −2 |
| Forge of the Future ogn-212-298 — "Recycle up to 4 cards from trashes" | set FIN, before the kill-cost is paid (357.2) — the Forge can never be its own target | **trashes are Public (355.10.a.1)**, so 355.10.a does not apply. riftjudge `2f2fb3a61bb3446a` says resolution and is NOT followed |
| Drag Under sfd-164-221 played by a conquer trigger | the trash spell is a TARGET of the trigger, named at finalization | 355.10.a.1 again |
| Deceiver — "It becomes a copy of another unit there" | copy source FIN on the trigger | a chosen board object; no carve-out applies |
| Reflection ruling 40ecc1be71f6fc76 | the token is minted FIRST, then the reflexive "becomes a copy" item makes its OWN choice | 355.5.b — a trigger the item GENERATES never makes its choices during the parent's finalization. Not a contradiction of the Deceiver row: different card shapes |
| Angle Shot sfd-011-221 — "attach … or detach …" | a mode (355.3), so it must be MADE — a cast naming none is asked, never silently resolved as a detach | 355.10.d.2 — one legal half is still a choice |
| Dragon's Rage ogn-258-298 — "Then choose another enemy unit at its destination" | the follow-up AND the destination stay `RES` | the only follow-up shape that legitimately defers: its candidates are whoever stands there at resolution (ruling 25b00b80ac336276) |

## A sole legal option is still a choice (355.10.d.2)
Rule 355.10.d.2: **being the only valid choice does NOT make a selection programmatic.** So the engine never
short-circuits a choice down to "there is only one, take it" — a lone legal target/destination/mode/payer/recipient
raises the same prompt as five of them, flagged `soleOption: true` on the `pendingChoice` (and on the harness
`Decision`). Consequences that would be LOST by auto-binding and are the reason for the rule: the object is still
TARGETED, so "when you choose me" (355.14.d / 359.2) fires, the [Deflect] surcharge (809.1.c.1) is incurred at pick
time, and where the choice is declinable the player may still decline it.
- **UI**: a sole-option prompt is a one-click confirm — the single candidate is shown highlighted with
  **Confirm** / **Cancel**. Cancel = decline for an optional choice, or "choose nothing" where that is legal;
  a mandatory sole-option prompt has Confirm only.
- **NOT a choice, so NOT prompted** (355.10.d): a *programmatic* selection — "each unit", "all units with 2 or less
  Might", every effect whose object set is the whole of a description rather than a selection from it. Those keep
  resolving silently; do not "fix" them by adding a prompt.
- **Combat damage** stays the one deliberate exception, and it is not an exception to 355.10.d.2: rule 465.2.c.3
  gives the assigning player the choice "whenever more than one legal assignment exists", so a side facing a single
  opposing unit has no selection to make at all. Effect splits (355.14.e — "deal 5 split among …") DO prompt with a
  single surviving recipient, because there the recipients were chosen and the division is still the chooser's.
- **Automated drivers** (bot, goldfish auto-play, the ~27k harness tests) do not need the click: `EngineBackend`
  answers a `soleOption` prompt with its one option the instant it is raised, and `settle()`'s passive policy does
  the same — the same answer Confirm gives. Build a scenario with `.interactive()` to see the prompt instead. The
  gate is that flag, never the option count.

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

## Combat Resolution Step (466) — two settled adjudications (2026-08-12; do not re-litigate)
The Resolution Step is an ORDERED sequence and the engine follows its numbering literally: 466.1 Combat Cleanup
(which inserts only "3c. Heal all Units" and "3d. Recall Attackers …", 466.1.a.1-2) → 466.2 resolve the chain from
the damage step and the Cleanup → 466.3 Determine Combat Result → 466.4 resolve the result's own triggers → 466.5
Establish Control / Conquer → 466.7 Combat ends. Two questions keep coming back; both are closed:
- **Designations (and [Assault]) are STILL LIVE at the Conquer.** 466.5.d Conquers at step 5; only 466.7.a — two
  steps later — removes the Attacker/Defender designation, and 807.1.d.1 keeps [Assault] in effect for exactly as
  long as the designation lasts. So a unit that is [Mighty] (708/710) only via [Assault] does satisfy a conquer
  ability such as Sunken Temple's. Nothing in 466.1 strips designations. FOUR riftjudge answers say otherwise —
  `42b466db3f308240`, `c1e05840717871da`, `c1edab45ab8d7f0f` and `7412ece9e8248139` (none of them cites a rule; the
  middle two are the same FAQ-list claim); they describe the PRE-Unleashed rules, where combat Might was modulated
  for the damage step only (2025-06-02 CR 625.1.b / 627). riftfaq `8bf06d3d8b09e32c` cites 466.5.d vs 466.7.a and
  `f04d5265ef4cdef8` states the change ("previously, Assault would have deactivated before conquer effects
  resolved"); `211635a4cca0ac5a` agrees. All three stripping tests carry `// RULING-CONFLICT` and assert the CR.
  (Unchanged and correct: a unit walking onto an EMPTY battlefield never gains the designation at all — 464.2.c.3 —
  so it gets no [Assault] bonus there. That half of `42b466db3f308240` is right.)
- **A delayed "kill it" resolves BEFORE the combat result is read.** Imperial Decree ("when any unit takes damage
  this turn, kill it") is a delayed TRIGGER (390.2), not a delayed replacement (390.3): the damage is dealt and the
  kill is a separate chain item produced by dealing combat damage. 465.3 ends the damage step by skipping FEPR, so
  that item rides into the Resolution Step; 320/320.1 only say it cannot resolve *inside* a Cleanup; 466.2 then
  requires exactly those items to resolve before 466.3, whose text reads occupancy "during this step". So the kill
  lands first and a defender that the Decree removes never wins the combat (466.3.d No Result → 466.5.b
  Uncontrolled) — nobody draws. riftjudge `5140bd0235c38037` says the opposite (result read while the kill is still
  Pending, draw stacked on top, LIFO); it is annotated `// RULING-CONFLICT` and NOT implemented, because reading the
  result while the damage-step chain is live contradicts 466.2 generally — the same window is what lets a Deathknell
  change who is standing here at 466.3 (`kogmaw-dk-spares-3d-recalled-attackers`).

## Community rulings settled against the CR (2026-08-12; do not re-litigate)
A rules-adjudication pass took the 17 parked ruling-vs-CR items out of the fix queue
(`.claude/skills/engine-playtest-observer/CONFLICTS-ADJUDICATED-2026-08-12.md` has the full table). Ten were
riftjudge answers the current Comprehensive Rules supersede; their facets are now PASSING tests that assert the
engine, each carrying a `// RULING-CONFLICT` note and a "previously asserted the opposite, do not flip back" line.
The recurring shape is the one already seen for `fiora-peerless` and the 466 pair: the community answer describes
pre-Unleashed text, or it is contradicted by a *second* riftjudge answer, and the CR names the discriminator.
- **[Legion] never fires off its own card.** 812.1.c: the Dependent Ability is Active only while "a card DIFFERENT
  than the one with the Legion ability has been Finalized by you on the same turn" (812.1.b.1 "another card"). So
  Sun Disc's own play never satisfies it, and with no other play the ability is not on the card at all — it cannot
  be tapped "for no effect". `4bd896c444b3c607` says both of those things and is wrong on both.
- **No kill ⇒ no draw.** "Kill a unit at a battlefield. Its controller draws 2" is the CR's *own* example twice
  over: 355.10.d ("targets the unit, but not its controller") and the Hidden Blade example under 359.3.e.5 ("any
  instructions related to that unit are ignored"), with 359.3.e.12 making "its controller" read null. Contrast
  Void Seeker's "Draw 1", which names no referent back to the target and still happens. `719c8ada539c1401` is wrong.
- **A card played mid-resolution is Pending, not inlined.** 354.3 stops its further steps until the current
  resolution ends; 337.1/337.1.b then finalize the pending items in append order and 337.4 gives the next item's
  controller Priority — so it *is* counterable, and a play trigger appended later is newer and resolves first
  (340.1). `95688f6f6f4b0da4` denies both; riftjudge `22ed336a9af8edc9` agrees with the CR.
- **Designations are stamped when the showdown BECOMES a Combat Showdown, not when it closes.** 323.14 converts the
  running Non-Combat Showdown; 464.2 defines that conversion as combat opening; 464.2.c.3 stamps
  Attacker/Defender "now"; 464.2.c.1.b explicitly contemplates combat opening into a showdown already running.
  `33552d2333fd187b` is right that the showdown does not end early and wrong that nobody is designated yet.
- **[Ambush] grants LOCATION validity separately from TIMING.** A card's own "you may play me to its battlefield"
  clause is a location permission (822.3.a); the Reaction speed comes from Ambush and is conditional (813.4), so if
  the play's additional cost empties the destination the condition fails at step 5 Check Legality and the play is
  undone (813.4.b, 822.3). `7c7de024a0a95e9c` wants the Wolf in anyway; official ruling `57b3e2849ef0109a` and the
  CR agree it cannot be.
- **"Up to one X" is satisfied by zero** (355.13) — post-errata Salvage keeps the empty target set on the menu;
  `eea5054e0caa29a0` describes the pre-errata "you may kill a gear" wording.
- **Not every ruling clash is a clash.** Elder Dragon's three answers all hold at once: 142.4.c alters lethal damage
  only "for enemy units that have damage marked BY YOU", so who marked the pre-existing damage decides it. A repro
  that seeds damage with no attributor is testing neither case.

## Open rules questions (need a human or an official ruling)
The tree is self-consistent without answers to these — each is already implemented one way and pinned by tests. They
are listed because an official answer would *change* something, and because re-deriving them has cost real cycles.
1. **Hidden Blade's linked draw.** "Kill a unit at a battlefield. Its controller draws 2" — when the unit is saved,
   is the draw an *independent* instruction (like Void Seeker's "Draw 1", so it still happens) or an instruction
   *related to the illegal target* (so it is ignored)? Engine + 33 facets say ignored, on 359.3.e.5's own Hidden
   Blade example; riftjudge `719c8ada539c1401` says it still draws. This is the single closest call in the set.
2. **Deceiver's "another".** "Play a ready Reflection unit token there. It becomes a copy of ANOTHER unit there."
   The copy source is a target chosen at finalization (§ Choices and when they are made), but "another" is relative
   to a token that does not exist until resolution. Does that make the source choosable at finalization anyway
   (engine's eventual model) or is it one of the 355.16 "depends on what an earlier instruction produced" cases?
3. **A spell named at finalization, played at resolution.** Kai'Sa's "play a spell from your trash" targets that
   spell as the trigger is finalized (355.10.a — the trash is Public). When it is then actually played during
   resolution, does its own play get a normal Make-Relevant-Choices step and priority window, or does naming it at
   finalization pre-bind everything? Eight facets in `drag-under-fizz-no-kaisa-six-points-yes` assume the former.
   Sequencing, not naming, is the open half.

## Who may read a game's state (REST) — decision 2026-08-12, do not change silently

`GET /api/game/:id/state` answers with one of two views (`server/routes-game.ts restSnapshot`):

| session | view | why |
|---|---|---|
| real duel, or vs-Claude | `SPECTATOR` — every private zone (hands, decks, facedown) opaque | two parties, one of them not the caller (108.7.c / 128.4 / 723) |
| sandbox (passive Goldfish, hot seat) | unredacted, the whole table | one human, and it is theirs |

**The decision: the sandbox view stays unredacted.** Per-seat redaction is not "merely stricter" here, it is
wrong: hot seat is *by definition* one human driving both seats, and a solo practice game's other hand belongs to
a bot. There is nothing in that response that is private from its only human.

**What that rests on, and what now enforces it.** The justification is "a sandbox session holds exactly one
human". That was true only structurally — `createLobby` fills `lobby.guest` for every sandbox mode (the bot's
label, or `Player 2` for hot seat) and `POST /api/lobby/join` refuses a lobby that already has a guest. An
assumption that load-bearing under an UNAUTHENTICATED route should not be inferred from two files, so
`snapshot-privacy.test.ts` now pins it: for each sandbox mode a stranger's join is refused `Lobby is full`, and
the non-sandbox lobby (the one that *does* take a second human) is shown taking the SPECTATOR branch.

**Residual risk, stated plainly.** The route has no authentication and `GameSession` has no owner: what protects a
sandbox game today is only that its `gameId` is an unguessable UUID. That is a capability URL, not authorization,
and this app is fronted by a hosted research app that reverse-proxies every path for any authenticated principal —
so anyone who *obtains* the id can read the owner's hand. Nothing currently hands the id out (the 4-letter lobby
code is the only small secret, and joining a sandbox lobby is refused without revealing `lobbyId`/`gameId`), which
is why this is recorded rather than fixed.

**Flip the decision the moment any of these becomes true** — at that point the answer is an owner binding
(`GameSession` records the creating user id, which the lobby already resolves via `getUserIdFromRequest`; the
unredacted view requires that owner, everyone else gets `SPECTATOR`), not per-seat redaction:

1. any endpoint that lists, enumerates or searches games/lobbies;
2. any spectate, replay-sharing or resume-by-link feature (a shared URL is a shared capability);
3. a sandbox session ever holding two humans — i.e. any change that leaves a sandbox lobby's guest seat empty,
   which is exactly what the new test fails on;
4. the app consuming the relay's verified `x-rb-user` identity for anything (once real identity is available at
   the route, "unauthenticated by design" stops being defensible).

Follow-up queue item `64e48c356245` carries the owner-binding work. It is PARKED (`noRequeue`), not abandoned: no
engine lane can finish it, because it needs a human call on what a *null* owner means — local dev runs with no
login, so "deny unless you are the owner" would lock a developer out of their own practice game. Un-park it with
that answer, or when one of the four triggers above fires.
