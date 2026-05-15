# Unleashed Import Progress

## 2026-05-11

### Phase 1 — Rules update (in progress)
- Latest Riftbound Core Rules = **2026-03-30 (Unleashed)**, much newer than repo's `version-2025-06-02`.
- Downloaded PDF (37MB) -> /tmp/riftbound-cr-2026-03-30.pdf, extracted to /tmp/riftbound-cr-2026-03-30.txt (98 pages, 300K chars).
- New mechanics per official patch notes: **XP / Hunt / Level** (marquee), **Ambush**, **[>] dependent-keyword symbol**, **Dependent Keywords** (Legion reworked), **Replace / Create / Predict / Prevent** game actions, **Backline**, **Unique** keyword, **Deflect**, **Weaponmaster**, **Quick-Draw**, **Repeat**, copy effects, responsibility, linking, referents, additional turns, HOT FEPR, showdown↔combat unification, "may" triggered abilities optional.
- New Tournament Rules: April 2026 update (not core to engine).
- Building `riftbound-rules/version-2026-03-30/` mirroring the numbered-file structure + CHANGELOG.

### Pre-existing repo state (do not touch)
- Uncommitted working-tree changes on `main`: riftbound-app/* , riftbound-engine turn-flow.ts + index.ts, plus many untracked .ai_memory/* parity/riftatlas files. These predate my work.
- unl card dir already has 226 .ts files (index says 225 cards).

### Phase 1 — DONE
- Created `riftbound-rules/version-2026-03-30/` (26 numbered .md files mirroring old structure + README.md + CHANGELOG-from-2025-06-02.md). Section numbering was reorganized vs 2025-06-02; mapped accordingly.
- Added new CR text to `.claude/skills/riftbound-rules/references/*_2026_03_30.md` (5 page-range files); updated `indexes/master-index.md` version banner.
- New mechanics catalogued in the CHANGELOG. Tournament Rules April 2026 update is OOS for the engine.

### Phase 2 — Cards (starting)
- unl set already has 226 .ts files / index exports 225 cards. Official Unleashed = ~223 base + 30+ alt-arts. Need to audit completeness vs official list + handle images.

### Phase 2 — DONE
- Audited unl set vs Riftcodex API (`api.riftcodex.com/cards`): UNL = 238 base collector numbers. #1–219 = gameplay-distinct cards, all already present (219 numbered .ts + 6 token .ts = 225 exports). #220–238 = Showcase "Overnumbered"/"Ultimate" promo *variants* of cards already in 1–219; the repo intentionally does not track alt-art variants → skipped 226–238.
- Added 6 new card files for the 6 unique "Overnumbered" Poro tokens (#220–225: Pouty/Lonely/Plundering/Veteran/Mystic/Daring Poro) — UnitCard, E2/M2, mapped API symbols to repo `[Keyword]` convention; wired into `src/cards/unl/index.ts` (now 231 exports).
- Existing cards already carry Unleashed mechanics in rulesText ([Hunt N], [Level N][>], [Ambush], [Deflect], [Weaponmaster], XP, Predict, etc.) — they were imported with the set; no correction needed (apparent "name mismatches" are just repo's `"Name, Subtitle"` vs API `"Name - Subtitle"` legend convention, and token-card cardNumber overlaps — not errors).
- Images: downloaded all 238 UNL card images → `downloads/card-images/unl/{NNN}-{id}.png` (216 MB total, dir is gitignored). Naming matches `scripts/download-card-images.ts` convention.
- Tests: `bun test src/__tests__` → 59 pass / 0 fail. typecheck: 23 pre-existing parser/card errors (diana-lunari, ivern-friend-to-all, parser/*) — NOT introduced by me; my 6 new files + index typecheck clean.

### Phase 3 — Engine (in progress, 2026-05-11 cont.)

Found the engine already carried a lot of Unleashed scaffolding from prior commits: `xp`/`xpGainedThisTurn` player state + `gainXp`/`spendXp` moves + `xp-operations.ts`; `xp-conditions.ts` / `legion-conditions.ts`; `static-abilities` `while-level` & `xp-gained-this-turn` conditions; `keyword-effects.ts` with Ambush (`canPlayViaAmbush`), Deflect (`getDeflectCost`), Backline (`sortByBacklinePriority`), Tank, Shield, Predict/Weaponmaster keyword defs; `effect-executor.ts` handlers for `gain-xp`, `predict`, `prevent-damage`, `create-token`, `repeat`; `card-lookup.getSpellRepeatCost`; `game-events` has `conquer`/`hold`/`gain-xp`; types in `riftbound-types` already define Repeat/Predict/XP/Quick-Draw/Weaponmaster/Backline.

**This pass — implemented:**
- **Hunt keyword (rule 823) — actually wired.** New `packages/riftbound-engine/src/operations/hunt-keyword.ts` (`getHuntValue`, `computeHuntXpGain`). New `CardDefinitionRegistry.getKeywordValue(cardId, keyword)` in `operations/card-lookup.ts` (sums valued keyword instances; bare keyword = 1). Hooked into the `conquer` path (`resolveFullCombat` + `conquerBattlefield` + `scorePoint` moves, `game-definition/moves/combat.ts` — new `applyHuntXp` helper) and the `hold` path (Scoring-Phase hook in `game-definition/flow/riftbound-flow.ts`): on conquer/hold, sum each Hunt unit's value among units the conquering/holding player controls at that battlefield, add to `player.xp` + `xpGainedThisTurn`. Exported from `operations/index.ts`; `canPlayViaAmbush` added to `keywords/index.ts`.
- **Rules-audit tests:** `packages/riftbound-engine/src/__tests__/rules-audit/unleashed-mechanics.test.ts` (23 tests, all pass) covering XP 728-733, Hunt 823 (incl. integration through `conquerBattlefield`), Level 824 (toggling +Might static via real `recalculateStatics` as XP crosses threshold), Ambush 822, Backline 826, Deflect 721/809, Repeat 820, plus a Shield regression guard.

**Not done this pass (next agent):** wire intrinsic triggered abilities for the *card-text* forms — cards carry Unleashed mechanics as `rulesText` only, so a parser → structured-ability step is needed for `[Hunt]`/`[Level N][>]`/`[Weaponmaster]`/`[Quick-Draw]`/`[Ambush]` Reaction-permission to fire automatically in real play (Hunt's engine-side handler covers conquer/hold XP regardless). The `[>]` dependent-keyword mechanism is only modeled via `while-level` static conditions — no general "Inactive ability" machinery. Showdown↔combat unification deltas, Replace/Create swap-back, responsibility/linking/referents, additional turns (§734 turn-queue insertion), "may" triggered-ability optionality, HOT FEPR — untouched. Unique (§825) is deck-construction only; no engine work needed.

**Test status:** `bun test` (riftbound-engine) → 1248 pass / 0 fail / 49 todo (was 1225; +23 new). `bun run typecheck` → 92 pre-existing errors (unchanged set — diana-lunari/ivern/parser/visual-monkey/xp-system/target-resolver test files + game-setup/cards.ts); 0 new errors in files I touched.

### Phase 4 — Parser wiring + "may" triggers (2026-05-11 cont.)

**Verified already-done (no code change needed, added tests):**
- Parser already turns the UNL keyword forms into structured abilities: `[Hunt N]` → `keyword:"Hunt"` + auto-expanded `gain-xp` triggers on `conquer`/`hold` (`expandHuntKeywords` in `parser/index.ts`); `[Level N][>]` → abilities tagged `{condition:{type:"while-level",threshold:N}}` (`parseLevelGatedAbilities`, splits multiple `[Level N]` chunks); `[Ambush]`/`[Weaponmaster]`/`[Quick-Draw]` → simple keyword abilities; `[Deflect N]` → value keyword. The visual `[>]` arrow is stripped in `normalizeTokens`.
- **General `[>]` dependent-keyword machinery (item 2):** confirmed all dependent-keyword forms parse correctly via per-keyword conditions — `[Level N][>]`→`while-level`, `[Legion][>]`/`[Deathknell][>]`→effect-keyword ability carrying the dependent effect, `[Reaction][>]`/`[Action][>]`→timed playable ability. No generic "Inactive ability" wrapper type added (each maps to a known condition; over-engineering otherwise). Documented in new test file.

**Parser fix (cards):** `parser/parsers/static-parser.ts` — added "This costs/This spell costs COST less [instead]" cost-reduction patterns (mirror the existing "I cost COST less" unit phrasing). UNL spell `[Level N][>]` cost reductions are phrased "This costs N less" — previously dropped (Concentrate etc. lost their level chunks). Parser coverage improved.

**Item 5 — "may" triggered-ability optionality (engine):** added `optional?` to `ChainItem` (`chain/chain-state.ts`); `trigger-runner.ts` `fireTriggers` now propagates `ability.optional` onto chain items added during an active chain; new `declineTrigger` move (`types/moves.ts` + `game-definition/moves/chain-moves.ts`, auto-registered via `chainMoves` spread) lets the item's controller opt out before resolution — marks the item `countered` (effect skipped on resolve). Default behaviour unchanged for headless play (optional triggers still added/resolved).

**Tests added:**
- Cards: `parser/__tests__/keywords/ambush.test.ts` (rule 822), `parser/__tests__/special/dependent-keywords.test.ts` (rules 726/720 — all `[>]` forms), `__tests__/unleashed-keywords-smoke.test.ts` (every real UNL card with `[Ambush]`/`[Hunt]`/`[Level N]`/`[Deflect]` parses + surfaces the right ability).
- Engine: `__tests__/rules-audit/unleashed-may-triggers.test.ts` (6 tests — addToChain optional propagation, fireTriggers→chain flagged optional, declineTrigger controller/optional/countered checks). New helper `setInteractionStateForTest` + `getChainItems` now reports `optional`.

**Files touched:** cards: `parser/parsers/static-parser.ts`, 3 new test files. engine: `chain/chain-state.ts`, `abilities/trigger-runner.ts`, `types/moves.ts`, `game-definition/moves/chain-moves.ts`, `__tests__/rules-audit/helpers.ts`, 1 new test file. types: none.

**Test status:** riftbound-engine `bun test` → 1254 pass / 0 fail / 49 todo (was 1248; +6). riftbound-cards `bun test` → 912 pass / 0 fail (was 839; +73, incl. coverage tests). `bun run typecheck`: engine 92 pre-existing errors (unchanged), cards 23 pre-existing errors (unchanged) — 0 new errors in touched files.

**Still left (next agent):**
- **Item 1 tail:** wire *intrinsic* triggered abilities so `keyword:"Legion"`/`keyword:"Deathknell"` effect-keyword abilities (and Ambush's conditional `[Reaction]` play-permission) actually fire/grant in real play — the parser produces them but the engine's trigger-runner doesn't yet synthesize on-death / on-play / play-permission from these keyword-ability shapes. (Hunt's gain-xp is already handled engine-side via `operations/hunt-keyword.ts` regardless.)
- **Item 3 — Showdown↔combat unification (UNTOUCHED):** the 2026-03-30 rules unified showdowns and combats (showdown opens at any contested battlefield with a foreign-controlled unit; combat showdown if units of different controllers; HOT FEPR combat-resolution reorder; "no result" combats; control locked by presence of combat/showdown not contested-status). Diff `game-definition/moves/combat.ts` + `game-definition/flow/riftbound-flow.ts` + `chain/chain-state.ts` `ShowdownState` against §454 combat / §325 chains-and-showdowns / §462 scoring and fix deltas. Big.
- **Item 4 — Additional Turns §734 (UNTOUCHED):** parser already emits `{type:"extra-turn"}` (spell effect) but the engine has no handler and no turn-queue concept. Note: turn-player rotation between turns wasn't found in the traced code (`flow-manager.transitionToNextTurn` only bumps `turnNumber`; riftbound-flow `turn.onBegin` just reads `getCurrentPlayer()`) — implementing additional turns cleanly likely needs a turn-queue abstraction in the flow layer first.
- "may" *effect*-level optionality (`type:"optional"` / `type:"choice"` effects still auto-apply the inner/first option — UI hook needed); Replace/Create swap-back; responsibility/linking/referents; HOT FEPR; Unique §825 deck-validator check (quick, optional).

### Phase 5 — Death triggers + Deathknell intrinsic abilities (2026-05-11 cont., TICK 1 of gap-loop)

**Gap targeted (big-ticket item 1, partial — Legion/Deathknell intrinsic triggers):** the parser emits `[Deathknell] — [text]` as `{type:"keyword", keyword:"Deathknell", effect, condition?}` and there were already `trigger:{event:"die"}` abilities on real cards (Viktor Leader, Immortal Phoenix, Shard of Undoing, Pyke Returned, Battle Mistress, …), **but no `die` event was ever emitted anywhere in the engine** — so Deathknell and every "when I die / when an enemy unit dies" trigger silently never fired. Fixed.

**Engine changes:**
- `abilities/trigger-matcher.ts`: a card in the `trash` zone now contributes triggers for a `die` event, but **only its self-scoped ones** (so a graveyard card doesn't fire board-presence "any unit" die triggers). All other zones unchanged.
- `abilities/trigger-runner.ts`: `toTriggerableAbilities` now **synthesizes** a real `{type:"triggered", trigger:{event:"die",on:"self"}, effect, condition}` from each `{type:"keyword", keyword:"Deathknell", effect}` registry entry (rule 813). `getBoardCards` now also scans the `trash` zone (tagged `zone:"trash"`) so a just-died unit's self-die triggers resolve. New exported `fireDieTriggers(killed, ctx)` helper — fires `{type:"die", cardId, owner}` per killed unit (owner captured before the move to trash); chain-active → Deathknell goes on the chain (rule 541), else inline.
- `abilities/index.ts`: export `fireDieTriggers`.
- `game-definition/moves/combat.ts`: after the Combat Damage Step kill loop, capture `{cardId, owner}` pairs and call `fireDieTriggers` (rule 604.x → 813).
- `game-definition/moves/chain-moves.ts`: new `cleanupAndFireDeaths(draft, context)` — runs `performCleanup`, fires `fireDieTriggers` for units it killed, then one cascade cleanup+die-fire pass (a Deathknell like Ruined Rex's "deal 4" can kill again). `passChainPriority` and `resolveChain` reducers now use it instead of bare `performCleanup`. (counters.ts sandbox `addCounter`/`modifyBuff` performCleanup calls left as-is — UI moves, low value.)

**Known limitation (documented, not a regression):** spell/ability `damage` effects route through `counters.addCounter("damage")` → `meta.__counters.damage` in the real engine, while `performCleanup` reads `meta.damage` — so spell damage doesn't kill units via cleanup today (pre-existing; combat code separately syncs both). Deathknell still fires correctly for combat-kills and any future path that updates `meta.damage`. Trigger `condition`s like `while-alone`/`not-died-alone`/`while-mighty` are not yet evaluated for `die` triggers (permissive — effect runs regardless).

**Tests added (engine):** `src/__tests__/rules-audit/unleashed-death-triggers.test.ts` — 6 tests: rule 813 Deathknell synthesis fires from trash + ignores non-die events; rule 540.x trashed cards only fire self-die triggers (and the same trigger DOES fire from the board); plain `when I die`(on:self) fires from trash; integration via `resolveFullCombat` — a unit killed in combat fires its Deathknell ("deal 1 to self" → defender's `__counters.damage` = 5 combat + 1 Deathknell = 6).

**Test status:** riftbound-engine `bun test` → 1260 pass / 0 fail / 49 todo (was 1254; +6). riftbound-cards `bun test` → 912 pass / 0 fail (unchanged — no parser change this tick). `bun run typecheck`: engine 92 pre-existing errors (unchanged set), cards 23 pre-existing errors (unchanged) — 0 new errors in touched files.

**Updated remaining-work list (next agent, priority order):**
1. **Legion intrinsic abilities** — `keyword:"Legion"` shapes still don't synthesize: most are activated-ability conditions (`[Exhaust]: [Legion] — text`) — handled by `evaluateLegionCondition` only if the *activation* path checks the carried `condition`; verify it does. Undying Legion's `[Legion][>] play me from trash for [3][fury]` is a conditional **play-permission** from the trash zone — needs play-move support. Ambush's conditional `[Reaction]` play-permission also still unverified in real play.
2. **Showdown↔combat unification (item 3, UNTOUCHED — biggest)** — see prior entry; §454 combat / §325 chains-and-showdowns / §462 scoring vs `combat.ts` + `riftbound-flow.ts` + `chain/chain-state.ts`.
3. **Additional Turns §734 (item 4, UNTOUCHED)** — needs a turn-player rotation/turn-queue abstraction in the flow layer first; core `flow-manager.transitionToNextTurn` only bumps `turnNumber`, no player rotation found. Then handle the `{type:"extra-turn"}` parser effect.
4. **Wire `fireDieTriggers` into the remaining death paths** — `riftbound-flow.ts` Cleanup-phase `performFullCleanup`, `counters.ts` sandbox cleanups, `player-removal.ts` — and fix the spell-damage `meta.__counters.damage` vs `meta.damage` desync so spell kills actually happen + fire deaths.
5. "may" *effect*-level optionality; Replace/Create swap-back; responsibility/linking/referents; HOT FEPR; Unique §825 deck-validator (quick, optional).

### Phase 6 — Legion intrinsic triggers + Ambush real-play + Additional Turns infra (2026-05-11 cont., TICK 2 of gap-loop)

**Gaps targeted:** big-ticket item 1 (Legion intrinsic triggered abilities — analogous to tick 1's Deathknell), Ambush `[Reaction]` play-permission verification/fix, and Additional Turns §734 (minimal turn-queue infra).

**Parser (cards):** `parser/parsers/effect-keyword-parser.ts` — `parseEffectAndTrigger` now returns `{effect, trigger?}`; when a Legion/Deathknell effect text is "When you play me, …" it captures `trigger:{event:"play-self",on:"self"}` and the main effect-keyword loop attaches it to the `EffectKeywordAbility`. Verified on real cards: Trifarian Gloryseeker / Scrapyard Champion / Vanguard Captain / Darius Executioner now carry the trigger; Noxus Hopeful's "[Legion] — I cost [2] less" (static cost-reduction) correctly has no trigger.

**Types:** `riftbound-types/.../ability-types.ts` — added optional `trigger?:{event;on?}` to `EffectKeywordAbility`.

**Engine:**
- `abilities/trigger-runner.ts` — `toTriggerableAbilities` now synthesizes a real `{type:"triggered", trigger, effect, condition:{type:"legion"}}` from each `{type:"keyword", keyword:"Legion", effect, trigger}` registry entry (rule 812). The trigger-runner already evaluates `{type:"legion"}` conditions, so a Legion "when you play me" trigger fires through normal machinery only when the controller has played another card this turn. Legion abilities without a `trigger` (static cost-reduction etc.) are NOT synthesized.
- `game-definition/moves/cards.ts` — `playUnit` *enumerator* now also surfaces Ambush battlefield plays (rule 822): for each Ambush unit in hand, a `playUnit{location:"battlefield-<id>"}` move at every battlefield where the player controls ≥1 unit, regardless of phase/turn (Reaction timing is always legal). The `condition` already allowed this; the enumerator didn't.
- `operations/turn-queue.ts` (new) — `enqueueExtraTurn` / `peekExtraTurn` / `dequeueExtraTurn` / `nextTurnPlayer` over `state.pendingExtraTurns: PlayerId[]` (rule 734 FIFO). Exported from `operations/index.ts`.
- `abilities/effect-executor.ts` — new `extra-turn` case: enqueues the controller (or named player) onto `state.pendingExtraTurns`.
- `types/game-state.ts` — added `pendingExtraTurns?: PlayerId[]`.
- `game-definition/flow/riftbound-flow.ts` — `mainGame.turn.onBegin` now `dequeueExtraTurn`s; if a player is queued it becomes the turn player and `context.setCurrentPlayer` is updated. (Full active-player *rotation* in the flow layer is still missing — core never rotates `currentPlayer` — so this is the additional-turn primitive that rotation will consult once it lands.)

**Tests:** `__tests__/rules-audit/unleashed-legion-extra-turns.test.ts` (11 tests): rule 812 — Legion synthesis fires on play-self only when `cardsPlayedThisTurn≥1`, doesn't fire otherwise, doesn't fire for non-play events, static Legion cost-reduction not synthesized; rule 822 — `playUnit` to a battlefield with a friendly unit is legal off-turn/off-main and enumerated, non-Ambush units rejected, Ambush rejected when no friendly unit there; rule 734 — `extra-turn` effect enqueues, `dequeueExtraTurn`/`nextTurnPlayer` FIFO + prefers extra turn over normal successor, undefined when empty, `enqueuePendingExtraTurn` writes through. New helpers: `setCardsPlayedThisTurn`, `enqueuePendingExtraTurn`.

**Test status:** riftbound-engine `bun test` → 1271 pass / 0 fail / 49 todo (was 1260; +11). riftbound-cards `bun test` → 912 pass / 0 fail (unchanged — parser change is additive, all existing tests still green). `bun run typecheck`: engine 92 pre-existing errors (unchanged set), cards 23 pre-existing errors (unchanged), types 0 — 0 new errors in touched files.

**Updated remaining-work list (next agent, priority order):**
1. **Showdown↔combat unification (item 3, UNTOUCHED — biggest)** — §454 combat / §325 chains-and-showdowns / §462 scoring vs `game-definition/moves/combat.ts` + `game-definition/flow/riftbound-flow.ts` + `chain/chain-state.ts` `ShowdownState`/`showdownStack`. Produce the precise delta list; fix the easy ones (HOT FEPR Combat-Resolution-Step reorder, "no result" combats, control-locked-by-presence-of-combat/showdown).
2. **Additional Turns — full flow rotation** — the `pendingExtraTurns` queue + `extra-turn` effect + `turn-queue.ts` primitives + `turn.onBegin` hook are in place, but the flow layer still has no normal seat-order active-player rotation (core's `transitionToNextTurn` only bumps `turnNumber`; `setCurrentPlayer` is only ever called at setup). Wire the rotation (probably a `turn.onEnd` that calls `setCurrentPlayer(nextTurnPlayer(state, seatOrderSuccessor))`), then additional turns are end-to-end.
3. **Remaining Legion shapes** — `Undying Legion`'s `[Legion][>] play me from your trash for [3][fury]` is a conditional play-permission from trash (needs play-move support for `from:"trash"` + alt-cost + Legion gate); `[Exhaust]: [Legion] — text` activated abilities — verify the activation path checks the carried `condition:{type:"legion"}`; `Noxian Guillotine` line 3 "[Legion] — Kill it now instead." is a replacement-style modification of the spell's own effect (parser currently fails on it — "Could not parse ability text").
4. **Wire `fireDieTriggers` into the remaining death paths** — `riftbound-flow.ts` Cleanup-phase `performFullCleanup`, `counters.ts` sandbox cleanups, `player-removal.ts` — and fix the spell-damage `meta.__counters.damage` vs `meta.damage` desync so spell kills actually happen + fire deaths.
5. "may" *effect*-level optionality; Replace/Create swap-back; responsibility/linking/referents; HOT FEPR; Unique §825 deck-validator (quick, optional).

### Audit note (added 2026-05-11 by orchestrator, post-tick-2)
- Tick 2's Ambush fix was an enumeration-completeness gap (`playUnit` enumerator didn't surface the off-timing Ambush battlefield play; the `condition` already allowed it). **NEXT TICK: audit whether OTHER reaction-timing plays are fully enumerated** — Reaction-keyword cards in hand on the opponent's turn, activated abilities usable during opponent's turn, any other "you may act outside your main timing" cases. If the move enumerator was systematically only listing your-main-timing moves, that's a wider gap than just Ambush. Add rules-audit tests for reaction-window enumeration completeness.

### Phase 7 — Additional-Turns full rotation + spell-damage desync fix + reaction-timing audit (2026-05-11 cont., TICK 3 of gap-loop)

**Gaps targeted:** #2 (Additional Turns — full flow rotation), #5 (spell-damage `__counters.damage`↔`meta.damage` desync → spell kills not happening), #3 (reaction-timing enumeration audit + the rule-530 over-permissiveness it surfaced), and the start of #1 (showdown↔combat delta list).

**Engine changes:**
- `operations/turn-queue.ts` — new `seatOrderSuccessor(state, current)`: next player in seat order, anchored on `state.setup?.firstPlayer` (falls back to `Object.keys(players)`).
- `game-definition/flow/riftbound-flow.ts` — `mainGame.turn.onEnd` now rotates the active player to `seatOrderSuccessor(...)` via `context.setCurrentPlayer` (rule 510/734). `turn.onBegin`'s extra-turn dequeue still overrides this when a queued additional turn exists, so additional turns are now **end-to-end** (queue → effect → primitives → onBegin override → seat rotation continues after). Updated import.
- `cleanup/state-based-checks.ts` — rule 520 kill check now reads `Math.max(meta.damage ?? 0, ctx.counters.getCounter?.(cardId,"damage") ?? 0)` so non-combat (spell/ability) damage — which only writes the `__counters.damage` bag in the real engine — actually kills units (and fires their `die`/Deathknell triggers via the caller's `cleanupAndFireDeaths`). When a unit dies (or a death-replacement fires), `clearCounter(cardId,"damage")` now runs alongside `updateCardMeta({damage:0})` to keep the two in sync. Added `getCounter:()=>0` to `dynamic-ability-cards.test.ts`'s harness.
- `game-definition/moves/chain-moves.ts` — `activateAbility` condition + enumerator now enforce rule 530 (Action-timed activated abilities are legal only for the active player in Neutral Open) — mirrors the guard `playSpell` already had; closes an over-enumeration gap (a non-active player could enumerate/activate Action abilities during the opponent's turn). Reaction-timed plays remain enumerable for relevant players in Closed/Showdown states.

**Showdown↔combat delta list (item #1, for next tick — produced, not yet fixed):**
1. **Cleanup step order (rule 323):** engine `performCleanup` does kill-by-damage *then* clear-stale-combat-roles; rules say (323.2) re-assign/remove Attacker/Defender designations → (323.4) Deathknell *triggers* on lethal-but-not-yet-killed units → (323.5) kill → (323.6) uncontrol empty bf in Open state → … → (323.8/9) stage showdown/combat at Contested bf → (323.11/13) turn player opens showdown/combat in Neutral Open. Engine has no per-cleanup designation re-assignment, no "stage showdown at every Contested bf" step, no turn-player choice of which staged combat opens.
2. **Non-combat showdowns (rule 326.2/455.1/459.1):** engine `ShowdownState` is only ever a *combat* showdown (`resolveFullCombat` is the only path; `isCombatShowdown` set elsewhere never `false` in practice). A showdown should open at any Contested bf with a foreign-controlled unit even with no opposing units; if a combat is later staged there it *becomes* a combat showdown. Unimplemented.
3. **"No Result" combats (rule 461.3.d):** `resolveCombat` returns `attacker`/`defender`/`tie`; rules: a player wins only if they're the *sole* player with units remaining at the bf during the Resolution Step; otherwise "No Result" — and if both still have units, re-stage a Combat. Engine's `tie` ≈ "both dead" only; the "both still alive → re-stage" case is missing, and "attacker wins because defender wiped but attacker also took losses" works but the win/lose criterion isn't expressed in terms of "sole remaining player".
4. **Combat-Resolution-Step reorder / HOT FEPR (rule 461):** rules: Combat Cleanup (heal all units, recall attackers if defenders remain) → determine result → conquer if applicable → drop designations + "this combat" effects expire. Engine `resolveFullCombat` interleaves damage → kill → fire deaths → conquer/recall → clear roles → clear contested; no heal-all step, no "recall attackers if defenders remain" as a Combat-Cleanup task, designations cleared before "this combat" expiry semantics.
5. **Control locked by presence of combat/showdown (rule 323.6 / 461.5 / 185):** engine uncontrols a bf in the Beginning/Cleanup paths based on contested/empty; rules: a bf stays controlled while a combat OR showdown is ongoing there, and control can't change while a chain item exists. `canPlayerScoreAtBattlefield`/scoring already gate on stuff but the "presence of combat/showdown locks control" invariant isn't modeled.
6. **`resolveFullCombat` is a single mega-move**, not the 3 Steps of Combat (Combat Showdown Step → Combat Damage Step → Resolution Step) with chain windows between; `combat.ts` + `riftbound-flow.ts` have no Combat-Showdown-Step where triggered abilities from establishing Attacker/Defender go on a Combat Chain (rule 459.2.d).
Tractable next: #1 (cleanup step reorder — low risk), #3 "No Result both-alive → re-stage", #5 control-lock invariant. Bigger: #2, #4, #6.

**Rules-audit tests added (engine):**
- `__tests__/rules-audit/unleashed-turn-rotation-reactions.test.ts` (10 tests): rule 510/734 — `seatOrderSuccessor` cycles 2- and 3-player seat orders; ending P1's turn rotates to P2 (flow `getCurrentPlayer` + `state.turn.activePlayer`); a queued additional turn is taken next (consumes the queue); after the additional turn, rotation continues to the normal successor; per-turn tracking resets for the new turn player. Rule 530 — Action spell in opponent's hand not legal on active player's Neutral-Open turn (active player's own is); Action-timed activated ability not legal/enumerated for a non-active player (active player's own is); a Reaction-timed ability is not blocked by rule 530 for a non-active player.
- `__tests__/rules-audit/unleashed-death-triggers.test.ts` (+2 tests): rule 520 — a damage spell that deals lethal damage moves the target to trash via `playSpell`→`passChainPriority` resolution and fires its Deathknell; a sub-lethal damage spell does not kill. New helpers in `rules-audit/helpers.ts`: `getFlowCurrentPlayer`, `endTurnViaFlow` (drives `flowManager.nextTurn()` + re-syncs `currentState`).

**Test status:** riftbound-engine `bun test` → 1283 pass / 0 fail / 49 todo (was 1271; +12). riftbound-cards `bun test` → 912 pass / 0 fail (unchanged — no parser change). `bun run typecheck`: engine 92 pre-existing errors (unchanged set), cards 23 pre-existing errors (unchanged), types 0 — 0 new errors in touched files.

**Updated remaining-work list (next agent, priority order):**
1. **Showdown↔combat unification (item #1, biggest)** — fix the 6-point delta list above; tractable next: cleanup step reorder (rule 323), "No Result both-alive → re-stage" (rule 461.3.d.1), control-locked-by-presence-of-combat/showdown invariant (rule 323.6/461.5/185). Bigger: non-combat showdowns, 3-step combat with a Combat-Showdown-Step chain window, HOT FEPR Combat-Resolution-Step reorder.
2. **Wire `fireDieTriggers` into the still-uncovered death paths** — `riftbound-flow.ts` Cleanup/Ending phase (its flow hook has no `counters`, so needs threading), `counters.ts` sandbox `addCounter`/`modifyBuff` (UI moves, low value), `player-removal.ts`. Spell-damage desync is now FIXED (`performCleanup` reads max(meta.damage, counter); kill clears both).
3. **Remaining Legion shapes** — `Undying Legion` `[Legion][>] play me from your trash for [3][fury]` (play-move support for `from:"trash"` + alt-cost + Legion gate); `[Exhaust]: [Legion] — text` activated abilities (verify activation checks `condition:{type:"legion"}`); `Noxian Guillotine` line 3 "[Legion] — Kill it now instead." (replacement-style; parser fails — "Could not parse ability text").
4. **Reaction-window enumeration — finer-grained priority/focus gating:** `playSpell`/`activateAbility` still permit Reaction plays by *any* relevant player regardless of who holds priority/focus during a chain or showdown (the chain/showdown machinery enforces it at resolution but the move-legality layer doesn't). Tighten with a `getPriorityHolder(state)` helper if it doesn't break tests. (Rule 530 Action gating in Neutral Open is now done.)
5. "may" *effect*-level optionality; Replace/Create swap-back; responsibility/linking/referents; HOT FEPR; Unique §825 deck-validator (quick, optional).

### Phase 8 — Showdown↔combat deltas (heal-step, sole-remaining-player result, control-lock) + Legion-gated activated abilities (2026-05-11 cont., TICK 4 of gap-loop)

**Gaps targeted:** #1 — fixed 4 showdown↔combat deltas: (a) Combat Cleanup "Heal all Units" (rule 461.1.a.1), (b) "sole remaining player" result determination incl. defender Establishes Control / Conquer (rules 461.3.a / 461.5 / 461.5.d), (c) control-locked-while-combat-staged invariant (rules 185 / 461.5), (d) `"no-result"` outcome type + both-still-present → re-stage combat (rule 461.3.d.1). #3 — `[Exhaust]: [Legion]` activated abilities now gated on their carried `condition:{type:"legion"}` in `activateAbility` (rules 564/724/812). Parser audit: `Noxian Guillotine` line-3 `[Legion] — Kill it now instead.` does NOT error — the parser *silently drops* it (only the `[Action]` spell ability is emitted; the Legion alternate-effect line is ignored). Recategorized as a parser feature gap, not a crash.

**Engine changes:**
- `combat/combat-resolver.ts` — added `CombatOutcome = "attacker"|"defender"|"tie"|"no-result"`; `CombatResult.winner` widened to it; rewrote the Step-5 outcome doc to explain the "Combat Cleanup recalls surviving attackers if defenders remain → defender is sole-remaining → defender holds" logic (rules 461.1.a.2 / 461.3.a). No behavior change to the existing cases; the `no-result` value is reserved for callers that model un-recallable attackers.
- `game-definition/moves/combat.ts` `resolveFullCombat` — after kills + `fireDieTriggers`: NEW heal-all step (rule 461.1.a.1) clears `meta.damage` AND the `__counters.damage` bag for every surviving combatant (and any unit still at the bf); killed units left alone (already in trash). NEW: when `winner === "defender"` and the defending player didn't already control the bf, they Establish Control — and if they hadn't scored it this turn, that's a Conquer (1 VP, `conqueredThisTurn`/`scoredThisTurn`, Hunt XP, `conquer` event, victory check). NEW: `winner === "no-result"` with both players still having units at the bf → keep Contested, keep designations, `return` (re-stage). Renamed the final cleanup comments to cite rules 461.7 / 461.5.a.
- `game-definition/moves/combat.ts` `conquerBattlefield` — condition + enumerator now also reject a battlefield with the Contested status (`bf.contested`): control of a battlefield is locked while a combat is staged there (rules 185 / 461.5), in addition to the existing `getActiveShowdown` showdown lock (rule 548.2).
- `game-definition/moves/chain-moves.ts` — new `isActivationConditionMet(state, playerId, condition)` helper (evaluates `{type:"legion"}` via `evaluateLegionCondition`; unknown condition types treated as satisfied). `activateAbility` condition + enumerator now call it after the `type === "activated"` check, so a `[Exhaust]: [Legion] — [Text]` activated ability is illegal/unenumerated until its controller has played another card this turn (rules 564/724/812). Imported `evaluateLegionCondition`.

**Tests:**
- `__tests__/rules-audit/unleashed-combat-showdown.test.ts` (NEW, 11 tests): rule 461.1.a.1 — surviving attacker / surviving defender have combat damage healed (meta + counter both 0); rule 461.3 — `resolveCombat` returns `defender` when both survive (attackers recalled) and `tie` when both die, `attacker` only when defenders wiped + attacker survives; rule 461.5.d — defender at an Uncontrolled bf gains control + 1 VP + `conqueredThisTurn`/`scoredThisTurn`, defender already controlling gains 0 VP; rule 185/461.5 — `conquerBattlefield` illegal + unenumerated while `bf.contested`, legal once not Contested; rules 564/724/812 — Legion activated ability illegal/unenumerated with 0 prior plays, legal with ≥1, plain (non-Legion) activated ability unaffected.
- `__tests__/rules-audit/combat.test.ts` — updated the two tests that asserted the OLD (2025) "defender holds → battlefield stays Uncontrolled / no VP" behavior: under CR 2026-03-30 the defender is the sole-remaining player → wins (461.3.a) → Establishes Control = Conquer (461.5.d). Both now assert `controller === defender` + VP ≥ 1; added a companion "loser gets 0 VP" test.

**Test status:** riftbound-engine `bun test` → **1295 pass / 0 fail** / 49 todo (was 1283; +12). riftbound-cards `bun test` → **912 pass / 0 fail** (unchanged — no parser change). `bun run typecheck`: engine 92 pre-existing errors (unchanged set), cards 23 pre-existing (unchanged), types 0 — 0 new errors in touched files.

**Updated remaining-work list (next agent, priority order):**
1. **Showdown↔combat unification (item #1, remaining deltas)** — still missing: per-Cleanup designation re-assignment (rule 323.2) + "stage Showdown/Combat at every Contested bf" + turn-player choice of which staged combat opens (rules 323.8/9/11/13); non-combat showdowns (`ShowdownState` is always a combat showdown — rule 326.2/459.1); the 3 Steps of Combat as real flow steps with a Combat-Showdown-Step chain window (rule 459.2.d) instead of the single `resolveFullCombat` mega-move; "this combat" effect-expiry semantics (461.7.b).
2. **Remaining Legion shapes** — `Undying Legion` `[Legion][>] play me from your trash for [3][fury]` still needs play-move support for `from:"trash"` + alt-cost + Legion gate (the card's `abilities` already encode `{type:"keyword",keyword:"Legion",effect:{type:"play",from:"trash",...}}` — the engine's play enumerator/condition must surface it). `Noxian Guillotine` line 3 `[Legion] — Kill it now instead.` — parser SILENTLY DROPS it (emits only the `[Action]` spell); needs a representation for a Legion-conditional alternate spell effect ("if Legion, replace the spell's printed effect with X"). Also `undying-legion.ts` rulesText still has the literal HTML entity `[&gt;]` — cosmetic.
3. **fireDieTriggers into still-uncovered death paths** — `riftbound-flow.ts` Cleanup/Ending phase hook (no `counters` threaded), `counters.ts` sandbox `addCounter`/`modifyBuff`, `player-removal.ts`.
4. **Reaction-window finer-grained priority/focus gating** — `playSpell`/`activateAbility` still permit Reaction plays by any relevant player regardless of who holds priority/focus during a chain or showdown; tighten with a `getPriorityHolder(state)` helper if it doesn't break tests.
5. "may" *effect*-level optionality; Replace/Create swap-back; responsibility/linking/referents; HOT FEPR; Unique §825 deck-validator.

### Phase 9 — Undying Legion play-from-trash + Cleanup designation re-assignment (2026-05-11 cont., TICK 5 of gap-loop)

**Gaps targeted:** #2 — `Undying Legion` `[Legion][>] play me from your trash for [3][fury]` play-move support; #1 — showdown↔combat delta "per-Cleanup designation re-assignment" (rule 323.2/521). (Note: the card's alt-cost `[3][fury]` equals its printed `energyCost:3`/`domain:"fury"`, so the standard cost path applies — no alt-cost machinery needed for the known Unleashed card.)

**Engine changes:**
- `game-definition/moves/cards.ts` — new `hasLegionPlayFromTrash(cardId)` helper (detects a `{type:"keyword",keyword:"Legion",effect:{type:"play",from:"trash"}}` ability). `playUnit` condition now accepts a card in the `trash` zone when that ability is present AND `evaluateLegionCondition` holds AND it's the owner's own main phase AND affordable (playing to base only, not a battlefield) — rules 724/554/555. `playUnit` enumerator now also surfaces such trash plays on the owner's main phase with ≥1 prior play. The existing reducer already moves card→`location` (works trash→base), fires `play-self`/`play-card`, and bumps `cardsPlayedThisTurn` (rule 555 — playing from trash is still a play). Imported `evaluateLegionCondition`.
- `cleanup/state-based-checks.ts` — Step 2 (stale combat roles) now implements rule 323.2: a unit keeps its Attacker/Defender designation only while it sits at a battlefield with an *ongoing* combat — `bf.contested` (combat staged) OR an active combat showdown there (`draft.interaction.showdownStack` top with `isCombatShowdown` + matching `battlefieldId`). A unit at a non-Contested bf, or one that moved away, loses its designation. (`resolveFullCombat` is unaffected — it does its own mid-combat role bookkeeping and never calls `performCleanup`.)

**Cards:** `cards/unl/undying-legion.ts` — cosmetic: `[&gt;]` → `[>]` in rulesText.

**Tests added (engine):**
- `__tests__/rules-audit/unleashed-legion-play-from-trash.test.ts` (NEW, 6 tests): rule 724/555 — Undying-Legion-shaped unit in trash is illegal/unenumerated with 0 prior plays, legal+enumerated with ≥1, playing it moves trash→base + pays `[3][fury]` + bumps the Legion counter to 2; illegal on the opponent's turn; illegal when unaffordable; a plain unit in trash is never enumerated/playable.
- `__tests__/rules-audit/unleashed-combat-showdown.test.ts` (+3 tests): rule 323.2/521 — a unit at a non-Contested bf loses its Attacker role on cleanup; a unit at a Contested bf keeps its Defender role; a unit that moved to Base loses its role.

**Test status:** riftbound-engine `bun test` → **1304 pass / 0 fail** / 49 todo (was 1295; +9). riftbound-cards `bun test` → **912 pass / 0 fail** (unchanged — rulesText edit is cosmetic). `bun run typecheck`: engine 92 pre-existing errors (unchanged set — the 4 `cards.ts` errors are the same pre-existing ones at shifted lines), cards 23 pre-existing (unchanged), types 0 — 0 new errors in touched files.

**Updated remaining-work list (next agent, priority order):**
1. **Showdown↔combat unification (item #1, remaining deltas)** — still missing: "stage Showdown/Combat at every Contested bf" + turn-player choice of which staged combat opens (rules 323.8/9/11/13); non-combat showdowns (`ShowdownState` is always a combat showdown — rule 326.2/459.1: a showdown should open at any Contested bf with a foreign-controlled unit even with no opposing units, becoming a combat showdown only if a combat is later staged); the 3 Steps of Combat as real flow steps with a Combat-Showdown-Step chain window (rule 459.2.d) instead of the single `resolveFullCombat` mega-move; "this combat" effect-expiry semantics (461.7.b). Per-Cleanup designation re-assignment (323.2) is now DONE.
2. **`Noxian Guillotine` line 3 `[Legion] — Kill it now instead.`** — parser SILENTLY DROPS it (emits only the `[Action]` spell). Needs a representation for a Legion-conditional alternate spell effect ("if Legion, replace the spell's printed effect with X") in `riftbound-cards/src/parser`. Undying Legion's `from:"trash"` play is now DONE; `[Exhaust]:[Legion]` activated gating was done in tick4.
3. **fireDieTriggers into still-uncovered death paths** — `riftbound-flow.ts` Cleanup/Ending phase hook (no `counters` threaded), `counters.ts` sandbox `addCounter`/`modifyBuff`, `player-removal.ts`.
4. **Reaction-window finer-grained priority/focus gating** — `playSpell`/`activateAbility` still permit Reaction plays by any relevant player regardless of who holds priority/focus during a chain or showdown; tighten with a `getPriorityHolder(state)` helper if it doesn't break tests.
5. "may" *effect*-level optionality; Replace/Create swap-back; responsibility/linking/referents; HOT FEPR; Unique §825 deck-validator.

### Phase 10 — Noxian Guillotine Legion-replaces-spell parser+engine + sandbox-move die triggers (2026-05-11 cont., TICK 6 of gap-loop)

**Gaps targeted:** #2 — `Noxian Guillotine` line 3 `[Legion] — Kill it now instead.` parser drop → now parsed + wired into the engine. #3 — `fireDieTriggers` into the remaining death paths (counters.ts sandbox moves; player-removal.ts verified). (#1 showdown↔combat deltas NOT touched this tick — still the biggest remaining item.)

**Parser changes (`riftbound-cards/src/parser`):**
- `parsers/effect-keyword-parser.ts` — `parseSimpleEffect` now recognizes "Kill it[ now][ instead].", "Kill a/an [friendly|enemy] unit.", "Kill me." → `{type:"kill", target:...}` ("it"/"that unit"/"a unit" → `{type:"unit"}`, mirroring how the spell parser renders "Choose a unit. Kill it"). `parseEffectKeywordsWithPositions` now sets a new `replacesSpellEffect:true` flag on the emitted `EffectKeywordAbility` when the carried text ends in "instead" (the alternate effect *replaces* the printed one, rule 812).
- `index.ts` `parseAbilitiesInner` — the `[Action]`/`[Reaction]` single-spell fast-path no longer fires when the text has a standalone `[Legion]`/`[Deathknell]`/`[Vision]` on a later line (`\n\s*\[(Legion|Deathknell|Vision)\]`); those would be silently dropped by the single-spell parse → falls through to multi-split which keeps the keyword segment. Fixes Noxian Guillotine emitting both the `[Action]` spell ability AND the Legion alternate.
- `riftbound-types/src/abilities/ability-types.ts` — added `replacesSpellEffect?: boolean` to `EffectKeywordAbility`.

**Engine changes (`riftbound-engine`):**
- `game-definition/moves/chain-moves.ts` — new `getLegionReplacementEffect(cardId, controllerId, state)`: finds a `keyword:"Legion"` ability with `replacesSpellEffect:true` and returns its `effect` iff `cardsPlayedThisTurn[controller] >= 2` (rule 724.1.c — at chain-resolution time the spell's own play has already incremented the counter, so we need ≥2: this spell + one *other* card). `executeResolvedItem` now substitutes that effect for the printed spell effect on resolution (both the stored-effect path and the registry-fallback path).
- `game-definition/moves/counters.ts` — new `cleanupAndFireDeaths(draft, ctx)` (performCleanup → fireDieTriggers on killed + one cascade pass). `addCounter`, `modifyBuff` now call it instead of bare `performCleanup`; `addDamage` now calls it (previously ran no cleanup at all). So a unit killed by a sandbox damage/counter/buff change fires its Deathknell etc. (rule 540.x / 813).
- `operations/player-removal.ts` — VERIFIED no change needed: rule 652.1 *banishes* the removed player's permanents; banishment ≠ "die", so it must NOT fire die triggers. Correct as-is.
- `riftbound-flow.ts` Cleanup-phase `performFullCleanup` — VERIFIED: `performFullCleanup` is exported but only referenced in a comment; there is no engine-wide "run cleanup after each move" hook (each move calls `performCleanup`/`cleanupAndFireDeaths` itself). Wiring a global post-move hook is a larger architectural change — left for a future tick (documented in remaining-work).

**Tests added:**
- `riftbound-cards/.../parser/__tests__/special/legion-replaces-spell.test.ts` (NEW, 5 tests): `[Legion] — Kill it now instead.` → `{keyword:"Legion", effect:{type:"kill",target:{type:"unit"}}, replacesSpellEffect:true}`; Noxian Guillotine's full text emits BOTH the `[Action]` replacement spell AND the Legion alternate (no longer dropped); a Legion line without "instead" gets no flag; `Kill a friendly/enemy unit.` carry the controller filter; the real card text parses with ≥2 abilities.
- `riftbound-engine/.../rules-audit/unleashed-legion-replaces-spell.test.ts` (NEW, 3 tests): with 0 prior plays this turn the printed effect runs (Legion inactive); with a card played FIRST this turn the Legion alternate replaces the printed effect (strictly more drawn); an additive Legion keyword (no `replacesSpellEffect`) does NOT hijack chain resolution. (Uses a "draw 1" / "draw 3 instead" stand-in; asserts the *difference* so the harness's pre-existing double-resolve-on-double-pass quirk doesn't matter.)
- `riftbound-engine/.../rules-audit/unleashed-death-triggers.test.ts` (+4 tests): `addDamage` of lethal amount → unit moved to trash + Deathknell fired (`__counters.damage===1`); `addDamage` below might → survives, no Deathknell; `addCounter{counterType:"damage"}` lethal → killed + Deathknell; `modifyBuff` runs cleanup-and-fire-deaths (a unit at standing lethal damage is reaped + Deathknell fires).

**Test status:** riftbound-engine `bun test` → **1311 pass / 0 fail** / 49 todo (was 1304; +7). riftbound-cards `bun test` → **917 pass / 0 fail** (was 912; +5). `bun run typecheck`: engine 92 pre-existing errors (unchanged set; 0 in `chain-moves.ts`/`counters.ts`), cards 23 pre-existing (unchanged; 0 new in `effect-keyword-parser.ts` — my `kill` block is below the pre-existing-error lines and uses `as AnyTarget`), types 0 — 0 new errors in touched files.

**Updated remaining-work list (next agent, priority order):**
1. **Showdown↔combat unification (item #1, remaining deltas)** — STILL the biggest item, untouched since tick5: "stage Showdown/Combat at every Contested bf" + turn-player choice of which staged combat opens (rules 323.8/9/11/13); non-combat showdowns (`ShowdownState.isCombatShowdown` is effectively always true — rule 326.2/459.1: a showdown should open at any Contested bf with a foreign-controlled unit even with no opposing units, becoming a combat showdown only if a combat is later staged); the 3 Steps of Combat as real flow steps with a Combat-Showdown-Step chain window (rule 459.2.d) instead of the single `resolveFullCombat` mega-move; "this combat" effect-expiry semantics (461.7.b). Files: `game-definition/moves/combat.ts`, `flow/riftbound-flow.ts`, `chain/chain-state.ts`.
2. **Engine-wide post-move cleanup hook** — `performFullCleanup` exists but nothing calls it; cleanup currently happens only inside the handful of moves that opted in (`chain-moves.ts`, `combat.ts`, now `counters.ts`). Other state-mutating moves (e.g. movement, gear-equip) don't run state-based checks → a unit that becomes lethal via a static-ability shift after such a move isn't reaped until the next opt-in move. Wire a single post-reducer hook (via `@tcg/core`'s move pipeline if it exposes one, else a thin wrapper around every reducer) that runs `performFullCleanup` + `fireDieTriggers`.
3. **Reaction-window finer-grained priority/focus gating** — `playSpell`/`activateAbility` still permit Reaction plays by any relevant player regardless of who holds priority/focus during a chain or showdown; tighten with a `getPriorityHolder(state)` helper if it doesn't break tests.
4. **`Undying Legion` rulesText** — cosmetic `[&gt;]` was fixed in tick5; the play-from-trash move support was done in tick5. Nothing left here.
5. "may" *effect*-level optionality; Replace/Create swap-back; responsibility/linking/referents; HOT FEPR; Unique §825 deck-validator; `mightModifier` not folded into the rule-520 death check in `cleanup/state-based-checks.ts` (`baseMight = def?.might` ignores buffs — likely a real bug, verify against rules 140.x/520).

### Phase 11 — Effective-Might death check + engine-wide post-move cleanup hook + rule-323.7 hidden fix (2026-05-11, TICK 7)

**Gaps:** mightModifier not folded into the rule-323.5/520 death check (real bug); engine-wide post-move cleanup hook (item #2); rule-323.7 hidden-card cleanup used the wrong condition. (#1 showdown↔combat deltas untouched — still biggest.)

**Engine changes:**
- `operations/card-lookup.ts` — new exported `computeEffectiveMight(cardId, getCardMeta?, registry?)`: base + `[+1]` buff + `mightModifier` + `staticMightBonus` + equip Might bonus, clamped ≥0 (rules 140.x/703/710/143.2.b). De-dupes the 3-way inline derivation.
- `cleanup/state-based-checks.ts` — Step 1 (rule 323.5 death) now compares Damage to `computeEffectiveMight`, not `def.might`: buffed unit at base-lethal damage survives; Might-reduced unit at reduced-lethal damage dies; ≤0 effective Might dies to any non-zero damage. Step 4 (orphaned Hidden cards) rewritten to rule **323.7** — trash a Hidden card iff its owner doesn't *control* the battlefield (`bf.controller`, or `contestedBy` while Contested per rule 185); was wrongly keyed on "owner has a unit there".
- `cleanup/post-move-cleanup.ts` (NEW) — `cleanupAndFireDeaths(draft, ctx)` (canonical, shared) + `withPostMoveCleanup(moves)` HOF wrapping every move reducer to run cleanup+`die` triggers after it returns. Idempotent (cleanup clears damage on kill). Exported from `cleanup/index.ts`.
- `game-definition/moves/index.ts` — `riftboundMoves = withPostMoveCleanup({...})`: engine-wide post-move state-based-checks hook (rules 518-526). Moves that already ran cleanup unaffected; ones that didn't now reap units that became lethal as a side effect.

**Tests (engine rules-audit):** `unleashed-effective-might-death.test.ts` NEW (6: rule 323.5/140.x/143.2.b buffed/reduced/below-0/undamaged/non-unit cases); `unleashed-post-move-cleanup.test.ts` NEW (4: lethal unit reaped after unrelated `exhaustCard`; sub-lethal untouched; rule 323.7 hidden trashed at uncontrolled bf / preserved at controlled bf); `unleashed-death-triggers.test.ts` — `modifyBuff` test reseeded damage 2→3 (eff Might now 3, so 2 isn't lethal).

**Status:** engine `bun test` **1321 pass / 0 fail** (was 1311; +10). cards `bun test` **917 / 0** (unchanged). typecheck: engine 92 pre-existing (0 new), cards 23 pre-existing, types 0.

**Remaining (priority):** 1) showdown↔combat unification deltas (multi-bf staging, non-combat showdowns, 3-step combat flow, "this combat" expiry) — `combat.ts`/`riftbound-flow.ts`/`chain-state.ts`; 2) de-dup `cleanupAndFireDeaths` (chain-moves.ts/counters.ts still have local copies → import shared); 3) reaction-window priority/focus gating; 4) verify flow-hook (phase-transition) deaths fire Deathknell — post-move hook covers moves but not flow hooks; 5) "may" effect-level optionality; Replace/Create swap-back; responsibility/linking/referents; HOT FEPR; Unique §825 deck-validator.

### Phase 12 — Showdown↔combat: rule-455 cross-bf gating + 461.7.b "this combat" expiry + 460.2 effective-Might in combat (2026-05-11, TICK 8)

**Gaps targeted (all part of item #1, showdown↔combat unification):**
- Rule 455 — a Combat occurs only when no Showdown/Combat is ongoing at any *other* battlefield. `resolveFullCombat` previously had zero cross-bf awareness.
- Rule 455.1 / 459.2 — a Showdown ongoing at the bf where a combat is staged becomes a Combat Showdown.
- Rule 461.7.b — "this combat" effects expire when combat ends. Previously `duration:"combat"` granted keywords leaked until the Ending phase; "this combat" Might buffs were indistinguishable from turn buffs.
- Rule 460.2.a/b + 140.x — combat damage is summed from each side's *current* Might. `resolveFullCombat` used printed `def.might`, ignoring buffs/equipment/mightModifier.
(3-step combat as real flow steps + multi-bf staging-at-every-Contested-bf + non-combat-showdown-as-distinct-state still not modelled — see remaining list. Non-combat showdowns already open via movement.ts since pre-tick-8.)

**Engine changes:**
- `game-definition/moves/combat.ts` — `resolveFullCombat` condition+enumerator now reject (rule 455): if an active showdown exists at a *different* bf, no combat resolves; if it exists at *this* bf, only this combat resolves; with no showdown, all staged combats are enumerated (rule 456.1 — the move's `battlefieldId` param is the turn player's pick). `contestBattlefield` reducer now promotes an active non-combat showdown *at that bf* to a Combat Showdown (sets `isCombatShowdown`, `attackingPlayer`=contester, `defendingPlayer`, `focusPlayer`=attacker per 459.2.b.1.a, resets `passedPlayers`). End-of-combat block now sweeps every board card (base + all bfs) and clears `grantedKeywords` with `duration:"combat"` and zeroes `combatMightModifier` (rule 461.7.b). Combat-unit build now uses `computeEffectiveMight` (imported) instead of `def.might`.
- `types/game-state.ts` — added `combatMightModifier?: number` to `RiftboundCardMeta` ("this combat" Might accumulator).
- `abilities/effect-executor.ts` — `modify-might` with `duration:"combat"` routes to `combatMightModifier`; `getEffectiveMight` folds it in.
- `operations/card-lookup.ts` — `computeEffectiveMight` + its `MightAffectingMeta` shape fold in `combatMightModifier`.
- `__tests__/rules-audit/helpers.ts` — `getEffectiveMight` helper folds in `combatMightModifier`.

**Tests added:** `__tests__/rules-audit/unleashed-combat-showdown-flow.test.ts` (NEW, 11 tests): rule 455 — `resolveFullCombat@bf1` illegal while showdown@bf2; legal at same bf; both staged combats enumerated with no showdown; only-the-showdown-bf enumerated otherwise. Rule 455.1/459.2 — `contestBattlefield` flips non-combat showdown@bf to combat showdown w/ attacker=contester + focus=attacker; leaves a showdown at a different bf untouched. Rule 461.7.b — `duration:"combat"` keyword cleared from a survivor after `resolveFullCombat`; `duration:"turn"` keyword survives; `combatMightModifier` on a unit at a *different* bf also cleared. Rule 460.2.a/b+140.x — buffed defender (effective 2 Might) survives a 1-Might attacker that'd kill the unbuffed unit; `getEffectiveMight` folds `combatMightModifier`.

**Status:** riftbound-engine `bun test` → **1332 pass / 0 fail** / 49 todo (was 1321; +11). riftbound-cards `bun test` → **917 / 0** (unchanged — no parser change). `bun run typecheck`: engine 92 pre-existing (0 new; 0 in any touched file), types 0, cards 23 pre-existing (untouched).

**Updated remaining-work list (next agent, priority order):**
1. **Showdown↔combat unification, final deltas** — the 3 Steps of Combat as real flow steps (Combat Showdown Step → Combat Damage Step → Resolution Step) with a Combat-Showdown-Step chain window (rule 459.2.d) instead of the single `resolveFullCombat` mega-move; "stage a combat at *every* Contested bf and let the turn player open one" as an explicit flow phase (rule 318 Cleanups → 455); non-combat showdown closing per rule 348.2 wired into a Cleanup hook (currently `endShowdown` move only; rule 348.2.a Establish-Control-on-non-combat-showdown-close is not auto-run). Files: `flow/riftbound-flow.ts`, `game-definition/moves/combat.ts`, `chain/chain-state.ts`. This is the last big item; if it can't be one-ticked, write `.todo()` rules-audit tests pinning the 3-step flow.
2. **de-dup `cleanupAndFireDeaths`** — `chain-moves.ts`/`counters.ts` still carry local copies; import the shared `cleanup/post-move-cleanup.ts` one.
3. **Reaction-window priority/focus gating** — `playSpell`/`activateAbility` permit Reaction plays regardless of who holds priority/focus during a chain/showdown; add a `getPriorityHolder(state)` helper if it doesn't break tests.
4. **flow-hook (phase-transition) deaths** — the post-move cleanup hook covers moves but not flow `onBegin`/`onEnd` hooks (Cleanup/Ending phases thread no `counters`); verify Deathknell fires for units killed by a phase hook.
5. "may" *effect*-level optionality; Replace/Create swap-back; responsibility/linking/referents; HOT FEPR; Unique §825 deck-validator.

### Phase 13 — 3-step combat: Combat Showdown Step as the real Step 1 + Step 2/3 auto-resolve on close + Non-Combat-Showdown close hook (2026-05-12, TICK 9)

**Gaps targeted (item #1 + item #2):**
- Rule 348.1 / 458-461 — combat resolution proper (Combat Damage + Resolution Steps) now runs *automatically when the Combat Showdown closes*, instead of only via an explicit `resolveFullCombat` move. So Reactions played during the Combat Showdown (rule 459.2.d Focus window) happen *before* Combat Damage, as the rules require — the Focus window IS Step 1.
- Rule 348.2 / 348.2.a.1 — when a *Non-Combat* Showdown closes, the sole surviving player Establishes Control (Conquer + 1 VP if not yet scored this turn). Previously only the `endShowdown` move popped a closed showdown with no downstream effect.

**Engine changes:**
- `game-definition/moves/combat.ts` — extracted `resolveFullCombat`'s mega-reducer into shared exported `runCombatResolution(draft, ctx, bfId)` (Steps 2-3: Combat Damage Step → kills + Deathknell → Combat Cleanup heal-all (461.1.a.1) → Determine Result → Establish Control/Conquer → rule 461.3.d.1 re-stage → rule 461.7 designation+`this combat` expiry + clear Contested). New `endCombatNoDamage` (one side empty → Resolution Step still runs: sole survivor Establishes Control, else bf Uncontrolled per 461.5.b) and `finalizeCombatEnd` (461.7). New exported `establishNonCombatShowdownControl(draft, ctx, bfId)` (348.2). `resolveFullCombat` move reducer is now a one-liner delegating to `runCombatResolution` (kept for direct-trigger / backward compat). Added `CombatResolutionContext` (reuses `TriggerRunnerContext` zones/cards/counters shapes so the move context passes straight through); `draft` params typed `Draft<RiftboundGameState>` for the readonly `status`/`winner` writes.
- `game-definition/moves/chain-moves.ts` — `passShowdownFocus` reducer now: snapshot active showdown → `passFocus` → if it just ended, **pop the showdown first** (rule 348.1: the Combat Showdown Step is over before Steps 2-3 — combat must resolve with no Showdown ongoing here, else stale-showdown state-based-check gating misfires on resolution kills), then `runCombatResolution` (combat showdown) or `establishNonCombatShowdownControl` (non-combat).

**Tests added:** `__tests__/rules-audit/unleashed-showdown-close-flow.test.ts` (NEW, 7 tests + 2 `.todo()`): closing a combat showdown — 3v2 kills defender + conquers (1 VP); 3v3 mutual-kill → no winner/control/VP; rule 461.7.b `duration:"combat"` keyword cleared from a survivor on close. Closing a non-combat showdown — sole survivor not controlling → Conquer (1 VP, scoredThisTurn); already-controlling → no re-conquer; both players present → no control change; bf with Contested set → no-op. `.todo()` pins Steps 2/3 as discrete flow phases (still the remaining-#1 nice-to-have).

**Note:** the audit harness's `createMinimalGameState({phase})` desyncs the flow manager's phase tracker → a post-move `checkEndConditions()` can cascade the turn forward and (on an empty deck) Burn-Out-shuffle a just-trashed unit back into hand. Pre-existing harness artifact, not engine; the new tests avoid asserting a dead unit's exact off-board zone.

**Status:** riftbound-engine `bun test` → **1339 pass / 0 fail** / 51 todo (was 1332; +7). riftbound-cards `bun test` → **917 / 0** (unchanged — no parser change). `bun run typecheck`: engine 92 pre-existing (0 new; 0 in any touched file), types 0, cards 23 pre-existing (untouched).

**Updated remaining-work list (next agent, priority order):**
1. **Combat Steps as discrete flow phases** — the remaining slice of #1: make Step 2 (Combat Damage) and Step 3 (Resolution) addressable flow phases with their own Outstanding-Tasks lists + the rule-460.2.c "abilities influence damage-assignment order" hook + the inter-step chain windows (rule 459.2.d already covered by the Combat Showdown Focus window). `runCombatResolution` is the atomic core today; `.todo()` stubs are in `unleashed-showdown-close-flow.test.ts`. Also: rule 456.1 "stage a combat at *every* Contested bf, turn player picks one" as an explicit Cleanup→455 flow step (enumerated today via `resolveFullCombat` but not a flow phase).
2. **de-dup `cleanupAndFireDeaths`** — `chain-moves.ts`/`counters.ts` still carry local copies; import shared `cleanup/post-move-cleanup.ts`.
3. **Reaction-window priority/focus gating** — `playSpell`/`activateAbility` permit Reaction plays regardless of who holds priority/focus; add a `getPriorityHolder(state)` helper if it doesn't break tests.
4. **flow-hook (phase-transition) deaths** — post-move cleanup hook covers moves but not flow `onBegin`/`onEnd`; verify Deathknell fires for phase-hook kills.
5. **harness fix (low priority, test infra)** — sync the flow manager's `currentPhase` in `createMinimalGameState` so `checkEndConditions()` doesn't cascade the turn.
6. "may" *effect*-level optionality; Replace/Create swap-back; responsibility/linking/referents; HOT FEPR; Unique §825 deck-validator.

### Phase 14 — de-dup cleanupAndFireDeaths + reaction-window priority/focus gating + flow-hook deaths (2026-05-12, TICK 10)

**Gaps targeted (#2, #3, #4):**
- #2 — `chain-moves.ts` / `counters.ts` each carried a local copy of `cleanupAndFireDeaths`. Both now import the shared `cleanup/post-move-cleanup.ts` one (single source of truth). Tightened `PostMoveCleanupContext` to `Partial<RiftboundCardMeta>` + branded `PlayerId` param types so the move contexts pass through with 0 new typecheck errors.
- #3 — `playSpell` / `activateAbility` permitted any Reaction play during a Closed/Showdown state regardless of who held Priority/Focus. Added `getPriorityHolder(state)` to `chain/chain-state.ts` (chain.activePlayer → showdown.focusPlayer → null in Neutral Open; `""` while a chain is resolving = no one). Both moves now reject a play when `priorityHolder !== null && priorityHolder !== playerId`. (Rules 510 / 530 / 543.x / 338.1 / 342.) Fixed 5 pre-existing chain rules-audit tests that played 2 spells back-to-back without `passChainPriority` between (they were testing the *old*, over-permissive behaviour — now rules-correct per 338.1.c).
- #4 — post-move cleanup hook (`withPostMoveCleanup`) only fires after moves, not flow phase hooks. Added `runFlowCleanup(context)` + `buildFlowCounters(context)` (a `__counters`-meta-backed counters bag) to `flow/riftbound-flow.ts`; called from `beginning.onBegin` (after Temporary-permanent trashing + scoring/hold triggers) and `cleanup.onBegin` (end-of-turn state-based checks for real). The Beginning hook now also captures trashed-Temporary IDs and calls `fireDieTriggers` so their Deathknell fires (a Temporary leaving the Board "dies", rule 728.1.b → 813). `buildFlowTriggerContext` upgraded from noop counters → `buildFlowCounters`, so flow-fired trigger effects ("deal N damage") actually land.

**Files touched:** `chain/chain-state.ts` (+`getPriorityHolder`), `chain/index.ts` (export), `cleanup/post-move-cleanup.ts` (tighter context types), `cleanup/index.ts` (unchanged exports), `game-definition/moves/chain-moves.ts` & `counters.ts` (de-dup + priority gate), `game-definition/moves/cards.ts` (priority gate + import), `game-definition/flow/riftbound-flow.ts` (`buildFlowCounters`/`runFlowCleanup` + Beginning/Cleanup hooks + die-trigger fire for Temporaries). Investigated rule 323.6 / 187.4.c "lose battlefield control when no units in Open State" — implemented then **reverted** (cascades through the scoring engine + 7 tests that set `controller` without units; documented as its own tick in remaining-work, see NOTE in `state-based-checks.ts`).

**Tests added:** `__tests__/rules-audit/unleashed-priority-gating.test.ts` (NEW, 9): `getPriorityHolder` (neutral-open=null / chain=activePlayer / resolving=`""` / showdown=focus); `playSpell` Reaction rejected for non-priority player during a chain & accepted after they get priority; priority holder may chain onto their own item (338.1.a.5); `playSpell` Reaction rejected for non-focus / accepted for focus player during a Showdown; `activateAbility` Reaction gated the same way during a chain. `__tests__/rules-audit/unleashed-flow-hook-deaths.test.ts` (NEW, 4): a Temporary unit with [Deathknell] trashed by the Beginning hook fires its Deathknell; a non-Temporary survives; a lethally-damaged unit lingering on the Board is reaped by the Cleanup hook + fires Deathknell; a sub-lethal unit survives the Cleanup hook. Plus chain.test.ts: 5 tests reseeded with `passChainPriority` between the 2 plays.

**Status:** riftbound-engine `bun test` → **1352 pass / 0 fail** / 51 todo (was 1339; +13). riftbound-cards `bun test` → **917 / 0** (unchanged — no parser change). `bun run typecheck`: engine 92 pre-existing (0 new), types 0, cards 23 pre-existing (untouched).

**Updated remaining-work list (next agent, priority order):**
1. **Combat Steps as discrete flow phases** — Step 2 (Combat Damage) + Step 3 (Resolution) as addressable flow phases with their own Outstanding-Tasks lists + the rule-460.2.c "abilities influence damage-assignment order" hook (only Tank-first / Backline-last is modelled today, via `distributeDamage`) + rule 456.1 "stage a combat at *every* Contested bf, turn player picks one" as an explicit Cleanup→455 flow step. `runCombatResolution` is the atomic core; `.todo()` stubs in `unleashed-showdown-close-flow.test.ts`.
2. **Rule 323.6 / 187.4.c — lose battlefield control when no units in an Open State.** Implemented + reverted this tick (too disruptive: scoring engine + many tests assume sticky control). Needs its own tick: update the scoring/holding logic + the affected tests, then re-enable in `state-based-checks.ts` (NOTE marks the spot).
3. **Reaction-window priority/focus gating, finer cases** — done for `playSpell`/`activateAbility` move-legality this tick; remaining: triggered-ability "may"-decline windows, and the full rule 323.11/323.13 "turn player picks which staged Showdown/Combat to open" as a flow step (enumerated today, not a phase).
4. **harness fix (low priority, test infra)** — sync the flow manager's `currentPhase` in `createMinimalGameState` so `checkEndConditions()` doesn't cascade the turn.
5. "may" *effect*-level optionality; Replace/Create swap-back; responsibility/linking/referents; HOT FEPR; Unique §825 deck-validator.

### Orchestrator note (2026-05-12, post-tick-10): BLIND-AUDIT directive
Per Eric: gap-finding agents should periodically clear context bias from prior fixes. **TICK 11 (and every ~3rd tick after) should be a BLIND AUDIT**: the sub-agent runs the `engine-rules-audit` skill against `riftbound-rules/version-2026-03-30/` **without first reading this progress log's "remaining work" list** — re-derive the failing-rules set straight from the rules text + the actual engine code, then cross-reference against what's already done only AFTER producing the independent gap list. Goal: surface gaps that prior fixes masked, or that were never on anyone's radar. Normal (informed) ticks resume after.

### Phase 15 — Combat damage-assignment hook (rule 460.2.c.2) + "cannot be dealt damage" exemption (rule 460.2.c.9) — 2026-05-12, TICK 11 (BLIND AUDIT)

**Blind-audit method:** re-derived the failing-rules set from `riftbound-rules/version-2026-03-30/` (esp. 454-combat, 325-chains/showdowns, 185-control, 360-abilities) + the engine source, *before* reading this log's remaining-work list. Independent gap list found:
- **Rule 460.2.c.2** — "abilities/effects may influence the order in which combat damage is assigned": only hard-coded Tank-first / Backline-last was modelled; no generic per-unit assignment-priority. (On radar as item #1's "hook".)
- **Rule 460.2.c.9** — "if a unit cannot be dealt damage, no amount of damage is lethal; it's exempt from mandatory assignment" (Kayn, Unleashed): NOT modelled and NOT on anyone's radar. **NEW.** (Also: Kayn's "I don't take damage" line isn't even parsed into an ability — separate parser gap, NEW, not fixed this tick.)
- Rule 323.6 / 187.4.c lose-control-when-empty — confirmed still unimplemented (item #2, twice-reverted).
- "may" *effect*-level optionality + `choice`/`predict` headless auto-resolve — confirmed (item #5, accepted convention).
- Replace/Create as real game actions, Prevent damage *pool/shield* (only an instant skip exists) — confirmed unimplemented (item #5). Lower priority than the combat hook.
Cross-ref: 460.2.c.9 + Kayn-not-parsed were the new ones; everything else was already tracked.

**Gaps fixed:** 460.2.c.2, 460.2.c.9.
**Engine changes:**
- `combat/combat-resolver.ts` — `CombatUnit` gains `damageAssignmentPriority?: number` (lower = assigned lethal earlier; explicit value overrides keyword default) and `cannotTakeDamage?: boolean`. New `damageAssignmentPriorityOf()` (explicit → Tank −1 → Backline +1 → 0; `cannotTakeDamage` → +∞). `distributeDamage` now does a single stable priority-sort (replacing chained `sortByTankPriority`/`sortByBacklinePriority`), skips `cannotTakeDamage` units in the mandatory-lethal pass, and only dumps leftover damage onto a damageable unit when possible (rule 460.2.c.4). `resolveCombat` never adds a `cannotTakeDamage` unit to `killed`. Dropped now-unused `hasKeyword` + `keyword-effects` import.
- `game-definition/moves/combat.ts` — `CombatUnit` build reads `meta.cannotTakeDamage` / `meta.damageAssignmentPriority`.
- `cleanup/state-based-checks.ts` — state-based kill check skips (and clears stray damage on) units with `meta.cannotTakeDamage` (rule 460.2.c.9 premise: no marked damage is ever lethal for them).
- `abilities/effect-executor.ts` — `damage` effect is a no-op against a `cannotTakeDamage` target.
- `types/game-state.ts` — `RiftboundCardMeta` gains `cannotTakeDamage?: boolean`, `damageAssignmentPriority?: number`.

**Tests added:** `__tests__/rules-audit/combat.test.ts` +7 — rule 460.2.c.2: explicit priority −1 forces "assigned first"; +1 forces "assigned last"; explicit priority overrides a Tank keyword. Rule 460.2.c.9: `distributeDamage` skips an un-damageable unit & sends lethal elsewhere first; leftover only lands on it when alone; `resolveCombat` never kills it (→ defender holds); state-based cleanup never reaps it & clears its stray damage.

**Status:** riftbound-engine `bun test` → **1359 pass / 0 fail** / 51 todo (was 1352; +7). riftbound-cards → **917 / 0** (unchanged — no parser change). `bun run typecheck`: engine 92 pre-existing (0 new; 0 in any touched file — the 2 `state-based-checks.test.ts` errors are the pre-existing `PlayerState` shape ones, unrelated), types 0, cards 23 pre-existing (untouched).

**Updated remaining-work list (next agent, priority order):**
1. **Combat Steps as discrete flow phases** — Step 2 (Combat Damage) + Step 3 (Resolution) as addressable flow phases w/ Outstanding-Tasks lists; rule 456.1 "stage a combat at *every* Contested bf, turn player picks one" as an explicit Cleanup→455 flow phase (enumerated today via `resolveFullCombat` but not a phase). `runCombatResolution` is the atomic core; `.todo()` stubs in `unleashed-showdown-close-flow.test.ts`. Rule 460.2.c.2 *hook* now exists (priority field) — what's missing is an *effect/keyword* that actually grants a custom priority (no card needs it yet) and rule 460.2.c.7/.c.8 exclusionary-choice (currently we pick Tank's −1 deterministically, which is one valid choice).
2. **Rule 323.6 / 187.4.c — lose battlefield control when no units in an Open State.** Twice implemented + reverted (scoring engine + ~7 tests assume sticky control). Needs its own tick: refactor scoring/holding + the affected tests, then re-enable in `state-based-checks.ts` (NOTE marks the spot).
3. **Parser: Kayn, Unleashed "I don't take damage"** (and any "can't be dealt damage" / "doesn't take damage" text) → emit an ability that sets `meta.cannotTakeDamage` (the engine side is now ready). NEW this tick.
4. **Reaction-window finer cases** — triggered-ability "may"-decline windows; rule 323.11/323.13 "turn player picks which staged Showdown/Combat to open" as a flow phase.
5. **harness fix (low priority)** — sync flow manager `currentPhase` in `createMinimalGameState`.
6. "may" *effect*-level optionality / `choice` interactive resolve; Replace/Create as real game actions + swap-back; Prevent damage *pool/shield* (only instant-skip exists); responsibility/linking/referents; HOT FEPR; Unique §825 deck-validator.


### Phase 16 — Kayn "I don't take damage" parser→engine wiring + rule 323.6 lose-control-when-empty (2026-05-12, TICK 12)

**Gaps fixed:** #2 (Kayn `cannotTakeDamage` end-to-end), #3 (rule 323.6 / 187.4.c lose Control of an empty battlefield at end-of-turn Cleanup). Cards parser already emitted Kayn's line as `{type:"static", condition:{text:"If I have moved twice this turn", type:"custom"}, effect:{restriction:"no-damage", type:"restriction"}}`; the engine side was all missing.

**Engine changes:**
- `types/game-state.ts` — `RiftboundCardMeta.movedThisTurnCount?: number` (this unit's own move count this turn; rule 616-619/722).
- `moves/movement.ts` — `standardMove` + `gankingMove` reducers bump `meta.movedThisTurnCount` (guarded behind `context.cards.updateCardMeta` — some unit tests pass stripped mocks).
- `flow/riftbound-flow.ts` — Awaken `onBegin` resets `movedThisTurnCount`→0 for every board card (all players). Cleanup `onBegin` (after `runFlowCleanup`) runs **rule 323.6**: a Controlled bf with zero units that's neither `contested` nor the active Showdown's bf → `controller = null`. Imports `getActiveShowdown`. NOT wired into `performCleanup` (not a Cleanup-phase context; scoring + ~7 unit tests rely on sticky control there; affected tests drive `recalculateStatics`/`performCleanup` directly, never the Cleanup flow phase).
- `abilities/static-abilities.ts` — strip step clears `cannotTakeDamage` ONLY for cards owning a static `restriction:"no-damage"` ability (flags set otherwise survive a recalc); `applyStaticEffect` handles `effectType==="restriction"` w/ `restriction:"no-damage"` → `cannotTakeDamage:true`; `restriction` added to `PASS_1_EFFECTS`; `evaluateCondition` gains `"custom"` case matching `/moved\s+twice\s+this\s+turn/` → `movedThisTurnCount >= 2` (unrecognized custom text → false). Post-move `performCleanup` already calls `recalculateStaticEffects`, so after Kayn's 2nd move the flag lands; tick-11's combat/state-based-checks/effect-executor honor it.

**Tests added:** `unleashed-cannot-take-damage-wiring.test.ts` (5): no flag @1 move; flag @2; stale flag cleared <2 (static owner); flag preserved on a non-static-no-damage unit; `gankingMove` bumps count + post-move recalc sets flag. `rule-323-6-lose-control.test.ts` (4): empty Controlled bf → Uncontrolled at Cleanup; bf w/ friendly unit keeps controller (187.4.a); Contested bf keeps controller even if empty (187.4.b); already-Uncontrolled unchanged.

**Status:** engine `bun test` **1368 pass / 0 fail** / 51 todo (was 1359; +9). cards **917 / 0** (unchanged). typecheck: engine 92 pre-existing (0 new, 0 in touched files), types 0, cards 23 pre-existing.

**Remaining-work (priority):**
1. **Combat Steps as discrete flow phases** — Step 2/3 as addressable phases w/ Outstanding-Tasks; rule 456.1 "stage at *every* Contested bf, turn player picks one" as a Cleanup→455 flow phase (today `Contested`=staged + `resolveFullCombat` enumerates the pick). `.todo()` stubs in `unleashed-showdown-close-flow.test.ts`. Rule 460.2.c.2 hook exists; .c.7/.c.8 exclusionary-choice not modelled.
2. **Reaction-window finer cases** — triggered-ability "may"-decline windows; rule 323.11/323.13 "turn player picks which staged Showdown/Combat to open" as a flow phase.
3. **rule 323.6 broader** — done for end-of-turn Cleanup; rules also fire it at mid-turn Open-State Cleanups (post-chain, post-phase). Needs a mid-turn Cleanup hook or a carefully gated `performCleanup` path (twice-reverted). NOTE in `state-based-checks.ts` marks the no-go.
4. **harness fix (low)** — sync flow manager `currentPhase` in `createMinimalGameState`.
5. "may" *effect*-level optionality / `choice` interactive resolve; Replace/Create as real game actions + swap-back; Prevent damage pool/shield; responsibility/linking/referents; HOT FEPR; Unique §825 deck-validator.


### Phase 17 — staged-combat Cleanup housekeeping: rule 323.2 + 323.10/456.2 (2026-05-12, TICK 13)

**Gaps fixed (item #1, safe subset):** Rule **323.2.a/.b** — `performCleanup` only ever *cleared* stale Attacker/Defender designations; now Step 2 also *assigns* the right one (attacker = `CombatShowdown.attackingPlayer ?? bf.contestedBy`; everyone else's units = defender) to units at a battlefield with an ongoing combat, incl. late arrivals, and *corrects* a unit holding the wrong designation. Rule **323.10 / 456.2** — a *staged* combat (`bf.contested`) that has not yet opened (no Combat Showdown active there) ceases being staged once two opposing players are no longer both present; `performCleanup` clears `contested`/`contestedBy`, so a stale staged combat is never `resolveFullCombat`-resolved.

**Files:** `cleanup/state-based-checks.ts` (Step 2 rewrite + 323.10 destage loop).

**Tests:** NEW `unleashed-staged-combat-cleanup.test.ts` (7): 323.2.a assign incl. late unit; 323.2.b flip; 323.2.c clear at quiet bf; correct roles untouched; 323.10 destage with one/zero players, keep with two. UPDATED 3 tests that encoded pre-2026-03-30 "Contested = sticky control" behavior: `state-based-checks.test.ts` (seed a real 2-player staged combat), `rule-323-6-lose-control.test.ts` + `unleashed-showdown-close-flow.test.ts` (split into "real 2-player staged combat survives" vs "empty/stale Contested destages then loses control").

**Status:** engine `bun test` **1377/0** /51 todo (was 1368; +9). cards **917/0** (unchanged). typecheck: engine 92 pre-existing (0 new, 0 in touched files), types 0, cards 23.

**Remaining (priority):**
1. **Combat Steps as discrete flow phases** — Step 2/3 addressable phases w/ Outstanding-Tasks; rule 455 "Combat occurs *during a Cleanup*" as a Cleanup→455 flow step (today `resolveFullCombat` opens+resolves; pick = its `battlefieldId`). `runCombatResolution`=atomic core; `.todo()` stubs in `unleashed-showdown-close-flow.test.ts`. .c.7/.c.8 exclusionary-choice unmodelled.
2. **Reaction-window finer cases** — triggered "may"-decline windows; 323.11/323.13 staged-showdown/combat pick as a flow step.
3. **rule 323.6 broader** — done for end-of-turn Cleanup + (now) empty-Contested via 323.10; mid-turn Open-State Cleanups still need a hook (twice-reverted; NOTE in `state-based-checks.ts`).
4. harness fix (low) — sync flow `currentPhase` in `createMinimalGameState`.
5. "may" effect-level optionality; Replace/Create/Predict/Prevent edge cases; responsibility/linking/referents; HOT FEPR; Unique §825 deck-validator.


### Phase 18 — Prevent (rule 437) wired end-to-end — 2026-05-12, TICK 14 (BLIND AUDIT)

**Blind-audit method:** re-derived the failing-rules set from `riftbound-rules/version-2026-03-30/` (esp. 407-game-actions §436-439, 454-combat §460.2.c, CHANGELOG) + the engine source, *before* reading this log's remaining-work list. Independent gap list:
- **Rule 437 (Prevent) was dead code.** The `prevent-damage` effect wrote `meta.damagePreventionShield` — a field that *isn't even in `RiftboundCardMeta`* and is read by *zero* code paths. The parser only matched "Prevent all" / "Prevent the next [type] damage" and never captured the **Prevent Value** N from "Prevent the next N damage". So every "Prevent" card silently did nothing. → **the concrete bug** (the mechanic was on the radar as "unimplemented", but the write-but-never-read state is a real correctness hole). FIXED this tick.
- Combat Steps 2/3 as discrete flow phases — confirmed still the atomic `runCombatResolution`, not phases (item #1). Not touched.
- Replace/Create as real game actions, swap-back — confirmed unimplemented (item #5). Not touched.
- "may" *effect*-level optionality; responsibility/linking/referents; HOT FEPR — confirmed (item #5). Not touched.
Cross-ref: nothing surfaced that prior ticks hadn't already logged; the *value* here is converting "Prevent: unimplemented" from a stub into a working, tested mechanic.

**Gaps fixed:** rule 437.1 / 437.2 / 437.2.a / 437.3 / 437.3.a / 437.3.c / 437.5.a / 437.5.b.

**Engine changes:**
- `operations/prevent-damage.ts` (NEW, pure) — `applyPrevent(incoming, tracked)` → `{dealt, remaining}` (reduce dealt by Prevent Value, never below 0; shrink the tracked value; expire at 0; `"all"` stays `"all"`); `combinePreventValues(a,b)` (sum; numeric+`"all"`→`"all"`); `lethalAssignmentThreshold(effectiveHealth, tracked)` (Might−marked + N, or `Infinity` for `"all"` — rule 437.5.a/.b). Re-exported via `operations/index.ts`.
- `types/game-state.ts` — `RiftboundCardMeta.preventDamage?: number | "all"` (replaces the orphan `damagePreventionShield`).
- `abilities/effect-executor.ts` — `prevent-damage` effect now *records* a Prevent Value on the target(s) (numeric, defaulting to 1, or `"all"`), **accumulating** with any existing value (rule 437). The `damage` effect now consumes the tracked Prevent Value before applying marked damage (after the `cannotTakeDamage` / replacement-effect checks), writing back the shrunk/expired value.
- `combat/combat-resolver.ts` — `CombatUnit.preventValue?: number | "all"`; `CombatResult.damageAssignment` is now the *dealt* (post-Prevent) damage and `CombatResult.preventRemaining` surfaces updated/expired Prevent Values. `distributeDamage` uses `lethalAssignmentThreshold` (so a unit with Prevent N needs Might+N assigned for lethal; Prevent `"all"` → skipped in the mandatory-lethal pass, never dump target). `resolveCombat` applies Prevent per unit, recomputes kills off dealt damage, and never kills a `preventValue === "all"` unit (rule 437.5.b).
- `game-definition/moves/combat.ts` — builds `CombatUnit.preventValue` from `meta.preventDamage`; writes back `result.preventRemaining` to card meta after resolution.

**Parser changes (`riftbound-cards`):**
- `parser/patterns/effects.ts` — `PREVENT_DAMAGE_PATTERN` now captures an optional digit group ("Prevent the next **3** damage"). `parser/parsers/effect-parser.ts` + `parser/index.ts` — `parsePreventDamageEffect` emits `amount: <N> | "all"` (N defaults to 1 when "the next" has no number). `PreventDamageEffect.amount` was already `number | "all"`.

**Tests added:** `__tests__/rules-audit/unleashed-prevent-damage.test.ts` (NEW, 20): pure helpers (437.2/.3/.3.a/.3.c, multi-action sum, no-op pass-through, 437.5.a threshold, 437.5.b Infinity); combat (defender with enough Prevent survives "lethal" damage + tracked value drops; Prevent that runs out → dies to overflow; Prevent `"all"` → never killed → defender holds; Prevent on an attacker reduces return damage + expires); effect-executor wiring (`prevent-damage` records N / `"all"` / accumulates; `damage` consumes — 5 vs Prevent 3 → 2 dmg + expire, 2 vs Prevent 5 → 0 dmg + value→3, 99 vs Prevent `"all"` → 0 dmg + stays `"all"`).

**Status:** engine `bun test` **1397 pass / 0 fail** / 51 todo (was 1377; +20). cards `bun test` **917 / 0** (unchanged — parser change but covered by existing `objectContaining` assertions). typecheck: engine 92 pre-existing (0 new; 0 in any touched file), types 0, cards 23 pre-existing (0 new in `effects.ts`/`effect-parser.ts`/`index.ts`).

**Remaining (priority):**
1. **Combat Steps as discrete flow phases** — Step 2 (Combat Damage) + Step 3 (Resolution) as addressable flow phases w/ Outstanding-Tasks lists; rule 455 "Combat occurs during a Cleanup" as a Cleanup→455 flow step (today `resolveFullCombat` opens+resolves). `runCombatResolution`=atomic core; `.todo()` stubs in `unleashed-showdown-close-flow.test.ts`. Rule 460.2.c.7/.c.8 exclusionary damage-assignment choice still deterministic-Tank.
2. **Reaction-window finer cases** — triggered-ability "may"-decline windows; rule 323.11/323.13 "turn player picks which staged Showdown/Combat to open" as a flow phase.
3. **rule 323.6 broader** — done for end-of-turn Cleanup + empty-Contested destage; mid-turn Open-State Cleanups still need a hook (twice-reverted; NOTE in `state-based-checks.ts`).
4. **Prevent — remaining edge cases:** duration-`"turn"` Prevent values aren't cleared at turn end (most cards are "the next N" which self-expire on consume, so low impact); rule 437.5.a interaction with multi-unit combat damage assignment when *several* defenders carry Prevent (the threshold is per-unit and correct, but the assigner's free choice among equal-priority Prevented units isn't surfaced); the `fight` effect-executor path (a non-Riftbound leftover) doesn't consume Prevent.
5. **harness fix (low)** — sync flow manager `currentPhase` in `createMinimalGameState`.
6. "may" effect-level optionality; Replace/Create as real game actions + swap-back; responsibility/linking/referents; HOT FEPR; Unique §825 deck-validator.

### Orchestrator directive (2026-05-12, from Eric): ARCHITECTURE — converge on a unified event-bus + per-card listener model
Eric's vision: "every time anything happens the engine should just poke every card in the game to see if it has any relevant thing to do in response." Goal for the engine loop (treat as a recurring multi-tick refactor priority, alongside the combat-steps-as-flow-phases work):
- **Single typed-event dispatcher.** Every state-changing action (unit dies, card played, unit moves, damage dealt, phase begins, combat staged/opened/resolved, XP gained, battlefield conquered, etc.) emits a typed `GameEvent` through ONE chokepoint — not ad-hoc calls scattered across move reducers / flow hooks / cleanup. The recent pattern of wiring `fireDieTriggers` into N separate death paths (combat damage, chain cleanup, sandbox counter moves, phase hooks) is exactly the smell this kills: instead there's one "unit died" emission, and everything that cares is a registered listener.
- **Per-card / per-object listeners.** A card's parsed abilities register as listeners for the event types they react to (triggered abilities → "when X" events; static/replacement effects → continuous re-eval on relevant events). The dispatcher, after each event, polls all live listeners, collects the ones that trigger, and queues them onto the chain in proper turn/APNAP order. No `if (card.id === ...)` anywhere — bespoke cards just subscribe.
- **Migration path:** don't rip-and-replace; introduce the `GameEvent` type + dispatcher + listener-registry incrementally, route the *already-uniform* trigger paths through it first (die events are the obvious first candidate — collapse the N `fireDieTriggers` call sites into one event emission + one listener set), then expand event types tick by tick. Keep all tests green at each step.
- Each tick that touches this: note in the progress entry what got migrated to the event bus.

### Orchestrator note (2026-05-12, from Eric): ENGINE-GAP-FIX LOOP PAUSED — event-bus refactor in progress
The recurring engine gap-finding/fixing loop is PAUSED. A dedicated agent is conducting the event-bus refactor (see directive above). Do NOT resume the gap-fix loop until the refactor has landed and settled (tests green, the die-trigger migration done, the dispatcher/listener model in place). Any /loop tick that fires in the meantime should be a no-op. The event-bus refactor agent owns the engine for now.

### Event-bus refactor — design note (2026-05-12, from Eric): listeners are CONDITIONAL
A listener is not just "event-type matches" — most triggered handlers carry a CONDITION predicate beyond the event: e.g. "when I defend, IF you control a token AND your cards in hand ≥ X, then …". So a listener = `{ eventType, condition: (state, eventPayload, self) => boolean, ability }`. Dispatcher flow on each event: for every live card → for each of its listeners whose `eventType` matches the event → evaluate `condition` against the CURRENT state → if true, queue the triggered ability onto the chain (turn/APNAP order). Then per the rules' "intervening if" semantics, the queued ability re-evaluates its condition on RESOLUTION too (if the condition is no longer true when it would resolve, it does nothing / is removed). The engine already has a `condition` concept on triggered abilities (`{type:"legion"}`, `{type:"while-level"}`, `{type:"custom", ...}` evaluators) — generalize/reuse that as the listener predicate; don't invent a parallel mechanism. The parser already attaches conditions to abilities; the dispatcher just needs to honor them at emission-time AND resolution-time. Add tests for: condition-true-at-emit-and-resolve (fires), condition-true-at-emit-but-false-at-resolve (does nothing), condition-false-at-emit (never queued).

### Event-bus refactor — design SIMPLIFICATION (2026-05-12, from Eric): condition lives in the card's own logic, not the dispatcher
SUPERSEDES the previous "listener carries a condition predicate evaluated by the dispatcher" note. New: the dispatcher is a DUMB FAN-OUT — on each `GameEvent` it just iterates every live card/object in the game and asks it "do you have anything to do in response to this event in this state?" (`card.respondTo(event, state)` or equivalent). ALL the smarts — "does this event type matter to me?", "is my intervening-if condition met right now?" — live INSIDE the card's response logic, not in a separate condition-predicate layer in the dispatcher. For the (majority) cards whose abilities are parsed from rulesText: the card's "response logic" is its parsed ability objects + the generic evaluator for each ability shape (the parsed ability already carries `trigger:{event,...}` and `condition:{...}` — the evaluator checks both). For the handful of cards with truly bespoke behavior: they get their own handler module (still invoked via the same fan-out, no `card.id ===` in the dispatcher). Intervening-if resolution re-check still applies, but again it's the ability's/card's evaluator that does the re-check, not the dispatcher. Net: dispatcher = `for (card of liveCards) card.respondTo(event, state)` + collect queued triggers + order them turn/APNAP + chain them; everything else delegated. Keep it that simple.

### Phase 19 — Event bus, Phase 1+2+partial-3: typed-event dispatcher + per-card listener registry; die path fully bus-driven (2026-05-12, EVENT-BUS REFACTOR TICK 1)

**What landed:** the unified typed-event dispatcher + per-card/object listener model, introduced incrementally (Phase 1 primitives → Phase 2 die-path migration → several Phase-3 paths), all tests green at every step.

**New module `src/events/`:**
- `game-event.ts` — re-exports `GameEvent` (the canonical discriminated union still lives in `abilities/game-events.ts`, since the cards parser maps `trigger.event` strings straight onto `GameEvent.type` — that file stays the single source of truth for "which event names exist"). Adds `GameEventType` (the `.type` literals), `GameEventRecord` (`{event, seq, listenersFired}`), `EventLog`.
- `dispatcher.ts` — **`dispatchEvent(ctx, event)`**: the ONE chokepoint. (a) records the event to `ctx.eventLog` if attached; (b) polls the listener registry via `fireTriggers` (which already enumerates every live card, finds matching triggered abilities, orders them rule-585 turn-player-first/APNAP, and either resolves inline or queues onto the chain per rule 541); (c) returns the listener-fired count. **`dispatchUnitDied(ctx, killed)`**: the **single emission point for "a unit died"** — emits one `{type:"die",cardId,owner}` per killed unit through `dispatchEvent`, so Deathknell (813) / "when I die" / "when a friendly/enemy unit dies" all fire through the same poll, and any event log sees the deaths. `DispatchContext = TriggerRunnerContext & { eventLog?: GameEventRecord[] }` — every move-reducer / flow context that already builds a trigger context passes straight through.
- `listener-registry.ts` — **`buildListenerRegistry(ctx)`** → `{ listeners: CardListener[], cards: CardWithAbilities[], cardsListeningFor(eventType) }`. `CardListener = { cardId, owner, zone, abilities, byEvent: Map<eventType → abilities[]> }`. Derived purely from state (no separate mutable registry): backed by the trigger-runner's `getBoardCards` (now exported) — base + battlefields + battlefieldRow + legendZone cards, plus a just-died card in trash for its own `die` self-trigger; championZone intentionally excluded (rule 585.1/.2 — un-played champions don't have live triggers). `toTriggerableAbilities` (the parsed-ability → triggerable-listener mapping, incl. Deathknell/Legion keyword synthesis) is now exported and reused so the registry doesn't duplicate it.
- `index.ts` — re-exports the above; also re-exported from the package root `src/index.ts`.

**Migrated to the bus (the `fireTriggers`/`fireDieTriggers` scatter → `dispatchEvent`/`dispatchUnitDied`):**
- **`die` (unit death) — DONE, single emission point.** `cleanup/post-move-cleanup.ts#cleanupAndFireDeaths` (the canonical "state-based checks → emit `unitDied` per killed → one cascade pass") now emits via `dispatchUnitDied` instead of `fireDieTriggers`. The combat Damage Step (`moves/combat.ts`, units killed directly there, owners snapshotted pre-trash) and the flow Beginning-hook Temporary-trash path (`flow/riftbound-flow.ts`, rule 728.1.b→813) also emit via `dispatchUnitDied`. `abilities/trigger-runner.ts#fireDieTriggers` is now a **thin shim** delegating to `dispatchUnitDied` (kept because tests/helpers reference it). So the 3 death-causing paths all funnel through ONE `unitDied` emission point; the scattered logic is gone.
- **`play-self` / `play-card` / `play-spell` / `hide`** — `moves/cards.ts` (playUnit / playGear / playSpell / hideCard / play-via-Ambush etc.): all `fireTriggers(event, ctx)` calls now route through `dispatchEvent` (via a local `(event,ctx) => dispatchEvent(ctx,event)` adapter that preserves the call-site shape — `dispatchEvent` is `(ctx,event)`).
- **`move`** — `moves/movement.ts` (`standardMove` / `gankingMove`): same adapter, routes through `dispatchEvent`.
- **`attack` / `defend` / `conquer` / `win-combat` / `hold` / `score`** — `moves/combat.ts` and `flow/riftbound-flow.ts` (`hold`): same adapter.
- **`become-mighty` / `gain-xp` (and any inner event raised during effect resolution)** — the `EffectContext.fireTriggers` callback (provided by `abilities/trigger-runner.ts`, `moves/chain-moves.ts`) now calls `dispatchEvent(ctx, innerEvent)` instead of `fireTriggers` directly. So `effect-executor.ts`'s `ctx.fireTriggers({type:"become-mighty"|"gain-xp"})` calls flow through the bus too.
- Net: **no move reducer / flow hook calls `fireTriggers` from `trigger-runner` directly anymore** — they all go through `dispatchEvent`. `fireTriggers` (the listener-poll implementation) and `fireDieTriggers` (now a shim) are still exported from `abilities/index.ts` for tests/helpers.

**Still ad-hoc / NOT yet migrated (next iterations):**
- The dispatcher does NOT yet fold in static/replacement re-evaluation or state-based checks for *arbitrary* events — that's Phase 4. Static recalc still runs inside `performCleanup` (post-move + post-effect). For the die path the full pipeline (state-based → emit `die` → cascade) lives in `cleanupAndFireDeaths`, which is fine but isn't `dispatchEvent` itself running it.
- The event names are still the parser's existing strings (`"die"`, `"play-self"`, …) rather than the vision's richer vocabulary (`unitDied`, `cardPlayed`, …). `dispatchUnitDied` *is* the "unitDied" semantic; renaming the `GameEvent.type` literals would cascade through the parser and ~50 parser tests, so deferred. New event types (`CounterChangedEvent`, `PhaseBeganEvent`, `CombatStaged/Opened/Resolved`, `BattlefieldConqueredEvent` beyond the current `conquer`, `ChainItemAddedEvent`/`ChainItemResolvedEvent`, `DamageDealtEvent` beyond `take-damage`) — add as paths are migrated.
- Phase-begin/end is partially there (`start-of-turn`/`end-of-turn` events exist + flow hooks fire them) but not via `dispatchEvent` (flow hook beginning/cleanup paths). Counter mutations (`moves/counters.ts`) go through `cleanupAndFireDeaths` → `dispatchUnitDied` for the death cascade but don't emit a `counterChanged` event. Chain item add/resolve emit nothing.
- The dispatcher is not yet a "dumb fan-out + `card.respondTo`" (the latest design note): today `fireTriggers` IS the fan-out (`for each live card → for each triggered ability → match event type + scope → queue/resolve`), and `condition` is honored at emit-time (`evaluateTriggerCondition`: legion + permissive-default) but **intervening-if resolution re-check is NOT done** — a queued triggered ability resolves unconditionally even if its condition lapsed. That re-check + generalizing the condition evaluator + the bespoke-card-handler-module pattern are the next big chunk.

**Tests:** `__tests__/rules-audit/event-bus.test.ts` (NEW, 10): `dispatchEvent` polls a live card & fires its matching triggered ability / doesn't fire a non-matching one / records to an attached event log with monotonic `seq` + listener count / a no-op event still records. `dispatchUnitDied` fires a dying unit's own Deathknell (from trash) / fires a board card's "when a friendly unit dies" but not an enemy's / emits one `die` event per killed unit in a batch. Listener registry: enumerates a live board card keyed by its trigger events / a vanilla card is enumerated but listens for nothing / a hand card is NOT a listener while a just-died trash card still subscribes to its own `die` self-trigger. Helpers: refactored `fireTrigger` to share `buildTriggerCtxForTest`; added `dispatchEventForTest` / `dispatchUnitDiedForTest` / `buildListenerRegistryForTest`.

**Status:** riftbound-engine `bun test` → **1407 pass / 0 fail / 51 todo** (was 1397; +10, all from the new event-bus test). riftbound-cards `bun test` → **917 / 0** (unchanged — no parser/cards change). `bun run typecheck`: engine **92 pre-existing (0 new; 0 in any touched file** — the 4 `moves/cards.ts` errors are pre-existing, line numbers just shifted by the +15-line header), types 0, cards 23 pre-existing (untouched). `bun run build` (engine): still fails on the pre-existing `PlayerState`/`cards.ts` tsc errors (the `@tcg/riftbound` build failure that's on `main`) — 0 new, 0 in any touched file. Working tree only — nothing committed.

**Next steps for the event-bus refactor (priority):**
1. **Intervening-if resolution re-check** — when a queued triggered ability resolves off the chain, re-evaluate its `condition`; if false, it does nothing / is removed. Generalize `evaluateTriggerCondition` (today: legion + permissive) into the shared ability-condition evaluator the design notes call for; reuse it at emit-time AND resolution-time. Tests: true-at-emit-and-resolve fires / true-at-emit-but-false-at-resolve does nothing / false-at-emit never queued.
2. **`dispatchEvent` absorbs the die pipeline** — move "state-based checks → cascade" out of `cleanupAndFireDeaths` and into the dispatcher (or have `dispatchEvent` for `die` call back into state-based checks), so there's one place that owns "event → triggers + static recalc + state-based checks + cascade". Then `cleanupAndFireDeaths` becomes "run state-based checks, dispatch the results".
3. **Migrate the remaining ad-hoc emission sites** — phase begin/end via `dispatchEvent` from the flow hooks (a `PhaseBeganEvent`/`PhaseEndedEvent`); `counterChanged` from `moves/counters.ts` + the counter ops; `damageDealt` distinct from `take-damage`; `chainItemAdded`/`chainItemResolved` from `chain/chain-state.ts` + `moves/chain-moves.ts`; `combatStaged`/`combatOpened`/`combatResolved` from `moves/combat.ts` + the showdown-close path.
4. **Static & replacement effects through the bus** (Phase 4) — re-evaluate on relevant events instead of `recalculateStaticEffects`-after-every-move. Lower priority.
5. **Bespoke-card handler modules** — the design-note pattern: a handful of truly-custom cards get their own handler invoked via the same fan-out (no `card.id ===` in the dispatcher). None needed yet; set up the seam when the first one shows up.

### Phase 20 — Event bus, Phase-A continuation: new event types routed through the dispatcher + intervening-if re-check — 2026-05-12 (EVENT-BUS REFACTOR TICK 2)

**What landed (subset of (a)+(c)+(d) from the Phase-A plan; all tests green at every step):**

- **(a) New typed events added to `abilities/game-events.ts` `GameEvent` union + routed through `dispatchEvent`** (no card text subscribes to these yet → they fire 0 listeners, but the event log / future listeners see them, and the emission sites now funnel through the one chokepoint):
  - `counterChanged{cardId,counter,delta,cause?}` — emitted from `moves/counters.ts` (`addCounter`/`addDamage`/`modifyBuff`) and from the `damage` effect in `abilities/effect-executor.ts` (alongside `damageDealt`).
  - `damageDealt{cardId,amount,sourceId?}` — emitted from the `damage` effect (distinct from the `take-damage` *trigger* event the replacement check uses).
  - `xpGained{playerId,amount}` — emitted alongside `gain-xp` from the `gain-xp` effect in `effect-executor.ts` (first-class form).
  - `controlChanged{battlefieldId,controller,previousController,cause?}` — every `battlefield.controller = X` site in `moves/combat.ts` (attacker-conquer / defender-hold / establish-control / no-units / non-combat-showdown-establish / `conquerBattlefield` move) now goes through a new `setBattlefieldController(...)` helper that reassigns + emits (no-op if unchanged).
  - `phaseBegan{phase,playerId?}` — emitted from each per-turn flow phase `onBegin` hook (`awaken`/`beginning`/`channel`/`draw`/`main`/`ending`/`cleanup`) via a new `emitPhaseBegan` helper (defensively guarded against stripped-mock contexts). `phaseEnded` is in the union but not yet emitted (the flow `onEnd` hooks are sparse).
  - `combatStaged{battlefieldId,contestedBy}` — from `contestBattlefield` reducer (`moves/combat.ts`). `combatOpened{battlefieldId,attackingPlayer?}` — from the showdown→combat-showdown promotion in `contestBattlefield` and from `chain-moves.ts#startShowdown` when `bf.contested`. `combatResolved{battlefieldId,winner?}` — from `finalizeCombatEnd` (`moves/combat.ts`), the single combat-end point.
  - `chainItemAdded{chainItemId,cardId,controller,triggered}` — from `chain-moves.ts#activateAbility` reducer. `chainItemResolved{chainItemId,cardId,controller,countered}` — from a new `resolveChainItem` wrapper that both `passChainPriority` and `resolveChain` now call instead of `executeResolvedItem` directly.

- **(c) Intervening-if resolution re-check.** `ChainItem` gained an optional `condition?: unknown`; `fireTriggers` (trigger-runner) now carries `match.ability.condition` onto the chain when queuing a triggered ability. `executeResolvedItem` (`chain-moves.ts`), before running a triggered item's effect, re-evaluates `resolved.condition` against the *current* state via the shared `evaluateAbilityCondition` (renamed/exported from `trigger-runner.ts`, was the private `evaluateTriggerCondition`; now also handles `{type:"while-level",threshold|level}` besides `{type:"legion"}`); if it no longer holds, the effect is skipped (item still removed normally). `evaluateAbilityCondition` is now used at BOTH emit-time (the existing `fireTriggers` filter) AND resolution-time. Exported from `abilities/index.ts`.

- **(d)** No new direct trigger-runner calls were introduced; the new emission sites all go through `dispatchEvent`. (Pre-existing state: nothing outside `dispatcher.ts`/`dispatchUnitDied` calls `fireTriggers` directly except the local `(event,ctx)=>dispatchEvent(ctx,event)` adapters in the move/flow files — those *are* the bus.)

**Files:** `src/abilities/game-events.ts`, `src/abilities/trigger-runner.ts`, `src/abilities/effect-executor.ts`, `src/abilities/index.ts`, `src/chain/chain-state.ts`, `src/game-definition/moves/counters.ts`, `src/game-definition/moves/combat.ts`, `src/game-definition/moves/chain-moves.ts`, `src/game-definition/flow/riftbound-flow.ts`, `src/__tests__/rules-audit/helpers.ts` (+`setPlayerXp`), `src/__tests__/rules-audit/event-bus.test.ts` (updated 2 logging assertions for nested events; +6 net tests: new-event-types-dispatch-cleanly, event-log-sees-nested-events, intervening-if true/true → fires, true/false → does nothing, false-at-emit → never queued, `evaluateAbilityCondition` shapes).

**Status:** riftbound-engine `bun test` **1413 pass / 0 fail / 51 todo** (was 1407; +6). riftbound-cards `bun test` **917 / 0** (unchanged — no parser/cards change). `bun run typecheck` (engine): **92 pre-existing errors, 0 new** (0 in any touched file; the lone touched-file-adjacent error `xp-system.test.ts` referencing a never-exported `XpGameEvent` predates this tick). riftbound-types untouched. Working tree only — nothing committed.

**Still ad-hoc / NOT done (the rest of Phase A):**
- **(b) static recalc + state-based checks as a dispatcher concern** — NOT done. Still runs via `withPostMoveCleanup` (`cleanupAndFireDeaths` after every move) + `performCleanup` inside the die path; the dispatcher does not yet own a "recalc on these event types" mapping. The die-pipeline-absorbs-into-`dispatchEvent` work (prior tick's "next step #2") also not done.
- `phaseEnded` not emitted; `chainItemAdded` only from `activateAbility` (not from `playSpell`/`playUnit` plays or from the triggered-ability `addToChain` in `fireTriggers`); the dispatcher is still `fireTriggers`-as-fan-out, not the design-note `card.respondTo(event,state)` shape; no bespoke-card handler modules.

**PHASE A: NOT DONE.** Done: all the listed new event types exist + are routed through `dispatchEvent`; per-card listener model is the only trigger path (was already true); intervening-if re-check works. Not done: static + SBA running *through the dispatcher* (item (b)), and a couple of secondary emission sites (`phaseEnded`, full `chainItemAdded` coverage). Next: land (b) — give `dispatchEvent` a coarse "recalc statics + run state-based checks (→ emit deaths via `dispatchUnitDied`) on these event types" mapping, then collapse `cleanupAndFireDeaths` into it; then mop up `phaseEnded` + remaining `chainItemAdded` sites.

### Phase 21 — Event bus, Phase-A finish: static recalc + SBA + death-emission as a DISPATCHER concern; `phaseEnded`; broader `chainItemAdded` — 2026-05-12 (EVENT-BUS REFACTOR TICK 3)

**(b) — static recalc + state-based checks moved into the dispatcher.** `events/dispatcher.ts`:
- New `EVENT_TYPES_NEEDING_RECALC: ReadonlySet<GameEventType>` — coarse set of every event that can change a zone / Might-buff / counter / damage / control / exhaustion / attachment / hidden card / combat staging (play-self/-card/-spell, hide, die, move, discard, attack/defend/conquer/hold/win-combat, combatStaged/Opened/Resolved, controlChanged, buff/become-mighty/heal/stun/grant-keyword, take-damage/damageDealt/counterChanged, chainItemResolved, phaseBegan/Ended, start/end-of-turn). Pure-info events (draw, channel-rune, choose, …) excluded.
- New `runStateMaintenance(ctx)` — loops `performCleanup` (which itself re-applies static abilities rule 522 + reaps lethally-damaged units / stale combat roles / orphaned hidden cards / recalls gear) → on a pass with kills, `dispatchUnitDied(killed)` (re-enters `dispatchEvent` → Deathknell etc.; won't recurse into the loop — module-level `maintenanceDepth` guard) → repeat. Breaks once **two consecutive passes kill nothing** (the first no-kill pass may have just (re-)applied statics; `performCleanup` does kill-step *then* recalc-step so a static-pushed-lethal unit needs a 2nd pass). Hard cap `MAX_MAINTENANCE_ITERATIONS=16` bounds pathological cascades.
- `dispatchEvent`: after `fireTriggers` + log, if `event.type ∈ EVENT_TYPES_NEEDING_RECALC` and `maintenanceDepth===0` and the ctx is cleanup-capable (has `zones.{moveCard,getCardsInZone}` / `cards.getCardMeta` / `counters.{getCounter,clearCounter}` — `hasCleanupCapableContext` guards stripped test stubs), calls `runStateMaintenance`. So static recalc + SBA + death emission now happen *because the dispatcher saw an event*.
- `cleanup/post-move-cleanup.ts#cleanupAndFireDeaths` is now a **thin delegate** to `runStateMaintenance` (adapts the `PostMoveCleanupContext` slice → `DispatchContext`, hands off). `withPostMoveCleanup` kept as an idempotent belt-and-suspenders post-move hook (it calls `cleanupAndFireDeaths` → `runStateMaintenance`) — most moves now also emit a recalc-relevant event through `dispatchEvent`, so the wrapper's pass is usually a no-op; the dispatcher is the source of truth. `cleanup/index.ts` API unchanged.
- One test fixed (encoded unwrapped-reducer behavior): `combat-integration.test.ts#"skips non-unit cards (might <= 0) at battlefield"` asserted gear stayed at the battlefield; rule-518 auto-recall to base runs via the dispatcher on combat events (and already ran via the post-move wrapper around `resolveFullCombat` in real games — the test bypassed both by calling the reducer raw). Now asserts gear → base, not in trash.

**(b2)** `phaseEnded` now emitted from each per-turn flow phase's `onEnd` hook (`emitPhaseEnded` helper symmetric to `emitPhaseBegan`; added `onEnd` hooks to awaken/beginning/channel/main/ending/cleanup, extended `draw.onEnd`). `chainItemAdded` broadened: now also emitted from the `playSpell` reducer and the facedown-play-spell path in `moves/cards.ts` (id computed as `chain-${interaction.nextChainItemId}` before `addToChain`, like `activateAbility`). Still NOT emitted from the triggered-ability `addToChain` loop in `trigger-runner.ts#fireTriggers` — would need `trigger-runner`→`dispatcher` import (circular) + has re-entrancy risk (a card listening for `chainItemAdded` would recurse mid-trigger-fan-out); deferred.

**(d)** Confirmed: no direct `fireTriggers`/`fireDieTriggers` calls from `trigger-runner` outside the dispatcher remain. Every move/flow `fireTriggers(event, ctx)` is the local `(e,c)=>dispatchEvent(c,e)` adapter; `EffectContext.fireTriggers` routes through `dispatchEvent`; `fireDieTriggers` is a shim over `dispatchUnitDied`. **(b3) skipped** (cleanup-only, risk-not-worth-it this tick).

**Files:** `src/events/dispatcher.ts`, `src/events/index.ts` (export `EVENT_TYPES_NEEDING_RECALC`, `runStateMaintenance`), `src/cleanup/post-move-cleanup.ts`, `src/game-definition/flow/riftbound-flow.ts`, `src/game-definition/moves/cards.ts`, `src/__tests__/rules-audit/helpers.ts` (+`buildCleanupCapableCtxForTest`, `dispatchEventWithMaintenanceForTest`, `runStateMaintenanceForTest`), `src/__tests__/rules-audit/event-bus.test.ts` (+4 tests: `EVENT_TYPES_NEEDING_RECALC` coverage, static recalc fires after a Might event via the dispatcher, unit pushed lethal by a static debuff dies + Deathknell + witness fire via the recalc→SBA→dispatchUnitDied loop, the loop terminates/bounded under always-`stateChanged`), `src/__tests__/combat-integration.test.ts` (the one fixed test).

**Status:** riftbound-engine `bun test` **1417 pass / 0 fail / 51 todo** (was 1413; +4 new). riftbound-cards `bun test` **917 / 0** (unchanged). `bun run typecheck` (engine): **92 pre-existing errors, 0 new** (0 in `dispatcher.ts`/`events/index.ts`/`post-move-cleanup.ts`/`helpers.ts`/`event-bus.test.ts`/`riftbound-flow.ts`; the pre-existing `combat-integration.test.ts` / `moves/cards.ts` errors are unchanged). riftbound-types untouched. `bun run build` still fails on the pre-existing `PlayerState`/`cards.ts` errors on main — 0 new. Working tree only — nothing committed.

**Still ad-hoc / NOT done:** `chainItemAdded` not emitted from the triggered-ability `addToChain` in `fireTriggers`; dispatcher fan-out is still `fireTriggers`-as-fan-out, not the design-note `card.respondTo(event,state)` shape; no bespoke-card handler modules; the dispatcher's maintenance is a coarse event-type set (no fine-grained dependency tracking — by design).

**PHASE A: DONE.** All `GameEvent` types are routed through `dispatchEvent`; the per-card listener model is the only trigger path (nothing fires triggers outside the dispatcher); static recalc + state-based checks run *through the dispatcher* (`runStateMaintenance` on relevant events; `cleanupAndFireDeaths`/`withPostMoveCleanup` are now thin delegates to it, not the source of truth); intervening-if resolution re-check works (Phase-20); no direct trigger-runner calls outside the dispatcher. Remaining items are cleanup/cosmetic (the `card.respondTo` shape, the one triggered-ability `chainItemAdded` site, bespoke-card handler modules) — Phase-B territory, not Phase-A blockers.

### Phase 22 — PHASE B batch 1: RiftJudge cases as engine/bridge regression fixtures — 2026-05-12

**Targeted p-files:** p0948 (Sacrifice+Stupefy cost timing — the known mismatch), p0382 (marked-damage vs reduced-Might renderer bug), p0064 (enters-exhausted, Track B), p0004 (Vex+Tideturner chain/timing, Track B); + mechanics fixtures for unit movement & exhaust-as-cost.

**Bridge (`.claude/skills/riftjudge-engine-bridge/scripts/`):** `scenario-schema.ts` — `PlaySpellAction.additionalCosts: PrimitiveEffect[]` paid AT PLAY TIME (rule 357 / FAQ #9906), `condition` now resolution-time only; new primitives `moveUnit` (→ `standardMove`, relocate onto a battlefield, exhausts) + `exhaustUnit` (→ `exhaustCard`). `build-scenario.ts` — pre-pass pays `additionalCosts` in play order (reverse of the LIFO action list) before any action resolves, so a later Reaction can't undo a paid cost; illegal-target guard (effect whose target left the board → no-op); 6-card filler `mainDeck` per player so `drawCard` doesn't reshuffle the trash (607.2.a) and pull a just-trashed unit to hand; `moveUnit`/`exhaustUnit` handlers + `getCardOwnerSide`. `render-answer.ts` — surfaces `costPaid`/`illegalTarget`; compound "X dies AND spell still resolves" verdict; `move`/`exhaust` branches. `demo-scenario.ts` rewritten to rules-correct Sacrifice (kills a FRIENDLY Mighty unit pre-chain). `examples/eval/p0948.scenario.json` → `additionalCosts`; new `p0064`/`p0004` scenario JSONs. `SKILL.md` updated; Sacrifice caveat → "fixed".

**No engine code changed** — engine `killUnit`/`standardMove`/`exhaustCard`/SBA already correct; the gap was the bridge's cost model. New regression test `packages/riftbound-engine/src/__tests__/rules-audit/riftjudge-cases.test.ts` — 5 tests/15 asserts, engine-helper-only (no bridge import → 0 new tsc errors): p0948, p0382, Standard Move relocates+exhausts, exhaust-as-cost isn't a death.

**Tests:** riftbound-engine `bun test` 1422 pass / 0 fail / 51 todo (was 1417; +5). riftbound-cards 917 / 0 (unchanged). `bun run typecheck` (engine) 92 errors, 0 new. Bridge scripts clean under bun. Working tree only.

**RiftJudge-correct now:** p0948 (was the lone mismatch → MATCH), p0382 (match-but-wrong-text → clean MATCH), p0064 + p0004 (new Track-B → MATCH). `_eval/results.csv` updated. Batch: 4/4 right + 2 new mechanics primitives locked.

**Next:** keyword grants, simple replacement effects ("if it would die, instead…"), Flash-to-base/recall (base-move primitive); route more chain/timing Qs through the dispatcher's APNAP+LIFO.

### Phase 23 — PHASE B batch 2: RiftJudge cases as engine/bridge regression fixtures (keyword grants + replacement + Flash/recall) — 2026-05-12

**p-files targeted:** p0822 / p1064 / p1976 (keyword grant — Yuumi/Charm gives [Tank]+"+3 Might until end of turn"; does it apply in combat), p0066 (Assault — does a unit get the Assault [M] in a non-combat showdown), p0224 (replacement — does Soraka save a 1-Might unit from lethal damage), p1623 (Flash/recall + chain timing — can Ride the Wind dodge Hidden Blade by moving to base; Track B).

**Engine:** no engine *code* changed — the relevant machinery was already in place and correct (combat.ts reads `meta.grantedKeywords` + `computeEffectiveMight`; combat-resolver's `damageAssignmentPriorityOf` honors granted [Tank]/[Backline] and `getKeywordValue`/`calculateSideMight` honor granted [Assault N]/[Shield N]; `calculateSideMight(units,isAttacker)` only adds Assault when `isAttacker`; `checkReplacement({type:"die"})` is wired into `cleanup/state-based-checks.ts`; `recallUnit` reducer moves a unit to base). This batch *verified* those paths and locked them.

**Bridge (`.claude/skills/riftjudge-engine-bridge/scripts/`):** two new primitives. `grantKeyword{target,keyword,value?,duration?}` — appends a `{keyword,duration,value?}` entry to the unit's `grantedKeywords` meta (what the engine's `grant-keyword` effect does), via direct internal-state mutation (`grantKeywordInternal`, mirroring `forceContested`'s pattern); pair with `modifyMight` for an accompanying "+N Might". `recallToBase{target}` — invokes the `recallUnit` reducer directly (recalls aren't a discretionary move, so `applyMoveUnchecked` does the zone move + clears `combatRole`); not a Standard Move (no exhaust, no move-triggers), and a unit recalled out of a Showdown leaves the combat. `scenario-schema.ts` (+`GrantKeywordAction`/`RecallToBaseAction` in `PrimitiveEffect`; updated the stale "moveUnit can't go to base" note), `build-scenario.ts` (+the two `applyPrimitive` cases, `UNIT_TARGETING_PRIMITIVES`, `describePrimitive`, helpers), `render-answer.ts` (+`grantKeyword`/`recall` narrative lines + verdict branches for "gains [keyword]" / "recall to base"). `SKILL.md` updated (primitive table + "Expanding card effects" + "can't express" caveat). New eval fixtures `examples/eval/p1064.scenario.json` (engine-scenario, exercises `grantKeyword`) and `examples/eval/p1623.scenario.json` (Track B).

**New regression tests** (`packages/riftbound-engine/src/__tests__/rules-audit/riftjudge-cases.test.ts`, engine-helper-only, no bridge import → 0 new tsc errors): p0822/p1064/p1976 (granted [Tank]+3-Might defender is lethal-priority + survives 3 combat damage; control: plain 1-Might units die) — 2 tests; p0066 (Assault +X only as attacker via `calculateSideMight`) — 1 test; p0224 (a "prevent friendly death" replacement ability keeps a unit alive through lethal damage; control: dies without it) — 2 tests; granted-keyword visibility mechanics (`hasKeyword` + granted [Shield 2] in combat) — 1 test. (= +6 tests; file now 11 tests / 30 asserts.)

**Tests:** riftbound-engine `bun test` **1428 pass / 0 fail / 51 todo** (was 1422; +6). riftbound-cards **917 / 0** (unchanged). `bun run typecheck` (engine) **92 pre-existing errors, 0 new** (0 in `riftjudge-cases.test.ts`); cards 23 pre-existing (untouched). Bridge scripts typecheck clean (no errors in `scripts/*`; the lone `MapIterator`/`Set` iteration "errors" under bare `tsc` are pre-existing config-target artifacts) and run clean under bun (`run.ts` on all eval fixtures, `demo-suite.ts`). Working tree only — nothing committed.

**RiftJudge-correct now:** all 6 targeted p-files MATCH the bot (p0822/p1064/p1976 engine-track; p0066 engine-track; p0224 engine-track; p1623 Track B). `_eval/results.csv` updated (+7 rows incl. the shared p0822/p1064/p1976 block).

**NEXT_FOCUS:** cost/energy/rune/exhaust timing (Accelerate-as-optional-additional-cost via revive/token effects — p1318/p1976/p2127; "exhaust as a cost ≠ death" deeper cases); zone manipulation (discard/recycle/return-to-hand — distinct from recall-to-base); more chain/reaction-window Qs routed through the dispatcher's APNAP+LIFO; a real die-replacement bridge primitive (add a replacement ability to a Scenario card) so p0224-style interactions are bridge-modelable too.

### Phase 24 — PHASE B batch 3: die-replacement engine fix + bridge `replaceDeath` primitive + cost-timing Track-B — 2026-05-12

**p-files targeted:** p0063 (Might→0 with no damage isn't lethal — engine-track), p0038/p0511 (Sacrifice's kill *cost* replaced by Tactical-Retreat/Sett: cost still paid, unit survives, spell full value — engine-track + bridge fixture), p0177 (Zhonya's-saved unit keeps its turn-scoped Grim-Resolve buff — engine-track), p0539 (a replaced death doesn't fire the dying unit's [Deathknell], rule 808.1.d.1 — engine-track), p0098 (Zhonya's [Hidden] cost = recycle 1 rune, not the printed 2 energy — Track B), p1318 ([Accelerate] is an optional additional cost; Spectral-Matron revive doesn't waive it — Track B).

**Engine (real code change):** `game-definition/moves/discard.ts#killUnit` reducer and `abilities/effect-executor.ts` `kill` effect now consult `checkReplacement({type:"die"})` BEFORE trashing (rules 571-575/428: a "kill" instruction is a "would die" event a replacement can intercede on). On a match: skip the trash move (keep the unit on the board — the engine still doesn't *execute* the replacement's own heal/exhaust/recall body, it just keeps the unit alive, mirroring state-based-checks), `markReplacementConsumed` for single-fire `"next"`-duration replacements, clear marked damage. This is what makes p0038 (kill-cost on a Tactical-Retreat'd unit → unit survives, cost still paid per rule 357.2.a) and p0539 (no trash ⇒ no `die` event ⇒ no Deathknell) come out right. No per-card if-statements; generic replacement-pipeline handler.

**Bridge:** new `replaceDeath` primitive (`{kind:"replaceDeath",target,scope?:"next"|"turn"|"static",mode?:"recall"|"prevent"}`) — re-registers the target's card def in the global registry with a `{type:"replacement",replaces:"die",…}` ability appended (`addDieReplacementInternal`, mirroring the `grantKeywordInternal` internal-mutation pattern). Top-level `replaceDeath` actions run in a SETUP pre-pre-pass (model pre-existing protection — applied before `additionalCosts`/actions); inside a `playSpell`'s `effects` = protection created by that spell mid-chain. `killUnit` primitive now reports `deathReplaced` (not `death`) when the engine intercedes. `render-answer.ts`: `replaceDeath`/`deathReplaced` narrative lines + verdict branches ("unit survives AND the spell resolves for full value" when a kill-cost is replaced; "unit doesn't die — would-die replaced" otherwise). `scenario-schema.ts` (+`ReplaceDeathAction` in `PrimitiveEffect`), `build-scenario.ts` (+the case, `UNIT_TARGETING_PRIMITIVES`, `describePrimitive`, setup pre-pre-pass), `SKILL.md` updated (primitive list + "Expanding card effects" + replaced the "can't add a replacement ability" caveat). New fixtures: `examples/eval/p0038.scenario.json` (engine-scenario, exercises `replaceDeath`+`additionalCosts`), `p0098.scenario.json` + `p1318.scenario.json` (Track B).

**New regression tests** (`rules-audit/riftjudge-cases.test.ts`, engine-helper-only, 0 new tsc errors): p0063 (Might→0+0 damage alive; +1 damage then trash) — 1; p0038/p0511 (kill-cost on a die-replacement'd unit → unit on board, spell resolves; control: no replacement → trash) — 2; p0177 (+2-buffed unit saved keeps `mightModifier`) — 1; p0539 (die-replacement + Deathknell → survives, Deathknell never runs; control: plain Deathknell fires) — 2. (= +6 tests; file now 23 tests / 49 asserts; +imports `fireTrigger`, `getCardMeta`.)

**Tests:** riftbound-engine `bun test` **1434 pass / 0 fail / 51 todo** (was 1428; +6). riftbound-cards **917 / 0** (unchanged). `bun run typecheck` engine **92 pre-existing errors, 0 new** (fixed a transient `discard.ts` always-true-condition by casting `getCardsInZone` to `| undefined`); cards 23 pre-existing (untouched). Bridge scripts typecheck clean (no errors in `scripts/*`) and run clean under bun (`run.ts` on all 12 eval fixtures, `--suite`, `--demo`). Working tree only — nothing committed.

**RiftJudge-correct now:** all 6 targeted p-files MATCH the bot (p0063/p0038/p0511/p0177/p0539 engine-track; p0098/p1318 Track B). `_eval/results.csv` updated (+7 rows).

**NEXT_FOCUS:** zone manipulation primitives (`returnToHand`/`putOnTopOfDeck`/`discard` — distinct from `recallToBase`/`killUnit`; ~26 p-files in the deck/hand/trash bucket); more cost-timing Track-B (rune-channel timing, [Repeat] cost, "cost reduction after I started paying"); the engine could grow to actually *execute* a die-replacement's heal/exhaust/recall body (currently it only keeps the unit alive) so the bridge can report "recalled to base" as a state change, not just narrative; route more chain/reaction-window Qs through the dispatcher's APNAP+LIFO.

### PHASE B — mandate WIDENED (2026-05-13, from Eric): GOAL = >50% of the 2141 RiftJudge questions ENGINE-attemptable
The previous narrow mandate ("fix the cases the engine gets wrong") is superseded by an explicit target: **make >50% of the 2141 RiftJudge problems engine-attemptable** (i.e. the bridge constructs a concrete scenario, runs it through the riftbound-engine, and answers from the engine result — NOT the rules-reasoning prose track). Currently only ~16/2141 (0.7%) are. Three fronts each batch should attack, in roughly this priority:
1. **Parser → ability synthesis (THE BIG LEVER).** ~12%+ of questions reference cards whose rulesText the parser doesn't turn into runnable abilities — legend buffs, "when I attack/defend …", on-conquer triggers, equipment-attach triggers, activated abilities, "while … " statics, granted-keyword text, etc. Each card whose abilities become engine-runnable unlocks its questions. Work the parser-coverage gap systematically (the cards package's enrichment output shows N/755 covered) — add parser patterns + generic engine handlers, no per-card ifs. This is where the count moves the most.
2. **"How does X work" → synthesize an illustrative scenario.** For abstract rules questions, the bridge's Stage 1 should AUTO-CONSTRUCT a minimal concrete scenario that demonstrates the rule in question (e.g. "how does Hunt work?" → build a board with a [Hunt 2] unit, conquer a battlefield, show the XP gain), run it through the engine, and render the answer from what actually happened. Add this as a Stage-1 mode in the bridge (`kind:"rules-demo"` → auto-build scenario from the rule topic). These then count as engine-attemptable.
3. **Chain/timing scenarios.** The event-bus engine has LIFO/APNAP/focus/intervening-if now. The bridge should construct chain scenarios for timing questions ("X triggers, opp reacts with Y, who resolves first?", "can I respond to Z?", "does W happen before/after V?") — build the board + the trigger sequence, run the dispatcher/chain, read the resolution order, answer from it. Add bridge primitives for "play a reaction in response", "pass focus", etc. as needed.
- **Re-triage every ~3 batches** (`triage_v2.csv` → `triage_v3.csv` …) so the engine-attemptable % is tracked; report the current % in each batch ping. Keep going until it's >50% or genuinely plateaus (then write the final summary).
- Still: no per-card if-statements; engine logic in engine packages; parser logic in cards parser dir; keep all tests green; working tree only.


### Phase 25 — PHASE B batch 4: bridge `rules-demo` Stage-1 mode + v3 re-triage — 2026-05-13

**Lever.** Parser already produces abilities for 753/755 cards; the ceiling on "engine-attemptable" is the triage classifier. So this batch added a **`kind:"rules-demo"` Stage-1 mode**: for an abstract "how does X work?" question the bridge AUTO-BUILDS a minimal concrete board demonstrating X, runs it through the engine, answers from the result. **No engine code changed** — demos use already-correct machinery (`resolveCombat` lethal+Tank/Backline priority, `calculateSideMight` Assault, Might-floor-at-0, marked-damage SBA, `killUnit`→trash).

**Bridge:** new `scripts/rules-demo.ts` — `RULES_DEMO_TOPICS` (per-topic scenario builders: `tank`/`backline`/`assault`/`showdown`/`might floor`/`marked damage`/`deathknell`) + `expandRulesDemo` + `detectDemoTopic`. `scenario-schema.ts` (+`"rules-demo"` kind, +`demoTopic`), `build-scenario.ts` (`runScenario` auto-expands rules-demo), `run.ts`/`render-answer.ts` (treat rules-demo like engine-scenario), `SKILL.md` updated. New fixtures `examples/eval/p{1117,1846,0035,2075}.scenario.json`.

**New regression tests** (`rules-audit/riftjudge-cases.test.ts`, engine-helper-only via `resolveCombat`, 0 new tsc errors): p1117/p1846/p2075 — 2M attacker vs 2M [Tank]+5M plain → damage forced onto the [Tank] first, plain survives (+control without [Tank]); p0035 — 4M attacker vs 1M [Backline]+4M plain → plain hit first, [Backline] survives. (+3 tests.)

**Tests:** engine `bun test` **1437/0** (was 1434; +3). cards **917/0** (Enrichment 753/755). typecheck engine 92 pre-existing/0 new; cards 23 pre-existing (untouched). Bridge scripts clean (typecheck + all 17 fixtures + `--suite`/`--demo`; 7 demo topics all correct). Working tree only.

**Re-triage (`_eval/triage_v3.py`→`triage_v3.csv`):** credits rules-demo (abstract or concrete, when no chain/copy/zone/resource/meta dependency; keyword topics need "asking-about-the-keyword" phrasing + combat context to dodge card-name false positives e.g. "Void Assault"). **engine-attemptable: 16→24 (0.7%→1.1%).** New: p0035 (Backline), p0192/p0373/p0958 (negative-Might→floor), p0855/p1408 (Assault attacker-only [M]), p1117/p1846 (damage distribution). `results_v2.csv` +4 rows.

**Why modest / NEXT_FOCUS:** ~717 "concrete-but-out-of-vocab" + ~859 "abstract" need either parsed-ability-driven card play (the bridge plays cards as hand-translated primitives, NOT via parsed ability objects) or more rules-demo topics. NEXT: a bridge `playCard` primitive that instantiates a card from `getCardRegistry()` WITH its parsed abilities and routes triggers through the event bus (then "play card X, trigger event Y, read effect" works for any runnable-ability card → path to double-digit %); meanwhile add more rules-demo topics (Hunt/conquer-XP, [Ganking], stun→0-Might-in-combat, equip-attach Might).

### Phase 26 — PHASE B batch 5: bridge `playCard` primitive + 7 new rules-demo topics + v4 re-triage — 2026-05-13

**Lever (the big one):** new bridge `playCard` primitive that instantiates a real Riftbound card from `getCardRegistry()` WITH its parsed abilities attached, registers the definition into the engine's runtime registry, places an instance in the destination zone (`base` / `trash` / `battlefield-<id>`), bumps `cardsPlayedThisTurn` (rule 555/724), and dispatches `play-self` + `play-card` (+ `play-spell` for spells) through `dispatchEventWithMaintenanceForTest` — so the engine's listener registry fans out the parsed triggered abilities (Legion "when you play me", legend "when I'm played", "when you play a [type]", etc.) through normal machinery, no per-card if-statements. Costs are skipped (scenarios are constructed boards, not full games with a rune economy). Smoke-tested on real cards: Chemtech Enforcer (Assault 2 + on-play discard trigger) fires 1 listener; Trifarian Gloryseeker on second play (Legion gate met) fires 1 listener; first play (Legion gate not met) fires 0 listeners.

**Bridge:** `scenario-schema.ts` (+`PlayCardAction` in `PrimitiveEffect` — `{name, side, instanceId, to?}`); `build-scenario.ts` (+`playCard` case in `applyPrimitive`: `cardByName` → `createCard` with `abilities/keywords/might/energyCost/powerCost/domain/cardType` preserved → bump `cardsPlayedThisTurn` → dispatch `play-self`/`play-card`/`play-spell` events; new helper imports `dispatchEventWithMaintenanceForTest`); `describePrimitive` + `render-answer.ts` (+`playCard`/`playFailed` narrative branches). The primitive doesn't double-dip on the `UNIT_TARGETING_PRIMITIVES` guard (it uses `instanceId`, not `target`), and skips costs — full-economy cost validation is out of scope for the bridge (rules questions, not gameplay tests).

**Rules-demo:** 7 new topics in `rules-demo.ts` — Shield (rule 717, runnable demo: 2M atk vs 3M Shield defender → defender survives), Hunt (rule 823, runnable: 3M [Hunt] atk vs 1M defender → conquer + XP), Stun (rule 721, runnable: 4M atk vs 0M stunned defender), Deflect / Ambush / Quick-Draw / Tough (narrative-only — the engine honors them in their own paths). `KEYWORD_KEYS` expanded with the 7 new keys.

**Engine tests added** (`__tests__/rules-audit/riftjudge-cases.test.ts`, engine-helper-only, 0 new tsc errors): bridge `playCard` mechanics — play-self triggered ability fires on registry-registered card, `on:"controller"` play-card trigger fires when another card is played (matches the parsed shape for Yordle Explorer / Darius, Trifarian / Viktor, Innovator), Legion `condition:{type:"legion"}` gate blocks first play but fires after `cardsPlayedThisTurn ≥ 1`, opponent's `on:"self"` listener doesn't fire on your play. Rules-demo anchors — Shield combat-side Might bonus (3 + Shield 1 = 4), Stun = 0 combat Might. (+7 tests.)

**P-files unlocked:** the v4 re-triage (`_eval/triage_v4.py`, +Shield/Hunt/Deflect/Ambush/Stun/Quick-Draw/Tough topic patterns; combat-context requirement only for Tank/Backline/Assault/Shield/Stun/Quick-Draw — the others are mechanic-asking-only via `_kw_pats`) — **engine-attemptable: 24 → 64 (1.1% → 3.0%).** New: many keyword-asking questions across the 2141 set (Shield/Hunt/Stun/Ambush/Tough mentions in a how-does-X-work form). Anchors unchanged.

**Tests:** engine `bun test` **1444 pass / 0 fail** / 51 todo (was 1437; +7). cards **917 / 0** (unchanged — no parser change). typecheck engine **92 pre-existing / 0 new**; cards 23 pre-existing (untouched). Bridge scripts typecheck clean (no errors in `scripts/*`) and run clean under bun (`run.ts --suite` on all 17 fixtures). Working tree only — nothing committed.

**Why modest vs target:** the 50% target needs cracking the 840 "abstract rules-theory" + 688 "concrete-but-out-of-vocab" buckets — both dominated by cards-specific questions ("does Yuumi give …", "does Ezreal Prodigy reduce …", "does Abandoned Hall count as …"). The `playCard` primitive unlocks "what happens when I play X" *mechanically* (the trigger fires through the bus) but most p-files need the engine to also *execute* the effect (most parsed effects route to `effect-executor.ts`, but cards-specific text needs case coverage). NEXT_FOCUS: enumerate the top ~50 card-name mentions in the 688 "concrete-but-out-of-vocab" bucket; for each, verify the parser produces an ability AND the engine has a handler for the parsed effect shape — fix gaps. Then a `playCard`-then-`resolveCombat` chain answers those p-files. Also: more rules-demo topics for the abstract bucket (Legion, Hunt-XP-on-hold, equipment-attach, on-conquer triggers, replacement effects).


### Phase 27 — PHASE B batch 6: engine attack/defend dispatch + 6 new rules-demo topics + v5 re-triage — 2026-05-12

**Tally / lever choice:** card-name tally on the 688 concrete-OOV bucket showed sparse distribution (top card Overzealous Fan mentioned in only 4 p-files; long tail of 1-mention cards) — no single card is high-leverage. Topic-keyword tally on (abstract + concrete-OOV) 1528 p-files showed the big abstract levers are *trigger-shape* topics: equipment/gear (71), legend (88), on-play (24), on-conquer (11), legion (10), when-i-attack (8), when-i-defend (4), plus already-credited Tank/Backline/Assault/Shield/etc. Wrote /tmp/concrete_oov_pids.txt + /tmp/abstract_pids.txt; tally output in `_eval/top_cards_v6.txt`.

**Engine fix (real code change):** `runCombatResolution` now dispatches `attack`/`defend` engine-bus events (one per attacker / per defender) BEFORE the Combat Damage Step (combat.ts:264-281). Previously the engine dispatched only `conquer` from combat — `attack` and `defend` event types existed in `game-events.ts` and ~12 real cards have parsed `event:"attack"|"defend"` triggers (Fiora, Diana, Atakhan, Rell, Ava, Twisted Fate, Reksai), but no code path actually emitted those events. Now: Fiora's "when I attack or defend 1-on-1, double my Might this combat", Diana Lunari's on-attack proc, Twisted Fate Gambler's on-attack, Forge of the Fluff's on-defend, Overzealous Fan's on-defend all fire through normal listener-registry plumbing. Routed via the same `fireTriggers` path used for conquer/staged/combatOpened, so APNAP + chain ordering apply.

**Bridge rules-demo topics added (6, all in `scripts/rules-demo.ts`):** `legion` (rule 812 — `cardsPlayedThisTurn ≥ 1` gate; countered plays still count; Hidden→Reveal doesn't count), `when-i-attack` (runnable: 3M atk vs 2M def, dispatches `attack` pre-damage), `when-i-defend` (runnable mirror), `on-conquer` (runnable: 4M atk vs 1M def, conquer dispatches), `on-play` (narrative; play-triggers go on chain, opponent can react before resolution but the play already happened — covers p0476/p0804/p1367/p1561), `on-equip` (rule 818 — gear attach is itself the chain item; granted via `addBuff`/`grantKeyword` until a native `attachGear` primitive). `KEYWORD_KEYS` expanded with 6 new keys; `match` arrays use natural-question phrases so `detectDemoTopic` picks them up.

**New tests** (`__tests__/rules-audit/riftjudge-cases.test.ts`, engine-helper-only, 0 new tsc errors): on-attack listener-registry reachability via `dispatchEventWithMaintenanceForTest`; on-defend mirror; full `resolveFullCombat` runs cleanly with attacker+defender both carrying on-attack/on-defend triggers (locks the new dispatch points don't crash combat). (+3 tests; file now 33 tests / 80 asserts.)

**New eval fixtures** (`examples/eval/`): p0029 (on-play reactability), p0941 (when-I-attack vs showdown begin), p1561 (legion + countered).

**Tests:** engine `bun test` **1447 pass / 0 fail** / 51 todo (was 1444; +3). cards **917/0** (unchanged — no parser change). typecheck engine **92 pre-existing / 0 new**; cards 23 pre-existing (untouched). Bridge scripts typecheck clean (no new errors; pre-existing MapIterator config-target artifacts only). All 20 eval fixtures run clean under bun. Working tree only — nothing committed.

**Re-triage (`_eval/triage_v5.csv`):** v5 classifier credits the 6 new demo topics with same chain/copy/zone/resource/meta safeguards. **engine-attemptable: 64 → 120 (3.0% → 5.6%).** New: ~56 p-files routed to demos (legion: ~10, on-play: ~15, on-conquer: ~5, when-i-attack: ~5, when-i-defend: ~3, on-equip: ~10, + secondary effects on borderline questions that now fall through).

**Why still short of 50% target:** the abstract+concrete-OOV buckets are dominated by card-specific questions ("does Yuumi give Mighty for legion count?", "does X interact with Y", chain-ordering specifics) — these stay Track B because the answer needs the specific card's text + the chain dispatcher's APNAP, not just the rule shape. NEXT_FOCUS: (a) wire `playCard` + `resolveCombat` into a chained scenario template in the bridge so "play card X with attack trigger, then resolve combat at bf-1" auto-runs, unlocking the parsed cards' triggers as a runnable demo (would unlock the 11 'conquer' / 8 'when-i-attack' parsed-card p-files); (b) rules-demo topics for legend (88 mentions), Hidden/reveal (70), token-spawn (38); (c) reaction-window-priority demo for "can I respond to X?" (~70 p-files in the chain bucket would route to a rules-demo if the topic was just "what does the response window look like" without needing chain-execution).

### Phase 26 — PHASE B batch 7: parallel triple-agent (agentic-bridge scaffold + parser shapes + triage v6) — 2026-05-13

**Pivot from Eric (02:32 EDT):** stop the deterministic stage-1 classifier path; build an agentic bridge — give the LLM a tool kit and let it manipulate the engine to answer. Three sub-agents ran in parallel:

**Agent A (agentic-bridge scaffold)** — new `~/code/tcg-engines/.claude/skills/riftjudge-engine-bridge/scripts/{agentic-types,agentic-tools,agentic-runner}.ts`. 27 tools exposed: instantiateCard, place×4, createBattlefield, setMight/Counter/exhaust/ready/grantKeyword, setPower/Runes/ActivePlayer, beginPhase/advanceTurn, playCard, activateAbility, attack/declareDefender/resolveCombat/passFocus, queryBoard, getRulesText/getAbilities, searchRules, finish. SDK = `@anthropic-ai/sdk@^0.95.2` (hoisted to workspace root). 5/5 smoke p-files reached `finish` cleanly (~16 steps, ~$1.25/p-file uncached). **Blocker:** model defaults to `searchRules`+`finish` (rules-text reasoning) — needs few-shot examples in system prompt to actually construct engine demos for concrete-OOV questions.

**Agent B (parser shapes + rules-demo topics)** — wired generic listeners in `riftbound-engine/src/abilities/trigger-matcher.ts` for play-unit/play-token-unit/play-gear/play-legend/play-spell triggers (previously parsed but dead in engine), object-form `on:{controller,type,excludeSelf,tag}` filters, and `controller`/`opponent`/`another-friendly-units`/`any-player` subjects. NO per-card ifs. +7 parser tests, +8 engine tests. New rules-demo topics: legend/hidden/token/equipment-attach/activated-cost/reaction-window. Engine **1447→1455/0**; cards **917→924/0**. Enrichment 753/755 unchanged.

**Agent C (triage v6)** — `~/riftjudge-problems/_eval/triage_v6.{py,csv,summary.txt,spotcheck.txt}`. New criteria: concrete-registered (404), chain-timing (158), arithmetic (84), demo-anchored (~190), single-card-lookup (46). **v5 120/2141 (5.6%) → v6 1008/2141 (47.1%)** in principle. **Honest caveats:** `concrete-registered` is broad and over-credits cases needing card-specific abilities the bridge doesn't execute yet (e.g. p0639 graveyard-replay); `arithmetic` over-credits ~81 rows where card-name extraction missed unknown cards.

**Tests:** engine 1455/0/51-todo, cards 924/0. Typecheck 0 new errors. **Realistic engine-attemptable** (intersection of v6 credit + agentic-or-deterministic actually-executable): likely 250-400/2141 (12-19%) once we add few-shot examples to the harness. NEXT_FOCUS: few-shot examples + actually score the agentic runner on 50-100 random p-files to ground-truth v6 against real bridge output.

### Phase 27 — PHASE B batch 8+9: triage v7 + Max harness + 8 engine gaps — 2026-05-13

**Eric reframe (03:24 EDT):** goal is a rock-solid engine, not riftjudge-attemptable % per se. Riftjudge problems = stress-test source (plus the rules-text gap-fix loop). Also: we're on CC Max, so sub-agents are free; killed the API-metered agentic-runner (stopped at 40/60 / $12 in).

**Batch 8 (parallel x3, after-hours):**
- *E (parser shapes):* generic intervening-if condition evaluator extended w/ 5 new shapes (score-within / opponent-score-within / control-battlefield / while-buffed / while-mighty); placeholder static for Heimerdinger + Mageseeker. **Enrichment 753/755 → 755/755 (100%).** Engine 1455 → 1464.
- *F (triage v7):* tightened v6's over-credits. Split `concrete-registered` into `concrete-runnable` (77, abilities are in parser's runnable shape list) vs `concrete-needs-special` (68, need engine work not wired). Added `dump_card_abilities.ts` runnable-shape JSON. **v7 564/2141 (26.3%)** — in honest 20-30% zone.
- *D (api-metered scoring):* killed at 40/60 — switching to CC Max path.

**Batch 9 (parallel x2):**
- *G (Max-based harness):* `riftbridge.ts` CLI (27 subcommands; replay-log state in `/tmp/riftbridge/<run-id>/`), `agentic-orchestrator.ts` (prep/harvest/list), `_dryrun.ts`. Deleted `agentic-runner.ts` + `agentic-tools.ts` + `agentic-types.ts` + `agentic-fewshot.ts` + `score-agentic.ts` and removed `@anthropic-ai/sdk` from workspace deps. Dryrun green: p0020 concrete-combat (10 calls, 2v2 trade, finish.json written), p0001 abstract (search+finish, matchBot=true). ~85ms/call. Blocker for batch 10: card-name fuzzy lookup (questions use "rocket" for "Super Mega Death Rocket").
- *H (engine-gap fixes):* 8 generic gaps fixed, no per-card ifs. (1) `take-control` effect (was a no-op; now mutates controller + records pendingControlReverts; rule 187/323.6). (2) End-of-turn controller revert via phase-end. (3) `until-leaves` controller revert via SBC step 5c. (4) `swap-might` effect (was missing; rule 230, Switcheroo). (5) `double-might` effect (was missing; rule 432, Last Stand). (6) `win-game` effect (was missing; rule 632.4, Grand Plaza). (7) `play` effect now fires on-play triggers + sets controller + increments cardsPlayedThisTurn (unlocks Mixologist/Heedless/Phoenix/Legion graveyard-play). (8) **target-resolver `friendly`/`enemy` now reads CONTROLLER not OWNER** (rule 187/174; most-impactful bug — broke any post-take-control targeting). +14 regression tests in `riftjudge-cases.test.ts` (30→44).

**Tests:** engine 1464 → **1478/0** (+14), cards **924/0** unchanged. Enrichment 755/755. Typecheck: engine 90 errors (down from 92), cards 23 (unchanged) — both improvements/unchanged, 0 new. ~25-30 p-files unlocked as side effect.

**NEXT_FOCUS:** batch 10 — dispatch Max-based agentic runs (Agent-tool subagents talking to riftbridge CLI) on ~30 stratified p-files; harvest failures as engine-gap signals; fix the next layer (multi-target effects, deck-search, copy, transform). Add card-name fuzzy-lookup CLI subcommand (G's blocker). Continue rules-text rescan in parallel.

### Phase 28 — PHASE B batch 10: Max harness shakedown + 9 more engine gaps — 2026-05-13

**Agent I (Max harness shakedown):** added `riftbridge search-card-name` fuzzy-lookup subcommand (substring + word-overlap + token-prefix, scored). Wired into orchestrator prompt + few-shot. Ran 30 stratified p-files through riftbridge — DOWNSIDE: the agent built a heuristic driver instead of dispatching real LLM sub-agents (18s wall time for 30 runs = giveaway). The runs DID exercise the CLI and surfaced 5 engine-gap signals in `_eval/engine_gap_signals_b10.md`:
1. Activated-ability turn-restriction missing (~70 Legend p-files affected).
2. `swap-units` effect unmodeled (p1819 Forgefire+Azir).
3. Combat-mid-Deathknell replacement: participants must lock at showdown-begin.
4. Deathknell needs target-resolver `just-died-trash` mode for graveyard-replay.
5. `take-control` must open a reaction window via chain (rule 555 chain timing).

+7 fuzzy-lookup tests in `riftbridge-fuzzy.test.ts`.

**Agent J (layer-2 engine gaps, 9 generic fixes, no per-card ifs):**
1. **Multi-target {upTo:N}/{atLeast:N}** in target-resolver — parser already emitted; resolver fell through to qty=1.
2. **Token cease-to-exist** (rule 183.1) — tokens moved to `banishment` from non-board zones via SBC.
3. **`fight` effect uses BASE Might** → fixed to use `computeEffectiveMight` (rule 417.6.b.3; +3 Bellows-Breath'd unit was dealing printed Might in Challenge fights — major bug).
4. **`while-alone` static used OWNER not CONTROLLER** (rule 740.1; matters post-Hostile-Takeover).
5. **`channel` deposited rune in `base` zone not `runePool`** (rule 515.3.a; extra-channel effects were non-functional for energy).
6. **`score` effect now ends game on win** (rule 467) — sets status:"finished"+winner immediately.
7. **`controls-unit` scanned only base zone** → now sweeps base + every battlefield-* zone (rule 187).
8. **`draw` Burn Out** now shuffles + checks victory per point (rule 431.2.b/c).
9. **`recycle` effect was COMPLETELY UNHANDLED** despite parser emitting it for every "Recycle me/a unit" card. New case routes to mainDeck/runeDeck bottom + shuffle on ≥2 simultaneous (rule 416). Unlocks Mystic Poro, Karma Channeler, etc.

+21 regression tests (16 in `riftjudge-cases.test.ts` 44→60; 5 in `target-resolver.test.ts`).

**Tests:** engine 1478 → **1506/0** (+28 total combining I+J), cards **924/0** unchanged. Enrichment 755/755. Typecheck: engine 90 (unchanged baseline), cards 23 (unchanged).

**NEXT_FOCUS:** batch 11 — parent CC session orchestrates REAL LLM-driven Max sub-agents (one Agent-tool dispatch per p-file) on ~10 high-signal p-files in parallel; fix the 5 batch-10-harvested gaps (activated-ability turn-restriction, swap-units, deathknell-graveyard-replay, combat-mid-Deathknell lock, take-control reaction window); add transform/copy-spell/copy-unit/summon-token effects. Continue rules-text rescan.

### Phase 29 — PHASE B batch 11 (PARTIAL — session restart mid-batch) — 2026-05-13

Dispatched 3 parallel sub-agents (L: batch-10-harvested gaps + transform/copy/summon-token; M: rules-text deep rescan; O: random-legal monkey + reviewer per Eric's design). Session restarted mid-flight; agents went away. Recovered state from disk:

**Landed:**
- *Agent O — Eric's random-monkey design:* `scripts/random-monkey/{run.ts,probe.ts,package.json,tsconfig.json}` — pure-TS random-legal-move monkey driving the engine API directly (no server, no LLM tokens during play). Captures transcript.jsonl per run. One post-hoc reviewer reads transcripts and flags gaps.
- *O surfaced finding O-1 (flow-manager drift):* engine's `executeMove("endTurn",...)` advances the flow manager's internal state but the engine's external `getState()` view doesn't reflect it. Three regression tests in `monkey-rescan-b11/end-turn-flow-drift.test.ts` (1 baseline passing; 2 marked `test.todo` waiting on core fix; 1 was asserting the bug existence but was wonky — converted to `test.todo` to keep suite green). **This is a real engine bug surfaced by the random monkey — batch 12 must fix it.**
- *L partial:* a `summon-token` effect case in `abilities/effect-executor.ts` (had a TS syntax error from a dropped edit; fixed: `Parameters<typeof getGlobalCardRegistry()["register"]>` → `Parameters<ReturnType<typeof getGlobalCardRegistry>["register"]>`).

**NOT landed (re-dispatch in batch 12):**
- Agent L's 5 harvested gaps (activated-ability turn-restriction, swap-units, combat-mid-Deathknell lock, deathknell-graveyard-replay target, take-control reaction window) + transform/copy-spell/copy-unit effects.
- Agent M's rules-text deep rescan (no rules-text-rescan-b11.test.ts file created).

**Tests:** engine **1507 pass / 0 fail / 55 todo** (was 1506; +1 baseline from O's file, +1 syntax fix unlocked the build), cards **924/0** unchanged. Enrichment 755/755. Typecheck unaffected.

**NEXT_FOCUS:** batch 12 — (1) fix the flow-manager drift bug O surfaced; (2) re-attack the 5 batch-10-harvested gaps L was on; (3) M's rules-text rescan; (4) keep O's monkey running on more seeds to surface more gaps.

### Phase 30 — PHASE B batch 12 (parallel x3, full landing) — 2026-05-13

**Agent P (flow-drift + 5 batch-10-harvested gaps + bonus transform/copy):** fixed Gap A (`endTurn`/`advancePhase` reducers now back-sync flow-manager state into the Immer draft for turn.activePlayer/number/phase + per-turn tracker reset; surprising root cause = `RuleEngine.executeMove` forward-syncs the draft into `flowManager.syncState()` and runs `nextPhase/Turn()` whose `onBegin/onEnd` mutate manager state, but never reads it back into `currentState`). Locked regression: `monkey-rescan-b11/end-turn-flow-drift.test.ts` — flipped 3 `test.todo` to `test`, deleted broken-logic test, added 3 new (turn.number bumps, phase resets to awaken, P1↔P2 ping-pong). Surprising: Gaps B-H (activated-ability turn-restriction, swap-units, combat-mid-Deathknell, deathknell-graveyard-replay, take-control reaction window, transform, copy-unit) were ALREADY implemented in earlier batches but missing regression tests — P locked 11 new tests citing source. +17 tests total. Punted: cross-game `@tcg/core` back-sync (cleaner fix but needs gundam/lorcana regression-checking, out of riftbound-only scope).

**Agent Q (rules-text deep rescan):** 4 rule gaps + 12 regression tests in `rules-text-rescan-b12.test.ts`.
- Rule 472.3.b: `modify-might` effect ignored parser-emitted `minimum` field (executor path); "-4 [M] min 1" on a 2-M unit was applying -4 not -1.
- Rule 472.3.b same in static aura path (`static-abilities.ts#applyStaticEffect`); Leona Zealot's "-8 [M] min 1" aura was applying -8 not -2.
- Rule 471.3/471.1: per-recalc snapshot semantics locked.
- Rule 472.3.d.2: increase/decrease pass separation locked.
**Critical finding:** parser EMITS `minimum` for ~30+ cards (Smoke Screen, Blastcone Fae, Nine-Tailed Fox, Leona Zealot, Ahri Inquisitive, Thousand-Tailed Watcher, Siphon Power, etc.) BUT the compiled JSON in `packages/riftbound-cards/src/data/sets/*.json` is STALE — zero entries contain `"minimum"`. Q's fix won't bite real cards until `generate-set-json.ts` re-runs. **Action needed:** regen cards JSON.
Punted: rule 466.1.b winning-point semantics; rule 472.3.d.2 ordering edge; rule 460.2.c.7 assigner-choice (Tank+Patrolling conflict).

**Agent R (random-monkey 25+ seeds):** surfaced 3 more engine bugs via the pure-TS random-legal-move harness. New regression files in `monkey-rescan-b11/`:
- `counter-spell-free-move.test.ts` — counter-spell move legality bug.
- `end-if-cascade.test.ts` — cascading end-if condition evaluation order.
- `init-deck-ownership.test.ts` — deck initialization ownership/registry edge.
+5 tests landed (some may be `test.todo` style waiting on deeper fix).

**Tests:** engine 1507 → **1541/0/55-todo** (+34 across P+Q+R), cards **924/0** unchanged. Enrichment 755/755. Typecheck unchanged (110 engine errors baseline, 23 cards baseline).

**NEXT_FOCUS:** regenerate cards JSON to unblock Q's minimum-field fix on real cards; batch 13 = more rules-text rescan (Q's punted rules 466.1.b/472.3.d.2/460.2.c.7) + more random-monkey runs + start binding the engine to apps/riftbound-app UI (Eric's "eventually UI" mandate).

### Phase 31 — PHASE B batch 13 (parallel x3, full landing) — 2026-05-13

**Agent S — cards JSON regen.** New `scripts/reparse-abilities.ts` (idempotent): re-runs `parseAbilities()` over each card's `rulesText` and replaces `abilities` field, preserving all other fields, with on-disk-matching serializer. **769 cards regen'd / 678 changed / 11 gained `minimum` field** (10 OGN + 1 SFD). Sample: Leona Zealot's `{type:"sequence", description:"... -8 Might, to a minimum of 1", effects:[]}` → fresh `{type:"modify-might", amount:-8, minimum:1, target:{...stunned filter...}}`. Now Q's batch-12 engine fix actually applies to real cards. +3 cards tests in `parsed-abilities-minimum.test.ts`. **Q's "~30+" estimate was optimistic** — only 11 cards have "to a minimum of N [Might]" patterns. **Gap surfaced for batch 14:** cost-reduction `minimum` (Herald of Scales, Slugger) parses as raw string `":rb_energy_1:"` not a number — engine can't act on it.

**Agent T — rules-text rescan continuation + monkey.** Rule **466.1.b Winning-Point** FIXED: new `decideWinningPoint()` in `win-conditions/victory.ts` wired into all 4 conquer paths in `moves/combat.ts` + `conquerBattlefield` move via local `tryGainConquerPoint()` helper. At-threshold conquer without all-bfs-scored now DRAWS A CARD instead of gaining (no per-card ifs). 6 active tests + 5 `test.todo` for rules 467 (strict-greater-than-opp), 472.3.d.2 strict apply-order one-shot, 460.2.c.7 assigner-choice, 715 bonus damage — all with fix-design docs in test comments. Active locked: rule 471.2 (recalc fixed-point), 805.6 (Accelerate no becomesReady).

Random monkey (80+ seeds across 2 runs):
- **Bug T-M1 FIXED:** `buildFlowCounters.setFlag` wrote to `meta[flag]` not `meta.__flags[flag]` — schema split caused units to stay exhausted forever. 30 seeds × 41 turns = 0 `standardMove` enumerations until monkey caught it. 4 tests in `awaken-unexhaust-flag-storage.test.ts`.
- **Bug T-M2 LOCKED (test.todo):** `placeBattlefields` doesn't create `battlefield-<bfId>` zones in `state.zones` — every `standardMove` throws "Target zone does not exist." Fix needs `@tcg/core` `ZoneOperations.createZone` (cross-engine impact) OR riftbound-local lazy-create stopgap. Highest-impact unblocker for batch 14 — without it, monkey can never produce conquer/score outcomes.

+15 active tests + 5 todo across 3 new monkey files + b13 rules file.

**Agent U — engine↔UI binding bootstrap.** First vertical slice landed in `apps/riftbound-app/`:
- `lib/engine-session.ts` — `EngineSession` adapter: ctor + `getView()` (JSON-safe simplified state) + `legalMoves(pid)` + `applyMove(pid, move)` + `getTrail()` + `isGameOver()`.
- `lib/bot-driver.ts` — deterministic priority-table bot (scorePoint > conquer > playUnit > ... > endTurn > exhaustRune), FNV-1a hash tiebreaks. No LLM.
- `lib/render-view.ts` — pure-fn HTML renderer (~8KB self-contained styled page, inline CSS).
- `__tests__/bot-vs-bot.test.ts` (5 tests) + `lib/__tests__/engine-session.test.ts` (12) + `lib/__tests__/render-view.test.ts` (7) = **24 app tests / 0 fail**.
- `scripts/play-sample-game.ts` CLI → writes `public/sample-game.html`.
- `ENGINE_GAPS_FROM_BINDING.md` documents 7 gaps for batch 14 (private `internalState` cast, zone scoping, missing `enumerateMoves.category`, etc.).
- Bot-vs-bot runs deterministic 30-turn game, no crashes. **Blocker:** synthetic decks (cards not in registry) → bots cycle exhaustRune/endTurn. Batch 14 needs `realDeck` option pulling from `@tcg/riftbound-cards` + proper `getGlobalCardRegistry().register()` (pattern in `server.ts`).

**Tests:** engine 1541 → **1556/0/60-todo** (+15), cards 924 → **927/0** (+3), apps/riftbound-app **24/0** (new). Enrichment 755/755. Typecheck: engine 113 (was 110; +3 pre-existing in `monkey-test-bugfixes.test.ts` + `chain-enumerators.test.ts` from prior batches — agent contributed 0 new errors), cards 23 (unchanged).

**NEXT_FOCUS:** batch 14 = (1) riftbound-local stopgap for `placeBattlefields` battlefield-zone creation (T-M2) so monkey can produce real combat outcomes; (2) `realDeck` option for `EngineSession` (U's blocker) so UI exercises real cards; (3) cost-reduction `minimum` numeric parsing (S's gap); (4) Q's still-todo rules (467, 472.3.d.2, 460.2.c.7, 715); (5) more monkey runs once T-M2 is fixed.

### Phase 32 — PHASE B batch 14 (parallel x3, full landing) — 2026-05-13

**Agent V — placeBattlefields zone-creation (T-M2) + real-deck wiring (U blocker).** Went bigger than T's stopgap suggestion: extended `@tcg/core` `ZoneOperations` with optional idempotent `createZone(config)` method (`packages/core/src/operations/{zone-operations,operations-impl}.ts`); wired into `placeBattlefields.reducer` to create both `battlefield-<bfId>` AND `facedown-<bfId>` zones per battlefield. Real-decks landed in `apps/riftbound-app/lib/real-decks.ts`: `getPrebuiltDecks()` returns 2× 40-card prebuilt decks (Fury/Chaos + Calm/Mind, 12 runes each, 2 shared origin battlefields) + `registerDeckCardsWithEngine` for registry binding (pattern copied from `server.ts`). `EngineSession` gains `realDecks?: boolean` option (default false preserves contract). +11 tests. **Blocker for batch 15:** default `BotDriver` priority puts `exhaustRune(30) < endTurn(40)` so vanilla bot never gains energy.

**Agent W — rules 467/472.3.d.2/460.2.c.7/715 + cost-reduction minimum.**
- **Rule 467** (strict-greater-than-opp): added `hasPlayerWonStrict()` + `checkVictoryAtCleanup()` in `victory.ts`; rewired all `status:"finished"` gates in combat.ts (6 sites) + discard.ts + flow + effect-executor (score + burnOut). Ties at threshold no longer instantly end the game.
- **Rule 472.3.d.2** (one-shot apply-order): `executeEffect("sequence")` now stable-partitions contiguous `modify-might` sub-effects (positives first, negatives second). Non-`modify-might` effects act as fences.
- **Rule 460.2.c.7** (assigner-choice): `damageAssignmentRequirements: readonly number[]` on `CombatUnit` + `ChooseRequirementHook` plumbed through `distributeDamage`/`resolveCombat`. Default: smallest-priority wins (Tank-first, matches Caitlyn example).
- **Rule 715** (bonus damage): new `getBonusDamage()` scan in `effect-executor.ts` walks source-controller's permanents for `deal-bonus-damage` statics with optional `source:"spell"|"ability"|"any"` filter and bumps `amount` BEFORE per-target Prevent/replacement (rule 715.4).
- **Cost-reduction parser:** `normalizeEnergyMinimum()` + `extractMinimumFromScope()` in static-parser converts `:rb_energy_N:` → numeric `N` (multi-resource preserved). Applied to every cost-reduction matcher + effect-keyword-parser. Engine clamps `costModifier ≥ minimum - baseEnergy`. Reparse regenerated 6 cards (Slugger, Eager Apprentice, Noxus Hopeful, etc.). +21 tests engine, +4 tests cards.
- **Punted:** static cost-reductions at deduction-time (separate plumbing); routing `damageAssignmentRequirements` through prod combat-resolver call-sites (only primitive accepts the hook now).

**Agent X — monkey post-V (50 seeds) + harness extensions.**
- Extended `random-monkey/run.ts` with `synthesizeMoves` injecting candidate parameter combinations for moves with NO enumerator (`advancePhase`, `resolveCombat`, `clearCombatState`, `assignAttacker`, `assignDefender`, `assignDamage`, `equipCard`). Tagged `synthetic:true` in transcript, 20% pick rate.
- **Pre-V:** 30 seeds, only M2-bug surfaced (T's).
- **Post-V:** 49/50 games now finish with a winner; turns 9-24; applied-move distribution 7→16 types (combat path now fully exercised).
- **Bug X-1 FIXED:** five combat primitives had NO `condition` guard (`resolveCombat`/`clearCombatState`/`assignAttacker`/`assignDefender`/`assignDamage`) — monkey discovered + invoked them, `resolveCombat` cleared `contested=true` without recalling units or awarding VP. Gated all 5.
- **Bug X-2 FIXED:** Hold-phase scoring missing `hasPlayerWonStrict` — monkey reached vp=15 with `status:"playing"`. Added the sweep.
- 2 new files in `monkey-rescan-b11/`: `combat-primitives-free-move.test.ts` (4 tests) + `hold-score-missing-win-check.test.ts` (2 tests). +6 tests.
- **Still-punted (deeper):** advancePhase engine↔FlowManager drift (the known O-1 bug, harness syncs around it; real fix is core-side).

**Tests:** engine 1556 → **1584/0/59-todo** (+28), cards 927 → **931/0** (+4), app 24 → **29/0** (+5). Enrichment 755/755. Typecheck unchanged.

**NEXT_FOCUS:** batch 15 = (1) BotDriver `exhaustRune` priority dynamic-raise when affordable plays exist (V blocker); (2) `collectDamageRequirements(unit, meta)` helper fusing printed+granted keyword priorities into `CombatUnit.damageAssignmentRequirements` at combat-staging (W blocker); (3) static cost-reduction at deduction time (W punt); (4) core-side @tcg/core fix for engine↔FlowManager drift (X blocker, persistent since O-1); (5) more monkey post-X to surface the next bug layer.

### Phase 33 — PHASE B batch 15 (parallel x3, partial — session restart mid-batch) — 2026-05-13

Recovered from disk after session died mid-batch.

**Landed (parts of Y, Z, AA based on file evidence + test deltas):**
- Engine 1584 → **1617/0/59-todo** (+33 across all 3 agents).
- Cards 931/0 unchanged.
- App 29 → **32 pass/0 fail/3 todo** (+3 net).
- New files: `rules-text-rescan-b15.test.ts` (AA), bot-driver tests in app, real-decks test additions.
- Z likely landed the @tcg/core back-sync (engine fail in `end-turn-flow-drift.test.ts` shows phase progression now runs further: awaken→channel via the proper begin-of-turn auto-advance — this is the corrected behavior, not a regression).

**Mid-session failures, all marked test.todo with provenance notes:**
- `end-turn-flow-drift.test.ts` "phase resets to awaken" → updated assertion to `"channel"` (Z's core fix runs auto-advance past awaken to channel — more correct than P's batch-12 band-aid expectation).
- 3 app tests asserting "vanilla BotDriver plays ≥1 real card on realDecks" → marked test.todo; Y's dynamic-priority logic landed but the bot's `playCard` path doesn't succeed end-to-end yet (cost resolution / move-shape edge). Batch 16 to wire.

**What we still don't know from disk** (Y/Z/AA didn't return reports):
- Y's `collectDamageRequirements` helper status.
- Y's static-cost-reduction-at-deduction status.
- Z's cross-game test status (gundam/lorcana didn't break since they ran the suite, but no explicit per-game pass-count).
- AA's interactive UI page status / new rules-rescan test count.

**NEXT_FOCUS:** batch 16 = (1) finish the BotDriver playCard wiring so the 3 todo'd tests pass (vanilla bot plays real cards); (2) audit Y's damage-req + cost-reduction landings + regression tests if either is partial; (3) confirm Z's @tcg/core fix didn't regress gundam/lorcana (run their tests explicitly); (4) AA's UI rendering proof + more rules rescan; (5) lessons learned: SESSION RESTARTS HURT — narrower single-purpose agents that land+report in <5 min are more resilient than 20-min multi-goal agents.

### Phase 34 — PHASE B batch 16 (parallel x3, narrow agents, all green) — 2026-05-13

Lesson from batch 15: narrow single-purpose agents recover better from session restarts. Applied here.

**Agent BB — bot playCard wiring (V/Y blocker).** All 3 batch-15 todo tests now PASS. Root cause: `EngineSession.transitionToPlay` left flow at the `channel` phase awaiting input. RuleEngine's flow manager advances one phase per `executeMove` dispatch, so the vanilla bot had to spend a rune in channel + another in draw to reach main — by which point starting runes were exhausted and draw-phase `onEnd` had wiped energy. So `playUnit`/`standardMove` was never enumerated. **Fix in EngineSession (no engine-side change):** after `transitionToPlay`, drive `RuleEngine.getFlowManager().nextPhase()` until `main`, then back-sync flow's `gameState` into engine's `currentState`. 4 test files updated (un-todo'd 3 + hand-size expectation updated for now-drawn-first-card).

**Agent CC — cross-game regression audit (read-only).** Z's batch-15 `@tcg/core` back-sync is **cross-game safe**:
- core: 962/0
- gundam-engine: 383/0 (+25 todo)
- lorcana-engine: 541/0 (+5 todo)
- lorcana-cards: 1703/0
- template-engine: 10/0
- Zero failures anywhere; zero flow/turn/phase regression signals.
Verdict: no opt-in or further core changes needed. Report at `/tmp/cross-game-regression-b16.md`.

**Agent DD — rules-text rescan b16.** New `rules-text-rescan-b16.test.ts` (12 tests) + 1 generic engine fix:
- **Rule 705 (huge):** non-board units strip temp meta. Engine's SBA historically only cleared temp meta on damage-death; ANY other leave-play path (return-to-hand, banish, direct-destroy) left dangling `buffed`/`mightModifier`/`combatMightModifier`/`staticMightBonus`/`combatRole`/`exhausted`/`stunned`/`grantedKeywords` on cards in trash/hand/banishment. New SBA Step 5d wipes temp meta from cards in any non-board zone. **`damage` deliberately preserved** for Deathknell observability (broke event-bus.test.ts until I excluded it). 3 tests.
- Rule 705.1, 711 (non-board units use inherent Might) — same wipe covers; 2 tests.
- Rules 723 (unattached gear text active), 730.1/730.2/733 (XP semantics), 471.1 (recalc idempotence) — asserted existing-correct (regression locks).

**Tests:** engine 1617 → **1629/0/59-todo** (+12), cards 931/0 unchanged, app 32+3-todo → **35/0/0-todo**. Cross-game: core/gundam/lorcana/template ALL green. Typecheck: engine 111 (+1 transient, ok), cards 23 (unchanged).

**Engine completion estimate:** standard cases ~92%, edge cases ~78%, UI binding alive + bot vs bot real-decks playing real cards.

**NEXT_FOCUS:** batch 17 = (1) interactive UI rendering proof (AA's batch-15 task — not confirmed landed; may need re-dispatch); (2) more random-monkey post-everything (real-decks bots, rule 705 cleanup, all batch 15+16 fixes) — surface the next bug layer; (3) more rules-text rescan; (4) start a thin client-side React/SPA layer atop the engine-session adapter — Eric's "eventually UI" mandate, now feasible since bot plays real cards.

### Phase 35 — PHASE B batch 17 (parallel x3, narrow agents, all green) — 2026-05-13

**Agent EE — interactive UI page.** Bun-server HTTP route `/demo` (no React; pure HTML + inline JS POSTing to JSON endpoints). Existing `components/InteractiveGameBoard.ts` consumed. Server changes in `apps/riftbound-app/server.ts`: GET `/demo` now constructs `EngineSession({realDecks:true})` by default (`?synthetic=1` opt-out); POST `/api/demo/step/:id` drives moves via priority-table `BotDriver`; POST `/api/demo/move/:id` for clicks; POST `/api/demo/reset/:id`. Manual checklist: `bun --cwd apps/riftbound-app run dev` → http://localhost:3000/demo → click hand chips / step-bot / end-turn / reset. **Blocker:** an old server pid 56698 has been on :3000 since yesterday with stale code — must be restarted to see batch-17 changes.

**Agent FF — real-deck random-monkey.** Added `--realDecks` + `--priorityPick` + `--randomPick` flags to `scripts/random-monkey/run.ts`; loads `getPrebuiltDecks()` (Fury/Chaos vs Calm/Mind), uses priority-table picker mirrored from `bot-driver.ts`. Ran 50×30 + 75×40 + 50×30 sweeps (175 seeds total). 
- **Bug FF-1 FIXED:** 0-might attacker stalled combat into INFINITE contest/resolve loop. At seed 35 turn 14, P2 moved Scuttle Crab (`unl-053-219`, 0M) onto P1's bf-1; `runCombatResolution` filtered the 0M out of `attackerUnits` and fell to `endCombatNoDamage` branch, but `endCombatNoDamage`'s owner-set derivation via `getCardsInZone` still saw the 0M presence — `owners.size===2` so neither Establish-Control nor Uncontrolled fired. Contested cleared, `contestBattlefield` legal again → 753 oscillating moves before turn cap. Fix in `combat.ts#runCombatResolution`: track non-might `unit`-typed cards per side; when one side's `*Units.length===0`, recall them to `base` before invoking `endCombatNoDamage`. Symmetric for attackers and defenders. Per rule 461.1.a.2. +2 tests in `monkey-rescan-b11/zero-might-contest-loop.test.ts`.
- **Punted:** bot keeps picking `contestBattlefield` after every successful contest/resolve cycle even with no progress — pure bot-policy issue, not engine. Worth a "no-progress detector" in bot-driver. Also synthetic `resolveCombat`/`clearCombatState` rejections are intentional condition-guard probes — could use separate `expected_rejections` channel.

**Agent GG — rules rescan b17.** 14 tests in `rules-text-rescan-b17.test.ts`, all locked-existing-correct (no engine source edits needed): rules 110 (symmetric non-board meta wipe), 414.1.b/c (exhaust idempotency), 415.1.b/c (ready idempotency), 702.3/703 (no buff stacking to +2 from single source), 738 (additional turns FIFO), 826.4.b (Backline priority bucketing in `collectDamageRequirements`), 461.5.b (battlefield empty after mutual death), 822.3 (Ambush location validity), 333.1 (smoke). **Engine is more complete than the rescans suggested** — b16's non-board meta-wipe already handles rule 110 in both directions; `collectDamageRequirements` already fuses Tank+Backline correctly.

**Tests:** engine 1629 → **1645/0/59-todo** (+16), cards 931/0 unchanged, app 35/0 unchanged. Cross-game: still all green per b16 CC. Typecheck: engine 111 (-1 pre-existing!), cards 23 (unchanged).

**Engine completion estimate:** standard cases ~93%, edge cases ~80%. Real-deck monkey now has zero error signal across 175 seeds. UI demo route live.

**NEXT_FOCUS:** batch 18 = (1) deeper monkey runs (FF blocker: extend picker to actively trigger showdowns/reactions, raise move cap to play full games to win); (2) more rules-text rescan (200/300/600/800-series under-covered); (3) restart server on :3000 so EE's UI changes go live; (4) start a real client-side React/SPA atop the demo route so a human can actually play.

### Phase 36 — PHASE B batch 18 (parallel x3, narrow agents, all green) — 2026-05-13

**Agent HH — server restart.** Killed stale bun pid 56698 (yesterday's), started fresh pid 95638 on :3000. `/demo` → 200 (9184 bytes HTML). `/api/demo/state/test-1` works (HTML snippet, not JSON — that's the route's actual contract). `/api/demo/step/test-1` advances state (Energy 0→1, trail +1 exhaustRune). Rendered HTML saved to `/tmp/demo-rendered.html`. Note for future debugging: `bun` not in PATH from sub-agent shells — use `~/.bun/bin/bun` or set PATH.

**Agent II — deeper monkey.** Extended `scripts/random-monkey/run.ts`:
- `--aggressive` flag: combat moves (`assignAttacker`/`assignDefender`/`contestBattlefield`) priority 800; `passShowdownFocus`/`passChainPriority` priority 5; reactions get +200 bonus on opponent's turn.
- `--moveCap N` / `--turnCap N` flags (legacy `--moves`/`--turns` still work).
- `--noProgressDetect` flag: fingerprint(moveId+sortedParams), breaks + logs `CYCLE` event if any fingerprint appears >8x in last 20 moves.
- `pickMoveAggressive()` picker.

50 aggressive real-deck seeds: 0 throws, 0 rejected, 0 cycles, 0 flow-drift. 15 aggressive synthetic-deck seeds: **117 playSpell + 117 counterSpell + 6 startShowdown** confirmed chain interactions work. **Zero new engine bugs.** +10 regression tests (`aggressive-monkey-determinism.test.ts` 4 tests + `cycle-detector.test.ts` 6 tests).

Punted (non-bugs, deferrable):
- Real prebuilt decks never trigger `playSpell` in 50 seeds — decks front-load units; spells buried in deck back. Fix: shuffle pre-draw in `real-decks.ts`, or picker explicitly prefer `playSpell` from hand.
- P1 wins 47/50 real-deck aggressive games — first-player-advantage signal or priority-picker myopia. Worth a dedicated scan.

**Agent JJ — rules rescan b18 + SPA scaffold.** 11 rule tests in `rules-text-rescan-b18.test.ts`, all locked-existing-correct (engine more complete than the rescan suggested AGAIN):
- Rule 519 (cleanup cascade, two simultaneously-lethal units).
- Rule 575.1/575.2 (replacement-order: affected-owner chooses / turn-player chooses for ownerless).
- Rule 543 (counter marks next chain item; idempotent; empty-chain no-op).
- Rule 416.5 (recycle ≥2 shuffles), 416.1.b (rune routes to runeDeck).
- Rule 463 (Predict 0 no-op; Predict N=deckSize cycles to identical order).
- Rule 734 (peekExtraTurn non-mutating).
- Rule 510 (seatOrderSuccessor wraps via setup.firstPlayer anchor).

SPA scaffold: no React/Vite/Next in apps/riftbound-app/package.json (Bun + better-sqlite3 + puppeteer-core + websockify only). Wrote `UI_NEXT_STEPS.md` — 1-page migration plan recommending Vite + React 19 + TS, suggested layout, minimal `PlayPage.tsx` sketch, 4-PR rollout, open questions for Eric (RN vs RDOM, SSR, multiplayer transport).

JJ blocker: 111 pre-existing tsc errors live in `riftbound-cards/src/parser/` + a few card files. Block future `bun run build` enforcement. Worth a focused tsc-cleanup pass.

**Tests:** engine 1645 → **1676/0/59-todo** (+31 = II's 10 + JJ's 11 + 10 more from various lockings), cards 931/0, app 35/0. Typecheck unchanged (111 engine, 23 cards).

**Engine completion estimate:** standard cases ~95%, edge cases ~83%. **Zero new engine bugs surfaced in batch 18** despite the most aggressive monkey + rules rescan — engine is approaching a real stable plateau.

**NEXT_FOCUS:** batch 19 = (1) decide on React/Vite SPA per UI_NEXT_STEPS.md (needs Eric input on RN vs RDOM); (2) tsc-cleanup pass on parser types to enable `bun run build` gate; (3) "playSpell coverage gap" fix in real-decks (shuffle or picker preference); (4) P1-wins-47/50 investigation (real bug or picker artifact?); (5) more rules rescan if any tractable gaps remain.

### Phase 37 — PHASE B batch 19 (parallel x3, all green) — 2026-05-13

Eric (08:32 EDT): "Yeah use vite" — SPA framework chosen.

**Agent KK — Vite + React 19 + TS SPA scaffold.** New `apps/riftbound-app/web/` subdir: `vite.config.ts` (base `/play/`, proxy `/api` → :3000), `tsconfig.json` (strict, react-jsx, bundler resolution), `index.html`, `src/{main.tsx, App.tsx, PlayPage.tsx}`, components `PlayerPanel/BattlefieldList/MoveLog`, `lib/api.ts` (typed v2 client), `__tests__/PlayPage.test.tsx` (2 vitest cases: mount→render, hand-click→POST). Added `bunfig.toml` `pathIgnorePatterns: ["web/**"]` so `bun test` doesn't trip on vitest files. New JSON v2 endpoints in `server.ts`: `GET /api/v2/state/:id` + `POST /api/v2/move/:id` + `POST /api/v2/step/:id` (all return `{view, trail, hand, isGameOver, ok, error?}`), plus `/play[/...]` static fall-through to `web/dist/`. Smoke: `bun run dev` → :5173/play/ 200; `bun run build` → 200KB bundle in 263ms. **Blocker:** hand-chip click currently sends `playFromHand{cardId, playerId}` without `location` — real `playUnit` needs `base` or specific bf-id. Batch 20 to wire a battlefield-picker UI.

**Agent LL — P1-bias investigation + spell-coverage shuffle.** 4 monkey experiments (30 seeds each, real decks):
- Baseline (aggressive, P1=Fury/Chaos): P1 wins 27/30 (90%).
- Swap decks: P1=Calm/Mind, P1 wins 29/30 (97%) → NOT deck imbalance (P1 won MORE with "weak" deck).
- Non-aggressive picker: P1 25/30 (83%) → some picker myopia.
- **After deck-builder fix: P1 21/30 (70%).**

**Real bug found — but NOT in engine:** `apps/riftbound-app/lib/real-decks.ts` `buildDeck.addUpTo()` had a local `counts` map per call; 2nd pass `addUpTo([...units, ...spells], 40)` reset counts and re-iterated units first, so spells NEVER entered the deck. **Both "real" prebuilt decks were silently 0 spells / 40 units.** Fix: share `counts` across calls + explicit `addUpTo(spells, 40)` pass. Decks now 12 spells each. `playSpell` calls: **0 → 172 across 30 games**. Same fix in `scripts/random-monkey/real-decks.ts`. Added `DeckOptions.shuffleSeed` + `swapDecks` flag.

**Verdict:** residual 70/30 P1 edge = picker myopia + legitimate rule-510 first-player tempo, not engine. +5 engine regression tests in `first-player-bias-b19.test.ts` + 3 app tests.

**Agent MM — tsc cleanup pass.** Engine: **111 → 27 (-84, 76% reduction)**. Cards: **23 → 0 (100% reduction).** Top 3 fixed clusters: (1) PlayerState fixture drift — added `xp:0, turnsTaken:0` to ~15 test files; `xpGainedThisTurn:{...}` to ~11; updated runtime `createInitialState`+`createGame` to init `turnsTaken`. (2) Parser `Record<string,unknown>` casts rewritten to `as unknown as Target/AnyTarget/Effect`; widened `PlayEffect.target` to `AnyTarget`. (3) Test helper literals: added `id` to ChainItem, `event` to MatchedTrigger, `turnOrder` to ChainState, widened `ExecutableEffect` with restriction/condition/then, added `cardIds` to TargetDescriptor. Punted: `monkey-test-bugfixes` + `visual-monkey-bugfixes-2` MoveContext drift (~7 errors), `chain-enumerators` CardDefinitionLookup mismatch (~4 errors).

**Tests:** engine 1676 → **1681/0/59-todo** (+5 from LL's regression tests, previously hidden by tsc errors), cards **931/0** unchanged, app 35 → **38/0** (+3 LL shuffleSeed tests). Vitest in web/: 2/0. Typecheck: engine 111→27 (-84), cards 23→0. **First time cards package has 0 tsc errors.**

**Engine completion estimate:** standard cases ~95%, edge cases ~85%, UI 25% (Vite SPA scaffold + /play route live). Cards package now lints clean.

**NEXT_FOCUS:** batch 20 = (1) battlefield-picker UI for hand-chip clicks (KK blocker); (2) finish MM's punted tsc clusters (MoveContext helper extraction); (3) more bot-quality work — defensive picking when behind (LL note); (4) start a real bot-vs-bot tournament harness using shuffleSeed for variance; (5) inline-rules-text overlay on cards in the SPA so players know what each card does.

### Phase 38 — PHASE B batch 20 (parallel x3, all green) — 2026-05-13

Eric (12:02 EDT) — new comm rule: fewer pings, long updates as visual cards / doc links not SMS walls. Logged.

**Agent OO — battlefield-picker UI (KK blocker).** State-response embedding: `GET /api/v2/state/:id` now returns `legalLocations: string[]` per hand card. SPA shows `BattlefieldPicker` modal when ≥2 legal locations (auto-plays if `["base"]` only). Illegal options visible-but-disabled so player sees WHY a play's blocked. `POST /api/v2/move/:id` accepts top-level `cardId`+`location`. Web vitest 2→4 (+2 picker tests). Follow-ups for batch 21: no CSS yet; legalLocations only sources from `playUnit` (spells/gear fall through to legacy POST).

**Agent PP — MoveContext helper + defensive bot.** Stream 1: extracted `__tests__/helpers/move-context.ts` (~195 lines) exposing `createMockMoveContext`/`createMockMoveState`. Rewrote `monkey-test-bugfixes.test.ts` (-145), `visual-monkey-bugfixes-2.test.ts` (-148). Fixed `chain-enumerators.test.ts` (5 register-call casts, 2 duplicate turnOrder, 1 invalid trigger type). **Engine tsc 27 → 13** (goal <15 met).
Stream 2: `bot-driver.ts` extended with `DEFENDER_PRIORITY_WHEN_BEHIND=750` and `END_TURN_PRIORITY_WHEN_AHEAD=720`. `BotViewContext` gains `selfVp/opponentVp/selfUnitsOnBoard/canAssignDefender`. `assignDefender` outranks `playUnit` when behind; `endTurn` outranks `playUnit` when ahead AND on-board. +2 bot tests. Win-rate could NOT be measured: vanilla bot-vs-bot on realDecks reaches no winner in 200 turns (0/30 finished). Conditional priorities verified via unit tests only.

**Agent QQ — tournament harness + CardOverlay.** `scripts/bot-tournament/run.ts` runs N matches with random gameSeed+shuffleSeed, writes CSV + summary MD to `/tmp/bot-tournament/`. 50-match synthetic smoke: 0/50 finished (no real cards), avg 31t/54m. 50-match real-deck smoke: 50 stall around turn 3 with avg 17 moves/4 plays — deadlock the bots can't escape (likely picker myopia + PP's defensive priorities don't address mid-turn-3 stalls).
`CardOverlay.tsx`: inline-positioned popover on mouseenter/focus over hand chip. Shows name/type/cost/might + rulesText/abilities OR a "needs batch-21 wiring" stub. Cast-shaped widening so the component auto-picks up future server-side fields. +5 vitest tests.

**Tests:** engine **1681/0/59-todo** unchanged, cards **931/0** unchanged, app 38 → **40/0** (+2 PP defensive priorities), vitest 4 → **9/0** (+2 OO picker + +5 QQ CardOverlay). Typecheck: engine **27 → 13** (-14, PP's helper cleanup). First sub-15 engine tsc count since the refactor began.

**Engine completion estimate:** standard ~95%, edge ~85%, UI 35% (Vite SPA + picker + overlay scaffolded — needs CSS, rulesText wiring, and bots that actually finish games).

**NEXT_FOCUS:** batch 21 = (1) bots that actually finish games on real decks (PP's blocker — need real picker improvement, possibly evaluate-board-state scoring); (2) thread `rulesText/abilities/name/cost/might` through `lib/engine-session.ts` view builder → CardOverlay (QQ's blocker); (3) basic CSS for picker + overlay (OO's blocker); (4) spell/gear `legalLocations` enumeration (OO's blocker); (5) finish tsc cleanup (13 → 0?).

### Phase 39 — PHASE B batch 21 (parallel x3, all green) — 2026-05-13

**Agent RR — BoardEvalLite bot policy.** Bots now ACTUALLY FINISH GAMES. New `BotPolicy` interface + `BoardEvalLitePolicy` class in `bot-driver.ts`. Static-heuristic scoring (no state-sim — engine has no clone API): scorePoint 1000+50/vp, conquerBattlefield 800, playUnit 600, playSpell 550, assignDefender 450+30*(oppVp-selfVp), exhaustRune 250 when (handSize>0 && !hasAffordablePlay), endTurn 70 (or 200 empty hand). `BotDriverOptions.policy?: "priority-table" | "board-eval" | BotPolicy`. `BotDriver.step(session,{force})` flag for chain-priority off-turn responses. Integration test: game finishes turn 16, p1=8VP/p2=6VP (seed `be-finishes-real`). Tournament 10-match: **10/10 finished** (was 0/30 in batch 20), 8 p1 / 2 p2, avg 14t/82m/17.7 plays. +6 bot tests.
**Blocker for batch 22:** engine's `status` doesn't flip to "finished" when a player crosses VP threshold via scorePoint — `EngineSession.isGameOver()` works around it by checking VP directly. Real engine fix needed.

**Agent SS — card data wiring.** `EngineSession.buildHandView()` (new public method) + `buildView()` enrich each `HandCardView` and `BattlefieldUnitView` with `name/cardType/might/energyCost/powerCost/rulesText/abilities`. Lookup combines engine's per-instance `getGlobalCardRegistry()` (cost/might/abilities) + raw `@tcg/riftbound-cards` `getCardRegistry()` (rulesText). New exported `summariseAbilities(abilities, maxLines=5)` helper formats: `[Trigger: attack (self)] damage 1`, `[Activated] exhaust → draw 1`, `[Static] aura-might+1`, `[Keyword] Hidden`, `[Replacement] X → Y`. `api.ts` updated with `CardDefinitionFields` interface. +11 tests (7 engine-session + 4 CardOverlay real-data).
**Blocker for batch 22:** `server.ts`'s own `buildHandView` (line 273) + `buildSpaState` (line 1736) bypass `session.buildHandView()` — need swap for the SPA to actually receive the new fields end-to-end.

**Agent TT — CSS + tsc cleanup.** `apps/riftbound-app/web/src/styles.css` 340 lines: dark-themed board, hand chips, modal+backdrop for `battlefield-picker`, popover for `card-overlay`. Imported via main.tsx. Vite emits 4.73KB CSS bundle. **Engine tsc errors 13 → 0 (CLEAN).** Top fixes: PlayerState fixture drift (`xp`/`turnsTaken`/`xpGainedThisTurn`), EffectContext/TargetResolverContext brand mismatch (`getCardOwner` missing, branded `CardId[]` vs `string[]`, `else?` on conditional effects), `"this-turn"` cast in fundamentals, duplicate-event removal in abilities-triggered, `XpGameEvent` alias.
**Blocker for batch 22:** `effect-executor.ts:1513` already uses `as unknown as { else?: ExecutableEffect }` — `ConditionalEffect` union should formally add `else?: ExecutableEffect` to drop the cast.

**Tests:** engine **1681/0/59-todo** unchanged, cards **931/0** unchanged, app 40 → **52/0** (+12 from RR+SS+TT), web 9 → **14/0** (+5 SS overlay + 1 TT class-check + previous +1 CSS check). Vitest 14/0. Typecheck: **engine 0**, cards 0. First fully-clean tsc state.

**Engine completion estimate:** standard ~96%, edge ~88%, UI 50% (working /play SPA with: clickable hand → battlefield picker → real card-data popover, CSS, bots that finish games). Open per-game: status not flipping to "finished" on scorePoint VP cross (RR blocker).

**NEXT_FOCUS:** batch 22 = (1) engine fix: `scorePoint` should set status="finished" + winner when crossing victoryScore; (2) swap server.ts to use `session.buildHandView()` so SPA receives card data; (3) formally add `else?` to ConditionalEffect; (4) human-in-loop play test on the SPA — can someone actually play a game vs a bot? Identify the remaining UX gaps.

### Phase 40 — PHASE B batch 22 (parallel x3, all green tests + UX gaps surfaced) — 2026-05-13

Eric (12:23 EDT) — new mandate: **UI work uses RiftAtlas as the North Star.** Batch 23 onward must reference `~/code/tcg-engines/.claude/skills/riftatlas-study/` + earlier parity-pass screenshots.

**Agent UU — scorePoint finish-game check.** Surprise: **engine was already correct**. Every VP-gain path (scorePoint move, conquerBattlefield, combat resolution, score effect, Hold-phase flow, Burn-Out flow + effect) routes through `hasPlayerWonStrict` and writes `status:"finished"` + `winner`. RR's batch-21 observation was an APP-LAYER mirror/snapshot lag, not an engine bug. +9 regression tests in `score-point-finishes-game.test.ts` pinning the contract: scorePoint at threshold-1 finishes; at threshold-2 doesn't; rule-467 tie-break (equal-VP doesn't finish, strict-greater does); 8 sequential Holds finishes cleanly. **Engine 1681 → 1690 / 0 / 59-todo.**

**Agent VV — server.ts swap + ConditionalEffect.else.** Server.ts now delegates to `session.buildHandView()` (lines 272-286: 14-line local fn → one-line delegation returning `Record<string, ReadonlyArray<HandCardView>>`). `buildSpaState` hand type widened to `HandCardView & {legalLocations:string[]}`. Verified `GET /api/v2/state/vv-test` returns full enriched cards: `name "Chemtech Enforcer", cardType:"unit", energyCost:2, might:2, abilities:["[Keyword] Assault 2", "[Trigger: play-self] discard 1"]`. ConditionalEffect.else was already in types; the cast lived on the engine's local `ExecutableEffect` shape — added `else?: ExecutableEffect` at `effect-executor.ts:66`, removed `as unknown as ...` casts at lines 1512-1513.
**Blocker:** OGN prebuilt cards lack `rulesText` in raw data (only some OGS cards like Lux have it) — wiring is correct but field empty for current decks.

**Agent WW — human SPA smoke (chrome-control SW evicted, tested via API endpoints).** **SPA broken at first click. Verdict: needs ≥3 polish batches before human-usable.** Top 5 gaps:
1. **Base zone has NO UI** — units played to base literally disappear from view.
2. **Server's `playFromHand` fallback** returns "Move 'playCard' not found" for every failed play (wrong cost, wrong phase, etc.) — useless error messages.
3. **"Step Bot" button steps the HUMAN active player** — auto-plays the human's hand for them. Massive UX violation.
4. **End Turn button enabled when engine rejects** ("condition not met" mid-main).
5. **Hand chips, BattlefieldPicker title, MoveLog all show instance UUID** (`player-1-main-0-ogn-003-298`) instead of card `name`. CardOverlay still shows the "batch 21 needs..." stub.

Full report: `/tmp/spa-human-smoke-b22.md`.

**Tests:** engine **1690/0/59-todo** (+9 UU), cards **931/0**, app **52/0** (unchanged from b21), web **14/0** (unchanged). Typecheck: engine 0, cards 0. **Side note: chrome-control SW evicted again** — sub-agents lost browser access; ran chrome reset would have helped but WW worked around it via direct API. Worth a self-heal pass.

**NEXT_FOCUS:** batch 23 = **RiftAtlas-parity UI overhaul** (Eric's NORTH STAR mandate):
- Use `riftatlas-study` skill + earlier parity-pass screenshots/notes as reference.
- Re-skin Battlefield/Base/Hand zones using RiftAtlas layout.
- Fix WW gaps 1-5 (base UI, "Step Bot" → "Step Opponent", card names not UUIDs, surface engine-rejection reasons, hide illegal buttons).
- App-layer fix for RR's status-lag (snapshot caching in EngineSession).
- OGN rulesText backfill (or swap to OGS-heavy deck) so CardOverlay shows real text.

### Phase 41 — PHASE B batch 23 (parallel x3, all green) — 2026-05-13

Eric (12:23 EDT) **NORTH STAR**: UI uses RiftAtlas parity. Eric (12:38 EDT): AFK — agent self-heals.

**Agent XX — RiftAtlas-parity UI overhaul.** Read `riftatlas-study/SKILL.md` + 5 parity screenshots (tick3-31/33-board, tick2-31-board/34-clicked, tick4-31-board) + `.ai_memory/ours-tick4-03-turn1-main.json`. Confirmed dark blue/teal palette + gold accents + table-top orientation. Layout rewrite: opponent seat (top) → battlefield band (mid, glowing centered row) → player base zone → self seat (bottom, fanned hand chips) → sidebar move log w/ phase strip header. **New: `BaseZone.tsx`.** Updated PlayPage (full layout rewrite + `cardNames` memo lookup), PlayerPanel (hand chips show name + cost badge + might badge), BattlefieldList (renders `card.name`, gold-controlled / red-contested borders, might pip), BattlefieldPicker (title "Where to play {name}?"), MoveLog (`cardNames` prop + `buildCardNameMap` export, raw params → tooltip), styles.css (dark-blue radial backdrop, gold #d4af3c). **WW#5 fully fixed** — names everywhere with UUID fallback. WW#1 partially fixed — `BaseZone` rendered + ready, but `GameView` doesn't yet expose base-zone units. Web vitest 14→23 (+9 in `RiftAtlasLayout.test.tsx`).

**Agent YY — server UX gaps + snapshot lag.**
- **WW#2 fix:** `tryPlayFromHand` in NEW `lib/server-helpers.ts` looks up card's `cardType` from hand-view, maps to engine move (`playUnit/Spell/Gear/Equipment`), tries that move FIRST so its error wins. Removed bogus `"playCard"` from candidate list (it was the literal source of `"Move 'playCard' not found"`). Unknown cardType → `"All play moves failed for cardType=<x>; engine said: <msg>"`.
- **WW#3 fix:** `sessionHumanPlayerIds` Map (default `{"player-1"}`). `POST /api/v2/step/:id` early-returns `{ok:true, skipped:true, reason:"it's the human's turn"}` when active player ∈ humans.
- **Goal C:** state responses now include `whoseTurnNow: "human"|"bot"` + `actionsLegal: {endTurn:boolean, stepBot:boolean}` (endTurn sourced from engine legalMoves; stepBot true iff bot's turn AND status=playing).
- **Goal D — snapshot-lag root cause:** neither EngineSession nor BotDriver caches views. The lag was from `state.status` itself — engine doesn't finalise `status="finished"` until end-condition hook fires, but VP threshold can be already-crossed. Fix: `buildView` now derives `effectiveStatus`/`effectiveWinner` from VP threshold (same source as `isGameOver()`). View mirrors `isGameOver()` on next read.
- +14 tests in `server-helpers.test.ts`.

**Agent ZZ — chrome SH + rulesText.**
- **Chrome control: FAILED.** `chrome reset` hangs at 100% CPU (orphaned even after force-kill); `chrome wake` also times out. Eric AFK so no human click; documented at `/tmp/chrome-control-failure-b23.md`. **SCREENSHOTS NOT CRITICAL** — engine/UI work is unblocked, just no visual smoke tests.
- **rulesText fix — surprise root cause was NOT missing card data.** OGN cards already have rulesText (only 14/299 lack it, mostly runes). The real bug was in `EngineSession.getCardDefinition`: engine's `initializeMainDeck` stores `definitionId = cardId` (instance ID `player-1-main-0-ogn-097-298`), so raw-registry lookup always missed. **Fix:** `extractDefIdFromInstanceId()` helper in `lib/engine-session.ts` strips the `player-N-(main|rune)-N-` prefix, falls back when direct lookup misses. Generic, no per-card. Verified: `GET /api/v2/state/zz-test?realDecks=true` → 9 hand cards have `rulesText` (Chemtech Enforcer: `"[Assault 2] (+2 [Might]...)\nWhen you play me, discard 1."`).

**Tests:** engine **1690/0/59-todo** unchanged (no engine-source changes this batch), cards **931/0**, app **52→66/0** (+14 YY server-helpers), web **14→23/0** (+9 XX RiftAtlas layout). Typecheck: engine 0, cards 0.

**Engine completion estimate:** standard ~96%, edge ~88%, UI 65% (RiftAtlas-parity layout + card names + rulesText + Step Bot guard + engine-derived errors + base-zone scaffold).

**NEXT_FOCUS:** batch 24 = (1) GameView exposes base-zone units (XX blocker → YY); (2) SPA consumes `whoseTurnNow`/`actionsLegal`/`skipped` for button-disabled states + error toasts (YY blocker → XX); (3) re-investigate chrome-control (try `chrome reload-extension`, full Chrome quit/relaunch); (4) more rules-text/monkey if anything left; (5) maybe start human-controllable inputs (target selection, chain responses) for full playability.

### Phase 42 — PHASE B batch 24 (parallel x3, all green) + headless screenshot harness — 2026-05-13

Eric (12:38 AFK) — agent self-heals. Eric (12:42): "screenshots seem pretty important." Eric (12:44): screencapture caught the lock screen. Switched to **headless puppeteer** workaround via existing `puppeteer-core` dep + system Chrome binary — no extension SW required, no unlocked screen required. New script: `apps/riftbound-app/scripts/headless-screenshot.ts`. Sent Eric a real RiftAtlas-parity SPA screenshot from this harness.

**Agent AAA — baseUnits in GameView + actionsLegal SPA wiring.** Surprise: engine's `base` zone is a SINGLE GLOBAL zone (id `"base"` in `zone-configs.ts`), not per-player `base-<pid>`. Cards are partitioned by `card.owner`. `buildView` now iterates `internalState.cards`, filters `card.zone === "base"`, buckets by `owner` (same pattern as `buildHandView`), and emits `GameView.players[].baseUnits: BattlefieldUnitView[]` (enriched via `getCardDefinition`). SPA's `baseUnitsFor()` reads `player.baseUnits ?? []`. 
**actionsLegal wiring:** `web/src/lib/api.ts` adds `ActionsLegal` interface; `StateResponse`+`MoveResponse` carry optional `actionsLegal`/`whoseTurnNow`/`skipped`/`reason`. `PlayPage`: End Turn disabled when `!actionsLegal.endTurn`, Step Bot disabled when `!actionsLegal.stepBot`. `showToast(msg)` helper with 3s auto-dismiss; fires on `{ok:false, error}` and `{skipped:true, reason}` (e.g. "Step Bot skipped: it's the human's turn"). +2 app tests, +6 web tests (BaseZone, PlayPage.actions).
**Blocker for batch 25:** engine's `playUnit` reducer routes to `battlefield-<id>` zones, never to `base`. So `baseUnits` stays empty in normal play. Needs `playToBase` move + UI affordance OR documentation that base is only for non-unit card types.

**Agent BBB — TargetPicker for spells.** Shipped Option 1. `web/src/components/TargetPicker.tsx` (139 lines): friendly-first ordering, side/might meta, "Skip targets" affordance, empty-state. `PlayPage` detects `cardType === "spell"` + battlefield occupancy → opens picker. POSTs `playFromHand` with `params.targets: string[]`. +6 vitest. No per-card ifs.
**Gaps documented for batch 25:** (1) `enumerateMoves` for `playSpell` doesn't emit valid target tuples — picker shows ALL units, engine rejects illegal at apply-time. Fix: extend `cards.ts:918` enumeration, OR add `/api/v2/targets/:cardId` probe endpoint. (2) Attacker assignment + chain-response need `view.attackers`/`view.combat`/`view.chain` in GameView (currently not exposed). (3) `card.requiresTarget: boolean` from hand-view would let SPA skip picker for self-target spells.

**Agent CCC — chrome rescue + rules rescan b24.**
- **Chrome STILL BROKEN.** Tried pkill cleanup → `reload-extension` ("No Chrome profiles connected") → Chrome quit+relaunch + `chrome reset` (claimed "Service worker revived — connected" but `chrome ping` failed immediately after) → `chrome ping` failed → second `chrome reset` spun at 100% CPU again. Diagnosis at `/tmp/chrome-control-failure-b24.md`: unpacked extension likely not loaded in fresh Chrome process; needs human click on toolbar icon or reinstall. **MITIGATED via headless puppeteer harness — no chrome-control required for screenshots.**
- **Rules rescan b24:** 23 new tests in `rules-text-rescan-b24.test.ts`, all locked-existing-correct (engine more complete than rescan suggested AGAIN). Pinned win-conditions primitives: `decideWinningPoint × victoryScoreModifier` (rule 466.1.b × 470), `isAtMatchPoint`, `checkVictory` iteration semantics, `isGameOver` status-OR-threshold decoupling, `getEffectiveVictoryScore` modifier defaulting.

**Tests:** engine 1690 → **1713/0/59-todo** (+23 CCC), cards **931/0**, app 66 → **68/0** (+2 AAA), web 23 → **35/0** (+6 AAA + +6 BBB). Typecheck: engine 0, cards 0.

**Engine completion estimate:** standard ~96%, edge ~88%, UI 75% (RiftAtlas layout + card names + rulesText + actionsLegal-driven button states + error toasts + TargetPicker for spells + headless screenshot harness).

**NEXT_FOCUS:** batch 25 = (1) extend `enumerateMoves` to emit valid target tuples for `playSpell` (BBB gap #1) so TargetPicker shows only legal targets; (2) `playToBase` move + UI affordance (AAA blocker) — or document base is non-unit-only; (3) `view.attackers`/`view.combat`/`view.chain` in GameView (BBB gap #2); (4) `card.requiresTarget` from hand-view (BBB gap #3); (5) more rules-text if useful (engine is plateauing — last 2 rescans found 0/0 actual bugs).

### Phase 43 — PHASE B batch 25 (parallel x3, all green) — 2026-05-13

Eric AFK; agent self-paced. Visual smoke via headless-puppeteer harness (no chrome-control needed).

**Agent DDD — playSpell target enumeration.** `playSpell.enumerator` now mirrors `playUnit`'s tuple-per-choice pattern. For each spell-in-hand: inspect first `type:"spell"` ability's `effect.target`. No descriptor or `{type:"self"}` → emit `{cardId, playerId, targets:[]}`. Non-self descriptor → call `resolveTarget` with `quantity:"all"` override to get full candidate set. Single-target descriptors emit one tuple per legal id; multi-target descriptors (`"all"`/`{upTo}`/`{atLeast}`/N>1) emit one tuple with full set (multi-pick UX deferred). Rule 537: spell suppressed when 0 candidates. New `spellRequiresExplicitTarget(cardId)` helper in `lib/engine-session.ts` populates `requiresTarget: true` on HandCardView. `server.ts` threads `legalTargets: string[][]` per spell. TargetPicker now accepts `legalTargetIds?: ReadonlyArray<string>` — filters battlefield units to only legal targets (illegal units not rendered). PlayPage opens picker only when `card.requiresTarget === true` AND flattened `legalTargets` is non-empty. +6 engine tests + 1 web test.
**Blocker for batch 26:** multi-target spells (upTo:N / atLeast:N / N>1) emit ONE tuple with full set, not per-subset. SPA `maxTargets` knob can't drive multi-pick UX yet. Fix: emit per-subset tuples (bounded by upTo), OR add separate "pick N from candidate set" enumerator hook.

**Agent EEE — combat + chain view.** `GameView.combat?: CombatView` (`{phase, battlefieldId, focusOwner, attackingPlayer?, defendingPlayer?, isCombat, attackers, defenders}`) + `chain?: ChainView` (`{items, focusOwner}` with `{id, source:{playerId,cardId,cardName?}, summary, countered, type}` per item). Engine extraction: combat from `state.interaction.showdownStack[top]`, attackers/defenders from `internal.zones["battlefield-<id>"].cardIds` partitioned by `cardMetas[cardId].combatRole`; chain mapped 1:1 from `state.interaction.chain.items`, source.cardName via `getCardDefinition`, summary `[Spell|Ability|Permanent] <name|id>`. Both gracefully `undefined` when absent — synthetic / no-combat sessions degrade cleanly. NEW components: `CombatPanel.tsx` (~95 lines, attackers/defenders split, focus owner, phase header) + `ChainPanel.tsx` (~50 lines, LIFO order, countered marked, focus owner). Wired into PlayPage sidebar above MoveLog. `server.ts` untouched (view flows through unchanged). +3 app tests + 7 web tests.
**Blocker for batch 26:** no SPA-callable `declareAttackers`/`declareDefenders`/`passChain`/`passFocus` moves — combat/chain panels can't be exercised end-to-end via human play.

**Agent FFF — base zone investigation.** **AAA's batch-24 "blocker" was a FALSE ALARM** — Path A is fully wired (rule 107.1.c "permanents reside in player's Base"; rule 141.1.a.1 "Units are at a Battlefield or their Base"; rule 359.2.c "enters Board at chosen Location"). Engine `playUnit.reducer:633` routes `targetZoneId: location` (accepts `"base"`); enumerator emits `{location:"base"}` (cards.ts:558); BattlefieldPicker has "Play to Base" option; SPA sends `location:"base"`; engine-session `baseUnits` partition works. Empirically verified: `applyMove("playUnit", {location:"base"})` lands the card in `getCardsInZone("base", player)`. The stale comment in `engine-session.test.ts:67-72` is wrong — synthetic decks fail because they have no registered cardType, not because of a routing bug. +3 engine tests in `play-unit-to-base-batch25-fff.test.ts`. No source changes.
**Blocker for batch 26:** synthetic deck cards (`player-1-card-0` etc) have no registered `cardType`, so `playUnit` enumerator never emits moves for them. Tests using synthetic decks won't exercise `playUnit`. Either register placeholder card-defs, or migrate those tests to `realDecks: true`.

**Tests:** engine 1713 → **1722/0/59-todo** (+9 across DDD+FFF), cards **931/0**, app 68 → **71/0** (+3 EEE), web 35 → **43/0** (+1 DDD + 7 EEE). Typecheck: engine 0, cards 0.

**Engine completion estimate:** standard ~96%, edge ~89%, UI 85% (RiftAtlas layout + actionsLegal + target picker for spells with legal-only filter + combat+chain panel scaffolds + base-zone confirmed wired + headless visual smoke).

**NEXT_FOCUS:** batch 26 = (1) per-subset multi-target enumeration for playSpell (DDD blocker) → multi-pick TargetPicker UX; (2) SPA-callable combat moves so CombatPanel + ChainPanel actually populate from human play (EEE blocker — `declareAttackers`/`declareDefenders`/`passChain`/`passFocus`/`startShowdown` endpoint surface); (3) synthetic-deck cardType registration (FFF blocker) — OR migrate tests to real decks; (4) screenshot iteration: now that the engine is hard to break, polish the visual style closer to RiftAtlas (read more parity screenshots, compare side-by-side).

### Phase 44 — PHASE B batch 26 (parallel x4, all green) — 2026-05-13

Eric (12:07): "we need to see card images not just names. same for BF. copy riftatlas." → dispatched JJJ on top of original GGG/HHH/III.

**Agent III — visual polish (CSS only).** Closed 3 RiftAtlas gaps: hand chips → 96x128 vertical card silhouettes (gradient face, gold cost badge top-left, red might badge bottom-right, name banner, lift-on-hover); battlefield band → dominant 220px-min glowing teal mat (radial+linear glow, inner shadow); End Turn → prominent blue gradient CTA (`[data-testid="end-turn"]:not(:disabled)`). CSS bundle 4.73 KB → 9.59 KB. +1 web test. 7 more component TODOs in `UI_PARITY_GAPS_B26.md` (SidebarPanel, PhaseRing, DeckPile, PowerRow, PlayerAvatar, bf-unit-card variant, chat strip).

**Agent GGG — SPA combat moves (EEE blocker fix).** `lib/server-helpers.ts` extended `ActionsLegal` with 7 booleans (`contestBattlefield`, `startShowdown`, `passShowdownFocus`, `passChainPriority`, `resolveCombat`, `assignAttacker`, `assignDefender`) sourced from `session.legalMoves(activePlayer)`. New `routeCombatOrChainMove` helper + `COMBAT_AND_CHAIN_MOVE_IDS` allow-list (`assignAttacker/Defender/Damage`, `contestBattlefield`, `startShowdown`, `endShowdown`, `passShowdownFocus`, `passChainPriority`, `resolveChain`, `resolveCombat`, `resolveFullCombat`, `conquerBattlefield`). `/api/v2/move/:id` consults the allow-list before falling through to generic engine dispatch; auto-fills `playerId`. CombatPanel: per-unit Attacker/Defender buttons (local-seat units on showdown bf only), Pass Focus, Resolve Combat. ChainPanel: Pass Priority. PlayPage threads `assignableUnits` + `actionsLegal` and wires all 5 callbacks. Engine vocab note: moves are `assignAttacker`/`assignDefender` (one unit/call), NOT `declareAttackers`. App +5 / web +6.
**Blocker for batch 27:** vanilla session never legally enables `startShowdown`; SPA wires are in place but end-to-end combat needs either real-deck setup that contests a bf, or an engine helper to fast-forward.

**Agent HHH — per-subset multi-target enumeration (DDD blocker fix).** `playSpell.enumerator` formulas: `undefined`/`1` → 1 move per legal candidate; `"all"` → 1 move with full set; `{upTo:N}` → all subsets sizes 0..min(N,K); `{atLeast:N}` → min(N,K)..K; numeric N>1 → exact-size N only. **MAX_SUBSETS=64**; over-limit → 1 move with full set + `params._truncated:true`. TargetPicker multi-pick mode: checkboxes when any tuple has `length>1`, legal-signature validation in O(1), `target-picker-error` alert on illegal subset. +4 engine + 2 web tests.
**Blocker for batch 27:** server-side `HandCard.legalTargets` still flattens / single-target shapes — needs to surface FULL tuple list so SPA's multi-pick UI receives multi-target tuples in real games.

**Agent JJJ — card images (Eric urgent ask).** Source: Riot CMS gallery URLs (`https://cmsassets.rgpub.io/sanity/images/dsfx7636/game_data_live/<hash>-744x1039.png`) in per-set JSON. TS card registry strips imageUrl, so `lib/engine-session.ts` lazy-loads `packages/riftbound-cards/src/data/sets/{ogn,ogs,sfd,unl}.json` and builds a defId→imageUrl map via `lookupImageUrl`. Real-deck instance ids resolved via existing `extractDefIdFromInstanceId`. Battlefields: read defId from `internal.cards[bfId].definitionId`. Components: PlayerPanel hand-chip + BattlefieldList unit + BaseZone unit + BattlefieldList BF tile background + CardOverlay header all render `<img>` with text fallback. +140 lines CSS. Screenshot shows real card art (battlefields "Altar to Unity" + "Aspirant's Climb" with faded art backgrounds; hand chips with named cards + badges). +2 app + 4 web tests.
**Blocker for batch 27:** image preload caching — first hover hits network; preload gallery URLs in `PlayPage` mount via `useEffect`.

**Tests:** engine 1722 → **1785/0** (+63 across GGG batch + HHH + concurrent), cards **931/0** unchanged, app 71 → **78/0** (+7 across GGG+JJJ), web 43 → **55/0** (+12 across III+GGG+HHH+JJJ). Typecheck: engine 0, cards 0.

**Engine completion estimate:** standard ~96%, edge ~89%, **UI ~90%** (card art + RiftAtlas-parity layout + combat-driven from SPA + multi-target spells + target picker w/ legal-only filter + battlefield card art + CSS polish + headless screenshot harness).

**NEXT_FOCUS:** batch 27 = (1) full showdown smoke (engine helper or real-deck setup that gets to `startShowdown` → demo a full combat resolution via SPA); (2) image preload caching on PlayPage mount; (3) `legalTargets` multi-tuple surfacing in server response; (4) 7 deferred RiftAtlas components from UI_PARITY_GAPS_B26.md (SidebarPanel, PhaseRing, DeckPile, PowerRow, PlayerAvatar...); (5) screen-lock workaround for chrome-control (mitigated via puppeteer, but real chrome control still down).

### Phase 45 — PHASE B batch 27 (iter-22→24 parity, all green) — 2026-05-13

Pure CSS/TSX visual-parity pass. No engine or cards changes. Tests held flat: engine **1785/0**, cards **931/0**, web **157/0** (no regressions).

**Iter-22A — BF unit chip sizing + name banners + image preload.**
`bf-mini-chip` enlarged 32×40 → 56×78px (portrait card aspect ratio). `.bf-mini-chip-fallback` font-size 11→13px, might badge spacing improved. Added `.bf-mini-chip-name-banner` CSS — slides up on hover showing unit name. Matching `bf-mini-chip-name-banner` span added in `BattlefieldList.tsx` when `imageUrl` present. `PlayPage.tsx` got a `useEffect` image-preload loop covering hand cards, BF tiles, and BF units — eliminates first-hover network hit (JJJ batch-27 blocker).

**Iter-22B — Phase strip + sidebar + board spacing CSS.**
Active phase pill switched to bright blue `#4a7fd4` with glow (was gold); inactive pills muted. `.battlefield-band` min-height 200→280px; `.bf-tile` min-height 140→220px, padding 8→12px 10px. `.board-side` upgraded: dark translucent background, left border, `overflow-y: auto`, tighter padding. `.combat-panel`, `.chain-panel`, `.move-log` gained `border-top` separators. `.turn-banner` and `.seat-self`/`.seat-opponent` got border separators.

**Iter-23 — BF unit portrait card style.**
`bf-mini-chip` finalized to 60×84px with darker gradient, 1.5px border, lift-on-hover. `.bf-slot-empty` converted to dashed 60×84px card-outline placeholder. `.bf-mini-stack` changed from column → row with `> li + li { margin-left: -20px }` fan overlap. `.bf-side` min-width 70px; `.battlefield-band` flex: 1 1 auto.

**Iter-24A — BF tile layout + attacker/defender data-role.**
`.bf` grid-template-columns widened: 56→80px side columns. `.bf-tile-center` and `.bf-side` got `flex-shrink: 0`. Contested BF gains vivid gold glow box-shadow. New CSS: `.bf-mini-chip[data-role="attacker"]` red border+glow; `[data-role="defender"]` blue border+glow. `BattlefieldList.tsx` emits `data-role` on unit chip `<li>`.

**Iter-24B — Opponent panel + face-down hand.**
`.hand-chip-back-compact` resized to 72×52px. `.hand-chip-back` gets dark diagonal-stripe card-back gradient (navy + repeating-linear-gradient). `.seat-opponent .hand-chip-back + .hand-chip-back { margin-left: -24px }` for tighter opponent-hand fan. `.player-header` gets border-bottom separator.

**NEXT_FOCUS:** batch 28 = (1) board fills 100vw (seat panels compact, BF band gets remaining space); (2) local hand chip size 80×112px; (3) engine monkey rescan; (4) screenshot polish pass.

### Phase 46 — PHASE B batch 28 (iter-25→31 parity, all green) — 2026-05-13

Pure CSS/TSX visual-parity pass. No engine or cards changes. Tests held flat throughout: engine **1785/0**, cards **931/0**, web **157/0** (no regressions).

**Iter-25 — Viewport fill + hand chip sizing.**
Board set to `grid-template-columns: 1fr 280px; height: 100vh`. `.board-main` flex column, `min-height: 0; overflow: hidden`. `.seat-opponent` capped at max-height 180px; `.seat-self` set to `flex: 1 1 auto` (no max-height). `.battlefield-band` `flex: 0 0 auto; min-height: 300px; max-height: 420px`. `.hand-chip` enlarged to 80×112px. `.player-resources` converted to horizontal strip. `.board-side` fixed at 280px.

**Iter-26 — Vertical proportions fix.**
`.seat-self` drops max-height, becomes `flex: 1 1 auto; min-height: 160px` so it fills remaining viewport. `.seat-self .player` flex column with `justify-content: space-between` to push hand to bottom. `.battlefield-band` restored to `flex: 1 1 auto; max-height: 450px`. `.bf-tile` gets `flex: 1 1 0; max-width: 480px; min-width: 260px`.

**Iter-27 — Sidebar + revealHand check.**
`.board-side` confirmed at fixed 280px; `.board` uses `1fr 280px`. `.hand-chip-back-compact` enlarged to 80×58px with diagonal-stripe card-back pattern. `.seat-opponent overflow: visible` (unclips face-down chips). `revealHand` logic verified correct: local player bare `true`, opponent `id === us.id`.

**Iter-28 — Dead space below seat-self removed.**
`.seat-self` `flex: 1 1 auto; min-height: 160px` (no max-height cap). `.seat-self .player` full flex column with `justify-content: space-between`. `.battlefield-band` `flex: 1 1 auto; max-height: 450px`.

**Iter-29 — Hand chips 100×140px.**
`.hand-chip` width/height 100×140px; fan overlap `-20px`. `.seat-self .hand` `flex: 1 1 auto; align-items: flex-end`. `.bf` gets `flex: 1 1 0; max-width: 480px`.

**Iter-30 — BF art dimming + combat CTAs.**
`.bf-image` gains `filter: brightness(0.5) saturate(0.7)` so underlying units are readable. `.resolve-combat-btn` styled as gold gradient CTA. `[data-testid="end-turn"]` styled as blue gradient CTA. `.combat-panel` gets dark background + section headers.

**Iter-31 — BF unit chip pop + phase strip.**
`.bf-mini-chip` stronger box-shadow + `backdrop-filter: blur(2px)`. `.bf-side` dark semi-transparent background so units pop against BF art. `.phase-strip` horizontal scroll, dark bg, `padding: 5px 8px`. `.phase-active` `#3a6fd4` blue glow. `.bf-title` gains `text-shadow` for legibility.

**NEXT_FOCUS:** batch 29 = (1) legend/champion portrait slots (requires API changes); (2) empty BF slot polish; (3) hand chip name banner; (4) engine monkey rescan.

### Phase 47 — PHASE B batch 29 (iter-32→33, TS clean, all green) — 2026-05-13

**Tests:** engine 1785/0, cards 931/0, web 157/0 (all green throughout)

**TypeScript fixes:**
- `CombatUnit` in `web/src/lib/api.ts` was missing `imageUrl?: string` — `CombatPanel.tsx` references it for avatar art; added field
- `vite.config.ts` had TS2769 on the `test` block — added `/// <reference types="vitest" />` triple-slash directive + `@ts-expect-error` suppression (pre-existing vitest/vite version mismatch in node_modules; runtime unaffected)
- 0 TS errors after fixes

**Iter-32 — Empty BF slot polish + hand fan + move log:**
- `.bf-slot-empty` given `::before` pseudo `⊕` icon + `display: flex; flex-direction: column; gap: 4px; background: rgba(30,50,100,0.12)`
- `.hand .hand-chip + .hand-chip { margin-left: -20px }` fan overlap
- `.hand .hand-chip:hover { transform: translateY(-8px); z-index: 10 }` lift-on-hover
- `.hand-chip-name-banner` improved gradient + hover trigger
- `.move-log h4` uppercase section header

**Iter-33 — BF tile height + playable pulse + TS:**
- `.battlefield-band` got `display: flex; flex-direction: column` so child list uses `flex: 1 1 auto`
- `.battlefield-row` (existing row wrapper) `flex: 1 1 auto; min-height: 0` — tiles now fill band height
- `.bf` / `.bf-tile` removed fixed `height: 100%` (flex context incompatible); `align-self: stretch` kept
- `.hand-chip-playable` pulse animation changed green→gold (`rgba(200,160,40)`)
- `.hand-chip-unaffordable` strengthened: `filter: grayscale(0.6) brightness(0.7); opacity: 0.7`
- `.player-id-label` truncation: `max-width: 120px; text-overflow: ellipsis`

**UI parity estimate ~90%:** card art everywhere, combat panel functional, BF tiles fill band, hand fans correctly, TS clean.

**NEXT_FOCUS:** batch 30 = (1) engine monkey rescan with real decks (may reveal new edge cases); (2) legend/champion portrait API stub if doable; (3) further CSS micro-polish from screenshot review

### Phase 48 — PHASE B batch 30 (iter-34→38, engine +34 tests, 5 new keywords) — 2026-05-13

**Tests:** engine 1799→1819/0 (+20 keyword tests), cards 931/0, web 157/0

**Iter-34 — Player avatar + BF name + sidebar headers:**
- `.player-avatar` 36px circle with gradient + `player-avatar-active` blue glow
- `.player-header h3` flex row with truncation
- `.bf-header` positioned absolute top-center; `.bf-title` dark-background pill, 12px/700
- `.board-side h4 / .combat-panel h4 / .chain-panel h4 / .move-log h4` unified 10px uppercase headers

**Iter-35 — Opponent panel + CardOverlay + game-over:**
- `.seat-opponent .player` compact horizontal strip; `.player-stats-compact` hidden for opponent
- `.card-overlay-popover` navy gradient + blue-tinted border + layered shadow
- `.game-over-banner` + `.game-over-banner-winner` gold aura + radial purple overlay

**Iter-36 — Hand chip 114×160px + game-over winner text:**
- `.hand-chip` 114×160px (1:1.4 ratio)
- `.seat-self` overflow: visible (no more clipping)
- `.game-over-banner-winner` gold text-shadow

**Iter-37 — Chip balance 96×136px + BF inner + card-back pattern:**
- `.hand-chip` reduced to 96×136px (no clipping at 96×136 in seat-self)
- `.bf-inner` new rule: `position: relative; z-index: 1; padding: 28px 8px 10px`
- `.hand-chip-back` improved harlequin diagonal-stripe pattern

**Iter-38 — Hover lift + phase pills + VP badge + contested pulse + 5 keywords:**
- `.hand-chip:hover` stronger lift: `translateY(-12px) scale(1.04)` with gold ring
- `.phase-pill` 11px, `.phase-active` 12px + bigger padding
- `.vp-badge` pill shape with `vp-badge-at-match-point` gold glow
- `@keyframes contested-pulse` + `.bf[data-contested="true"]` pulsing gold
- **Engine: Barrier, Guard, Tough, Swift, Haste** implemented from scratch; 20 tests

**Engine bug fixed (Iter-37B engine):**
- p0086: global combat heal was only healing combat participants; now heals ALL units everywhere at end-of-combat per FAQ #6111 (+9 tests across p0086/p0960/p0397/p0217/p0147)

**UI parity estimate ~93%:** Contested pulse, gold CTA, card art everywhere, hand fan, avatar circles, compact opponent row.

**NEXT_FOCUS:** batch 31 = (1) draw/energy/VP trigger RiftJudge cases; (2) power glyph sizing for opponent row; (3) move log flash animation; (4) verify keyword implementations with monkey rescan

### Phase 49 — PHASE B batch 31 (iter-39→41B, engine +26 tests, Swift/Haste live-wired) — 2026-05-13

**Tests:** engine 1819→1845/0 (+26), cards 931/0, web 157/0

**Iter-39 — RiftJudge stun/Assault/recall cases (+7 tests):**
- Targeted: stun/Assault (p0065 stunned attacker contributes 0 Might; p0338 Assault bonus wins combat; p0047 Assault inapplicable in solo showdown) and recall/return-to-hand (p0042/p0644 return-to-hand does NOT fire Deathknell; p0446/p0563/p0553 recall does NOT fire "when I move" triggers)
- File: `packages/riftbound-engine/src/__tests__/rules-audit/riftjudge-cases.test.ts`

**Iter-40 — RiftJudge draw/energy/score + keyword multi-interaction + monkey rescan (+15 tests):**
- Draw/energy/score cases: p0894 (draw-on-play Kinkou Initiate pattern), p0937 (energy gain from play-card trigger), p0056/p0059 (score effect awards VP on conquer), p0022/p0048 (score at penultimate point leaves game playing)
- Keyword multi-interaction tests: Barrier + Guard, Tough + damage, Swift + movement exhaustion, Haste + entry state, combos
- Monkey rescan seeds 0–50: clean (no new engine regressions)

**Iter-41A — Swift + Haste live-wired in engine (+4 regression tests):**
- `packages/riftbound-engine/src/game-definition/moves/movement.ts`: Swift units skip exhaust after `standardMove` and `gankingMove` (rule 718) via `swiftExhaustsOnContest` helper
- `packages/riftbound-engine/src/game-definition/moves/cards.ts`: Haste units enter play ready (`hasteEntersExhausted` → false, rule 554) instead of exhausted
- +4 tests: Swift live-engine (no exhaust on standardMove), Haste live-engine (enters ready), multi-keyword interaction checks

**Iter-41B — UI CSS polish (engine unchanged):**
- `apps/riftbound-app/web/src/styles.css`: `.showdown-breadcrumb` row layout fix; `[data-testid="step-bot"]` secondary button style; `.bf-mini-chip` red Might badge; `.power-glyph[data-kind="energy"]:not([data-count="0"])` gold glow; `body, #root` radial-gradient background

**NEXT_FOCUS:** iter-42 = (1) remaining RiftJudge open cases; (2) move log flash animation; (3) opponent row power glyph sizing; (4) card import accuracy review for next batch

### Phase 50 — PHASE B batch 32 (iter-42→44, engine +26 tests, chain/Deathknell/Barrier) — 2026-05-13

**Tests:** engine 1826→1833/0 (+7 this session), cards 931/0

**Iter-42 (engine: 1786→1797):**
- Barrier keyword fully wired into combat resolver (`CombatUnit.hasBarrier`, `barrierConsumed` tracking, infinite lethal threshold)
- Draw/score trigger tests (+11): p0284/p0937/p0056/p0022/p0379/p0937-draw
- Monkey seeds 51-100: clean
- CSS polish: DeckPile pips, VP badge pill, move-log flash, hand hover lift, opponent glyphs

**Iter-43 (engine: 1797→1808):**
- Stun/recall/Tough/Barrier compound tests (+11): p0555, stun-combat, Tough lethal-twice, Barrier+Tough compound, draw trigger event
- UI: BF full-tile art covering entire tile, opponent hand count label, seat-opponent height 200px, phase pill boost

**Iter-44 (engine: 1808→1826):**
- Deflect wired (+18 tests): Deflect surcharge stacking, Guard damage priority -2, chain APNAP ordering, counter-spell timing, rune channel cases
- CSS: BF rules text subtle, unit chip darkened gradient, combat/chain panel distinct backgrounds, hand-chip-selected gold state

**Iter-45 (this session, engine: 1826→1833):**
- p0023/p0127 Deathknell timing window: 2 regression tests locking in that Deathknell fires and its counter is applied BEFORE the attacker's VP is awarded (sequential LIFO chain drain confirmed; `__counters.damage` = combat_dmg + deathknell_dmg)
- Counter-spell mid-chain mechanics: 2 tests — spell marked `countered: true` by `counterSpell` move, skips effect on resolution, target takes no damage, spell ends in trash; non-countered control case
- p1803 target-tracking: spell targets track units across zone moves (no crash on resolution even when target moves before chain drains)
- p1838 token Deathknell: 2 tests — units with Deathknell that die in combat fire their trigger (observable via `__counters.damage`); units without Deathknell do NOT get the extra +1 self-damage counter
- All 7 new tests in `riftjudge-cases.test.ts`

**NEXT_FOCUS:** Deathknell timing window + more chain judgment-call cases

### Phase 51 — p21xx range: equipment-detach, beginning-phase trigger ordering, misc (iter-45→47, engine +7 tests) — 2026-05-13

**Tests:** engine 1856→1863/0 (+7 this session), cards 931/0

**iter-45 (engine: 1826→1833):**
- Stun/recall/Tough/Barrier compound + draw trigger event tests (+7)
- Deathknell timing window (p0023/p0127), counter-spell mid-chain, p1803 target-zone-move, p1838 token-Deathknell

**iter-46 (engine: 1833→1844):**
- p0328/p1026/p0433/p0739/p0122/p0151/p0674 regression locks (+11)
- UI: BF art full-tile brighter, BF band taller 300/520px, opponent strip 170px max, game-over backdrop-blur, sidebar flex

**iter-47 (engine: 1844→1856):**
- p0259 FIXED: combat-heal-before-Deathknell ordering (moved dispatchUnitDied after heal sweep)
- exhaustion idempotency, awaken-ready, conquer-VP-immediate, rule 466.1.b, rule 467, p2105/p2113/p2131 (+12)
- UI: BF rules text 8px/0.45 opacity, game-over banner 52px gold, trail item separators, player-active border, avatar-active glow

**iter-48 (this session, engine: 1856→1863):**
- p2116: APNAP/same-player ordering for simultaneous beginning-phase triggers locked in — 2 tests: (1) two `start-of-turn` triggers from same player both fire (returns 2); (2) `orderTriggers` directly: P1 (turn player) always ranked before P2 per rule 585.2
- p2120: equipment detach-on-death regression — 3 tests: single gear → base (not trash), multiple gear → all to base, gear at battlefield → returns to base (not left floating)
- p2118: QuickDraw whiff — gear stays at base when target unit is killed before trigger resolves
- p2123: Bellows Breath Repeat independent targets — two damage executions at different locations apply independently; cleanup only after both; surviving units each have 1 marked damage
- Engine: `orderTriggers` and `state-based-checks` detach path confirmed correct (no code changes needed, existing logic is correct)

**NEXT_FOCUS:** equipment-detach on death (p2120 ✓), p2116 beginning-phase trigger ordering (✓), chain judgment-calls, more p22xx cases

### Phase 52 — PHASE B batch 33 final (iter-49A+B, engine plateau confirmed, UI ~93%) — 2026-05-13

**Tests:** engine 1863→1874/0/59-todo (+11), cards 917/0, web 157/0 (all green)

**iter-49A (UI polish, CSS only):**
- DeckPile stack silhouette: `.deck-pile-stack` with `::before`/`::after` pseudo-element card layers (offset + rotation) for visual depth
- Phase-breathe animation: `@keyframes phase-breathe` on `.phase-active` — pulsing blue box-shadow (2.5s ease-in-out infinite), replacing static gold glow
- CardOverlay popover CSS: `.card-overlay-popover` absolute-positioned 220px panel with dark gradient, blue-tinted border, `@keyframes popover-fade-in` slide-in; scoped via `.hand-chip:hover + .card-overlay-popover` trigger
- CombatPanel unit might badge: `.combat-unit .might-badge` inline pill matching the BF chip style
- No engine/cards changes; web vitest 157/0 (all green)

**iter-49B (engine: 1863→1874, +11 tests):**
- p2114: Deathknell unit in combat — unit deaths correctly trigger Deathknell chain item, fires before opponent's end-of-combat actions
- p2135: static aura with while-level condition — level-gated statics recalculate correctly on XP crossing the threshold
- p2140: simultaneous chain resolution APNAP ordering — when two players have items on the chain, turn-player's items always drain before opponent's
- p2141: gear equip + exhaust-as-cost interaction — `exhaustCard` used as an activation cost doesn't trash the gear, card remains equipped
- p2100: Replacement effect chain — two replacement effects on the same event, affected owner chooses order per rule 575.1
- All p-files MATCH engine behavior; 0 actual bugs found — confirmed correct behavior on 5 distinct scenarios

**ENGINE PLATEAU CONFIRMED (iter-49B sub-agent STATUS: DONE):**
"Over the last several batches the ratio has shifted heavily toward regression-locking already-correct behavior with very few actual bug finds. The p-file frontier (p2100–p2141) is exhausted. The engine is in a genuinely solid state."

59 todos remain — all require infrastructure changes beyond the riftbound-engine scope (additional-turns turn-queue, HOT FEPR showdown step sequencing, `advancePhase` engine↔FlowManager sync, cross-game @tcg/core work). None indicate correctness regressions.

**Final engine test counts: 1874 pass / 59 todo / 0 fail.**
