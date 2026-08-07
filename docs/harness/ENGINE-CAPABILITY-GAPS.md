# Engine capability gaps — cross-cutting analysis of the fix queue

Snapshot: HEAD `6885efb` (2026-08-06), queue `open≈310–367 (draining live) · failed 37 · done 493`.
Inputs: every `failed/*.json` note, all `open/*.json` titles+expected (regex-clustered, then hand-corrected),
the last ~200 `done` notes, `FIXER-PRIMER.md`, `HARNESS-DESIGN.md §10`, `03-rules-decision-taxonomy.md §4`,
and spot-checks of the engine at HEAD (`git show HEAD:…`) plus the shared working tree (≈70 engine files carry
other lanes' uncommitted WIP — noted where it matters). Paths: `E/` = `packages/riftbound-engine/src/`.

Two meta-findings before the table:

1. **~70 % of `failed` items are lane collisions, not missing capabilities.** 26/37 notes say "another lane is
   mid-flight in `cost.ts` / `play-spell.ts` / `resolve.ts` / `trigger-runner.ts` / `damage.ts` /
   `state-based-checks.ts`". Those six files are where every cross-cutting gap below lives. Per-item fixers keep
   bolting flags onto them (`ChooseTargetChoice` now has 11 optional mode flags; `"pay-x"` is produced/consumed in
   `resolve.ts`/`pending-choice.ts` but is **not a member of the `PendingChoice` union** at HEAD). The gaps should be
   closed as single-owner work packages with the queue paused on those files, or the collision rate will climb.
2. **What per-item fixers CAN land** (from `done`): card-def/`abilities` reshapes, parser patterns, new target
   filters/locations, new effect handlers, new trigger `on`/event fields, one-off prompt producers reusing
   `choose-target`/`reveal-and-pick`, cost-shape recognition in `getOptionalPlayCost`, keyword/static conditions.
   Anything needing a *new answer shape*, *a pause inside an effect sequence*, *a new place in the turn structure
   where the game asks*, or *one choke point that 8+ call sites must route through* does not land per-item.

## Top table

Counts are open items whose *primary* blocker is the gap (hand-corrected from the regex clusters in the appendix;
many items need two gaps — secondary counts in the per-gap sections). Size: S ≤ 1 day, M 2–4 days, L ≥ 1 week
of one strong agent incl. tests.

| # | Gap | 1-line description | #open (examples) | #failed | Size | Deps | Order |
|---|---|---|---|---|---|---|---|
| G1 | **Score/victory pipeline** | One `awardPoints()` choke point: 471.1.b final-point/draw-instead, "can't gain points" denial (054.1), clamp ≥ 0, board-derived victory score, victory SBA at every cleanup (hold wins), burn-out loop, no discretionary `scorePoint`, no conquer trigger on re-take of scored bf | **~46** (590a54a47e22, 9ac838f3512a, 3f89def69a0f, 14b57c7e32c4, cfaa2aa3ae38, 3ba2895fd6be Baron Pit) | 1 (267c1379880f) | M | none | **1** |
| G2 | **Generic choice algebra + effect continuation** | `PendingChoice` gains `pick{min,max}`, `distribute{total,buckets}`, `order{items}`, `integer{min,max}` (typed `pay-x`), explicit `chooser`, and a uniform `resume` continuation so *any* handler (`optional`, `for-each`, `sequence`, cost payment) can suspend and resume; zero-pick legality; re-validate targets at resolution (fizzle / can't-be-chosen) | **~24** (dad03a93c255-class, 9d202ab95691, f4af9beceea2, af15a600ba86, 129aa985bd90, 49823c3bc58c, 69ec3aa8d805, d5f6808fc20e, 6033dadb3006) | 3 (dad03a93c255, 6b8492d3e02d, e315c542aa1a) | L | none | **2** |
| G3 | **Nested play-by-effect = full play bundle** | `handle_play` becomes `beginEffectPlay(cardId, fromZone, {player, locationConstraint, costMode: full/ignore-energy/ignore-all/-N, then})` that runs 354–359: chooser may be opponent/owner, location prompt, targets, optional costs (Accelerate), permission plays from trash/banishment (Endless Riches, Nocturne), 128.6 decline, LKI reset | **~38** (9a0eb5313fa5 Bone Skewer, 3102bebdb0de Temporal Breach, e0a11f2e2f38 Endless Riches, 99c75d82c6da Rift Herald, 1f5b34dfbcb1 Glasc, defaa7bfccba Nocturne, a125fa8b7565, 40fb3c1635d3) | 4 (20d34b8bc188, 3ffdcdbe69de, acbfa7cfccaa, 02b30b239491) | L | G2, G6, G5 | **5** |
| G4 | **Cost model + payment step** | `AdditionalCost[]` per card (mandatory/optional × pay/kill/discard/exhaust/spend-buff/recycle/xp, each with chosen object params) shared by playUnit/playSpell/activateAbility/revealHidden/trigger opt-in; alternative costs; one-shot modifiers with power pips; restricted energy; a **Pay sub-step** where Reaction-Add abilities (tap/recycle rune, Gold) are legal (357.1.a/444.2.c) so affordability = pool + addable | **~30** (d61ab776d017, 0de7c03c9495, 1d9d53d3f52d, e936452be203, 4c1ef8841f0c, 18d5dabb2965, 049292235ee5 Hard Bargain, 6b478c7c4790, 952c1c5ada69, b6605ac38527) | 7 (ce21b7940621, 540af2f1dcbe, b076b4ebd634, e151f0aae31f, 66503f785bee, 4c7bba1368a9, 0f8ffb6aa800 — mostly collisions in `cost.ts`) | L | G2 (integer/pick for pay plan) | **4** |
| G5 | **Single leave-play / die choke point + LKI** | `leaveBoard(cardId, dest, cause)` used by kill.ts, SBA deaths, Temporary, cost-kills in `activate-ability.ts`, discard costs, banish, recycle, bounce: applies die replacements (ordered/optional), emits `die`/`discard`/`leave` with last-known info (`diedAt`, `wasBuffed`, `wasAlone`, attachments, board snapshot for Karthus-dies-too), resets meta (124.1), detaches Equipment (457.1), tokens cease (186.1), single damage store | **~22** (13619db7ad13, 758e0cf67b54, 770cf14d2f65, df287d5c9936, fb33584078c1, 6a239b702f2a, 47069bf92781, 55283c05cd19, e3262d91b64b) | 3 (235e9e82dc6c, 9b2c07b1ec80, 66503f785bee — fixed in-tree, unlanded) | M | none | **3** |
| G6 | **Priority/Focus/turn-state oracle + cleanup-driven showdown staging** | One `whoMayAct(state) → {player, allowedTimingClasses}` consulted by every move condition (14 files check `activePlayer`/`focusPlayer` ad hoc); newest-item controller gets priority (337.4); 346.1 focus retention; 323.12/13 staged showdowns begin automatically in Neutral-Open cleanup with correct Focus (345); Closed state keeps bf control (323.6) | **~18** (e4ea2d8e33ed, 8f80115ec861, 27553113aa06, 28ffa7a8791f, 971de2f24123, 89351b0929e4, d84d9bd41f9e, 7e48e50c59a6, 9327b69cf103) | 0 | M | none | **6** |
| G7 | **Trigger finalization dialog (FIN)** | When a triggered item is put on the chain: 402.1 "you may" perform?, 402.2 targets/modes/destinations, 404 pay-or-decline base cost — all before anyone receives priority; per-item (Karthus copies choose independently); declined = never triggered | **~10** (2b7c0bd55fb0, 69aa7fee34e2, f689143f7648, 09f6e5152ca9, d11f5b5ec390, c4a2af4e0357, 8bc5d9ef6d4a) | 2 (e315c542aa1a, 55f2fd709413) | M | G2 (continuation), G6 | **7** |
| G8 | **Restriction / permission layer** | Queryable `isAllowed(action, subject, ctx)` fed by statics, `turnStatics`, `meta.restrictions` (today write-only — no reader exists): can't move (to base), can't play spells this turn, can't be played/moved here (Rockfall Path, 449.2 3-player), once-per-turn activations (377.2.b), modes not chosen this turn, conditional enters-ready ([Level], hand-size, namesake-in-trash), no-combat-damage, damage immunity, forced move → recall (456.1) | **~20** (3b1fe8aa9a69, 8b081fee909c, 958546cc977a, 54a1202d38bb, a25f93878604, dd55344bd27b, 39ad13c021a6, 91dd90ea58f1, e8c806e9c66a, 4b8f8d476f18) | 2 (ffd00589afe5, f6499d826616) | M | none | **8** |
| G9 | **Control ≠ owner sweep** | Combat sides, hold check, "you"/"its controller"/"friendly", battlefield-card triggers controlled by the acting player (190.6), contest attribution, `MatchedTrigger.cardOwner` → controller. `resolve-full-combat.ts` and flow hold scoring use `getCardOwner` exclusively today | **~14** (32e929b87674, c48cbc5aa3f5, 7217e5ed10b0, 3debdef900ab, f5a60bb6db05, fdea167b9bd7, 993a0071d58e, f9dea396f58d, b34df2eb6631) | 1 (e1a086fb7e46, in-tree) | S–M | G5 (LKI of controller) | **9** |
| G10 | **Replacement engine v2** | `replaces` for any event kind (die, take-damage, score, might-change, reveal/look, move, draw, play-token), `optional` + `cost` + `chooser` on `ReplacementAbility` with an RPL-time prompt, 372/373 ordering prompt for every event (today only SBA-die), modifiers (double/prevent) composition, GA-style "kill this instead" | **~10** (879b1ec3caa3, 0ecf6b3793df, 4725749f3edb, 3a4387624dab Lotus Trap, 436cc2b5651c, b53b1202e36a, c0e8bbf0e027) | 1 (691b1256ae5d) | M | G5, G2 | **10** |
| G11 | **Missing GameEvent emitters / trigger sources** | `win-combat`, `draw`, `heal`, `channel-rune`, `look`/`reveal` (deck cards as trigger/replacement sources — Nocturne), `ready` from every path, effect-move `move` events reaching "When I move" (Faefolk), `play` during showdown, spell-cost payload on `play-spell`, `equip` | **~14** (3f5ba4c359df, 1bf2aa4e27b2, 4a97828cebc5, 9158c5188f0c, dbfa6cb819a8, ef8cb06fbf4c, 31df1d829116, 13e81f9a9619, 106a699edaa5) | 1 (3ffdcdbe69de) | S each / M total | G5 for die-family | **11** (parallel-safe) |
| G12 | **Combat damage assignment as a decision + outcome rules** | Attacker then defender submit `distribute` honoring 465.2.c (lethal-fill, Tank first, Backline last, stunned = 0), reject illegal splits; lone attacker with no defenders establishes control (466.3.a/466.5.d); "no result" restages; heal-all scope; attacker designation cleared on recall | **~10** (8f03264b3a55, a489b24fa7cd, e16ca9236d3e, e51e6dc522b1, fdea167b9bd7, 4f7ebaf37ee7, 1f92dbf68b85, adec6f42fc32, 700c6b30d6bd) | 0 | M | G2 (`distribute`) | **12** |
| G13 | **Layered characteristics / static recalculation** | One `computeCharacteristics(cardId)` with layers (copy → set/swap → ±modify → multipliers → keyword grants), dynamic `{count:…}` amounts, equipment multipliers, points-scaled Might, copy effects (Reflection/Spectacles), single post-mutation recalculation hook (incl. scenario build, rune moves, playSpell finalize) | **~12** (16cf4fad0fff, 386823277d04, f6761b769836, 7a426254e4f0, 71e6c9dce6be, df5623971157, 2ea7abeda81e, 394c3eea1a2d, c04e82b38550) | 0 | M–L | none | **13** |
| G14 | **Trigger multiplicity & restriction bookkeeping** | `once-each-turn` (TODO in `trigger-matcher.ts`), once-per-game, "first Beginning Phase", dedupe (Abandoned Hall fires twice), Karthus doubler read from LKI when the doubler dies in the same event, same-controller ordering prompt (383.3.d) | **~9** (0b1585b1d4d3, 401f3525c6c1, 47069bf92781, ecd61df6c7e9, 4d4052498985) | 3 (2a926178a696, 752f258669c7, 865b6188fd37 — fixed in-tree, blocked on `trigger-runner.ts` collision) | S–M | G5 (LKI), G2 (`order`) | **14** |
| G15 | **Pregame / match procedure** | Mulligan validation & turn order, once-only opening draw, tie re-roll, random Bo1 battlefield, hidden simultaneous selection, set-aside (not trash) of unused battlefields, Bo3 match state, deck validation (3 bfs, dup names, Signature), first-turn channel bonus by *player's* first turn, FFA first-player draw skip | **18** (157bb22e27c2, 1a278f359067, 228faf05022e, 748c70f766ba, 1657d6919770, c29a6935ecf1) | 0 | M | none | **15** (independent, low card leverage) |
| G16 | **Per-engine card registry** | `getGlobalCardRegistry()` has ~160 call sites; concurrent games in one process (MCP server, parallel tests) are unsafe; token ids use `Date.now()` | 0 open (harness prerequisite §10.2/14) | 0 | M (mechanical) | none | opportunistic |
| — | UI/app render items | board.js clipping, DOM invariants, WebSocket crash | 9 | 0 | — | not engine | — |

Already landed since the taxonomy was written (do **not** re-plan): X-as-Power paid at resolution (`pay-x`
prompt in `resolve.ts` — needs typing only), token play-location prompt (`create-token.ts` → `choose-destination`),
independent per-instance spell targets, `each-player-may` sequential prompts (Whirlwind/King's Edict "may" form),
kill-any-number / spend-buff / discard optional costs on `playUnit`, mandatory spell kill cost, split-damage
`allocation`, replacement ordering prompt for SBA deaths, optional pay-to-replace death (in-tree WIP), Karthus
`trigger-double` static (in-tree), trigger target lock at finalization for single targets (untracked
`abilities/trigger-target-lock.ts`, WIP).

**G1 / WP1 landed** (2691333, 708c4b7, 0faa4b0): `E/operations/points.ts` is the score/victory choke point —
`awardPoints` (054.1 denial → 443 per-method skips → 471.1.b Final Point → add + per-method `pointsGainedThisTurn`
ledger), `losePoints`, `markScored`/`scoreBattlefield` (471.2.c), `scoreEvents` (`hold`/`conquer` + new `score`
GameEvent), `burnOut`/`refillDeckOrBurnOut` (431.3), `effectiveVictoryScore` (battlefield + board statics),
`checkVictory` (only status/winner writer; end of `performCleanup`, flow Hold step, burn-outs; no-op mid-resolution).
All nine former `victoryPoints` writers route through it; `scorePoint` is never enumerated. Remaining G1-adjacent
work lives in other gaps: excess-damage conquer prompts (G2/G12), `win-combat`-first-time restriction (G14).

**G5 / WP3 landed** (b7d20e7, eb119c2, 8f0d410): `E/operations/leave-board.ts` is the leave-play / die choke point —
`snapshotLKI`/`snapshotBatch` (428.1.a.1.b / 740.2.a: zone, controller, owner, Might, buffed/stunned/exhausted, damage,
attachments, unitsHere, wasAlone, triggerDoubler → `draft.lki`, batch on `draft.leavingBatch`), `applyDieReplacement`
(board 370–373 via the existing matcher), `detachOnLeave` (457.1/719.5 both sides), `resetObjectState` (124.1 incl.
control revert 191.1), `leaveBoard(ctx, id, to, cause)` and `emitLeaveEvents`/`removeFromBoard` (one `die` with
`diedAt/killedBy/killSource/wasBuffed/wasStunned/controller/owner/wasAlone/attachments/cause`, `discard`, or new
`leave-board` GameEvent; tokens cease after their event, 186.1). Routed: `effects/kill.ts` (`killUnits` exported), SBA
deaths in `performCleanup` (pre-snapshotted batch) + `dispatchUnitDied`, flow [Temporary] kill, `activate-ability`
kill/discard costs, `play-unit` discard cost, `effects/{banish,return-to-hand,recycle,discard}.ts`, owner-choice recycle
in `pending-choice.ts`, sandbox `killUnit/discardCard/banishCard/recycleCard`; `trigger-runner` reads LKI for the dying
card's controller, `wasAlone`, and Karthus-style doublers dying in the same batch. `E/operations/damage-store.ts`
(`get/set/add/remove/clearDamage`) is the single damage writer (counter bag = store, `meta.damage` = mirror) for
effects/combat/sandbox/Ending-Step heal; `counterMoves` run post-move maintenance. Not yet done here: die-replacement
ordering/optional prompts beyond the SBA path (G10/G2), reveal-and-pick recycle of BOARD cards in `pending-choice.ts`
(WP2's rewrite), `effects/play.ts` fresh-object reset → `resetObjectState` (WP5).

---

## Per-gap detail

### G1 — Score / victory pipeline (M, order 1)

**Rules.** 471.1.b/471.1.b.1 (at VS−1 a Conquer gains the Final Point only if every battlefield was scored this
turn, else *draw instead* — the battlefield still counts as Conquered/Scored, 471.2.a); 471.2.c (re-establishing
control of an already-scored battlefield is not a Conquer → no "When I conquer"); 472/323.1/319.2 (victory is checked
in every cleanup, including after the Beginning-phase Hold and mid-chain); 054.1 ("can't gain points" forbids beat
permits; the Score still happens, the Point does not — 383.4.d.2.c); 194.4 (points floor at 0); 194.3.a/365.1
(victory score modifiers derived continuously from board statics); 431.3 (Burn Out repeats until someone wins);
468–469 (scoring is a Limited Action — no discretionary `scorePoint`); 443 (score-skip replacements are per method).

**Engine today.** Nine independent writers of `player.victoryPoints` (`flow/riftbound-flow.ts` beginning.onBegin
hold + burn-out, `moves/combat/resolve-full-combat.ts`, `moves/chain/showdown.ts passShowdownFocus`,
`moves/combat/score-point.ts`, `conquer-battlefield.ts`, `abilities/effects/score.ts`, `effects/draw.ts`,
`moves/discard.ts`, `operations/riftbound-operations.ts`), each with its own (or no) `hasPlayerWon` check and its
own `status="finished"` write. Hold scoring in flow never checks victory. `operations/scoring-rules.ts` has only
`canPlayerScoreAtBattlefield` (Forgotten-Monument style) and `applyScoreReplacement` (method-agnostic).
`getEffectiveVictoryScore` reads a setup-time `victoryScoreModifier`, not board statics. No denial static reader.

**Design.** New `E/operations/points.ts`:
```
awardPoints(draft, playerId, n, cause: {method:"hold"|"conquer"|"effect"|"burn-out", battlefieldId?, sourceCardId?}, io): {gained:number, drewInstead:boolean}
losePoints(draft, playerId, n)                       // clamps at 0
markScored(draft, playerId, bfId, method)            // scoredThisTurn/conqueredThisTurn bookkeeping, independent of the point
effectiveVictoryScore(draft, playerId)               // base + setup modifier + Σ board statics {type:"static", effect:{type:"modify-victory-score"}}
checkVictory(draft) → called from performCleanup (state-based-checks.ts) ONLY; sets status/winner once
```
`awardPoints` order: (a) undeniable? (burn-out 431.3.c.1) else denial statics (`opponents-cant-gain-points`
condition evaluated via `static-abilities.evaluateCondition`) → 0; (b) `applyScoreReplacement(method)`; (c) if
`method==="conquer"` and `points ≥ VS−1` and not every battlefield in `scoredThisTurn[player]` → draw 1, return
`drewInstead`; (d) add, no victory write here. Conquer trigger emission moves behind `markScored` returning
`wasAlreadyScoredThisTurn` (471.2.c). Delete `scorePoint` from the main-phase enumerator (keep as directed/sandbox).
Burn-out: loop in the draw step while deck+trash empty until `checkVictory`. Hold step: fire `start-of-turn`
triggers, **let the chain resolve** (flow hold on pending chain — the driver already supports beginning holds),
then score (315.2.a→b items 012f928fb9cd, 0d0efb7e778f, 2e001cb7e518).

**Migration.** Replace all nine writers; `victory.ts hasPlayerWon` stays as the predicate. Harness `TurnDriver`
already stops on `status==="finished"`.
**Tests that flip.** `core-rules/victory-and-final-point.test.ts` (12), `score-denial-and-modification.test.ts`
(23), `scoring-hold-and-conquer.test.ts` (4), `rulings/baron-nashor-ccdaa4bfea95cac4` (2), Tianna Crownguard.
**Risk.** Low; pure bookkeeping. Watch 2v2 team conquer rule (630.1.a `previousController`) when folding
`score-point.ts` in.

### G2 — Generic choice algebra + effect continuation (L, order 2)

**Rules.** 355.13 (any number / up to N includes zero), 355.14.e–h (distribution decided at resolution),
383.3.d & 372/373 & 416.5.a & 719.5.a (orderings), 444.2 (integer pay), 355.10.e/411.1 (non-controller
choosers), 383.3.a.3 / 740.4.a.1 (later "you may"/"pay N to" decided mid-resolution), 359.3.e.5 (targets
re-checked at resolution; illegal → that instruction fizzles), 757 (can't be chosen).

**Engine today.** `E/types/game-state.ts PendingChoice` = 7 variants answered by one scalar each; multi-pick,
distribute, ordering and integer exist only as **flags on `choose-target`** (`anyNumber`, `maxPicks`, `picked`,
`assign`, `total`, `boundTargets` drop-mode, `replacementOrderFor`, `bindToChainItemId`) or on `reveal-and-pick`
(`remaining`, `taken`), plus an undeclared `"pay-x"`. Continuations are ad hoc `then?: unknown` fields on four
variants; `effects/optional.ts` **auto-applies** ("auto-apply for now"); `effects/sequence.ts` suspends only when
the parked prompt is `choose-mode`; `for-each.ts`/`do-times.ts` never check `draft.pendingChoice`, so a prompt raised
inside them silently drops the remaining iterations (root cause of failed dad03a93c255/6b8492d3e02d). Zero-target
"choose none" is not expressible for non-`anyNumber` prompts; resolution-time legality re-check exists only in
`resolve.ts` for bound targets that left the board.

**Design.** Replace the union with a small algebra (keep old names as type aliases during migration):
```
type Chooser = { playerId: PlayerId; controllerId?: PlayerId }        // who answers vs. whose effect it is
type Resume  = { effect: ExecutableEffect; ctx: SerializableCtx; cursor: number[] }   // see below
PendingChoice =
 | { kind:"pick";       chooser; options: Key[]; min; max; semantics: "target"|"drop"|"destination"|"mode"|"revealed"|"cost-object"|"player"|"event"; visibleTo?: PlayerId[]; resume }
 | { kind:"distribute"; chooser; total; buckets: {key,min,max}[]; ordered?: boolean; resume }
 | { kind:"order";      chooser; items: Key[]; resume }
 | { kind:"integer";    chooser; min; max; unit:"power"|"energy"|"x"; resume }
 | { kind:"yes-no";     chooser; cost?: Cost; resume }
 | { kind:"name";       chooser; vocabulary; resume }
resolvePendingChoice { keys?: Key[]; allocation?: Record<Key,number>; value?: number; accept?: boolean; name?: string }
```
**Continuation:** make effect execution resumable instead of re-entrant-by-convention. `executeEffect` gets an
explicit program counter: `sequence`/`for-each`/`do-times`/`conditional`/`optional` push a frame
`{effectPath, index, boundTargets, variables}` onto `ctx.stack`; any handler may `return suspend(choice)` which
stores `{stack, rootEffect, chainItemId}` in `pendingChoice.resume`; `resolvePendingChoice` writes the answer into
`ctx.answers[choiceId]` and calls `resumeEffect(resume)` which re-walks the tree by path (pure data, no closures —
keeps state serializable/replayable). `optional` becomes `suspend(yes-no)`; "you may pay N to" becomes
`yes-no{cost}` → on accept enter the G4 pay sub-step. Add `isValidAnswer(choice, answer, state)` as the single
validator (min/max, distinctness, 465.2.c constraints for combat, sum=total) and `revalidateTargets(boundTargets,
descriptor, ctx)` called by every handler via `getTargetIds` (drops illegal/left-zone/untargetable → per-instruction
fizzle, 359.3.e.5; "can't be chosen" filtered at enumeration in `resolveTarget({choosing:true})` and again here).
Harness: `harness/decision.ts` already has `pick{min,max}`, `distribute`, `order`, `integer`, `yes-no` — mapping
becomes 1:1 and the `choose-target`-flag special cases (lines ~444–560) collapse.

**Migration.** Remove `assign`/`total`/`anyNumber`/`maxPicks`/`picked`/`remaining`/`taken`/`replacementOrderFor`
flags; `each-player-may.ts`, `recycle.ts` keep-N, `discard.ts` N>1, `look.ts`, `predict.ts` (gets `order`),
`sequence.ts` choose-mode special case, `resolve.ts` opt-in/pay-x all become `suspend(...)`. ~25 producer sites
in `abilities/effects/*` + `resolve.ts` + `play-unit.ts` (weaponmaster) + `state-based-checks.ts`.
**Tests that flip.** ogn-153 Overt Operation, ogn-230 Albus Ferros zero case, ogn-206/sfd-023/Switcheroo two-target,
Alpha Strike zero targets, ogn-237 King's Edict distinct picks (3p), unl-164 each-player-must, rune recycle order
(416.5.a), facedown overflow (107.3.b.2), Vex/Ruin Runner can't-be-chosen, Lacerate resolution-condition, plus it
unblocks G3/G4/G7/G10/G12.
**Risk.** High-touch (pending-choice.ts is 1.6 kLoC of per-variant branches). Do it with the queue paused on
`pending-choice.ts`, `resolve.ts`, `sequence.ts`, `game-state.ts`; land behind type aliases so card tests keep
compiling; then delete aliases.

### G5 — Single leave-play / die choke point + last-known information (M, order 3)

**Rules.** 124.1 (zone change to/from non-board clears damage, counters, grants, statuses, control changes);
428.1 (any kill — instruction, cost, SBA, Temporary — is a death: replacements 370–373 and Deathknell apply);
457.1/719.5 (attachments detach when the bearer leaves; controller orders detaches); 186.1 (tokens leaving the board
cease to exist); 740.2.a / 428.1.a.1.b (dies-triggers look back at the board state immediately before the event —
"here", "alone", "buffed", *and which doublers were on board*); 422 (discard as cost is a discard event).

**Engine today.** Deaths: `effects/kill.ts` (fires `die` itself with `diedAt/killedBy/wasBuffed/wasStunned`),
`cleanup/state-based-checks.ts performCleanup` → `events/dispatcher.ts dispatchUnitDied` (different payload),
`flow/riftbound-flow.ts` Temporary (raw `moveCard` to trash, consults `checkReplacement` but emits **no `die`**, no
meta reset), `moves/chain/activate-ability.ts` `cost.kill` and `cost.discard` (raw `moveCard`, no event),
`moves/play/play-unit.ts` optional `kind:"kill"` sacrifice (raw `moveCard` in one branch; the kill-any-number branch
routes through `executeEffect(kill)`), `moves/discard.ts`, `effects/discard.ts` (fires `discard`), `effects/banish.ts`,
`recycle.ts`, `return-to-hand.ts bounceToHand` (own reset copy). Meta reset lives in `performCleanup` kill path and
`bounceToHand` only → buffed/damage persist in trash/banishment (13619db7ad13, 758e0cf67b54, 37fe797e30cc);
equipment stays "attached" to a dead unit (770cf14d2f65); tokens linger in `mainDeck` (df287d5c9936); two damage
stores (`meta.damage` vs counters) disagree after end-of-turn heal (e3262d91b64b, 38daef5c0681). Karthus
`extraTriggerCount` reads the *current* board, so Karthus dying in the same cleanup stops doubling (47069bf92781,
ecd61df6c7e9).

**Design.** `E/operations/leave-board.ts`:
```
leaveBoard(ctx, cardId, to: "trash"|"banishment"|"hand"|"deck-top"|"deck-bottom", cause:
  {kind:"kill"|"sba"|"temporary"|"cost"|"discard"|"banish"|"recycle"|"bounce"|"replaced", by?: PlayerId, source?: CardId, sourceKind?: "spell"|"ability"|"combat"})
  → { left: boolean; replacedBy?: CardId }
```
Steps: snapshot LKI `{zone, controller, owner, might, buffed, stunned, exhausted, damage, attachments,
unitsHere, boardAbilitiesIndex}` into `draft.lki[cardId]` (cleared at end of cleanup pass) → if kill-family:
gather die replacements (`findAllReplacements` + `activeReplacements`), order via G2 `order` prompt when >1 (372),
optional ones via `yes-no{cost}` (G10) → detach attachments (order prompt if >1) → reset meta per 124.1 through
**one** `resetObjectState(cardId)` (also used by `bounceToHand`, banish, play-from-zone in G3) → move → token
sweep → emit `die`(unit/gear)/`discard`/`leave-board` with the LKI payload → `fireTriggers` evaluates `here`/`alone`/
doublers against `draft.lki`. Make `counters` the single damage store; `meta.damage` becomes a derived mirror
written only inside `setDamage()`.

**Migration.** Route the 8 sites above through `leaveBoard`; delete `dispatchUnitDied`'s private payload builder
and `bounceToHand`'s reset copy; `trigger-runner.getBoardCards` reads `draft.lki` for the dying card instead of
special-casing "the discarded/dying card itself".
**Tests that flip.** `core-rules/tokens-banishment-trash-object-identity` (3), ogn-182 Unlicensed-Armory-style gear
self-triggers (played/discarded/killed), sfd-036 "died alone", Kog'Maw `diedAt` crash, Karthus+Sentry simultaneous,
unl-070 Temporary on gear, sfd-019 recycle-from-trash cost, `turn-structure` damage-store items; prerequisite for
G3/G9/G10/G14.
**Risk.** Medium — ordering of "reset meta" vs "Deathknell reads wasBuffed" is exactly what LKI solves; keep
`kill.ts`'s event field names (tests match on them).

### G4 — Cost model + payment step (L, order 4)

**Rules.** 356.2.a (mandatory additional costs, incl. on other cards), 356.2.b (optional; several independent
ones per card), 356.1.a (alternative costs "play me for [rainbow]"), 356.4 (increase → discounts in chosen order →
minimums per discount, 3a054c06d5df), 357.1.a / 444.2.c / 429.3 (while paying — at play, at trigger opt-in, or
mid-resolution — the payer may use Reaction **Add** abilities: exhaust/recycle runes, crack Gold, Seals),
357.2 (non-resource cost objects chosen and paid in the Pay step; a replaced cost still counts as paid), 165/135.2.e
(restricted energy "spend only to play spells"; `[rainbow]` = power of any domain), 379.5 (unpayable cost →
not activatable), 809 (Deflect is an additional cost per chosen target — interacts with floors, 7447d9961645).

**Engine today.** `moves/play/cost.ts getOptionalPlayCost(cardId)` returns **one** optional-cost descriptor of
kind `accelerate|kill|pay|discard|spend-buff|kill-any-number` recognised from ~6 ability shapes; `playUnit` has
grown parallel params (`paidAdditionalCost, additionalCostSpec, sacrificeId, sacrificeIds, discardId,
spentBuffIds`), `playSpell` a different subset, `activateAbility` its own (`sacrificeId, discardId, recycleIds`),
`revealHidden`/`playFromChampionZone` none. `canAffordCard`/`deductCost` must be kept in sync by hand (primer §7).
Affordability is **pool-only**: a spell with an empty pool and two ready runes is "not playable" (d61ab776d017);
opt-in `optInCost` at resolution offers only decline when the pool is short (0de7c03c9495); Reactions cannot be
activated while a `pendingChoice` is up (ce21b7940621). `meta.costModifier` is energy-only (Astral Heron
`[2][rainbow][rainbow]` no-ops: 18d5dabb2965, 5ae6af39ca86, 7f8c853226ea). No restricted-energy buckets
(e936452be203, 4c1ef8841f0c). No alternative-cost list (Nocturne/Jhin). `additionalCostsPaid` is a boolean, so "if
you paid *my* additional cost, don't X" cannot distinguish which (160b2ecbafc0).

**Design.**
```
// riftbound-types
type CostComponent = { energy?: n; power?: Domain[]|{any:n}; xp?: n; exhaustSelf?: true; exhaust?: Target; kill?: Target|"self"; discard?: n|Target; recycle?: {from:"trash"|"board", target, n}; spendBuff?: Target|{anyNumber:true}; returnToHand?: Target; banish?: Target }
type AdditionalCost = { id: string; mandatory: boolean; cost: CostComponent; perUnit?: {reduces: CostComponent}; ifPaid?: Effect }   // perUnit = "for each X killed/spent reduce by …"
type PlayCostModel = { base: CostComponent; alternatives: {id, cost, from?: Zone[], condition?}[]; additional: AdditionalCost[]; x?: {resource:"power"|"energy", when:"play"|"resolve"} }
getPlayCostModel(cardId, ctx) // derived once from abilities/keywords (Accelerate, Repeat tiers, Flow, Deflect-per-target, Hidden-for-0) + board statics (mandatory costs imposed by other cards, Ezreal-style optional-cost discounts, Vex-style increases, floors)
// moves
PlayArgs.costs = { alternativeId?: string; paid: Record<additionalCostId, true | {objects: CardId[], count?: n}> }
```
One `computeTotalCost(model, args, targets)` → `{resources: {energy, power: DomainMultiset, restrictedOk}, objects:
ObjectPayment[]}` used by condition, enumerator (variants = alternatives × subsets of optional ids, objects surfaced as
`fields` not pre-enumerated subsets) and reducer. **Pay sub-step:** reducer calls `beginPayment(draft, payer, total,
resume)`; if `pool ⊇ total` pay immediately (no prompt — keeps every existing test stable); else if
`pool + addable(payer) ⊇ total` raise G2 `pick{semantics:"add-ability", min:0}` listing legal Reaction-Add
activations (runes to exhaust/recycle with domain, Gold, Seals) and loop until payable or the payer cancels
(358.5 rewind = don't commit the draft: run payment *first* in the reducer before any zone change, or stage
mutations in a scratch object). The same `beginPayment` serves trigger opt-in costs (404), mid-resolution "pay N
to" (740.4.a.1) and `pay-x`. Energy pool becomes `{free:n, restricted:{onlyFor:"spell"|…, n}[]}`;
`costModifier` becomes a `CostComponent` delta list with power pips. `draft.additionalCostsPaid[cardId]` becomes
`Set<additionalCostId>`.

**Migration.** Collapse `playUnit`/`playSpell`/`activateAbility`/`revealHidden`/`playFromChampionZone` cost params
onto `costs`; keep old params as shims for one commit (harness `PlayArgs` maps `accelerate|payOptional|sacrifice|
discard` → `costs.paid`). Delete `getOptionalPlayCost`, `resolvePayableOptionalCost`, `getKillAnyNumberCost`,
`discountOptionalPlayCost` special cases into the model builder.
**Tests that flip.** `core-rules/paying-costs-energy-power` (4), Ezreal/Hard Bargain rulings (3), Vex hidden-flip
tax (3), sfd-019 recycle-as-cost (2), sfd-020 Draven pay-[fury]-on-attack (3), ogs-014/ven-sp6 restricted energy,
Astral Heron, unl-164 Atakhan, Heedless Resurrection cost-kill timing (eb5fbe62ecc2, 9b20946f8749, 6a949676ca46),
failed ce21b7940621 (Gold mid-resolution).
**Risk.** High (cost.ts 1.8 kLoC, two callers per move). Land model-builder + `computeTotalCost` first with the old
params translated in, then the pay sub-step, then delete shims.

### G3 — Nested play-by-effect as a full play bundle (L, order 5)

**Rules.** 419.3 (effect plays are Limited-Action plays running the whole 354–359 process), 354.3/401.2 (the new
pending item finalizes after the current resolution finishes), 356.1.b (ignore cost / ignore energy / reduced),
355.2 & 462.2.a & 811.1.d.3 (location: chooser's base or controlled battlefield unless "here"/forced), 128.6
(plays from private zones are declinable), 355.1.a (optional additional costs such as Accelerate are still
offered, 40fb3c1635d3), 124.1 (fresh object), 366.1-style permissions ("you may play X from your trash/banishment"
— Endless Riches, Nocturne, Immortal Phoenix), opponent-performed plays (Bone Skewer "they play it"), owner-performed
replays (Temporal Breach), sequential each-player plays (Promising Future).

**Engine today.** `abilities/effects/play.ts handle_play` is a chain of special cases (`replaySelfSpell`,
`playFromTrash`, `playFromHandToBase`, hand candidates → `choose-target`, `here`), plus separate paths in
`pending-choice.ts` (`reveal-and-pick onPicked:"play"` with `playIgnoreCost/playIgnoreEnergy/playEnergyReduction`),
`play-spell.ts viaFlow`, `hide.ts revealHidden`, dispatcher `recentDeaths` for "play me from trash", and the
`opt-in.acceleratePlay` bolt-on. None share code with `playUnit`'s reducer (entry exhausted, enter-ready
replacements, play triggers, Weaponmaster, battlefield-token entry, control reset 191.1) except by copy. No
"permission to play from zone Z" registry, so `enumerateMoves` never offers Endless-Riches/Nocturne plays; no
opponent/owner chooser; no decline for private-zone plays; banish-then-replay (Temporal Breach family, 8 items) is
unimplemented.

**Design.** Extract `E/game-definition/moves/play/play-pipeline.ts`:
```
beginPlay(draft, {cardId, player, from: ZoneId, via: "hand"|"effect"|"permission"|"hidden"|"flow"|"champion",
           costMode: {kind:"full"} | {kind:"ignore-all"} | {kind:"ignore-energy"} | {kind:"reduce", by: CostComponent},
           location?: LocationId | "prompt" | {only: LocationId[]}, targets?, costs?: PlayArgs["costs"], declinable: boolean,
           then?: Resume })
```
which (1) moves the card to a `pending` limbo on the chain (354.2), (2) raises G2 prompts for any missing bundle
field to the *specified chooser* (location → targets → optional costs via G4 model → payment), (3) commits via the
same `enterBoard(cardId, zone, {fresh:true})` used by `playUnit` (which becomes `beginPlay({via:"hand", costMode:
full})`), (4) fires `play-self/play-card` with `via` so "when you play a unit from trash/facedown" triggers and
Legion counting work, (5) runs `then`. Add `draft.playPermissions: {cardId|filter, zone, player, cost?: alternative,
expires}[]` written by statics/effects (Endless Riches, Nocturne banish, Phoenix) and read by a new
`playFromZone` move enumerator. `reveal-and-pick onPicked:"play"`, `look`, Deathknell replays, Bone Skewer
(`chooser: opponent`, `location: {only:[here]}`), Temporal Breach (`banish → beginPlay({player: owner, from:
banishment, costMode: ignore-all, location: sameAsLKI})`) all call it.

**Migration.** Delete `playFromTrash/playFromHandToBase/replaySelfSpell`, `RevealAndPickChoice.play*` fields,
`OptInChoice.acceleratePlay`. `revealHidden` gains targets/location through the same pipeline (811.1.d).
**Tests that flip.** Bone Skewer (6), Temporal Breach (8), Shadowblade Lurker/Endless Riches (3), Nocturne (4),
Glasc/Skulker (4), Rift Herald, Harrowing enters-ready (2, with G8), sfd-111, Baited Hook ordering, failed
20d34b8bc188/acbfa7cfccaa/3ffdcdbe69de.
**Risk.** High but well-bounded once G2/G4 exist; without them it re-creates the flag sprawl.

### G6 — Priority/Focus/turn-state oracle + cleanup-driven staging (M, order 6)

**Rules.** 312/337.4/340.4 (after items finalize, the controller of the newest item receives Priority; others may
act only when Priority reaches them), 313/347 (in a Showdown only the Focus holder plays; Focus passes on pass),
346.1 (a chain opened by a triggered ability/Add does not move Focus when it empties), 323.12–13/344–345 (in
Neutral-Open cleanup the Turn Player picks a staged showdown; it begins automatically; the player who applied
Contested gets Focus), 323.6 (control of an empty battlefield is lost only in an Open state), 811.1.b/811.6 (Hide
only on your turn in Open state; play-from-hidden needs Priority/Focus).

**Engine today.** `chain/chain-state.ts getTurnState/isLegalTiming/hasShowdownPermission` exist, but who-may-act
is re-derived in each move: 14 move files test `chain.activePlayer`/`turn.activePlayer`, only `showdown.ts` and
`play-unit.ts reactionWindowOpen` look at `focusPlayer`; `play-spell.ts` got a Focus gate recently, `hide.ts`,
`activate-ability.ts`, `revealHidden` did not. Staged showdowns wait for a manual `startShowdown` move offered to
both players; `performCleanup` step 6 drops control while the state is Closed.

**Design.** `E/chain/priority.ts`:
```
actingWindow(state) → { kind:"neutral-open"|"neutral-closed"|"showdown-open"|"showdown-closed"|"pay"|"prompt"|"no-priority",
                       player: PlayerId | null, may: Set<"standard"|"action"|"reaction"|"add"|"discretionary"> }
mayAct(state, playerId, timingClass) : boolean       // the ONLY legality gate for timing; every move condition calls it
```
`addToChain` sets `activePlayer = controller of newest item` after finalization (337.4); `passPriority` rotates;
chain-empty handler consults `chain.openedBy: "card"|"trigger"|"add"` for 346.1. `performCleanup` (Neutral Open, no
chain) gains step "9": if staged showdowns exist → if exactly one or all combat → begin it (`startShowdown` with
`focusPlayer = contestedBy`), else raise G2 `pick{chooser: turnPlayer, semantics:"battlefield"}`; step 6 control-loss
guarded by `kind` ∈ open. Harness `getActingSeat` becomes `actingWindow(state).player`.
**Tests that flip.** `core-rules/showdown-focus-and-triggers-on-chain` (8), `hidden-and-facedown-zones` timing (3),
staged-showdown items (5), Glasc 8756cad8692a37b8, ogn-233.
**Risk.** Medium — many tests rely on today's permissive acceptance of off-priority Reactions; expect a batch of
test-side `settle()`/`pass()` adjustments.

### G7 — Trigger finalization dialog (M, order 7)

**Rules.** 383.3.a/402.1 (leading "you may" decided at finalization; decline ⇒ never triggered, no chain item, no
once-per-turn consumption 383.3.e.2), 402.2/355.5.b (targets, modes, destinations chosen at finalization, per item —
808.1.d.2 Karthus copies independently), 403–404 (base costs "[pay] to …" paid at finalization or the item is
removed), 337.1/337.4 (pending items finalize oldest-first, then newest controller gets Priority).

**Engine today.** `trigger-runner.fireTriggers` → `addToChain({optional, optInCost, triggerEvent})` with no
choices; `resolve.ts executeResolvedItem` raises `opt-in` and `choose-target` **at resolution**; `pay-x` likewise.
In-tree WIP `abilities/trigger-target-lock.ts lockTriggerTargets` binds a single caster-chosen target at
finalization only when >1 option, still without a prompt able to *pause* `fireTriggers` (e315c542aa1a note:
"fireTriggers/addToChain cannot pause for a pendingChoice"). Harness reports `timing: RES` for these (design §12).

**Design.** Chain items get `status: "pending"|"finalized"`. `fireTriggers` only appends `pending` items (ordered
per 383.3.d — same-controller order via G2 `order` prompt when >1, else scan order). A new cleanup step
`finalizePendingItems(draft)` runs whenever no prompt is open: take the oldest `pending` item → if leading-optional
raise `yes-no` (decline ⇒ remove item, un-consume restriction) → for each caster-chosen slot
(`collectChoiceSlots(effect)`, reusing `play/targeting.ts collectSequenceTargetSlots`) raise `pick`/`distribute`
targets-count → if base cost, `beginPayment` (G4) → mark `finalized`, fire `choose` events (Deflect tax here),
set priority (G6). Resolution then never prompts for these slots (only for 355.14.e distributions, D22 later
"you may", D28 hidden-info picks). Needs G2's `resume` so `fireTriggers` callers don't have to be re-entrant.
**Migration.** Remove `ChainItem.optional/optInCost` handling and the `choose-target` producer from `resolve.ts`
for triggered items; `trigger-target-lock.ts` folds in. Harness `Decision.timing` becomes truthful (`FIN`).
**Tests that flip.** `showdown-focus-and-triggers-on-chain` branch A/B (69aa7fee34e2, f689143f7648, 2b7c0bd55fb0,
28ffa7a8791f), Baited Hook 24995e96, Call to Battle 48502d76, Karthus/Rex per-item targets (d11f5b5ec390,
e315c542aa1a, c4a2af4e0357, e642cc17328b), Deflect-on-trigger variants.
**Risk.** Medium-high: every `test.failing`-free card test that today answers a trigger target *after* `settle()`
will now be asked *before* the opponent's priority — script order in ~40 tests may need `answers` moved earlier.
Do it immediately after G2 while the prompt plumbing is fresh.

### G8 — Restriction / permission layer (M, order 8)

**Rules.** 054.1 (forbid beats permit), 449.1–449.2/447.2/456.1 (movement legality; forced illegal move ⇒ Recall,
not a Move), 377.2.b ("use only once per turn"), 355.3 mode memory, 143.4/364.3.a conditional "I enter ready",
420.2.a passives restricting actions, 811.1.d (hidden play needs a legal target here).

**Engine today.** Scattered one-offs: `cost.ts getPlayLocationPermission/staticEnterReadyApplies`, `keyword-effects
canMoveToLocation` (Ganking only), `operations/damage-immunity.ts`, `turnStatics` (might/keyword only),
`effects/add-restriction.ts` writes `meta.restrictions[]` that **nothing reads**. No once-per-turn activation
counter; `once-each-turn` trigger restriction is a TODO in `trigger-matcher.ts`.

**Design.** `E/rules/permissions.ts`: `query(draft, {action:"move"|"play"|"play-spell"|"activate"|"ready"|"deal-combat-damage"|"take-damage"|"score"|"hide", subject: CardId|PlayerId, ctx:{from,to,source}}) → {allowed:boolean, because?: sourceCardId}`
evaluated from (a) printed statics with `effect.type ∈ {"restrict","permit"}` + `evaluateCondition`, (b)
`turnStatics`, (c) `meta.restrictions` (timed), (d) per-turn counters `draft.usage[cardId#ability]`. Forbid wins.
Callers: `standard-move`/`ganking-move`/`effects/move.ts` (→ recall fallback), `play-*` enumerators (locations),
`activate-ability` (once-per-turn), `combat-resolver` (no combat damage), `damage.ts` (immunity), `playUnit`
enter-ready (conditions incl. `{type:"hand-size-at-most"}`, `{type:"namesake-in-trash"}`, `while-level`). Parser:
`static-parser.ts` "X can't Y" / "Use only once per turn" → `restrict`.
**Tests that flip.** sfd-014 Minotaur Reckoner (5), Lullaby, sfd-050 once-per-turn, sfd-049 mode memory, unl-151/
unl-016/sfd-027/Shadow Assassin enter-ready (6), Rockfall Path, Warden/Baron, 3-player 449.2 (2), Kayn immunity
(failed ×2).
**Risk.** Low-medium; mostly additive. Pair with G9 since both touch move/combat legality.

### G9 — Control ≠ owner sweep (S–M, order 9)

**Rules.** 191/702 (friendly/enemy, "you", costs and activations follow *control*), 190.6 (battlefield-card
triggers are controlled by the player acting there / turn player), 359.3.e.14 ("its controller"), 466 (combat sides
by controller), 469 (hold by controller), 124.1 (control changes end on zone change).
**Engine today.** 157 `getCardOwner` vs 52 `getCardController` uses; `resolve-full-combat.ts` (sides),
flow hold check, `trigger-runner MatchedTrigger.cardOwner`, `standard-move.ts` use owner. Recent per-item fixes
patched `target-resolver`, `activate-ability`, `draw.ts target-controller` individually.
**Design.** `controllerOf(cardId)` = `getCardController ?? getCardOwner` exported from one module; codemod all
gameplay reads (keep `getCardOwner` only for "its owner's hand/deck/trash" destinations and 190.6 fallbacks);
`MatchedTrigger.controller` computed per 190.6 for `battlefieldRow` cards (acting player) ; contest attribution in
`effects/move.ts markContestedOnArrival` uses mover's controller.
**Tests.** Possession/Hostile Takeover interactions (5), Sunken Temple opponent card, sfd-005/ogn-213 "its
controller draws", sfd-011 same-controller pair, Charm contest attribution, lone-attacker conquer (with G12).
**Risk.** Low; mechanical with a good test net.

### G10 — Replacement engine v2 (M, order 10)

**Rules.** 366–373 (replacement effects apply to any event; optional "may … instead" with costs paid by the affected
object's controller 371.2; once-per-turn optional not consumed on decline 371.2.b; ordering 372/373 by affected
object's controller / turn order), 465.2.c.5 (prevent/double ordering during assignment), 715 bonus damage.
**Engine today.** `abilities/replacement-effects.ts checkReplacement` = first match by `replaces` string among
`die|take-damage|score|enters-ready|play-token`; call sites hand-placed (primer §9); ordering + optional-pay prompt
exist **only** in `state-based-checks.ts` for SBA deaths (`replacementOrderFor`, `suspendedDeathCardId` — WIP);
`kill.ts`, Temporary, `damage.ts` take the first match silently; no `double`; no `might-decrease`/`reveal`/`look`/
`draw`/`move` events; Guardian-Angel "kill this instead" and Zhonya-flipped-in-response are open.
**Design.** `applyReplacements(draft, event, io) → event' | null` as the single entry (called from `leaveBoard`
(G5), `dealDamage`, `awardPoints` (G1), `drawCards`, `look/reveal`, `moveUnit`, `enterBoard`): gather printed +
`activeReplacements` matches → group by controller → G2 `order` prompt if >1 → for each: if `optional` raise
`yes-no{cost}` to `chooser = controllerOf(affected)` → run replacement effect with `trigger-source` bound → mark
consumed (`duration:"next"`, once-per-turn only on accept). Event modifiers (`prevent n|all`, `double`, `+bonus`)
compose in chosen order before replacement proper.
**Tests.** Smite/Tactical Retreat/GA ordering (3), Lotus Trap, Gangplank might-decrease, Unlicensed Armory delayed
optional (failed 691b1256ae5d), ogs-020 next-time-would-die, Hidden Blade Zhonya-in-response, Nocturne look
replacement (with G11).
**Risk.** Medium; depends on G5 to have one death path.

### G11 — Missing GameEvent emitters / trigger sources (S each, order 11, parallelisable)

**Engine today** (grep of literal `fireTriggers({type:…})` sites at HEAD): **0 emitters** for `win-combat`, `draw`,
`heal`, `channel-rune`, `grant-keyword`, `reveal`; `look` only synthetic (Vision); `take-damage` only as a
replacement probe in `damage.ts`; `ready` 2 sites (not `effects/ready.ts`→Blade Dancer path per 31df1d829116);
effect-driven `move` events don't reach "When I move" for pulled units (Faefolk ×3); no `play` event variant while a
showdown is open (Fresh Beans); `play-spell` lacks `costPaid` (ogs-006 threshold — just landed per log); deck/hand
cards are not trigger/replacement sources (`getBoardCards`), blocking Nocturne. **Design:** add emit sites at
`resolve-full-combat` (winner units → `win-combat`), `zones.drawCards` wrapper → `draw`, `heal.ts`/combat heal →
`heal`, channel phase/`channel.ts` → `channel-rune`, `look.ts`/`reveal.ts` → `look`/`reveal` with the revealed ids
as sources; extend `getBoardCards` with `event.subjectIds` in non-board zones. Each is a per-item-sized fix once
G5 defines the payload convention; list here so one agent does them together and updates `game-events.ts` +
`EVENT_MAP` once.
**Tests.** sfd-020 Draven Gold on win, unl-095, `combat-flow` 466.3.a, Faefolk (3), Fresh Beans, Irelia/Blade
Dancer (2), ven-036 channel limit, Nocturne (4, with G3/G10).

### G12 — Combat assignment decision + outcome rules (M, order 12)

**Rules.** 465.2.c (attacker assigns full Might first, then defender; lethal must be filled per unit before the
next; Tank first, Backline last; free order within tier; stunned contribute 0; units that can't be damaged
skipped), 466.3.a/466.5.d (a side with the only remaining units wins; lone attacker with no defenders ⇒ conquer,
no damage step), 466.3.d.1 (no result ⇒ restage), 466.1.a.1 heal scope, 466.7.a designations cleared.
**Engine today.** `resolveFullCombat` auto-assigns via `combat-resolver.distributeDamage` (Tank/Backline sort);
manual `assignDamage` move exists but is not part of the flow; empty-defender branch recalls attackers
(fdea167b9bd7, 4f7ebaf37ee7); heal limited to combatants.
**Design.** After all passes: if both sides non-empty raise G2 `distribute{chooser: attacker, total: ΣMight,
buckets: enemy units, ordered:true}` validated by `isLegalAssignment` (465.2.c.3/4/6/10 + prevent shields
437.5.a), then the defender's; auto-answer when only one legal assignment exists (keeps existing tests green;
harness `autoProcedures` can default to the resolver's suggestion). Fold outcome rules into one
`determineCombatResult` that uses `controllerOf` (G9).
**Tests.** `combat-damage-assignment-status-and-healing` (2), `combat-flow-and-resolution` (5), Glasc no-result (2).

### G13 — Layered characteristics / static recalculation (M–L, order 13)

**Engine today.** `static-abilities.recalculateStaticEffects` strips and re-applies might/keyword statics in two
passes; five separate "effective might" readers (primer §5); `{count:…}` amounts partially supported; equipment
multiplier special-cased; copy = `CopyOnPlay` token only; `swap-might.ts` writes modifiers that don't survive
recalculation ordering (Switcheroo ×3); recalculation is invoked from ~7 places and still missing after scenario
build / rune moves / playSpell finalize. **Design:** `characteristics.ts compute(cardId, draft)` memoised per
cleanup pass with explicit layers `[copy, control, text/set (swap, "becomes N"), ±might (static→turn→counters),
multipliers, keywords grant/lose, restrictions]` and timestamps; every reader calls it; `runStateMaintenance` is the
only invalidation point and is called from the move wrapper (`withPostMoveCleanup` for **all** moves) and
`buildScenarioEngine`. **Tests:** Switcheroo (3), sfd-085/sfd-068 gear scaling, ven-172 points Might, Shady
Spectacles/Reflection copy (5, with G3 attach legality), ogs-005 Shield display.

### G14 — Trigger multiplicity & restriction bookkeeping (S–M, order 14)

Implement `once-each-turn`/`once-per-game`/`first-<phase>` in `trigger-matcher.restrictionSatisfied` with
`draft.triggerUsage[cardId#idx]{turn,game}` (un-consumed on FIN decline, G7); dedupe identical `(cardId, abilityIdx,
eventId)` matches per event (Abandoned Hall); read Karthus-style `trigger-double` from `draft.lki` (G5); same-
controller simultaneous ordering via G2 `order` (383.3.d) — default scan order when the harness auto-answers.
Three failed items here are already green in-tree and only blocked on the `trigger-runner.ts` collision.

### G15 — Pregame / match procedure (M, order 15)

Self-contained in `moves/setup.ts`, `flow` pregame segment, `deck-validation`: strict mulligan validation (ids in
hand, ≤2, once, in turn order after first-player choice), tie re-roll, idempotent opening draw, Duel random
battlefield vs Match choice with simultaneous hidden commit (redaction in `views/`), unused battlefields to a
`setAside` zone, `match` state (game N, used battlefields), first-turn channel bonus keyed to each player's own
first turn, FFA first-player draw skip, deck rules (3 battlefields, unique names, Signature tag). 18 items, one test
file (`setup-decks-and-mulligan.test.ts`) + `turn-structure` (2). No dependency on anything above; good filler
package for a separate lane because it touches none of the hot files.

### G16 — Per-engine card registry (M, opportunistic)

`operations/card-lookup.ts getGlobalCardRegistry()` (~160 call sites) → thread `ctx.registry` (already present on
most move contexts as `context.cards`' sibling) or stash the registry on `draft.__registry` (non-enumerable) and make
`getGlobalCardRegistry()` read an AsyncLocal-style current-engine pointer set by `RuleEngine.execute`. Also replace
`Date.now()` token ids with `draft.nextTokenSeq++`. Unblocks concurrent MCP games and parallel test files; zero
queue items but called out in HARNESS-DESIGN §10.2/§10.14.

---

## Recommended sequence

Scoring = primary-unblock ÷ size, then dependency order; hot-file ownership noted so the queue can be paused per
package.

| Order | Package | Unblocks (primary + secondary) | Size | Why here | Files to lock while in flight |
|---|---|---|---|---|---|
| 1 | **G1 Score/victory pipeline** | ~46 + 4 | M | Highest count ÷ size, zero deps, touches no hot file except flow | `flow/riftbound-flow.ts`, `operations/scoring-rules.ts`, `moves/combat/*score*`, `win-conditions/` |
| 2 | **G2 Choice algebra + continuation** | ~24 + it is a prerequisite of G3/G4/G7/G10/G12 (~100 transitively) | L | Everything else composes on it; doing it later means re-migrating each new flag | `types/game-state.ts`, `moves/pending-choice.ts`, `abilities/effect-executor.ts`, `effects/{sequence,for-each,do-times,optional,conditional,choice}.ts`, `chain/resolve.ts`, `harness/decision.ts` |
| 3 | **G5 leave-play choke point + LKI** | ~22 + prerequisite of G3/G9/G10/G14 (~35) | M | Small, removes a whole bug class (raw `moveCard` to trash), defines event payloads for G11 | `cleanup/state-based-checks.ts`, `events/dispatcher.ts`, `effects/{kill,banish,discard,recycle,return-to-hand}.ts`, `flow` Temporary block, `activate-ability.ts` cost block |
| 4 | **G4 Cost model + pay step** | ~30 + 7 failed + G3 | L | Second-largest cluster; most lane collisions happen in `cost.ts`; needs G2 `integer/pick` | `moves/play/cost.ts`, `play-unit.ts`, `play-spell.ts`, `activate-ability.ts`, `hide.ts`, `static-cost-reduction.ts`, `types/moves.ts` |
| 5 | **G3 Effect-play bundle** | ~38 + 4 failed | L | Largest single cluster but only tractable after 2/3/4 | `effects/play.ts`, `effects/look.ts`, `pending-choice.ts` (reveal-and-pick play), `play-unit.ts` reducer extraction |
| 6 | G6 Priority/Focus oracle + staging | ~18 | M | Independent; schedule alongside 4/5 in a separate lane (different files) | `chain/chain-state.ts`, move `condition`s, `cleanup` step 6/9 |
| 7 | G7 Trigger FIN dialog | ~10 (+ correctness of every trigger test) | M | Needs G2+G6 | `trigger-runner.ts`, `resolve.ts` |
| 8–9 | G8 Restrictions, G9 Control sweep | ~20, ~14 | M, S | Independent of hot files; can run in parallel lanes any time after G5 | movement/, combat/, `permissions.ts` new |
| 10 | G10 Replacement v2 | ~10 | M | after G5/G2 | `replacement-effects.ts`, `damage.ts` |
| 11 | G11 Event emitters | ~14 | S×n | any time after G5; per-item lane friendly | scattered, low conflict |
| 12–14 | G12 Combat assignment, G13 Layers, G14 Trigger bookkeeping | ~10, ~12, ~9 | M, M–L, S | tail | combat/, static-abilities.ts, trigger-matcher.ts |
| 15 | G15 Pregame | 18 | M | zero coupling — ideal for a spare lane **now** | setup.ts, deck-validation |
| — | G16 Registry | 0 | M | when MCP concurrency is needed | card-lookup.ts + codemod |

Expected effect: packages 1–5 address the primary blocker of roughly **160 of ~300** engine-layer open items and
30/37 failed items, and remove the six hot files from per-item contention.

### Work-package prompts (top 5)

**WP1 — Score/victory pipeline (G1).**
Implement `packages/riftbound-engine/src/operations/points.ts` (`awardPoints`, `losePoints`, `markScored`,
`effectiveVictoryScore`, `checkVictory`) per rules 471–472, 054.1, 194.3–194.4, 431.3, 443, 468–469 (read them with
`bun .claude/skills/riftbound-rules/scripts/rule.ts <id>`). Route every `victoryPoints` writer (grep
`victoryPoints +=|victoryPoints =` outside tests: flow hold + burn-out, resolve-full-combat, showdown.ts,
score-point.ts, conquer-battlefield.ts, effects/score.ts, effects/draw.ts, moves/discard.ts, riftbound-operations.ts)
through it; move the single `status="finished"` write into `cleanup/state-based-checks.ts performCleanup`. In flow
`beginning.onBegin`, fire start-of-turn triggers and defer Hold scoring until the chain they create has resolved
(use the existing beginning-phase hold mechanism in `harness/turn-driver.ts`). Add denial static support
(`opponents-cant-gain-points` via `static-abilities.evaluateCondition`) and board-derived
`modify-victory-score`. Remove `scorePoint` from the main-phase enumerator. Flip every `test.failing` in
`core-rules/victory-and-final-point`, `score-denial-and-modification`, `scoring-hold-and-conquer`, Baron Pit and
Tianna rulings; run `bun test packages/riftbound-engine` + parser suite; land with `land.sh`.

**WP2 — Choice algebra + resumable effects (G2).**
In `types/game-state.ts` introduce `PendingChoice = pick|distribute|order|integer|yes-no|name` each with
`chooser` and `resume` (see G2 sketch) and keep the seven legacy interfaces as deprecated aliases mapped onto them.
Make `abilities/effect-executor.ts` resumable: explicit frame stack for `sequence/for-each/do-times/conditional/
optional/choice`, `suspend(choice)` helper, `resumeEffect(resume, answer)` re-walking by path; convert
`effects/optional.ts` to a real `yes-no`, and `sequence.ts`/`for-each.ts` to stop-and-resume on any suspension.
Rewrite `moves/pending-choice.ts` as: validate (`isValidAnswer`), record answer, `resumeEffect`,
`postChoiceCleanup` — one path for all kinds; port every producer in `abilities/effects/*`, `chain/resolve.ts`
(opt-in, choose-target, pay-x → typed `integer`), `state-based-checks.ts`, `play-unit.ts` weaponmaster. Add
`revalidateTargets` in `effects/_helpers.getTargetIds` (359.3.e.5, 757). Update `harness/decision.ts` mapping
(should shrink) and `views/acting-seat.ts`. Acceptance: full engine suite green with no behaviour change except the
newly-passing BUG tests for ogn-153, ogn-230 (zero), ogn-206, sfd-023, Switcheroo ae63…, Alpha Strike 6b3e…,
ogn-237 3-player, unl-164, 416.5.a rune order, 107.3.b.2 overflow, Vex 6daab…, Lacerate 272f….

**WP3 — leaveBoard choke point + LKI (G5).**
Create `operations/leave-board.ts` (`leaveBoard`, `resetObjectState`, `snapshotLKI`) per rules 124.1, 428.1, 457.1,
186.1, 740.2.a. Replace raw trash/banish/deck/hand moves in `effects/kill.ts`, `events/dispatcher.ts
dispatchUnitDied`, `cleanup/state-based-checks.ts` kill path, `flow/riftbound-flow.ts` Temporary block,
`moves/chain/activate-ability.ts` (`cost.kill`, `cost.discard`), `moves/play/play-unit.ts` sacrifice branch,
`effects/{banish,recycle,return-to-hand,discard}.ts`, `moves/discard.ts`. Unify the `die` payload
(`diedAt, controller, owner, killedBy, killSource, wasBuffed, wasStunned, wasAlone, attachments`) and make
`trigger-runner`/`extraTriggerCount`/`here|alone` conditions read `draft.lki`. Collapse damage to one store. Flip
BUG tests in `tokens-banishment-trash-object-identity`, ogn-182, sfd-036, Kog'Maw kk-head, Karthus 8945ed…,
unl-070, sfd-019, turn-structure damage items; assert no regression in Zhonya/Highlander/Phoenix suites.

**WP4 — Cost model + payment step (G4).**
Add `PlayCostModel`/`AdditionalCost`/`CostComponent` to `riftbound-types`; implement
`moves/play/cost-model.ts getPlayCostModel(cardId, ctx)` (folding `getOptionalPlayCost`, Accelerate, Repeat tiers,
Flow, Deflect-per-target, kill-any-number, spend-buff, discard, board-imposed mandatory costs, Ezreal/Marai
discounts, Vex increases, per-discount minimums 356.4.e) and `computeTotalCost(model, args, targets)`. Give
`playUnit/playSpell/activateAbility/revealHidden/playFromChampionZone` a single `costs` param (shim old params in
the harness `PlayArgs` mapping) and one shared `payCosts(draft, payer, total, objects, resume)` that (a) pays object
costs through `leaveBoard`/effects, (b) pays resources from `{free, restricted[]}` energy + domain/any power, (c) when
short but `addableResources(payer)` suffices, suspends with a `pick{semantics:"add-ability"}` loop (357.1.a/444.2.c)
— also used by trigger opt-in costs and `resolve.ts` mid-resolution pays. Extend `costModifier` to carry power pips.
Acceptance: `paying-costs-energy-power`, Ezreal/Hard Bargain, Vex hidden-flip, sfd-019, sfd-020, ogs-014, ven-sp6,
Astral Heron, unl-164, Heedless Resurrection, failed ce21b7940621 all pass; `canAffordCard`/`deductCost` deleted.

**WP5 — Effect-play pipeline (G3).**
Extract `moves/play/play-pipeline.ts beginPlay/enterBoard` from the `playUnit` reducer (entry zone, exhausted/
enter-ready replacements, fresh-object reset via `resetObjectState`, control per 191.1, play triggers with `via`,
Weaponmaster, battlefield-token entry) and make `playUnit`, `revealHidden`, `playFromChampionZone`, Flow, and
`effects/play.ts` all call it. `beginPlay` takes `{player (chooser), from, via, costMode, location constraint,
declinable, then}` and raises G2 prompts for missing bundle parts, paying via WP4. Add `draft.playPermissions` +
a `playFromZone` move so statics/effects can grant "you may play X from trash/banishment (for [alt cost])".
Re-express `reveal-and-pick onPicked:"play"`, `look` picks, Deathknell replays, `each-player` plays on it; delete
`playFromTrash/playFromHandToBase/replaySelfSpell` and `OptInChoice.acceleratePlay`. Acceptance: Bone Skewer (both
rulings), Temporal Breach (3 rulings), Shadowblade Lurker/Endless Riches, Nocturne (with a `look`/`reveal` emitter),
Glasc, Rift Herald, Harrowing, sfd-111, Baited Hook edfd… ordering, failed 20d34b8bc188/acbfa7cfccaa.

---

## Appendix A — regex clustering of open items (primary cluster → count → samples)

Automated pass over `open/*.json` + `claimed/*.json` titles (+`expected`); first matching cluster wins, so counts
differ slightly from the hand-corrected table above. Full listing was generated to the session scratchpad; samples:

| Cluster (regex, first-match) | n | Sample ids · titles |
|---|---|---|
| SCORE victory/score pipeline | 48 | 590a54a47e22 "471.1.b.1 — awards the 8th point for conquering one of two battlefields" · 9ac838f3512a "472 — Victory Score by Hold must end the game" · 3f89def69a0f "Hold under opponents-can't-gain-points static" · 14b57c7e32c4 "battlefield static 'increase points needed to win' not derived from board" · cfaa2aa3ae38 "431.3 repeated Burn Out" · 5dddc67043bd "discretionary scorePoint action" |
| EFFECT-PLAY nested play by effect | 36 | 9a0eb5313fa5 Bone Skewer "P2 PLAYS it to bf1 … for free" · 3e81965d6566 Temporal Breach · e0a11f2e2f38 Endless Riches trash play · f75ef1a0d3bb Glasc "plays 'Revived Help' from trash ignoring cost" · 40fb3c1635d3 "unit played ignoring cost never offered Accelerate" · defaa7bfccba Nocturne on look |
| COST additional/alt cost + payment | 33 | d61ab776d017 "357.1.a spell not offered when pool empty though runes could be tapped" · 0de7c03c9495 "444.2.c cannot tap rune to pay optional [1] while ability resolves" · e936452be203 "'Use only to play spells' energy" · 18d5dabb2965 "discount next card by [2][rainbow][rainbow]" · 952c1c5ada69 "Recycle a unit from trash is part of the cost" · 049292235ee5 Hard Bargain ransom |
| DIE/LEAVE choke point + LKI | 28 | 13619db7ad13 "killed unit's Buff ceases to exist" · 770cf14d2f65 "attached Equipment stays attached to dead unit" · df287d5c9936 "token recycled into deck ceases to exist" · fb33584078c1 "If I died alone" · 6a239b702f2a "Kog'Maw Deathknell throws resolving former battlefield" · 55283c05cd19 ogn-182 "When this is discarded, draw 1" |
| PRIORITY focus/priority/staging | 22 | e4ea2d8e33ed "non-priority player plays a Reaction" · 27553113aa06 "turn player without Focus plays Action" · 971de2f24123 "staged showdown must BEGIN in cleanup" · d84d9bd41f9e "345 contesting player gains Focus" · 28ffa7a8791f "337.4 newest item's controller gets Priority" |
| CONTROL vs owner | 21 | c48cbc5aa3f5 "'its controller' draws 2, not caster" · 32e929b87674 "opponent's Sunken Temple: 'you' is whoever conquers" · 3debdef900ab "Contested attributed to caster not mover's controller" · fdea167b9bd7 "lone attacker establishes control" |
| PREGAME | 17 | 157bb22e27c2 "3-card mulligan must be rejected" · 228faf05022e "equal rolls" · 748c70f766ba "Duel battlefield random" · 1657d6919770 "Bo3 match structure absent" · c29a6935ecf1 "deck provides THREE battlefields" |
| RESTRICT permission layer | 16 | 3b1fe8aa9a69 "movement-restricting passives not enforced" · 958546cc977a "can't play spells this turn" · 54a1202d38bb "Use only once per turn" · 91dd90ea58f1 "enters exhausted unless ≤2 cards in hand" · a25f93878604 Rockfall Path |
| EVENT missing emitters | 12 | 3f5ba4c359df "engine never emits win-combat" · 9158c5188f0c Faefolk move trigger · ef8cb06fbf4c Fresh Beans play during showdown · 31df1d829116 Blade Dancer ready · 13e81f9a9619 channel-1 static |
| REPLACEMENT | 11 | 879b1ec3caa3 "asked to order Retreat's and Smite's replacements" · 4725749f3edb "Guardian Angel dies instead" · 3a4387624dab Lotus Trap double · 436cc2b5651c Gangplank decrease→+3 |
| MOVE semantics | 9 | 640f1d135b33 "destination offers current bf; crashes" · ebfb62bb1be0 multi-origin gank · 700c6b30d6bd attacker designation · 9d40c88e80f4 Faefolk bounced, Foe still moves |
| TRIGGER-MULT | 9 | 401f3525c6c1 Abandoned Hall twice · 0b1585b1d4d3 once-per-game · 47069bf92781 Karthus+Sentry together · 4d4052498985 chain order |
| TARGET multi/zero/tuple | 9 | f4af9beceea2 "TWO friendly units chosen" · 146fd708be47 "first target mandatory" · af15a600ba86 Switcheroo caster picks two · 6033dadb3006 Lacerate any Might |
| STATIC/layers | 8 | 16cf4fad0fff Switcheroo equipment re-add · 7a426254e4f0 "+1 per friendly gear" · c04e82b38550 Shield display |
| TURN structure | 5 | 706b28c681c3 "additional turns LIFO" · 24f011bfe4a5 off-turn pool empties · e3262d91b64b damage store |
| COMBAT-ASSIGN | 4 | a489b24fa7cd "ATTACKER chooses which defender receives lethal first" · 8f03264b3a55 defender distribute |
| TRIGGER-FIN | 4 | 09f6e5152ca9 "unit to kill declared at finalization" · d11f5b5ec390 Karthus two items each own target |
| HIDDEN | 3 | 0539e4c8bcf8 hide from Champion Zone · 78755c0cd4df hide not legal from banishment |
| UI/app | 9 | Back-Alley Bar clipping ×4, DOM exhausted invariant, WebSocket crash, sandbox panel |
| RULE-MISC | 31 | ogn-260 fight damage, sfd-041 recycle non-gear, ogs-024 all-friendly +2, Recruit token tag, Weaponmaster/Hand Hammer, 466.1.a.1 heal scope, Feral Strength stacking … (per-item fixable) |

## Appendix B — failed-item notes by cause

| Cause | ids |
|---|---|
| Lane collision / fixed in another lane's uncommitted tree (no capability gap) | 00b49dac531c, 02b30b239491, 0f8ffb6aa800, 18452bc3f4f9, 235e9e82dc6c, 267c1379880f, 29102ff2a11b, 2911f46e57f9, 35743486ba73, 38c6f5658ada, 4c7bba1368a9, 540af2f1dcbe, 66503f785bee, 7164c8feb294, 7a5fcd88ac31, 97b27b40f31f, 9b2c07b1ec80, b076b4ebd634, e151f0aae31f, f6499d826616, ffd00589afe5, 1095b42862f8, 2a926178a696, 752f258669c7, 865b6188fd37, 83b07fb7a72c, e1a086fb7e46 |
| G2 continuation (effect cannot suspend mid-sequence) | dad03a93c255, 6b8492d3e02d |
| G7 trigger targets at finalization | e315c542aa1a, 55f2fd709413 (partly) |
| G3 effect play bundle / play permissions / alt cost | 20d34b8bc188, 3ffdcdbe69de, acbfa7cfccaa |
| G4 pay step (Add during a pending pay) | ce21b7940621 |
| G10 optional pay-to-replace | 691b1256ae5d |
| Not attempted | bfba4f81d1a7 |
