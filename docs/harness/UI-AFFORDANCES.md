# Riftbound web client — move-kind → UI affordance table

Every move kind the engine can enumerate for the viewing player must have a
discoverable, human-labelled control where a player looks for it (the card's
own action bar and/or a named sidebar section), and using it must dispatch
exactly that move. This table is backed by
`packages/riftbound-engine/src/__tests__/harness-browser/affordances.test.ts`
(gated: `RB_BROWSER_TESTS=1 bun test packages/riftbound-engine/src/__tests__/harness-browser/`),
which drives the live app through `BrowserBackend` and asserts selector + label + dispatched params.

Label rule everywhere: never a raw id (`playFromChampionZone`, `create-token 4`,
`player-1-main-12-…`, `resolvePendingChoice (2 options)`); costs are named where a
choice costs something.

## Moves

| Move kind | Where it appears | Selector(s) | Label rule | Status (before → after this audit) |
|---|---|---|---|---|
| `endTurn` | sidebar **Turn Actions**; `Space` when nothing to pass | `#actionsList .action-btn.primary` "End Turn" | fixed text | OK → OK (test: basics) |
| `concede` | sidebar **Other** | `#actionsList .action-btn` "Concede" | fixed text | OK → OK |
| `exhaustRune` | click the rune; sidebar **Rune Actions** grouped by domain | `.rune-stack .card[data-zone=runePool]`; `#move-group-exhaustRune .action-btn` | "Fury Rune (2 available)" | OK; expanded group could sit below the fold of a 220px panel → panel 340px + scrollIntoView, asserted not clipped |
| `recycleRune` | right-click the rune (ready rune auto-taps first, `+1` float); sidebar group split ready/exhausted | `contextmenu` on rune → `quickRecycleRune`; `#move-group-recycleRune` | "Chaos Rune (ready) (2 available)" | OK → OK (test asserts tap-then-recycle: rune → rune deck, energy +1) |
| `playUnit` (base, single variant) | click / drag hand card → base; sidebar **Play Cards** row per card | `#player-hand .card.playable`; `#actionsList` "Play Unit — <name> to base" | card name + destination | OK → OK |
| `playUnit` (battlefield / Accelerate / other optional costs) | click hand card → **play-options modal**; drag to base *or to a lit battlefield*; sidebar "Play <name> — N play options…" | `#choiceOverlay[data-mode=playCost] .choice-modal-btn[data-variant-idx]`; `.battlefield.valid-target[data-drop-zone]` | "Play to base — 2 energy" / "Play to <bf>" / "Play + Accelerate to base — 2 + 1 energy + fury — enters ready" / "+ sacrifice X" / "+ discard X" / "+ pay N XP" / "+ exhaust legend" | modal OK; **hand→battlefield drag did not exist**, raw `battlefield-…` location in single-variant rows → drag targets lit battlefields, `location` humanised |
| `playSpell` (untargeted) | click hand card = cast; sidebar row **per card** | `#actionsList` "Play Spell — <name>" | card name (+ "(Repeat ×n)" / "(+ additional cost)") | **two different spells collapsed into "Play Spell (2 options)"** → one row per card |
| `playSpell` (targeted / multi-target / up-to-N) | click hand card → **targeting mode**: legal targets glow, banner "Choose a target for X — Esc to cancel", buttons "No target" / "Done (n)" / "Repeat xN" / additional-cost; sidebar "<name> — N targets…" enters the same mode | `body.targeting-mode`, `.valid-target[data-card-id]`, `#targetBanner.visible .target-banner-btn`, `#actionsList [data-target-play]` | banner names the card; glow set == engine target set (asserted) | OK → OK |
| `playSpell` (modal "Choose one —") | printed variant is cast; the engine's `choose-mode` prompt (at play or resolution) shows one button per mode | `#choiceOverlay[data-mode=pending] .choice-modal-btn` | server `optionLabels` → printed bullet; fallback renders the effect ("Counter a spell", "Play 4 1 Might Bird unit tokens with Deflect") | OK since 3355e24; fallback asserted |
| `playGear` | click hand card; drag Equipment onto a unit = play attached | `#player-hand .card.playable`; unit under pointer `.drag-over` | card name | OK → OK |
| `equipCard` ([Equip] a board Equipment, rule 476.1) | **card bar** "Equip [fury] → choose a unit" → targeting over legal units; **drag** the Equipment onto a unit; sidebar **Abilities** "Equip — <gear> — Equip [cost] → choose a unit" | `#actionBar [data-equip]`; `.valid-target`; `#actionsList [data-target-play]` | printed Equip cost + names | **missing entirely (raw "equipCard Serrated Dirk, Void Hatchling" under Other; board click did nothing; not glow-playable)** → fixed, asserted end-to-end |
| `hideCard` (rule 723) | targeting banner extra button "Hide at <bf>"; play-options modal row "Hide at <bf> — facedown…"; drag hand card onto the held battlefield; sidebar **Play Cards** "Hide Card — <card> at <bf>" | `#targetBanner .target-banner-btn`; `#choiceOverlay .choice-modal-btn[data-hide-idx]`; `#actionsList` | names card **and** battlefield | **only a sidebar "Hide Card (2 options)" group with "at <bf>" (no card name); no on-card path** → fixed |
| `revealHidden` | click the facedown card at the battlefield → bar "Reveal (play for 0)" (greyed "— not yet (from your next turn)" the turn it was hidden); sidebar **Abilities** "Reveal Hidden — <card>" | `.bf-facedown [data-card-id]` → `#actionBar button`; `#actionsList` | names card | **facedown card click did nothing** → fixed |
| `playFromChampionZone` | click champion → bar "Play Champion to Base" / "…to <bf>" (2+ cost variants → play-options modal); drag to base / lit battlefield; sidebar **Play Cards** "Play Champion — <name> to base" | `#actionBar [data-champion-play]`; `#actionsList [data-play-cost-card="__champion"]` | "Play Champion …" + destination | **bar button read `playFromChampionZone`; sidebar row `playFromChampionZone base` under Other** → fixed |
| `standardMove` (single unit) | click unit in base → bar "Move to <bf>" per destination + battlefield glow; drag unit → battlefield; sidebar **Movement** | `#actionBar .action-bar-btn`; `.battlefield.valid-target`; `#move-group-standardMove` | battlefield names | OK → OK |
| `standardMove` (multi-unit) | sidebar **Movement** group lists each unit set: "A, B to <bf>" | `#move-group-standardMove .action-btn` | unit names + destination | sidebar-only (no multi-select gesture) — unchanged, labelled |
| `gankingMove` | click unit at a battlefield → bar "Gank to <bf>"; drag bf→bf; sidebar "Ganking Move — <unit> to <bf>" | `#actionBar`; `#actionsList` | names | OK → OK (asserted) |
| `recallUnit` | click unit at a battlefield → bar "Recall to Base"; sidebar | `#actionBar`; `#actionsList` | fixed text | OK → OK |
| `activateAbility` (unit / gear / legend) | **card bar** button = printed "COST: effect" text (one per ability) → targeting when targeted; sidebar **Abilities** "Activate Ability — <card> — <COST: effect> — N targets…"; a printed ability with **no legal move** still shows on the bar, greyed, with the reason ("Already exhausted" / "Can't pay its cost right now" / "Only on your turn" / "Only Reactions while the chain is open") | `#actionBar .action-bar-btn[data-ability-group]`, `[data-ability-disabled]`; `#actionsList [data-target-play]` | printed ability text, never "Activate Ability N" | labels OK since 422f088; **legend with no move was inert (no pointer events, no reason)** → greyed-with-reason; gear bar said "Unit:" → "Gear:/Equipment:" |
| `passChainPriority` | chain overlay "Pass (Space)"; `Space`/`A`; sidebar "Pass Priority"; header "You have priority — react or pass (Space)" (gold when it is the opponent's turn) | `#chainOverlay.visible .chain-pass-btn`; `#sidebarHeader .game-status[data-cursor]` | — | OK; **header said "Waiting for <opponent>" while we held priority** → cursor-aware header |
| `passShowdownFocus` | battlefield showdown panel "Pass Focus (W)"; `Space`; sidebar "Pass Focus"; header "You have focus — act or pass (Space)" | `.battlefield__showdown-btn--pass` | — | OK → OK (+header) |
| `resolveChain` / `resolveFullCombat` / `conquerBattlefield` / `endShowdown` | chain box "Resolve"; showdown panel "Conquer (Q)" / "Cancel"; server auto-resolves combat | existing | — | unchanged |
| chain contents | chain overlay item rows: name, controller, spell/trigger, **what it does: mode text and "→ target names"** | `#chainOverlay .chain-item [data-chain-what]` | humanised effect / chosen mode + target names | **items showed only name/type** → targets + mode shown |
| `resolvePendingChoice` — every prompt type | **choice modal** (`#choiceOverlay[data-mode=pending][data-pending-type]`) titled per type; sidebar mirrors title (`[data-pending-type]`) + buttons (`[data-pending-pick]`); board picks glow and the backdrop is click-through | see below | see below | see below |
| … `opt-in` (rule 583) | Yes / No; title "Use <card> ability? (pay 2 energy, fury)"; Accelerate-from-trash: "Pay — enters ready" / "No — enters exhausted"; counter ransom | `.choice-modal-btn[data-other-idx]` | cost named in title | OK (+ accelerate/ransom titles) |
| … `confirm` (355.13) | Yes / No; title = prompt | same | prompt text | **title fell back to "Choose a card"** → prompt |
| … `choose-target` | card tiles (role=button, keyboard Enter) + board glow, backdrop pass-through; "any number": Done; split damage: one button per split "A 2 · B 1"; RPL "Which effect saves X?" | `.choice-modal-card[data-pick-idx][data-card-id]`, `.valid-target` | card names; tokens get a named fallback tile | OK; tiles were plain divs → role=button/tabindex |
| … `choose-destination` (355.4) | "Base" / battlefield names / "Don't move" (optional) / "(pay additional cost)" | buttons | zone names | title now names the unit |
| … `choose-mode` (355.3/355.8) | one button per mode | buttons | printed bullets / rendered instruction | OK |
| … `reveal-and-pick` (look / reveal hand) | every looked-at card shown (ineligible dimmed), "Decline" when optional, pick cost in subtitle | tiles + `Decline` | names | OK |
| … `name-card` (762) | one button per legal name **+ filter box** when > 12 | `.choice-modal-filter`, buttons (scrolling list) | names | hundreds of buttons unfiltered → filter |
| … `choose-player` | one button per seat | buttons | player display names | **"—"** → names |
| … `combat-damage` (465.2.c) | title "Assign N combat damage at <bf> (attacker)"; the units shown as context tiles; one button per legal assignment "Unit 2 · Other 1" | buttons + `.choice-modal-card-context` | names + amounts | **title "Choose a card"** → fixed |
| … `weaponmaster-equip` | equipment tiles + "Don't equip"; title names the unit | tiles + button | names | **"No" / "Choose a card"** → fixed |
| … `pay-x` | **stepper** − X + and "Pay N" over the enumerated amounts | `[data-x-step]`, `[data-compose-confirm]` | "X = n" | **buttons labelled "—"** → stepper |
| … `order` (372 die-order / 383.3.d) | **sequence chooser**: click items in order (numbered), "Confirm order (A → B)", "Reset", "Keep listed order"; > 4 items sends the composed permutation (engine validates) | `[data-seq-key]`, `[data-compose-confirm]`, `[data-compose-default]` | item labels / card names; die-order title "<dying card>: Order the replacement effects…" | permutation buttons only → chooser |
| … `order-cards` (386.2 Predict) | same sequence chooser, "first = top of deck" | `[data-seq-key]` | card names | **"—" buttons** → chooser |
| … `pick-many` (373 die-assign / 355.11.b) | **checkbox chooser** with min/max, "Done (n)" enabled only in range, "None" when min = 0; title "<source>: Choose which death this replacement effect applies to (1)" | `[data-check-key]`, `[data-compose-confirm]` | option labels / card names | subset buttons only → chooser |
| trigger order (383.3.d, soft) | **sidebar panel** (not a modal — nothing is blocked): "Order your simultaneous triggers … (optional — any other action keeps this order)" + one button per offered order; needs `pendingTriggerOrder` in the snapshot (server/snapshot.ts) | `#actionsList [data-trigger-order]`, `[data-trigger-order-pick]` | "A trigger → B trigger" | **raw group under Other** → panel |
| sandbox meta (`addToken`, counters, buffs, resources ±, peek dialog) | token `+` panels, meta-actions panel, resource bar ±, right-click deck | existing | — | unchanged (out of scope) |

## Layout invariants (DESIGN.md §Board layout) — asserted at 1440×900 and 1920×1080

| Invariant | How it holds now | Status |
|---|---|---|
| Legend/Champion always visible, never under runes (both players) | player hand/rune row has a content-independent basis (`flex: 0 1 264px`); `renderRuneStacks` compresses the fan to the row's real height; opponent pile is compact (70×98) and the opponent hand 80% size, which hands the height back to the player's row | was: pile clipped at the bottom / (earlier) painted over the legend → fixed, asserted (no overlap, no clipped rune, every rune hittable) |
| Rune-stack cards ≈ hand-card size | player runes stay 110×154 logical | OK |
| Exhausted = rotate 90° + dark overlay everywhere | `.card.card--exhausted` in base **and** battlefield rows (asserted via computed transform + ::before); `monkey-drive.ts` stale `[id^="bf-"]` selector → `#battlefieldRow .battlefield .card.card--exhausted` | OK; driver fixed |
| Actions panel never clips an expanded group | `max-height: 340px` + `toggleMoveGroup` scrolls the group into view; asserted no clipped sub-button | 220px panel hid expanded rune options → fixed |
| Battlefield unit rows show whole cards | asserted the unit at a battlefield is not clipped by its row | OK |
| VP badge = effective victory score (Aspirant's Climb +1) | `victoryScoreEffective[pid]` from the server | OK (asserted "1 / 9") |
| Chain overlay shows item mode/targets | `[data-chain-what]` | fixed |
| Prompt modal never hidden behind zoom / hover preview | opening any prompt / play-options modal closes the zoom and the floating preview; zoom refuses to open over a modal | OK (asserted) |
| Whose-cursor banner | sidebar header names priority / focus / prompt holder; gold when it is ours on the opponent's turn | new |

## Known engine-side gaps surfaced by the audit (not UI)

* `activateAbility` for Blind Monk (`ogn-257-298`, cost `[1], [Exhaust]`) is enumerated with 0 energy in the pool — the UI can only grey out abilities the engine does *not* enumerate.
* `equipCard` is enumerated while the chain is open (rule 476.1 is a discretionary action; expected only at main-phase timing).
* `revealHidden` params carry no targets; a Hidden spell with targets is targeted by the follow-up prompt (fine, noted for the harness).
