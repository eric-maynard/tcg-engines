# FIXER PRIMER — where Riftbound mechanisms are wired (read before grepping)

Paths relative to `/root/src/tcg/tcg-engines`. `E/` = `packages/riftbound-engine/src/`, `C/` = `packages/riftbound-cards/src/`,
`T/` = `packages/riftbound-types/src/`. Cite symbols, not line numbers — other lanes edit these files concurrently.

## 1. Pipeline overview
- `C/cards/<set>/<slug>.ts` — one exported const per card: `rulesText, timing, energyCost, might, keywords, tags`, optional
  explicit `abilities: Ability[]`. Sets `ogn ogs sfd unl` are .ts; `ven` is JSON-only (`C/data/sets/ven.json` → `adaptJsonCard`).
- `C/data/enrich-cards.ts enrichCard` — `normalizeSpellTiming` (spell `timing` = printed `[Reaction]` > `[Action]` > `"standard"`,
  reminder parens stripped), then `parseAbilities(rulesText)` ONLY when `card.abilities === undefined`.
  An explicit `abilities` (even `[]`) bypasses the parser entirely.
- `C/data/all-cards.ts` — `getAllCards()` = `enrichCards(backfillPowerCost([...getRawCards(), ...jsonCards]))`;
  `derivePowerCost` (single domain → N×domain; multi-domain → N×`"rainbow"`; `MULTI_DOMAIN_POWER_OVERRIDES`); `getCardRegistry()`.
- `E/operations/card-lookup.ts CardDefinitionRegistry` — keyed by card INSTANCE id (= harness alias). `get, getAbilities,
  getSpellTiming, getMight, getMightBonus, getEnergyCost, getPowerCost, getCardType, getCostToDeduct, getSpellRepeatCost,
  getSpellFlowCost, cantReady, hasKeyword` (flat `keywords[]` OR `abilities[{type:"keyword"}]` — printed only, not granted).
  `getGlobalCardRegistry()` is used everywhere; harness fills it in `E/harness/scenario.ts` via `E/harness/card-pool.ts toLookupPayload`.
- Moves: `E/game-definition/moves/index.ts riftboundMoves`; each move = `{condition, enumerator, reducer}`.
  Play moves `moves/play/{play-unit,play-spell,play-gear,hide}.ts`; chain `moves/chain/*.ts`; prompts `moves/pending-choice.ts`.
- Resolution chain: `moves/chain/resolve.ts executeResolvedItem` → `E/abilities/effect-executor.ts executeEffect`
  → `E/abilities/effects/<type>.ts` → `E/cleanup/post-move-cleanup.ts cleanupAndFireDeaths`
  → `E/events/dispatcher.ts runStateMaintenance` (static recalc + state-based checks + `die` emission)
  → `E/abilities/trigger-runner.ts fireTriggers` → new chain items.
- Print parser output for a rules text:
  `bun -e 'import {parseAbilities} from "./packages/riftbound-cards/src/parser"; console.log(JSON.stringify(parseAbilities("When you play me, deal 2 to an enemy unit here.").abilities,null,1))'`
- Print the enriched card exactly as the engine receives it (timing/powerCost/abilities):
  `bun -e 'import {getAllCards} from "./packages/riftbound-cards/src/data/all-cards"; const c=getAllCards().find(c=>c.id==="ogn-024-298"); console.log(JSON.stringify({timing:c.timing,powerCost:c.powerCost,abilities:c.abilities},null,1))'`
- Inside a harness test after `.build()`: `import { getGlobalCardRegistry } from "../../operations/card-lookup";`
  `console.log(getGlobalCardRegistry().get("alias"))`; raw meta: `game.state("alias").meta`.
Recipe: 1) dump enriched abilities. 2) JSON wrong → explicit `abilities` in the card def (or parser, §11).
3) JSON right → jump to the effect/trigger/static/cost section below. 4) run only the card's test file while iterating.

## 2. Targets / filters
- **A SOLE LEGAL OPTION IS STILL A CHOICE (rule 355.10.d.2)** — never re-introduce an `options.length === 1` (or
  `>= 2`) short-circuit that binds the only candidate instead of asking. Being the only valid choice does NOT make a
  selection programmatic: the object is still targeted ("when you choose me" 355.14.d / 359.2 fires, the [Deflect]
  surcharge 809.1.c.1 is owed at pick time) and a declinable choice stays declinable. Raise the normal
  `pendingChoice` with `soleOption: true` (targets, destinations, modes, cost payers, split recipients). A
  PROGRAMMATIC selection (355.10.d — "each unit", "all units with 2 or less Might") is not a choice and must NOT be
  prompted. Bots/tests do not click: `E/harness/engine-backend.ts confirmSoleOptions` answers a `soleOption` prompt
  immediately (and `passivePolicy` does the same in `settle()`); `scenario().interactive()` surfaces it instead.
  Spec: `E/__tests__/core-rules/sole-option-choices.test.ts`; design note: DESIGN.md "A sole legal option is still a choice".
- `T/targeting/riftbound-target-dsl.ts` — `Target {type, controller, location, filter, quantity, excludeSelf, totalMight}`;
  `Location` = `base|battlefield|here|same|trash|hand|deck|anywhere|…`; `SimpleFilter` = `mighty buffed damaged stunned ready
  exhausted token equipped attacking defending in-combat alone facedown`; object filters `{tag} {excludeTag} {might:{lt,lte,gt,gte,eq}}
  {keyword} {name} {domain} {inCombatWith}`; `Quantity` = n | `"all"` | `{upTo, atLeast}`.
- `C/parser/parsers/target-parser.ts parseTarget` — "[a|an|the] [another] [friendly|enemy] [Tag] unit(s) [here|at a battlefield]";
  bare plural ⇒ `quantity:"all"`; "another" ⇒ `excludeSelf:true`.
- `C/parser/impl/targets.ts parseCardTarget` — damage/kill phrasing: enemy/friendly, all/each, "up to N", at a battlefield /
  in base / here, damaged / stunned / [Mighty] / "in combat" / domain adjective. `parseLocationString`.
- `E/abilities/target-resolver.ts resolveTarget(target, ctx)` — pipeline: type (`unit|gear|permanent|battlefield|types[]`)
  → controller (CURRENT controller via `getCardController ?? getCardOwner`) → location (`here` = `ctx.sourceZone`; `base`;
  `battlefield*` = any bf unless `ctx.battlefieldZone`; `same` via `ctx.sameZone`; `move-to-or-from`) → `matchesFilter`
  → `excludeSelf` → Untargetable drop (`isUntargetable`; only when quantity≠"all" or `ctx.choosing`) → quantity slice.
  GOTCHAS: unknown filter strings/shapes PASS (e.g. `"token"`, `"alone"` are not implemented → match everything);
  default quantity is 1 = FIRST candidate, silently.
- `E/game-definition/moves/play/targeting.ts` — `spellEffectHasLegalTargets` (rule 355.8 gate, understands choice/sequence/
  for-each/counter), `targetDescriptorIsSatisfiable`, `findSequenceLeadTarget`, `collectSequenceTargetSlots`,
  `findAmountReferenceTarget`, `findReplacementChosenTarget`, `isLegalMultiTargetSet`, `enumerateSubsetsUpTo`.
- `E/game-definition/moves/play/play-spell.ts playSpell` — `condition` validates supplied `targets` against
  `resolveTarget({...tgt, quantity:"all"}, {choosing:true})`; `enumerator` emits one variant per legal target — this is what
  `game.p1.option("cast", c).fields` exposes. Only descriptors with `quantity` undefined/1 are caster-chosen at play time;
  `quantity:"all"`, `type:"player"|"battlefield"|"self"` are not. No Focus-holder check exists yet (rule 347 bugs land here).
- OPTIONAL / COSTED parts of a TRIGGERED ability — ONE model, ONE classifier `E/abilities/optional-kind.ts
  optionalKind(ability)` (stamped on the chain item as `item.mayKind`; core spec `core-rules/optional-instructions-
  timing.test.ts`; adjudicated against CR 2026-07-24 + train rulings — do NOT re-litigate per ruling):
  | kind | parsed shape / text | decided | act / paid |
  | `cost-at-finalization` | `condition:{type:"pay-cost",cost}` (± `optional`) = "you may **[pay N|kill me|exhaust me|
    banish me|discard N|[Burn N]|spend a buff|kill X|recycle X|return X] TO Y**"; or a lead `costStep:true` step ("Recycle me
    to Y", "spend 3 XP to Y", "disempower X to Y") | FIN opt-in (383.3.a/402.1; timing FIN, prompt "Pay … to use") — decline
    ⇒ item removed, never a chain item | FIN: it is the BASE COST (383.3.b, 204.3.a — the CR names Overzealous Fan —,
    740.4.a.2, 404.1); cost objects named by a forced FIN `pick-many`; unpayable ⇒ removed unasked (404.2); a counter refunds
    nothing (425.1.c); a resource that appears only after finalization (Sett's conquer buff for the Monastery) can't pay |
  | `may-at-finalization` | `optional:true`, no pay-cost, no lead costStep = "you may Y", "you may X. **If you do,** Y"
    (Reaver's Row, Tideturner, Azir; Draven V./Diana Lunari "you may pay [C]. If you do", Emperor's Dais "you may pay [1] and
    return a unit here …. If you do", Adaptatron) | FIN opt-in (free — prompt "Use …?"; declined ⇒ removed 383.3.a.2) | RES:
    X and Y are instructions; a "pay [C]. If you do" is a Pay GAME ACTION, not a cost (205) — asked, still declinable, as
    the item resolves (444.2, `effects/conditional.ts` payChoice, timing RES); objects X/Y name are TARGETS chosen at FIN
    (402.2); Y mandatory once opted in (383.3.a.1 — no "move it?" at RES); "if you do" linked (359.3.e.14 /
    `did-perform`): X not performed ⇒ Y skipped |
  | `may-at-resolution` | trigger NOT led by "you may": an inner `conditional{pay-cost}` / `optional` node / `pickCost`
    (Insightful Investigator "… You may pay 2 XP to …", Ornn "You may reveal …", "Then you may pay") | RES (383.3.a.3) | RES
    (204.3.b, 740.4.a.2.a) |
  Rulings that put a LEADING may/cost at resolution (Fan survives NSF, SMDR chain-discards, Monastery/Wildclaw spend Sett's/
  Cithria's fresh buff, Row "decline the move at resolution", Draven "nothing asked at trigger time") are the pre-Unleashed
  minority (~28 train ids, see do_not_commit-free list in `core-rules/optional-instructions-timing.test.ts` header):
  rewrite the facet to the model with `// RULING-CONFLICT: riftjudge <id> says X; CR 383.3.a/b / 204.3.a says Y — engine
  follows CR`. Parser (`C/parser/impl/triggers.ts`): "you may pay/exhaust me/kill me/spend a buff … TO" ⇒ `pay-cost`
  condition; "you may pay [C]. If you do, Y" ⇒ `optional:true` + effect `conditional{condition:pay-cost, then:Y}`.
- TRIGGERED items are FINALIZED when queued (rules 337.1/383.3.a-b/402-404): `E/abilities/trigger-finalization.ts
  finalizePendingItems` (run at the end of every move by `withTriggerFinalization`, moves/index.ts) asks, oldest
  pending item first and BEFORE anyone gets priority: leading "you may" (`opt-in`; for `cost-at-finalization` items the
  base cost rides on the same prompt and is paid on accept; decline ⇒ item removed), then the single caster-chosen target(s) (`executeResolvedItem(…, {finalizeOnly:true})` reuses the same
  planning; ≥2 options ⇒ `choose-target` with `bindToChainItemId`, 1 ⇒ auto-bound onto `item.targets`, 0 ⇒ removed
  per 402.4), then modes (`raisePlayTimeModeChoice`). Resolution uses `item.targets` and re-checks them against the
  descriptor (illegal ⇒ that instruction fizzles, no re-target). MOVE DESTINATIONS too (rule 355.4,
  `play/play-time-destinations.ts`, hooked at the top of `finalizePendingItems` for EVERY finalized item — spells,
  activations, triggers): a single caster-chosen / fixed mover already on the board with `to:"choose"|"any-battlefield"|
  {battlefield:…}` gets a `choose-destination` prompt bound to the item (`bindToChainItemId`, ≥2 options; 1 ⇒ auto,
  0 ⇒ null) right after its target; the answer is `_dest` on the move node; `effects/move.ts moveToBoundDestination`
  re-checks it via the shared `abilities/move-destinations.ts moveDestinationOptions` (illegal ⇒ no move) and runs a
  `then` at the landing zone. OBJECT COSTS of a trigger's base cost too (rule 383.3.b/402.2/404.1, "kill a unit
  you control here TO …", "recycle another friendly unit TO …", "pay [1] and return a unit here …", "kill 3 other
  friendly units and/or gear TO …"): right after `yes()` the controller names the cost object(s) — a forced
  `pick-many` (min=max=needed, `resume:{kind:"trigger-cost"}`, timing FIN; a lone candidate for a single object
  is auto-bound) — and they are killed/recycled/bounced AT ONCE (`trigger-finalization.ts settleObjectCost /
  payTriggerObjectCost`; Deathknells they set off are newer pending items finalized in the same sweep, above);
  the paid objects ride on the item as `paidObjects[{id,lki}]` (359.3.e.13 look-back, e.g. Rumble's discount reads
  `ctx.paidObjects[0].lki.might`). MULTI-TARGET SETS too (rules 355.12–355.14 / 402.2, `E/abilities/target-slots.ts`,
  dialog Step 2b `trigger-finalization.ts finalizeTargetSlots`; activated abilities with such a set are added
  `status:"pending"` and take the same step): every effect node of an ABILITY item (root / sequence step /
  conditional branch / optional body) that is a SPLIT (`damage split:true`, no Might reference) or an "up to N" /
  "any number" pick of board units/gear (NOT runes, NOT private zones, NOT spend-buff/play/look, NOT `delayed`
  items) is a SLOT: ONE `pick-many` (min 0, max = N / candidates / split damage available incl. Bonus Damage —
  355.14.c; per-option `deflect` surcharge shown, individually unaffordable candidates dropped, the SET's total
  Deflect validated + charged on the answer via resume `target-slot`, "choose" events fired; 0 candidates ⇒ bound
  `[]` silently, item stays — 355.13). Bound ids land in `item.targetSlots[{slot(path), ids, min, max,
  semantics:"split"|"upTo"}]`, are APPENDED to flat `item.targets` (Repulse counting / 359.3.e.2 reborn tracking)
  and stamped on the effect node as `_bound` (deep-copied effect). Resolution: `resolve.ts` strips slot ids off the
  positional `boundTargets` (`stripSlotIds`) and drops reborn objects from `_bound` (`mapBoundNodes`); handlers read
  the node: `_helpers.getTargetIds` returns `legalBoundIds` (= `_bound` ∩ descriptor-with-choosing NOW; illegal
  dropped, never re-aimed, 359.3.e.5/355.15); `effects/damage.ts resolveBoundSplit` = legal recipients, pool
  recomputed now (+bonus once, 715.3), 0 legal ⇒ nothing (359.3.e.7), 1 ⇒ all of it, ≥2 ⇒ `choose-target
  {assign,total,minPer,maxPer,exactTargets,targetsPreChosen}` = harness `distribute` (buckets min 1 / max
  total−(n−1); more recipients than damage ⇒ 0..1 each, exactly `total` nonzero — 355.14.h). The old resolve.ts
  planning never prompts/auto-binds a multi-pick node of an ability (`isMultiPickNode` guard). Still at RESOLUTION:
  rune picks ("ready up to 2 runes"), spend-buff sets, `delayed` items' picks (legacy accumulate prompt),
  reveal-and-pick/look, destinations of cards an effect PLAYS / multi-mover destinations / movers chosen at
  resolution, later "you may" / "then you may pay" (383.3.a.3).
  Harness: the FIN set pick is `kind:"pick", semantics:"target", targeting:"split-targets"|"up-to", min 0, max,
  options[].deflect`; answer ONCE with `pick(a,b)` / `decline()` (= none) right after the triggering verb — a
  trailing `decline()` after a completed set pick is tolerated as a no-op; `settle()` (passive) hands the set pick
  back UNANSWERED (it does not auto-decline it); the split's `distribute` comes at RES with bucket min/max.
  Harness: these prompts have `timing:"FIN"`; answer them right after the triggering verb (or `{answers:[…]}` — e.g.
  `cast("charm",{targets:"foe",answers:["bf2"]})`), THEN settle.
- NEW CHOICES for a finalized item (rules 751–755 — Mystic Reversal ogn-080 / Rebuttal ven-152 "gain control of
  a spell … you may make new choices for it"; parser also emits a standalone `{type:"new-choices", target}` for
  "[you may] choose new targets for it / that spell", handler `effects/new-choices.ts`): ONE module,
  `E/abilities/new-choices.ts offerNewChoices(draft, itemId, chooser, ctx, {optional, grantedBy})`, called by
  `effects/gain-control-of-spell.ts` right after it flips `item.controller` (+ `originalController`, + 340.4
  `reseatPriorityAfterResolution` so the NEW controller of the newest item holds priority even when nothing is
  offered). It reads the item's CHOICE SLOTS off what finalization recorded and raises ONE `pendingChoice
  {type:"new-choices", itemId, slots[{key,kind,label,parent?,current,status}], cursor, options[{key,cardId|zone|mode,
  current?,deflectIgnored?}], min,max, keepable, slotSemantics?, reChoose:true}` that walks the slots in order:
  `mode:i` (355.3, `_chosenIndex`; per [Repeat] execution) → its own `mode-target:i` (parent mode; on
  `item.targets` for a lone menu of a played spell/activation, else `_chosenTargets`) → SPELL positional targets
  mirroring play-spell's `item.targets` layout (`source`+`split` set for a Might-reference split — cap = NEW
  source's Might+bonus, 355.14.c; `source`+`target:1` for [reference, victim]/[reference, damaged]; pair shapes
  fight/swap/same-battlefield validated as a PAIR; `target:i` per distinct sequence slot — Star-Crossed; `set`
  for "up to N"/"any"/exact-N incl. ZERO for "up to"; plain `target:0` incl. counter/chain targets) or ABILITY
  positional `target:i` + `set:<path>` per `targetSlots` entry (rebinds entry + `_bound` + flat targets) →
  `dest:i` per bound `_dest` (parent = the slot holding its mover; options `moveDestinationOptions`+
  `keepLegalArrivals` for the CURRENT mover). Candidates always from the CHOOSER's seat with `choosing:true`
  (753.1 friendly/enemy re-read; item itself excluded 355.9.c; from-Hidden `hiddenZone` lock kept 811.1.d.2);
  per-player / "must" / chooseAtResolution / criteria (`quantity:"all"`) instructions are NOT slots (355.10 —
  Cull the Weak offers nothing). A slot is OFFERED only if some legal value ≠ current exists (sets: any candidate;
  753.2 ⇒ no prompt at all when no slot qualifies). Answers (`resolvePendingChoice`): `pickedKeys` (card id /
  zone / mode; naming the current value = keep-but-still-ask-dependants, status `renamed`; a new value = `changed`:
  written onto the item at once, rule 754 `choose` event fired for objects not in `originalTargets`, rule 755 NO
  cost charged — `deflectIgnored` is informational), `keep:true`/`accept:false` (status `kept`; its dependants
  `skipped` — declining a mode keeps mode+target, declining a mover keeps its destination), `keepAll:true`. A
  dependant whose CHANGED parent left it empty is mandatory (`keepable:false`, sole candidate auto-bound 402.2-style;
  a split set whose old members no longer fit ⇒ min 1). Item never re-pended; dialog end ⇒ `postChoiceCleanup`
  (340.4 reseat). Resolution reads the rebound slots like any finalized item; a Might-reference spell split now
  divides at RES with ONE fixed-total `distribute` (`effects/damage.ts`, `boundPrefix:[ref]` re-entry) like
  `resolveBoundSplit`. Harness: each slot is a `kind:"pick"` Decision (`semantics` mode|destination|target,
  `targeting` for sets, `allowDecline` = keepable, `timing:"RES"`, `source.pendingChoiceType:"new-choices"`) with
  `newChoices {itemId, grantedBy, slot, slots[]}` and options `current`/`deflectIgnored`; answer with
  `pick(x)` / `chooseMode(i)` / `pick("bf2")` / `decline()` (= keep), or `seat.rechoose({target:"y",
  destination:"bf2", source:…, split:[…], "mode:1":0})` (walks every slot: named ⇒ pick, parent of a named
  dependant ⇒ re-name current, else keep) / `seat.keepChoices()`; passive `settle()` keeps. UI: `modals.js`
  (single slots = card tiles/buttons incl. "Keep current choice"; sets = tick-and-confirm + Keep). Core spec:
  `E/__tests__/core-rules/new-choices.test.ts`.
Recipe — add a filter (non-token, in-base, at-a-battlefield, other, stunned…):
1) `T/targeting/riftbound-target-dsl.ts` — add to `SimpleFilter` if new.
2) `E/abilities/target-resolver.ts matchesFilter` — add the `case` (token: `cardId.startsWith("token-")`, as in
   `static-abilities.ts resolveStaticTargetsFromDescriptor`).
3) Emit it: explicit card `abilities` target `{type:"unit", controller:"enemy", location:"battlefield", filter:"stunned",
   excludeSelf:true}`, or a `parseTarget`/`parseCardTarget` pattern.
4) If statics must honour it, mirror in `static-abilities.ts resolveStaticTargetsFromDescriptor`.
5) Unit idioms: `E/__tests__/target-resolver.test.ts`.

## 3. Effects
- `E/abilities/effect-executor.ts` — `ExecutableEffect`; `EffectContext {playerId, sourceCardId, sourceZone, draft,
  boundTargets, variables, triggerSourceId, sameZone, zones, cards, counters, createCardInZone, fireTriggers}`;
  `executeEffect` = `EFFECT_HANDLERS[effect.type]` — an unknown type is a SILENT no-op.
- `E/abilities/effects/index.ts EFFECT_HANDLERS` — `"damage"→handle_damage` etc., one file per type in `effects/<type>.ts`
  (damage kill buff modify-might grant-keyword draw discard move recall return-to-hand banish create-token sequence conditional
  optional choice for-each do-times play look reveal counter replacement add-resource channel ready exhaust stun heal
  take-control cost-reduction cost-increase additional-cost gain-xp spend-xp spend-buff predict name-card …).
- `E/abilities/effects/_helpers.ts` — `getTargetIds` (returns `ctx.boundTargets` when set, else `resolveTarget`);
  `resolveAmount` (number | `"all"` | `{might:"self"|Target}` | `{count:Target}` | `{cardsInHand}` | `{cardsInTrash}` |
  `{variable:"x"}` | `{cost:…}` | `{distinctTags}` | `{revealTop}`); `evaluateEffectCondition` (`legion, paid-additional-cost,
  count, target-controller, target-attacking, this-kills-target, while-empowered, has-xp, score-within`; unknown ⇒ TRUE);
  `getEffectiveMight`, `checkBecomesMighty`.
- `effects/sequence.ts handle_sequence` — steps in order; routes play-time `boundTargets` per descriptor slot; a `self` step
  drops boundTargets; `pendingValue:{source:i}` binds later `{type:"pending-value"}` steps; `location:"same"` support;
  `spend-buff`/`spend-xp` steps gate the rest.
- `effects/conditional.ts` — `{condition, then, else}`. `effects/optional.ts` — AUTO-APPLIES the inner `effect` (no prompt).
  Real "you may" prompts exist only for triggered abilities (`optional:true` → `opt-in`) and inside specific handlers.
- `effects/choice.ts` — resolution-time `choose-mode` only for menus someone ELSE picks (`player:"opponent"|"target-controller"`,
  rule 355.10.e) or nested/for-each choices. A SPELL's own "Choose one —" (rule 355.3) is chosen AT PLAY: `playSpell {mode, targets}`
  (enumerator: `play-spell.ts expandSpellModes` → one variant per legal mode × that mode's targets; 355.8 falls out of
  `spellEffectHasLegalTargets` on the mode's effect), `{modes, targets}` for [Repeat]; unnamed ⇒ `play-time-modes.ts
  raisePlayTimeModeChoice` asks mode → target bound to the chain item (`_chosenIndex` on the choice node, target on `item.targets`)
  before priority; `chain/resolve.ts` unwraps the pre-chosen mode so 359.3.e.5 re-checks apply. Labels: parser keeps each bullet as
  `options[i].label`; `modeOptionLabel/spellModeLabels/summarizeEffect` (exported) render them; harness `fields[mode].labels`.
  Two-role spells (`target1`/`target2`: swap-might, swap-locations, increase-might-to): `targeting.ts pairEffectRoles /
  enumerateTargetPairs`; both chosen at play, bare play illegal, 355.8 needs a legal PAIR.
- PendingChoice kinds (`E/types/game-state.ts PendingChoice`): `reveal-and-pick` (discard.ts, look.ts, reveal-hand.ts,
  recycle.ts, predict.ts; carries `then`), `choose-target` (resolve.ts, damage.ts split), `choose-destination` (move.ts,
  create-token.ts), `choose-mode` (choice.ts), `opt-in` (resolve.ts), `name-card`, `weaponmaster-equip` (play-unit.ts),
  and two GENERIC kinds any producer may raise: `order {playerId, items:[{key,label?,cardId?}], defaultable?, resume}`
  (answer `orderedKeys` = permutation; empty/absent allowed when `defaultable`) and `pick-many {playerId, options, min, max,
  semantics:"target"|"drop"|"replacement-assign"|"subset", constraint?:{totalMightAtMost}, resume}` (answer `pickedKeys`,
  distinct, min≤n≤max, constraint re-validated). `resume` is pure data (`PendingResume`: `die-order`, `die-assign`,
  `trigger-batch`, `subset-repick`, `none`) dispatched by `pending-choice.ts resumePending` — add a `kind` there for a new
  producer instead of a closure. Validators `isValidOrderAnswer` / `isValidPickManyAnswer`; enumerator emits every
  permutation/subset for ≤4 entries, else a sample (the condition accepts any legal list; the harness sends it directly).
  All answered by move `resolvePendingChoice` in `E/game-definition/moves/pending-choice.ts` (`isValidPendingPick`,
  `pickDefaultForChoice`, one reducer branch per `choice.type`, then `postChoiceCleanup`; `choice.then` executed at the tail).
  While `draft.pendingChoice` is set every other move's `condition` returns false.
- 355.11.b group re-pick (Fox-Fire "total Might N or less"): `effects/kill.ts raiseGroupSubsetRepick` — bound group over the
  cap at resolution ⇒ `pick-many{semantics:"subset", min 0}` over the ORIGINAL targets only, resume `subset-repick`
  re-executes the effect with the chosen subset (`_subsetChecked`). Copy that shape for other aggregate-constrained effects.
- DAMAGE — ONE choke point, `E/operations/deal-damage.ts` (rules 417 / 432 / 437 / 465.2.c–d / 715 / 372): `dealDamage(io,
  {target, amount, source:{kind:"spell"|"ability"|"unit"|"combat"|"effect"|"cost", cardId?, player?}, combat?:{role,battlefieldId},
  noBonus?})` / `dealDamageBatch(io, requests, {onNeedsOrder?})` (simultaneous: all previews before any write) / pure
  `previewDamage(io, req)` / `damageReplacementProfile(io, target, source)`. EVERY writer routes through it: `effects/damage.ts`
  (`dealHits`: plain, split, splash; kind spell|ability by source card type), `effects/fight.ts` ("deal damage equal to their
  Mights to each other" — kind `unit`, source = the unit, 417.6.b.3), `moves/combat/resolve-full-combat.ts` (kind `combat`, one
  batch), `combat/assign-damage.ts`, sandbox `moves/counters.ts addDamage`. Inside, in order: amount ≤ 0 ⇒ nothing (417.1.e);
  `damage-immunity.ts unitIgnoresDamage` ("I don't take damage", 465.2.c.10) ⇒ 0; source-side Bonus Damage
  (`bonus-damage.ts getBonusDamage/getLocationBonusDamage`, spells/abilities only, 715.4.a: added BEFORE any prevention);
  a board `take-damage` replacement `{type:"redirect-damage", to}` ("…is dealt to Z instead") retargets once (370.2); then the
  target-side chain — global "prevent all spell/ability damage" (`activeReplacements` `{replaces:"take-damage", replacement:"prevent",
  global, amount:"all"}`), board `replacement:"prevent"` matches (Esteemed Hierophant, `sourceController`-scoped),
  `meta.preventNextDamageInstance` (Counter Strike), `meta.damagePreventionShield: N|"all"` (Ki Barrier; written by
  `effects/prevent-damage.ts` with `damagePreventionSource`), each `grantedKeywords DoubleIncomingDamage` (Lotus Trap) — folded by
  pure `operations/damage-modifiers.ts applyDamageOps` (floor 0). rule 372: when the ORDER changes the result (Double + finite
  Prevent, `damageOpsOrderMatters`) the damaged unit's CONTROLLER orders it: `effects/damage.ts parkDamageOrderPrompt` raises
  `order {resume:{kind:"damage-order", targetCardId, effect, playerId, sourceCardId, boundTargets}, suspendsSequence}` (harness: RPL
  `pick`, keys `double` / `prevent-shield` / `prevent-next` / `prevent-all:<src>` / `board:<src>#i`); `pending-choice.ts
  resumePending` stores `draft.damageReplacementOrder[target]` (`recordDamageReplacementOrder`) and re-executes the effect;
  combat asks the same question BEFORE assignment (resume without `effect`; `resolveFullCombat` re-runs). Otherwise the
  default order is prevent-all → prevent-next → prevent-N → double. Then: shields spent (437.3), `addDamage` (damage-store) with
  `lastDamagedBy/lastDamageSource` + `meta.lastDamage` LKI, `draft.damageLog` (capped), rule 391 "when it takes damage" effects
  run AFTER the mark (bound `activeReplacements` Noxian Guillotine / turn-wide Imperial Decree / printed board effects), and ONE
  `take-damage` GameEvent `{cardId, amount, original, sourceId, sourcePlayer, kind, combat, modifiedBy}` per unit actually
  dealt damage (437.4: fully prevented ⇒ no event, no `dealtDamageThisTurn`). Returns `{dealt, amount, original, modifiedBy,
  total, target}` — callers total the MODIFIED number. Deaths still happen in `state-based-checks.ts performCleanup` (damage ≥
  Might) / `effects/kill.ts`; Deflect/Shield/Tank are NOT damage modifiers. Tests: `core-rules/damage-choke-point.test.ts`.
  Recipe — new damage modifier: add a Candidate in `deal-damage.ts gather()` (op `double`|`prevent`, key, rank, `consume`),
  nothing else; new damage SOURCE: call `dealDamage`, never `addDamage`.
Recipe — new effect type: 1) (optional) type in `T/abilities/effect-types.ts`; 2) `E/abilities/effects/<type>.ts`
`export function handle_x(effect, ctx, h)`; 3) register in `effects/index.ts EFFECT_HANDLERS`; 4) caster-chosen `effect.target`
is lifted automatically by play-spell/resolve; 5) parser or explicit abilities emits `{type:"x", …}`.
Recipe — effect needs a player choice: in the handler `if (!ctx.draft.pendingChoice) { ctx.draft.pendingChoice =
{type:"choose-target", playerId, sourceCardId, effect, options, remaining:1}; return; }`; the `choose-target` branch of
`pending-choice.ts` re-runs `executeEffect(choice.effect, {...ctx, boundTargets:[picked]})` — make the handler idempotent on re-entry.
Recipe — "then / if you do": parser gives `{type:"sequence", effects:[A,B]}` (`impl/effects-sequence.ts`) or
`{type:"conditional", condition, then}` (`impl/effects-conditional.ts parseIfYouDoEffect`); discard/look keep `then` on the
effect and thread it through `reveal-and-pick.then`. If B needs A's object use `pendingValue` + `{type:"pending-value"}`.

## 4. Triggers
- `E/abilities/game-events.ts GameEvent` — the event union. Declared but NEVER emitted today: `draw`, `heal`, `channel-rune`,
  `win-combat`, `take-damage` (used only for replacement matching). Cards triggering on these need a new emit site.
- Emit sites (`fireTriggers({type:…}, {cards, counters, draft, zones})`):
  - play-self / play-card: `moves/play/play-unit.ts` reducer, `play-gear.ts`; spells fire `play-spell`+`play-card` on
    RESOLUTION in `moves/chain/resolve.ts executeResolvedItem`; `hide.ts` (hide, play from hidden); `effects/create-token.ts` (play-token-unit).
  - move / attack / defend / showdown-begin: `moves/movement/standard-move.ts`, `ganking-move.ts`, `effects/move.ts moveCardWithEvent`.
  - die: `effects/kill.ts`; all damage/combat deaths via `events/dispatcher.ts dispatchUnitDied` (from `runStateMaintenance`).
  - conquer / hold / score: built by `E/operations/points.ts scoreEvents` and fired (only when `scoreBattlefield(...).isScore`,
    rule 471.2.c) from `moves/combat/resolve-full-combat.ts`, `conquer-battlefield.ts`, `chain/showdown.ts passShowdownFocus`
    (non-combat close), `combat/score-point.ts`; hold + start-of-turn + ready(awaken) + main-phase + end-of-turn in
    `E/game-definition/flow/riftbound-flow.ts` (`awaken/beginning/main/ending.onBegin`, ctx from `flow/flow-context.ts buildFlowTriggerContext`
    — no-op counters! `buildFlowEffectContext` = meta-backed counters + `fireTriggers`); become-mighty at 3d expiry: `flow/expiration-step.ts`.
  - discard: `effects/discard.ts`, `moves/discard.ts`, `moves/chain/activate-ability.ts` (discard cost). ready: `effects/ready.ts`, `moves/turn.ts`.
  - buff/stun/empower/gain-xp/become-mighty/recycle: `effects/{buff,stun,empower,gain-xp}.ts`, `_helpers.checkBecomesMighty/resolveAmount`.
  - choose: `play-spell.ts` (at finalize), `activate-ability.ts`, `resolve.ts`, `pending-choice.ts`. attach-equipment: `moves/equipment.ts`, `pending-choice.ts`.
- `E/abilities/trigger-matcher.ts` — `EVENT_MAP` + aliasing in `triggerMatchesEvent` (`beginning-phase`→`start-of-turn`,
  `recycle-cards-to-deck`→`recycle`, compound `"a-or-b"` split, typed `play-<cardType>`). `on` branches: `"self"` (event.cardId
  === card; battlefieldRow cards match `battlefieldId`; player events match owner), `"friendly-units"|"friendly-other-units"|
  "another-friendly-units"`, `"any"|"any-unit"|"any-player"`, `"enemy-units"`, `"controller"|"controller-or-allies"`,
  `"opponent"`, object `{controller, actor, location:"here", excludeSelf, filter:["self"|"spell"|"stunned"|"killed-by-spell"]}`.
  Unknown `on` strings (parser emits `controller-here`, `another-friendly-non-recruit`, …) and unknown/TODO
  `restrictions[].type` (`first-time-each-turn`, `once-each-turn`, `during-showdown`, `non-token`) return FALSE.
- `E/abilities/trigger-runner.ts fireTriggers` — `getBoardCards` (base, legendZone, battlefields, battlefieldRow, plus the
  discarded/dying card itself; championZone excluded) → `findMatchingTriggers` → `evaluateTriggerCondition` (`legion,
  paid-additional-cost, while-empowered, while-at-battlefield, control, alone-in-combat, exists-here, fewer-runes-than-opponent`;
  unknown ⇒ true) → `orderTriggers` (turn player first) → `addToChain({triggered:true, optional, optInCost, triggerEvent})`.
  `add-resource` effects and `ctx.resolveInline` run immediately. `optional:true` / `optInCost` ⇒ `opt-in` prompt at FINALIZATION;
  the item carries `mayKind = optionalKind(ability)` (see §2 model).
  `GRANTED_KEYWORD_TRIGGERS` synthesises Vision for granted keywords. `play-self` also triggers a static recalc here.
- rule 383.3.d SAME-CONTROLLER ORDER: after a batch is finalized, `trigger-finalization.ts offerTriggerOrder` offers the
  ≥2 non-interchangeable triggered items one player controls as a SOFT prompt on `draft.pendingTriggerOrder` (type
  `order`, `defaultable`, resume `trigger-batch`) — NOT `draft.pendingChoice`: every other move stays legal and taking one
  (wrapper in `withTriggerFinalization`) accepts the listed scan order; `resolvePendingChoice{orderedKeys}` (first = bottom,
  last = top/resolves first) permutes those items in place (`reorderChainItems`). Cross-controller stays turn order
  (`orderTriggers`, `leave-board.ts orderBatchTriggersByTurnOrder`). Identical copies (Karthus) / source-independent equal
  effects (two Sentries' "Draw 1") are never offered.
  HARNESS: `game.decision()` shows it as `{kind:"order", defaultable:true, timing:"FIN", actions:[…seat menu]}` for the
  chooser; `seat.order([...keys])` answers it; `passPriority()/cast()/…`, `settle()` (passive policy) and
  `game.acceptTriggerOrder()` keep the listed order. A hand-rolled drive loop that switches on `game.decision().kind` must
  tolerate it: `if (d.kind === "order" && d.defaultable) { await game.acceptTriggerOrder(); continue; }`.
- Parser: `C/parser/impl/trigger-patterns.ts TRIGGER_PATTERNS` (regex → `{event, on, restrictions}`), `impl/triggers.ts
  parseTriggeredAbility` (leading/trailing "if" → `condition` via `parsers/condition-parser.ts`), `impl/keywords.ts
  KEYWORD_TRIGGER_EVENTS` (Deathknell→`die`, Vision→`play-self`) + `expandHuntKeywords`.
- REFLEXIVE triggers (387/388, "<main>. Then [you may] do this[ N times]: <body>"): parser `C/parser/impl/effects-reflexive.ts`
  (hooked in `impl/effects.ts parseEffects` before the single-effect attempt; comma-joined conditioned forms — "If this
  kills it, do this:", "for each … this kills, do this:" — and the Look→play "Empower it" idiom keep their own shapes)
  emits `{type:"reflexive", effect, times?, optional?}` sequenced after <main> (a body pronoun "it"/"of them" →
  `target:{type:"pending-value"}` + `pendingValue.source`). Engine `E/abilities/effects/reflexive.ts handle_reflexive`
  does NOT run the body: it appends `times` Pending triggered chain items (source = the card, controller = resolving
  player, `optional` → opt-in at finalization) which G7 finalization then targets; a `pending-value` target is frozen
  to `{type:"permanent", filter:{idIn:[…]}, quantity}` (`target-resolver.ts matchesFilter idIn`; `resolve.ts` prompts an
  id-linked "up to N" even with one option so zero stays choosable). "When you play a spell" triggers fire on the
  spell's RESOLUTION (419.4.a / 359.3.e.10 — `resolve.ts firePlayedCardTriggers`), never at chain-add.
  Tests: `core-rules/reflexive-triggers.test.ts`, parser `__tests__/effects/reflexive.test.ts`.
Recipe — trigger never fires: 1) dump abilities: need `{type:"triggered", trigger:{event,on}, effect}`; else parser/explicit.
2) Is `event` emitted (list above)? If not: add `fireTriggers` at the site and the shape to `GameEvent`/`EVENT_MAP`.
3) Does `on` hit a handled branch AND does the event carry the owner/actor field that branch reads (`owner`, `playerId`,
   `movedBy`, `killedBy`, `chooserId`)? Else extend `triggerMatchesEvent`. 4) `restrictions`/`condition` type returning false?
5) Triggered items sit on the chain — answer their FIN prompt (yes()/pick()) right after the triggering verb, then `settle()` to resolve.
Recipe — "first/only once each turn": implement in `restrictionSatisfied` with a per-card counter on the draft (pattern:
`draft.turnEvents` written in `fireTriggers`; cleared in flow `turn.onBegin`; "this turn" EFFECTS lapse in `flow/expiration-step.ts` 3d).
Recipe — "when you kill X with a spell": `die` carries `killedBy/killSource/wasStunned` (kill.ts; damage kills snapshot
`meta.lastDamagedBy/lastDamageSource` into `performCleanup().deaths`); match with
`on:{type:"unit", controller:"enemy", actor:"controller", filter:["killed-by-spell"]}`.

## 5. Statics / continuous effects
- `E/abilities/static-abilities.ts recalculateStaticEffects(ctx)` — strip `meta.staticMightBonus` and
  `grantedKeywords[duration:"static"]` from all board cards, then apply `{type:"static"}` abilities in two passes:
  pass 1 `grant-keyword|grant-keywords`, pass 2 `modify-might` (number, `{cardsInTrash}`, `{score}`, `minimum` floor,
  equipment `multiplier`). A `sequence` static is unwrapped. Amount `{count:…}` ("+1 for each …") is NOT computed (stays 0).
- `evaluateCondition` kinds: `while-at-battlefield, while-mighty, while-buffed, while-damaged, while-ready, while-exhausted,
  while-alone, while-equipped, while-empowered, while-in-showdown, control-battlefield, attacking, defending, in-combat,
  alone-in-combat, and, or, not, paid-additional-cost, while-level, xp-gained-this-turn, event-this-turn, this-turn,
  turn-count-at-least`; unknown ⇒ TRUE (applies unconditionally).
- Audience: `ability.affects` (`self|units|all-friendly|all-enemy|battlefield|gear`) via `resolveStaticTargets`; otherwise
  `effect.target` descriptor via `resolveStaticTargetsFromDescriptor` (controller, excludeSelf, location here|battlefield =
  same zone as source, filter `"token"`/`<metaFlag>`/`{tag}`); anything else ⇒ self.
- Only might + keyword statics live there. Other static kinds are read ad hoc: cost `E/operations/static-cost-reduction.ts
  computeStaticCostReduction / computeGrantedSpellRepeatCost` + `moves/play/cost.ts getSelfScaledEnergyReduction`;
  enter-ready `cost.ts staticEnterReadyApplies / hasStaticEffect`; play location `cost.ts getPlayLocationPermission`;
  additional cost `cost.ts getOptionalPlayCost`; "can't be chosen by enemy spells/abilities" = keyword `Untargetable`
  (grant via static `grant-keyword`) read by `target-resolver.ts isUntargetable`.
- When recalculated: `state-based-checks.ts performCleanup` step 3, reached through `runStateMaintenance` from
  `cleanupAndFireDeaths` after chain resolution (`moves/chain/resolve.ts`), prompt answers (`pending-choice.ts postChoiceCleanup`),
  `resolve-full-combat.ts`, every movement move (`moves/movement.ts` is wrapped in `withPostMoveCleanup`), counter moves;
  plus `fireTriggers` on `play-self` and flow `beginning.onBegin` after hold scoring. NOT run at harness scenario build
  (`harness/scenario.ts buildScenarioEngine`), not after `playSpell` finalize, not after rune/resource moves.
- Effective-might readers that must agree: `moves/play/cost.ts getCardEffectiveMight` (harness `game.state().might`),
  `effects/_helpers.ts getEffectiveMight`, `target-resolver.ts effectiveMight`, `state-based-checks.ts` lethal check,
  `resolve-full-combat.ts` CombatUnit `baseMight`; combat-only Assault/Shield in `E/combat/combat-resolver.ts unitCombatMight / lethalThreshold`.
Recipe — static not applied / not continuous / wrong scope: 1) dump: `type:"static"`, `effect.type`, `condition`,
`target`/`affects`. 2) scope → fix descriptor (`location:"here"`, `excludeSelf`, `controller:"friendly"`) or extend
`resolveStaticTargetsFromDescriptor`. 3) unknown condition → add case to `evaluateCondition`. 4) dynamic amount → branch in
`applyStaticEffect`. 5) invisible until a chain resolves → add `recalculateStaticEffects`/`cleanupAndFireDeaths` at the
mutation site (wrap the move map with `withPostMoveCleanup`, or recalc at the end of `buildScenarioEngine`).

## 6. Keywords & timing
- `E/keywords/keyword-effects.ts` — `KEYWORD_DEFINITIONS`, `calculateCombatMight`, `applyShield`, `sortByTankPriority`,
  `sortByBacklinePriority`, `canMoveToLocation` (Ganking), `canPlayViaAmbush`, `shouldEnterReady`, `canPlaySpellAtTiming`, `getDeflectCost`.
- Combat use: `E/combat/combat-resolver.ts resolveCombat / calculateSideMight / distributeDamage / lethalThreshold`
  (Assault +X attacker, Shield +X defender, Tank first, Backline last, `dealsNoCombatDamage`, `diesOnAnyDamage`), fed by
  `moves/combat/resolve-full-combat.ts` which collects keywords from `def.keywords`, `abilities[{type:"keyword", value}]`
  and `meta.grantedKeywords`. Stunned units are NOT zeroed yet — set `dealsNoCombatDamage` when `meta.stunned`.
- Runtime grants: `effects/grant-keyword.ts` → `meta.grantedKeywords[{keyword, value, duration:"turn"|"permanent"}]`
  (turn ones expire at 3d in `flow/expiration-step.ts expireCardTurnEffects`); statics use `duration:"static"`. Readers: `registry.hasKeyword` = printed only;
  `moves/movement/helpers.ts hasKeyword` = printed + granted. "Keyword ignored" is often the wrong reader.
- Timing: `E/chain/chain-state.ts getTurnState` (`neutral-open|neutral-closed|showdown-open|showdown-closed`),
  `isLegalTiming(timing, state)`: `reaction` always, `action` in *-open, `standard` neutral-open only.
  Spells: `play-spell.ts` (`registry.getSpellTiming` ← `normalizeSpellTiming`; active-player check in neutral-open).
  Units/gear: `play-unit.ts` / `play-gear.ts` condition (main phase, neutral-open; Ambush/Reaction keyword exceptions).
  Activated: `moves/chain/activate-ability.ts` condition — timing = `"reaction"` if `ability.timing==="reaction"` or keyword
  Reaction, else `"action"` (so plain abilities are allowed in showdowns/opponent open states today — rule 151.2 fixes go here);
  restrictions `self-at-battlefield`, `not-empowered`, condition `while-level`. Discretionary moves (standardMove, hideCard, …)
  require `neutral-open` + active player + `turn.phase==="main"`.
- Locations: `cost.ts getPlayLocationPermission / canPlayToOpenBattlefield / playOnlyToConqueredBattlefield`; Hidden
  `moves/play/hide.ts` (`facedown-<bf>`, `meta.hidden/hiddenAt`); Ganking `movement/ganking-move.ts` (bf→bf); Legion =
  condition `{type:"legion"}` (`E/abilities/legion-conditions.ts`, `draft.cardsPlayedThisTurn`); Accelerate = optional cost
  kind `"accelerate"` → `paidAccelerate` → enters ready in `playUnit` reducer (`staticEnterReadyApplies` otherwise).
- COUNTERED CARDS AND "PLAYED" — ONE model (rules 419.4.a.1 / 419.4.b / 425.1.b / 812.1.c), settled; do NOT re-litigate:
  a countered card fires NO play-TRIGGER ("when you play a card", Abandoned Hall, Viktor — 419.4.a.1/425.1.b), but it WAS
  Finalized, so every NON-triggered "cards played this turn" check still counts it (419.4.b's own examples name a
  Defy-countered spell: Legion stays active, Battering Ram still costs the reduced 4; 812.1.c = "Finalized by you").
  Engine matches: `draft.cardsPlayedThisTurn` is tallied at chain-add = Finalization and never decremented by a counter.
  Rulings 2a574e6d83c828f8 / 29c222d1d436fd40 (count must be 0) are the pre-CR minority — rewrite the FACET with
  `// RULING-CONFLICT: riftjudge <id> says X; CR 419.4.b/812.1.c says Y — engine follows CR`, never flip the tally.
Recipe — keyword ignored in combat: CombatUnit build in `resolve-full-combat.ts` → `combat-resolver.ts` usage.
Recipe — timing wrong: spell → card `rulesText`/`normalizeSpellTiming`; ability → `activate-ability.ts` timing block
(both `condition` and `enumerator` copies); move → that move's `condition` turn-state check.

## 7. Costs
- MODEL (`E/game-definition/moves/play/cost-model.ts`): `getPlayCostModel(state, player, card, ctx)` → `PlayCostModel
  {base, alternatives[{id:"alt"|"flow"|"self-trash"|"hidden", cost, from}], additional[AdditionalCost {id, mandatory, cost:
  CostComponent, perUnit?, ifPaid?, condition?, perTarget?}], repeat?[tiers], x?}` (types in `T/abilities/cost-types.ts`).
  Additional-cost ids: `accelerate`, `accelerate-granted` (board static, non-hand plays), `pay`, `kill`, `kill-any`
  (per-kill pip discount), `discard`, `exhaust`, `spend-buff`, `spend-buff-any` (per-buff pip discount), `return-to-hand`,
  `deflect` (mandatory, per opposing target). `computeTotalCost(state, player, card, selection, ctx, model?)` →
  `{resources: PlayResourceCost, objects: ObjectPayment[], paidIds, entersReady, extras, illegal?}`; `canPayTotalCost`;
  `optionalCostSubsets(model)`. Unit idioms: `E/__tests__/core-rules/cost-model.test.ts`.
- ONE resource computation in `moves/play/cost.ts`: `computePlayResourceCost(state, player, card, extras, getMeta, consume)`
  → `PlayResourceCost {free, ignoreEnergy, energy, named{domain:n}, any, hybrid?}` (base/alt/Flow cost, `meta.costModifier`,
  interactive Might reduction, board statics `computeStaticCostReduction` with per-discount minimums 356.4.e, increases
  `computeStaticCostIncrease` 356.3, self scaled/conditional/Legion discounts, one-shot next-play discounts incl. pips,
  X, Repeat tiers, Deflect offset by waived [A], additional-cost energy/pips, waived pips), then `canPayResourceCost`
  (restricted "use only to play X" energy via `state.restrictedEnergy`, pooled [A] covers named pips, hybrid pips) and
  `payResourceCost` (earmark first, ledgers `spellEnergySpentThisTurn`/`powerSpentThisTurn`). `canAffordCard`/`deductCost`
  are thin wrappers — extend the shared computation, never one wrapper. Effect-instructed plays (`pending-choice.ts`
  reveal-and-pick `onPicked:"play"`, `effects/play.ts`) price/pay through the same functions; rule 419.2.a: an
  unaffordable "play it" pick is filtered by `isAffordablePlayPick`.
- PARAMS: every play move (`playUnit/playSpell/playGear/revealHidden/playFromChampionZone/activateAbility`) accepts
  `costs: PlayCostSelection {alternativeId?, paid: {<costId>: true | {objects, count?, spec?}}}`; the legacy per-kind params
  (`paidAdditionalCost, additionalCostSpec, sacrificeId(s), discardId, spentBuffIds, altCost, viaFlow, recycleIds`) are
  SHIMS: spells expand `costs` via `legacyParamsFromSelection` and attach it via `withCostsParam`; PERMANENTS resolve
  either shape against the play-options model (`resolveSubmittedUnitPlay`) and emit `costs` (+ `quote`) on every variant
  that pays something. Harness: `play(c, {costs:{paid:
  {accelerate:true, "spend-buff-any":["ally"]}}})`, `cast(c, {costs:{alternativeId:"flow"}})`, `{paid:{kill:"pawn"}}`;
  the old `accelerate|payOptional|sacrifice|discard|flow` args still work. `draft.additionalCostsPaid[cardId]` is the LIST
  of paid ids (read via `operations/additional-costs-paid.ts additionalCostWasPaid(state, card, id?)`; condition
  `paid-additional-cost` may carry `costId`). Two optional costs on one card (Kraken Hunter) are independent: the bare
  legacy flag on an object-cost variant means THAT cost; the resource cost is elected by an explicit `additionalCostSpec`.
- PLAY OPTIONS — permanents (`E/game-definition/moves/play/play-options.ts`, rules 354–358 / 419.1.a / 811; core spec
  `core-rules/play-options-parity.test.ts` = PROPERTY "enumerated ≡ accepted ≡ charged" over seeded boards + targeted
  rules): ONE module answers, for a unit/gear played from ANY origin — `{kind:"hand"|"trash"|"championZone"|"facedown"
  (battlefieldId)|"effect"(destinations, extras, free, from)}` —, (1) `computeUnitPlayOptions(state, io, player, card,
  origin) → UnitPlayOption[] {destination, selection: PlayCostSelection (canonical: alternativeId + paid ids WITH their
  objects / priced spec), total: TotalCost, quote {energy, power{domain:n}, any, xp, paidIds, entersReady}, admittedBy
  standard|reaction|ambush|always, grantedReaction, redirect? mandatory|optional}` = every LEGAL and PAYABLE (destination ×
  cost selection): destinations from `unitPlayDestinations` (355.2.a base / RECORDED-controller battlefields; 355.2.b card
  + board permissions — open bf, occupied enemy, "where there are enemy units", attacked, `can-play-to-occupied`; 822.1.b
  [Ambush] with `ambushNeedsPresence`; ven-157 battlefield redirect `{pips, otherwiseValid}`; 054.1 Warden / "units can't
  be played here" / conquered-only filters; facedown = its battlefield only; effect = the instruction's list), selections
  = cross product over the model's additional costs (`choicesFor`: accelerate|accelerate-granted|pay → one entry per priced
  SHAPE incl. Ezreal flex shapes and the XP-for-discount shape; kill → each controlled candidate the descriptor matches;
  kill-any / spend-buff-any → every SUBSET (`objectSubsets`, full power set ≤ `OBJECT_SUBSET_FULL_LIMIT`=6 candidates,
  prefixes beyond — and only listed sets are ACCEPTED); discard → each other hand card; exhaust → ready legend / matching
  permanent; return-to-hand → each friendly gear; mandatory ⇒ no unpaid choice) × origin alternative (facedown ⇒ `hidden`,
  trash ⇒ `self-trash` when the card has one, hand/CZ ⇒ printed or `alt`), each run through `evaluate`: timing admission
  (standard now / [Reaction] keyword in `reactionWindowOpen` / Ambush with a friendly unit STILL there after the cost's
  victims leave — 822.3 / redirect paid), `grantedReaction` = facedown or Ambush-into-presence (822.4/811.6 → Mystic Vortex
  prices it), `computeTotalCost(…, ctx{board, grantedReaction, playedFrom, extras}, model + a `redirect` entry)`, XP check,
  `canPayResourceCost` (pool-only, ONE assignment: named pips from their Domain then pooled [A], any-Domain/hybrid last —
  135.2.e.5). Not admitted / illegal / unpayable ⇒ ABSENT (355.16, 357.3). (2) `resolveSubmittedUnitPlay(state, io, player,
  card, origin, params)` = the option a SUBMITTED move names (legacy per-kind params via `selectionFromLegacyParams`, or
  `costs`; a legacy `paidAdditionalCost:true` that elects nothing the play offers ⇒ refused; an explicit `costs` id the play
  does not carry ⇒ refused; at a redirect battlefield the flag also elects the pips, a non-controller always pays them) or
  undefined ⇒ the move's `condition` is false and its reducer a no-op (358.5). (3) `payUnitPlayCosts(draft, io, option)`
  = rule 357 on the draft: resources recomputed with `consume` (one-shot riders) and paid ONCE via `payResourceCost`, XP,
  discard (event), spent buffs (one `spend-buff` event each), cost-kills through the kill effect (Deathknell / 357.2.a; a
  kill-any survivor pays its pip back), exhaust, return-to-hand → `{paidIds, entersReady, suspended}` (a die-shield prompt
  mid-payment ⇒ `draft.suspendedPlay`, `completeSuspendedPlay`). (4) `unitPlayOptionParams(option)` = the legacy variant
  shape menus keep (`location, paidAdditionalCost, additionalCostSpec, sacrificeId(s), discardId, spentBuffIds, altCost`)
  + canonical `costs` + hidden `quote`. ROUTED: `playUnit` (hand + trash grants; condition/enumerator/reducer are 3 lines
  each), `playFromChampionZone` (419.1.a — identical to hand: XP shape, granted Accelerate, Warden, 340.4 reseat via
  `completeUnitPlay`), `revealHidden` for units/gear (spells keep their target-lock flow and price via `revealSpellCost` =
  `computePlayResourceCost({altCost 0, grantedReaction})`, Deflect at target lock). BATTLEFIELD CONTROL: a kill cost that
  empties the CONTROLLED destination is LEGAL (190.4/323.6 + official 9a32c2cc829f221a — control persists while the play is
  on the chain; ledros/cruel-patron facets carry RULING-CONFLICT); an [Ambush] REACTION play whose cost empties its
  destination is not (822.3). HARNESS: `seat.legal()/option()` variants carry `params.quote`; a unit play offered at several
  destinations goes to BASE when `play(card,{…})` names no `to` (every cost line is offered at every destination now).
  EFFECT PLAYS of permanents (`play-pipeline.ts continuePermanentEffectPlay`, also serving `playFromZone` and
  activated abilities that play a card): the dialog is a sequence of FILTERS over `computeUnitPlayOptions(…, {kind:
  "effect", destinations: locationCandidatesFor(spec), extras: instructionCost(spec) (356.1.a/b: for [cost] / ignoring
  … / reduced by), free (356.5.a), from, optionalCostIds: accelerate|accelerate-granted|pay|kill})`: no option ⇒
  abort (419.2.a; a DECLINABLE play first re-asks with recyclable runes credited — Nocturne cac9ff02); location prompt =
  distinct destinations; mandatory kill/return object = the objects the options name there (>1 ⇒ prompt); optional kill
  offered iff an option pays it (declinable iff one does not — 357.3); optional resource cost (incl. the XP shape and
  GRANTED Accelerate) offered iff an option pays it, `optInCost` = its increment; the survivor is paid via
  `payUnitPlayCosts` and entered. `canPerformEffectPlay` for a permanent = "≥1 option exists". Spells an effect plays
  keep `costExtrasFor` + the [Repeat] offer. PILE PLAYS by an ACTIVATED ability ("[Exhaust]: Play a unit banished with
  this", unl-148-219): the pile card is a TARGET named at activation — `activate-ability.ts` raises `choose-target
  {bindToChainItemId}` over `pilePlayCandidateIds` right after the item is added (offered even for one candidate,
  355.10; harness: `activate(gear)` → `pick(unit)` (timing FIN) → pass/settle → the play's own destination prompt);
  resolution plays THAT card (`effects/play.ts` bound-in-pile) or nothing if it left the pile (359.3.e.7).
  TODO(a7c4dc7d481b): spells are not modelled in play-options — [Repeat] needs PER-EXECUTION target sets
  (`executions:[{targets…}]`, 820.2.a) when they are; effect plays of spells must ask the same per-execution choices.
- `getOptionalPlayCost(cardId)` (cost.ts) is still the per-shape reader behind the model: kinds `accelerate|pay|kill|
  discard|exhaust|spend-buff|return-to-hand` (+`mandatory`, `energyDiscount`, `ignoresBaseCost`, `entersReadyIfPaid`,
  `condition`); `getBuffSpendCost` / `getKillAnyNumberCost` / `getSacrificeCostDiscount` / `getGrantedAcceleratePlayCost`
  for the variable-count and granted shapes. New shape → teach the reader AND `cost-model.ts additionalFromOptional`.
- OBJECT costs are paid through effects (`executeEffect kill` / `removeFromBoard discard` / `return-to-hand`), so
  Deathknell, discard triggers and die replacements apply; a replaced cost-kill still counts as paid (357.2.a). If paying
  raises a prompt (optional costed die shield, 371.2) the unit play SUSPENDS: `draft.suspendedPlay` (pure data) →
  `play-unit.ts completeUnitPlay` runs from `pending-choice.ts postChoiceCleanup` via `completeSuspendedPlay` once no
  prompt is open (resources were paid first; the unit is still in its origin zone meanwhile). rule 357.3: playSpell's
  `mandatoryKillCandidates` drops sacrifices that would leave a cost-capped "play from trash" with no legal card.
- TRIGGER costs (`item.optInCost`, from `condition:{type:"pay-cost", cost}` — the `cost-at-finalization` kind of §2's
  model; NOT the "you may pay [C]. If you do" Pay, which is a RES game action per rule 205) are ALL settled at FINALIZATION
  (rules 383.3.b / 402–404): `trigger-finalization.ts` raises the `opt-in` (`finalizationChainItemId`, timing FIN;
  payability gate = `pending-choice.ts canPayOptInCost` = resources + `killCostCandidates`/`recycleCostCandidates`/
  `returnToHandCostCandidates`/`spendBuffCostCandidates` counts; DESIGN: resource-short ⇒ prompt stays with canAccept:false;
  an EMPTY/too-small object set ⇒ item removed silently, no prompt — `optInCostObjectsExist`). On `yes()` the opt-in reducer
  pays energy/power/xp/exhaust/kill-me/banish-me/burn/discard-N at once and, when the cost names board objects
  (`objectCostsOf(cost)`: `kill {amount?,target}` / `recycle {…}` / `returnToHand {…}` / `spendBuff: n` (buffed units the
  payer CONTROLS, 745.2; paid via the `spend-buff` handler with bound targets, fires "when you spend a buff") —
  "here"/"another"/types honoured), marks the item `objectCostOwed`; the dialog's Step 1b (`settleObjectCost`) then has the controller
  name them (forced `pick-many`, `resume:{kind:"trigger-cost", itemId}`) and `payTriggerObjectCost` snapshots LKI →
  `item.paidObjects`, kills/recycles/bounces them through the effect handlers (357.2.a replacements, Deathknell,
  186.1) inside `withinMoveReducer`, then targets are chosen (Step 2). Nothing is asked or paid again at
  resolution (`executeResolvedItem` passes `paidObjects` into the EffectContext). Card-def shape for "you may
  <kill|recycle|return|spend a buff> X TO Y": `condition:{type:"pay-cost", cost:{kill:{target}}}` + effect Y (Dusk Rose Lab,
  Bottled Constellation, Rumble, Monastery of Hirana `{spendBuff:1}`). NOT Emperor's Dais ("… . If you do," ⇒ rule 205:
  `optional:true` + `conditional{pay-cost [1], target:<unit here>, then: sequence[return-to-hand, conditional did-perform →
  create-token]}` — unit chosen at FIN, pay + return at RES). Costs written inside instructions (`costStep:true`: "disempower X
  to …", "banish me to …", "Recycle me to …", and the parser's "Spend N XP to …" lead step) are paid by
  `payFinalizationCostSteps` (Step 3, after targets; a target-less cost step consumes no bound-target slot).
- Activated costs: `moves/chain/activate-ability.ts` condition checks energy, power (`chain/effect-context.ts canAffordPower`),
  xp, exhaust, `discard`/`recycle`/`kill` (params or `costs.paid.{discard|recycle|kill}.objects`); reducer `deductAbilityCost`.
- NOT DONE (fenced TODO at the top of `cost-model.ts`): the play-time Add sub-step (357.1.a — credit ready runes/Gold/
  Seals and prompt for Add activations when the pool is short); plays and taxed moves remain pool-only (DESIGN.md).
  Mid-resolution pays already accept rune taps while their prompt is open (444.2.c).
Recipe — additional cost not offered/mandatory: dump abilities → does `getPlayCostModel` list it (bun -e with a harness
game, see cost-model.test.ts `ctxOf`)? No → reshape the ability to what `getOptionalPlayCost` reads (explicit `abilities`
is fastest). Yes but not enumerated → for a PERMANENT the play-options model (below: `play-options.ts choicesFor` names
the objects/specs each cost id may take, `costCandidates` the board objects; a new cost id needs a case in `choicesFor`,
`normaliseSelection`, `unitPlayOptionParams` and `payUnitPlayCosts`); for a spell play-spell's paid variants.
Recipe — wrong total: assert `computeTotalCost(...).resources` in a unit test first; then fix inside
`computePlayResourceCost` (board static → `static-cost-reduction.ts matchesPlayedCard`/`minimum`; own text →
`getSelfScaledEnergyReduction`/`getSelfConditional*`; one-shot → `takeNextPlayDiscount` / `meta.costModifier`).
`[rainbow]` in tests: `.resources(P1,{power:{rainbow:1}})` (any domain also pays a rainbow pip).

## 8. Combat / movement / scoring
- Movement: `moves/movement/standard-move.ts standardMove` (exhausts, moves, `move` event), `ganking-move.ts`,
  `recall-unit.ts` (no move event), `helpers.ts`. Effect-driven: `effects/move.ts handle_move / moveCardWithEvent`
  (may prompt `choose-destination`; 449.2 two-other-players → recall), `effects/recall.ts`.
- ARRIVALS — ONE helper, `E/operations/arrive-at-battlefield.ts`: every path that makes a unit present at a battlefield
  calls `noteArrival(io, {at, unitIds, stagedBy, cause})` (Standard/Ganking move reducers, `contest-arrival.ts
  contestBattlefieldOnArrival` for play-unit/play-champion/pending-choice destinations, `effects/move.ts arriveByEffect`
  for effect moves/swaps, `effects/play.ts enterUnitFromEffect`, `create-token.ts`, `take-control.ts` cause
  `"control-change"`). It applies Contested for the unit's CONTROLLER (190.3.a/450: `bf.contested/contestedBy`,
  `showdownComplete=false`, `stagedBy` = whose action did it) and joins a showdown already running there (344.1
  non-combat→combat upgrade, 464.2.c.3.a roles + attack/defend events for newcomers only). It never BEGINS anything —
  NO caller opens inline (Standard/Ganking move, play-unit/champion included; `discretionary:true` marks those so the
  begun showdown is not `autoBegun` → harness `settle()` passes Focus through instead of handing it back once):
  `beginStagedShowdowns(io)` (= `chain/showdown.ts openPendingContestedShowdown`, run by the OUTERMOST move wrapper
  `moves/index.ts withStagedShowdownOpening` after trigger finalization — so a mover whose own "When I move" trigger is
  Pending finds a Closed State (401.1) and stays Staged — plus after the chain empties in `resolve.ts`, `pending-choice.ts
  postChoiceCleanup`, showdown close, full combat; a begun showdown re-runs `cleanupAndFireDeaths` (statics on
  "in combat") and its attack/defend/showdown-begin triggers are finalized as ONE batch) does 323.11 (un-contest a
  battlefield whose contesting player has no unit left — Gust-away in response ⇒ no showdown) → 323.12 (showdown-only
  first) → 323.13 (staged Combat whose attacker OR `stagedBy` is the turn player; ≥2 ⇒ turn player's `startShowdown`
  pick, `turnPlayerMustChooseStagedCombat`; an off-turn Reaction arrival waits for the turn player's `startShowdown`
  step). `beginShowdownAt(io, bfId, {autoBegun})` is the single opener (focus = contestedBy per 345,
  `startShowdownState`, `showdown-begin`, roles + become-mighty + `attack`/`defend` with batchIndex) used by that
  Cleanup and by the `startShowdown` move. A control steal of the ONLY unit at a battlefield is left to `performCleanup`
  step 6 `conquerByPresence`. Tests: `core-rules/effect-move-staging.test.ts`, `core-rules/staged-showdown-timing.test.ts`.
  TEST IDIOM: right after `move()` of a unit WITH a move trigger expect `decision().context==="chain"`, no showdown, no
  `combatRole`; pass priority twice (or `settle()`) to see the showdown/roles.
- Showdown / Focus: `E/chain/chain-state.ts startShowdown, passFocus, endShowdown, resetShowdownPasses, getActiveShowdown`;
  moves `moves/chain/showdown.ts passShowdownFocus` (all passed ⇒ close; non-combat close auto-conquers for a sole occupant
  + `conquer` event; combat close sets `bf.showdownComplete`), `startShowdown` (reducer = `beginShowdownAt`), `endShowdown`.
  HARNESS: an effect-staged combat now BEGINS in the Cleanup after the chain empties and `settle()` fights it through —
  to inspect the staged/begun state resolve the chain with `passPriority()`/`game.acting().pass()` instead of `settle()`.
- Combat damage: `moves/combat/resolve-full-combat.ts resolveFullCombat` (legal when `bf.contested && bf.showdownComplete`
  in neutral-open; harness `settle()` auto-runs it) → build `CombatUnit`s (each with `incomingDamageOps` / `immuneToDamage` from
  `deal-damage.ts damageReplacementProfile`; a Double+Prevent-N unit first gets the 372 `order` prompt) → 465.2.c.3 assignment
  prompts (`combat-damage` pendingChoice; `lethalNeed`/harness bucket `lethal` = `combat-resolver.ts lethalNeed` =
  `damage-modifiers.ts minAssignedForLethal` through the unit's ops: doubled ⇒ half, Prevent N ⇒ +N, Prevent All ⇒ never lethal
  but assignable, 465.2.c.4.a/437.5) → `resolveCombat` (assignment only) → `dealDamageBatch` (kind `combat`, source player =
  opposing side) → kills read off the MARKED damage vs `combatLethalMight` (Shield/Assault in role), heal survivors, force-mark
  the dead → `cleanupAndFireDeaths` (SBA deaths, Deathknell, die replacements) → winner by who remains: attacker ⇒
  `bf.controller`, `points.ts scoreBattlefield(…,"conquer")`, `conquer`+`score` events; defender ⇒ attackers recalled; nobody ⇒
  controller null; `expireCombatMight`; final `cleanupAndFireDeaths`.
- POINTS / VICTORY — ONE choke point, `E/operations/points.ts`: `awardPoints(draft, player, n, {method:"hold"|"conquer"|"effect"|
  "burn-out", battlefieldId?, sequenceIndex?}, io)` = 054.1 denial (`isPointGainDenied`, static `restriction` "can't gain points",
  condition via `static-abilities.evaluateCondition`) → 443.1.a per-method `scoring-rules.ts applyScoreReplacement` → 471.1.b Final
  Point (conquer at ≥VS−1 draws unless every bf scored) → add + `pointsGainedThisTurn` ledger. `losePoints` (194.4 clamp),
  `markScored`/`scoreBattlefield(draft, player, bfId, "hold"|"conquer", io, {previousController}) → {isScore, gained, denied,
  replaced, drewInstead}` (gates `scoring-rules.ts canPlayerScoreAtBattlefield`, 471.2.c re-take = not a Score, 630.1.a teammate),
  `burnOut`/`refillDeckOrBurnOut` (431.2/431.3 loop, repeat points unpreventable + immediate win), `effectiveVictoryScore` (base +
  modifier + battlefield `increase-victory-score` + board `modify-victory-score` statics), `checkVictory(draft, {io, immediate})` =
  the ONLY writer of `status="finished"/winner` for a points win — called at the end of `performCleanup` (no-op while a chain item
  resolves, rule 321), after the flow Hold step, after burn-outs, and by directed score moves. NEVER write `victoryPoints` directly.
- Hold scoring: flow `runHoldScoringStep` (after start-of-turn triggers resolve — deferred to `beginning.onEnd` when they open a
  chain; `scoreBattlefield(…,"hold")`, `hold`+`score` events, `checkVictory`, static recalc). Manual/sandbox: `moves/combat/score-point.ts`
  (never enumerated), `conquer-battlefield.ts`. `win-conditions/victory.ts` = read-only predicates delegating to points.ts.
- BATTLEFIELD CONTROL TIMING — ONE model, ONE module `E/operations/battlefield-control.ts` (rules 190.4 / 323.6 / 348.2.a /
  466.5 / 469; adjudicated against the CR text + ~100 train rulings incl. the official clarification 9a32c2cc829f221a; matrix
  test `core-rules/battlefield-control-timing.test.ts`). DO NOT re-litigate per ruling — rewrite the contradicting FACET:
  - LOST (`applyControlCleanupStep`, called by `state-based-checks.ts performCleanup` = Cleanup step 4): the controller has NO
    unit of theirs there AND the Cleanup runs in an OPEN State (`cleanupStateKind`: no active chain, no Pending item, no
    unanswered prompt, no `suspendedPlay`, not mid-resolution, no unit reaped in this very pass whose `die` trigger is not yet
    queued) AND no Showdown/Combat is ONGOING AT THAT battlefield (`isShowdownOrCombatOngoingAt`: on the showdown stack, or
    `contested && showdownComplete` / `combatDamageDone` = combat awaiting damage/resolution). Showdown Open (a showdown
    ELSEWHERE) is an Open State (310.3) ⇒ other empty battlefields DO lapse during it. The cause never matters (move, gank,
    recall, bounce, banish, death, control steal). Facedown cards follow in the same Cleanup (step 4/323.7: trashed +
    revealed once `bf.controller ≠ hider`), no window.
  - KEPT: any Closed State — a Deathknell / "when a unit dies" / pending replay / the resolving spell or ability itself
    (808.1.d.2 + 401.1). ⇒ Cruel Patron cost-kill, Baited Hook, Arcane Shift, Glasc Mixologist, Thrill of the Hunt: the
    just-emptied battlefield IS still "a battlefield you control" / a legal play destination (`playDestinationOptions` reads
    `controlsBattlefield` = recorded controller only); a lone Deathknell unit dying OUTSIDE a showdown keeps the hidden card
    playable in response to the trigger (it saves nothing). Control lapses at the first Open Cleanup after the chain empties.
  - FROZEN while a Showdown/Combat is ongoing THERE (190.4.b): the defender Flashed/Rebuked/Gusted/killed to zero units
    keeps control (hidden card playable, may play units "to a battlefield you control" there); coming back in the SAME
    combat and winning = defence, NO conquer/point; attacker wins ⇒ Conquer; nobody left ⇒ Uncontrolled (466.5.b, also the
    `unitIds.length === 0` early exit of `resolveFullCombat`); 466.5.c trashes the loser's facedown card at resolution.
    A showdown merely STAGED in the same Cleanup is NOT ongoing (step 4 runs before step 9): "spell kills/moves the lone
    defender AND a unit arrives in the same resolution" ⇒ control lapses first, the showdown runs at an UNCONTROLLED
    battlefield, whoever solely remains/wins establishes control = Conquer (rulings f69a1bb8709cf037 / 88f862ece2edcd29).
  - GAINED only via `establishControl` / `settleControlByRemainingUnits`: 348.2.a non-combat close (`chain/showdown.ts`),
    466.5 combat resolution (`resolve-full-combat.ts`), the directed `conquerBattlefield` move, and the DESIGN presence
    shortcut (Neutral Open, uncontested, controller has no unit, exactly one other player has units ⇒ that player conquers
    at once; in Showdown-Open the controller lapses and the occupant applies Contested instead). `recorded === player` ⇒
    nothing (no re-conquer); else Conquer, scored iff not in `scoredThisTurn` (also on the opponent's turn). During a
    showdown at an UNCONTROLLED battlefield nobody controls it (`battlefieldYou` null ⇒ "when you defend here" fires for no
    one; no "battlefield you control" plays there) until its close.
  - HARNESS: `.battlefield("bf1",{controller:P1})` places nothing — unit-less seeded control is real and LAPSES at the first
    Open Cleanup (usually the test's first move). Durable control needs a unit/token of the controller there. A facedown
    card seeded at a battlefield with no unit of its controller is trashed by that same Cleanup.
  - RULINGS that contradict this (riftjudge 04fa74a73219a761 Flash, 792f2571b4fd68f3 Rebuke, b056874d8c1e6ec9, c37012557b4ba27f,
    d039a38c7976af6b — "control lost mid-combat"; 41251a7db1c8d7f0 / d1e31cb5c7f480a0 / aa969395f8d0b7e9 / 382c535e1d2ee445
    Baited Hook, 81bdefc55681da4a Cruel Patron, 213de1e6a8cd73e7 / 581ad300c36bb43c Arcane Shift, 6f7d86e367ff1647 Emperor's
    Dais, 86f899a5f45e47f8 / 90f742d56433d8b2 / 3365413873f90883 / 5cd0777c2b847b3c "lost mid-chain"; 8470eb7c4a1c301d /
    070fc7a3b21bd0b1 / 678069c72cf4193e / b43c764cfdfe5b69 "lone Deathknell unit outside a showdown loses the hidden card before
    the trigger window"; 2c079c2e8ab0b3ed as ASKED — Stormbringer empties + arrives before any showdown) are the pre-"1.1"
    minority: rewrite the facet to the model with `// RULING-CONFLICT: riftjudge <id> says X; CR 190.4/323.6 (+ official
    9a32cc…) says Y — engine follows CR`, never flip the engine.
- Deaths happen ONLY in `performCleanup` (damage ≥ might) and `effects/kill.ts`. End of turn = TURN STRUCTURE below
  (`flow/expiration-step.ts`: 3c heal → 3d expire stun/`mightModifier`/turn keywords/`activeReplacements` (turn/next)/… →
  3e pools). [Temporary] kills are chain items queued in `beginning.onBegin` (816, `temporary-kill` effect → leave-board choke).
- TURN STRUCTURE (rules 315–317), `E/game-definition/flow/riftbound-flow.ts` phases `awaken → beginning → scoring → channel →
  draw → main → ending → expiration(self-looping)`; `state.turn.phase` shows `awaken|beginning|channel|draw|main|ending`
  (`scoring` and `expiration` are flow-internal; phase stays "beginning"/"ending"). A phase whose triggers open a chain HOLDS
  via `endIf` (chain inactive ∧ no pendingChoice [∧ no contested bf for ending]) and the following step runs when it is
  re-entered: Beginning Step triggers (315.2.a) → `runHoldScoringStep` deferred to `scoring.onBegin`; Ending Step 317.1
  ("end-of-turn" event, `ending.onBegin`) → EXPIRATION STEP 317.2 = `flow/expiration-step.ts runExpirationStep/
  runExpirationPass`: ONE cleanup per pass inside `withinMoveReducer` (320: items may be ADDED, none finalized) —
  3c `healAllUnits` (damage-store `clearDamage`, board only) → 3d `expireThisTurnEffects` SIMULTANEOUSLY: snapshot every
  board unit's `getEffectiveMight`, strip per-card turn state (`expireCardTurnEffects`: stun 423.1.a.2, `grantedKeywords/
  grantedAbilities/delayedTriggers` duration "turn", prevention shields, `modesChosenThisTurn`, `dealtDamageThisTurn`,
  (dis)empoweredUntilEndOfTurn, `mightModifier`+`combatMightModifier`, `baseMightOverride`), `expireControlEffects` (Hostile
  Takeover revert + recall), off-board sweeps (`grantedFlow`, stale modifiers), game/player ledgers (`expireGameTurnEffects`:
  scored/conquered/points/xp ThisTurn, `visibilityGrants`, `cannotPlayCardsThisTurn`, `nextSpellRepeat`, `activeReplacements`
  turn/next, `turnStatics`, `playerDelayedTriggers`), then `recalculateStaticEffects`, then `_helpers.checkBecomesMighty(id,
  before, buildFlowEffectContext)` per unit — the SAME choke mid-turn modifier writes use — so "when a unit becomes [Mighty]"
  (Grand Duelist / Fiora Worthy, 709/710) is queued as a Pending Item from inside the step → 3e `emptyAllRunePools`
  (`emptyRunePoolInPlace`: energy, power, earmarks — BEFORE anything is finalized, so a trigger cost is payable only by
  adding runes at the prompt, DESIGN manual-pay) → `orderBatchTriggersByTurnOrder` + `finalizePendingItems` (G7 dialog).
  `itemsProcessed` = chain ids minted by the pass; > 0 ⇒ 317.2.f: once that chain/prompt/showdown is gone the `expiration`
  phase re-enters itself and runs the NEXT pass (a "+2 this turn" created by that chain lapses there); a pass with 0 items ⇒
  `turn.phase="cleanup"`, `context.endTurn()` (317.3). Guard `MAX_EXPIRATION_PASSES`=8 (`guardTripped`). Trace:
  `state.turnTrace.expiration[] = {pass, steps:["heal","expire","empty-pools"], healed[], expired["<what>:<id>"], events
  ["become-mighty:<id>"], poolsEmptied{pid:{energy,power}}, itemsProcessed, guardTripped?}` reset in `ending.onBegin`, read
  with harness `game.trace().expiration` (survives into the next turn). New "this turn" state ⇒ add its lapse to
  `expireCardTurnEffects`/`expireGameTurnEffects` (+ a `record.expired` label), never to a phase hook. HARNESS: after
  `endTurn()` a 3d-created trigger shows as a FIN/chain decision while `turnPlayer()` is still the old player and
  `phase()==="ending"`; `settle()`/`advanceTurn()` carries through the re-loop. Tests: `core-rules/expiration-step.test.ts`,
  `interactions/watcher-grand-duelist-expiry-reloop`, `fiora-worthy-feline-smoke-second-expiry`. `rules-audit/helpers.ts
  runPhaseHook(engine,"ending")` still runs EOT triggers + pass 1 inline when the chain is idle.
Recipe — unit should/shouldn't die: which Might did the lethal check use (SBA: printed+buff+mightModifier+static+equip;
resolver adds Shield for defenders / Assault for attackers via `lethalThreshold`)? Was `meta.damage` written?
Recipe — conquer after killing the last defender mid-showdown: `resolveFullCombat` skips the damage step and 466.5
(`settleControlByRemainingUnits`) hands the sole remaining player the battlefield; non-combat closes via `passShowdownFocus`.
Recipe — "control lost/kept at the wrong time": read the BATTLEFIELD CONTROL TIMING block above first; the answer is almost
always "the test facet asserts the minority ruling / relies on unit-less seeded control" → rewrite the facet, add a holder unit.
Recipe — stun: `effects/stun.ts` sets flag + `stun` event; zero its combat damage in `resolve-full-combat.ts`; cleared at end of turn.

## 9. Replacement effects
- `E/abilities/replacement-effects.ts` — printed abilities `{type:"replacement", replaces:"die"|"take-damage"|"score"|…,
  replacement: Effect|"prevent", duration?:"next"|"turn", target?:{controller}, condition?}` on board cards:
  `checkReplacement(event, ctx)` (first match by `replaces===event.type` + friendly/enemy owner), `findAllReplacements`,
  `orderReplacementsByOwnerChoice`, `markReplacementConsumed` / `clearConsumedReplacements` (`draft.consumedNextReplacements`).
- Runtime-installed: `effects/replacement.ts handle_replacement` appends `{...effect, owner, sourceCardId, targetCardIds?}`
  to `draft.activeReplacements` (bound to targets for `die` / next `take-damage`); turn/next ones purged at 3d (`flow/expiration-step.ts`).
- DEATHS go through ONE planner: `E/abilities/die-replacement-batch.ts runDieBatch(ctx, dyingIds, {canPrompt, kill?})`
  (rules 370–373), called by `state-based-checks.ts performCleanup` (whole lethal batch; unreplaced ones are then killed
  together via `leaveBoard(…, {replacements:"skip"})`), `effects/kill.ts killUnits` (whole target batch) and
  `leave-board.ts applyDieReplacement` (single card: costs, [Temporary]). Per dying card it collects every candidate
  (`collectDieCandidates`: bound `activeReplacements` entries first, then board `findAllReplacements`), then:
  371.2 optional costed shield — bound entry OR board ability with `condition:{type:"pay-cost"}` (+ `payer:
  "affected-controller"` for "ITS controller may pay", `duringCombat:true` for "would die during combat"; battlefield
  cards in `battlefieldRow` are scanned with zone `battlefield-<id>` so `location:"here"` works) ⇒ legacy `opt-in`
  prompt (`suspendedDeathCardId`; batch waits; asked-and-still-dying = declined; kill batches carry `suspendedKill`); 372 ≥2 candidates ⇒ `order` prompt to the dying card's controller (harness shows it as a `pick`
  "which applies first", semantics `replacement-order`, timing RPL; `seat.pick(src)` or `seat.order([...])`); 373 a
  `singleUse` candidate (bound entry, `duration:"next"`, or an effect that kills/banishes `self` — Zhonya's, GA) that also
  matches a LATER death of the batch ⇒ `pick-many{1,1, semantics:"replacement-assign"}` to ITS controller naming the dying
  cards (picked one is processed first); candidates apply in order, each re-checked live (source still on board / entry
  still active / event still a death) so a replaced death consumes nothing else (370.2). State across prompts:
  `draft.dieBatch` (queue/orders/assigned/replaced/dying/kill); answers land in `recordDieBatchAnswer`, kill batches finish
  in `continueKillBatch` (pending-choice.ts `resumePending`). While a die prompt is open `performCleanup` leaves lethal
  units in place and `resolveFullCombat` defers its result (`bf.combatCleanupSuspended`, like 466.2).
  Guardian Angel's appended text is modelled on the card (`C/cards/sfd/guardian-angel.ts`: kill self + heal/exhaust/recall
  trigger-source, 373.2).
- Other call sites: damage — ONLY `operations/deal-damage.ts` (see §3 DAMAGE: every `take-damage` prevent / redirect /
  Double / "when it takes damage" effect, spell AND combat); score — `scoring-rules.ts
  applyScoreReplacement` (called only from `points.ts awardPoints`, method-scoped); tokens — `create-token.ts applyPlayTokenReplacement`; enters-ready — `cost.ts consumeEntersReadyReplacement`.
- Parser: `C/parser/impl/replacement.ts parseReplacementAbility` ("If … would …, … instead"), "next time" spells → effect `replacement`.
Recipe — "if X would die / be dealt damage, instead …": 1) ability `type:"replacement"` whose `replaces` equals the string
the call site checks; 2) no call site for that event kind → add `checkReplacement` where it happens (deaths: nothing to
add — the batch planner sees every board/bound `die` replacement); 3) optional ("you may pay …") replacements need a
prompt — reuse the `opt-in` pattern (`die-replacement-batch.ts offerOptionalShield`); 4) `duration:"next"` ⇒
`markReplacementConsumed`; 5) effect referring to "it" ⇒ target `{type:"trigger-source"}`.

## 10. Zones / tokens / hidden
- Zone ids (`E/zones/zone-configs.ts`): per player `mainDeck hand runeDeck runePool base trash banishment legendZone
  championZone`; shared `battlefieldRow` (the battlefield cards), `battlefield-<bfId>` (units/gear there), `facedown-<bfId>`,
  `chain`. Harness `zoneOf()` → `hand|base|trash|banishment|chain|battlefield-bf1|facedown-bf1|mainDeck…`.
- Tokens: `effects/create-token.ts handle_createToken` — ids `token-<slug>-…`, registers a def per instance and
  `token-def-<slug>`, unit tokens enter exhausted unless static EntersReady (`_helpers.tokenEntersReadyFromStaticGrant`),
  fires `play-token-unit`, location `"here"`→source zone / explicit zone / else base + `choose-destination` prompt if a
  controlled battlefield exists. Parser `C/parser/impl/effects-tokens.ts`. Manual `moves/token.ts`. TOKEN-NESS (rule 186) is
  DEFINITION-based — ONE predicate `registry.isToken(id)` (`operations/card-lookup.ts`: def `isToken:true` — set on printed token
  cards Recruit/Sprite/Gold/Bird/Reflection incl. `ven-t04` via `JSON_CARD_ENGINE_FLAGS`, and on every minted `token-def-*` /
  instance registration — or a `token-…` id); harness `state().isToken` agrees. 186.1: a token put into ANY non-board zone ceases
  to exist: `leave-board.ts leaveBoard` removes it (kill/SBA deaths only after their `die` event fired — Deathknell / "when a unit
  dies" still trigger; bounce/banish/recycle immediately), stragglers swept by `state-based-checks.ts sweepOffBoardTokens`; the
  owner is kept (`recordDepartedOwner/getDepartedOwner`). TESTS: a killed/bounced/banished token is in NO zone — assert
  `game.has(tok) === false` or `game.zoneOf(tok) === "gone"` (`locationOf` → undefined); `trash()`/`hand()` never contain tokens.
- Hidden: `moves/play/hide.ts hideCard` (needs keyword Hidden, pays 1 power of any domain, → `facedown-<bf>`, `hide`
  event) / `revealHidden` (plays it ignoring cost; `play-self` carries `fromHiddenAt` so `resolve.ts` limits targets to
  that battlefield). Orphan facedown cards trashed in `performCleanup` step 4.
- Leaving the board: kill path in `performCleanup` resets buffed/damage/exhausted/stunned/grantedKeywords/mightModifier and
  detaches equipment; `effects/return-to-hand.ts bounceToHand` resets too; `effects/banish.ts` → `banishment`;
  `effects/recall.ts` → base (keeps state, no `move` event).
- PLAYS — ONE pipeline, `E/game-definition/moves/play/play-pipeline.ts` (rules 354–359 / 419):
  - `enterPlayedPermanent(io, {cardId, playerId(performer), entryZone, via, from?, paidIds, entersReady, stun, stagedBy})`
    is the ONLY enter step for units/gear, used by the `playUnit/playGear/playFromChampionZone/revealHidden` reducers AND
    every effect play: battlefield-token entry replacement, fresh object (`leave-board.ts resetObjectState`, 124.1) when
    played from trash/banishment/deck, controller := performer (191.1), enters exhausted unless enters-ready
    replacement / static / paid Accelerate (143.4), `recordAdditionalCostsPaid`, `play-self`+`play-card` fired ONCE with
    `via` (`hand|effect|permission|hidden|champion|replay`) + `from` (origin zone), Legion count + `notePlayThisTurn`,
    arrival contest (`noteArrival`, discretionary iff hand/champion/hidden/permission), [Weaponmaster]/[Quick-Draw].
    Spells an effect plays: `putPlayedSpellOnChain` (`castSpellFromTrash` is a thin alias).
  - `beginPlay(io, EffectPlaySpec {cardId, playerId, via, costMode {full|ignore-all|ignore-energy|ignore-power|
    ignore-any-and-all|reduce{energy}|fixed{energy,power}}, location? "prompt"|"same-as-lki"|{fixed}|{only}|{extra},
    declinable?, sourceCardId, stagedBy, stun, then?, recycleAfter}, {immediate?})` = a play an EFFECT instructs (419.3):
    `canPerformEffectPlay` gate (419.2.a: affordable under the mode, mandatory additional cost payable, spell has a legal
    target, some legal location) → declinable ⇒ `opt-in {playConfirmSpec}` first (128.6) → the card becomes a Pending Item
    on the chain (`type:"permanent"|"spell"`, `status:"pending"`, `play:{…progress}`; a card from a PRIVATE zone waits in
    the `chain` zone, one in trash/banishment waits there) → the move wrapper's `trigger-finalization.ts
    finalizePendingItems` (oldest pending first, 337.1.b; items blocked by `finalizeAfter` are skipped) calls
    `continueEffectPlay`: for a PERMANENT every step is a filter over the play-options model (§7 PLAY OPTIONS — EFFECT
    PLAYS): location prompt to the PERFORMER (`choose-destination {playItemId}`; a single legal location is auto) →
    mandatory additional cost object (`choose-target {playItemId, playCostId}`, 356.2.a.1 — required under ANY cost mode)
    → optional kill (`choose-target {playCostOptional}`) → optional additional resource cost offer (`opt-in {playItemId,
    playCostId, resolved.optInCost}` — printed/granted Accelerate, "you may pay", XP-for-discount, 355.1.a / 356.1.b.3;
    free under any-and-all 356.5.a) → pay the surviving option (`payUnitPlayCosts`) → item leaves the chain →
    `enterPlayedPermanent`; a spell: [Repeat] offer → `computePlayResourceCost`+`payResourceCost` →
    `putPlayedSpellOnChain`; then `then` (played card bound, `triggerSourceId`) → `cleanupAndFireDeaths`.
    Answers are written back by `pending-choice.ts` (`recordEffectPlayAnswer`) and the wrapper re-enters. `{immediate:true}`
    continues at once when nothing older is pending (used by permission plays / accepted confirms); default = after the
    enclosing effect finishes (354.3).
  - Producers: `effects/play.ts handle_play` — A "play me" (`target self`; no cost fields ⇒ free: the trigger paid; `cost` ⇒
    fixed 356.1.a; `optional` ⇒ declinable), B "play a X from your trash/banishment" (`offerPileCandidates` → `reveal-and-pick
    {onPicked:"play", playSpec}`; filters: type, printed-cost bounds 206, tags, `linkedToSource`, killed-unit caps; Kharox
    reads THEIR trash), C "from your hand" (private ⇒ declinable pick even for one candidate), D explicit/bound targets ("banish
    it, then its OWNER plays it" — performer = owner unless `player:"controller"`; `toLocation:"same"` ⇒ `same-as-lki`).
    `pending-choice.ts` reveal-and-pick `onPicked:"play"` (look.ts / reveal.ts / reveal-hand.ts legacy fields `playTo/playStun/
    playIgnoreCost/playIgnoreEnergy/playEnergyReduction/playHere/playRecycleAfter` or an explicit `playSpec`) → `playSpecFromChoice`
    → `beginPlay` (Bone Skewer `playTo` ⇒ performer = OWNER, `ignore-any-and-all`, stunned, `stagedBy` caster); the pick's `then`
    rides on the play; a `then:{type:"optional"}` follow-up (ven-089) is its own chain item decided at resolution.
    `play-banished-pass.ts` (Promising Future) → one `beginPlay` (non-immediate) per banished card, in the effect's
    order (next player first). Flow stays `play-spell.ts viaFlow`; tokens stay `create-token.ts`.
  - BATCHES (rules 337.1/337.3/337.4/354.3/383.2.c/340.1): every play a resolving effect queues is a Pending Item in
    queue order; the resolving SPELL's own "when you play a spell/card" triggers (`resolve.ts firePlayedCardTriggers`,
    fired only once the resolution — incl. its prompts — has finished, `flushDeferredSpellSettle`) are appended AFTER
    them; `finalizePendingItems` then finalizes everything oldest-first back to back — each play dialogs to its
    performer, a permanent enters at once (its play-triggers append at the end and are finalized in the same sweep),
    a spell becomes a finalized spell item IN ITS OWN SLOT (`continueEffectPlay` re-slots the `putPlayedSpellOnChain`
    item; its targets are bound via the shared `executeResolvedItem(…,{finalizeOnly:true})` planning in
    `bindPlayedSpellTarget`, prompting the performer when >1) — and only when nothing is pending does the controller
    of the NEWEST item get priority (`reseatPriorityOnTop`); resolution is plain LIFO. Nothing lifts/reorders items
    any more (`finalizeAfter` survives only for the ven-089 reflexive follow-up). TEST IDIOM: after the last pick of
    such an effect expect the performers' FIN prompts (destination/target) in queue order with NO `action` decision
    in between; an older pending play is finalized before a newer play-trigger's target is asked.
  - PERMISSIONS (366.1 / 419.1.a): `E/operations/play-permissions.ts` — `draft.playPermissions[]` runtime grants
    (`grantPlayPermission`, effect `grant-play-permission {target, zone?, duration turn|permanent, cost?, ignoreCost?, player?,
    once?}`; turn grants lapse by `grantedOnTurn`) + standing ones derived on read (`hasPlayFromTrashGrant` board static →
    `static-board`; `self-trash-play.ts getSelfTrashPlayCost` → `static-self`); `collectPlayPermissions/permissionsForCard`.
    Move `moves/play/play-from-zone.ts playFromZone {cardId, permissionId?}` (harness `p1.playFrom(card, {answers})`,
    verb `playFrom`) enumerates runtime + non-trash permissions (static trash ones are still served by playUnit/playSpell/
    playGear's own trash handling), gates timing like the card type, and plays via `beginPlay(via:"permission", immediate)`.
  - Tests: `core-rules/play-pipeline.test.ts` (via × costMode matrix, 337.1.b two pending plays), `core-rules/play-permissions.test.ts`.
    HARNESS: an effect play now asks, in order: [pick the card] → destination (only if ≥2 legal) → [mandatory cost object] →
    [yes/no optional cost, only when payable] — answer with `pick()/yes()/no()` or `{answers:[…]}` on the triggering verb.

## 11. Parser quick map (`C/parser/`)
- `index.ts parseAbilities` → `impl/normalize.ts normalizeTokens/stripReminders` (`[2]`→`:rb_energy_2:`, `[fury]`→
  `:rb_rune_fury:`, `[Exhaust]`→`:rb_exhaust:`) → `impl/gated.ts` ([Level N], [Empowered]) → single-ability fast path, else
  `impl/segments.ts splitAbilityText` / `impl/split.ts splitOnThen, splitSentences` per segment.
- Segment kinds: keywords `impl/keywords.ts parseKeywordSegment` (+`KEYWORD_TRIGGER_EVENTS`, `expandHuntKeywords`);
  triggered `impl/triggers.ts` + `impl/trigger-patterns.ts TRIGGER_PATTERNS`; activated `impl/activated.ts` ("COST: effect",
  `impl/costs.ts`); spells `impl/spells.ts parseSpellAbility / parseSpellWithRepeat / parseSpellCostRiders`; statics
  `parsers/static-parser.ts parseStaticAbility` ("While …", "I have …", "Your X have …", cost reductions, restrictions,
  enter-ready); replacement / additional cost `impl/replacement.ts`; fallback `impl/other-segment.ts` (emits `raw`).
- Effect text: `impl/effects.ts parseEffects` (sequences; `impl/effects-conditional.ts` if-you-do / if-else / choice;
  `impl/effects-sequence.ts` "and" compounds + pendingValue) → `impl/effect.ts parseEffect` dispatch:
  damage/kill/fight/prevent `effects-damage.ts` · buff/±might/heal/double/spend-buff `effects-might.ts` ·
  draw/discard/look/predict/recycle `effects-draw.ts` · ready/exhaust/stun `effects-exhaust.ts` · move `effects-move.ts`
  (+`parsers/effect-parser.ts parseMoveEffect/parseRecallEffect`) · recall/return/banish `effects-return.ts` · tokens
  `effects-tokens.ts` · take-control/counter/extra-turn `effects-control.ts` · add/channel/xp/score/empower
  `effects-resources.ts` · grant keyword `effects-grant-keyword.ts` · attach/detach `effects-attach.ts` · play / next-spell
  riders `effects-misc.ts`. Targets `parsers/target-parser.ts`, `impl/targets.ts`; conditions `parsers/condition-parser.ts`.
- Tests: `C/parser/__tests__/{effects,triggers,static,keywords,costs,spells,activated,locations,special,tribal}/*.test.ts`,
  idiom `expect(parseAbilities(txt).abilities?.[0]).toEqual(expect.objectContaining({...}))`;
  run `bun test packages/riftbound-cards/src/parser/__tests__/`. `C/__tests__/parser-coverage.test.ts` and
  `abilities-coverage.test.ts` must stay green (land.sh runs the parser suite).
- RULE: ONE card needs it → explicit `abilities: Ability[]` in `C/cards/<set>/<slug>.ts` (`import type { Ability } from
  "@tcg/riftbound-types"`; model: `cards/ogn/party-favors.ts`). ≥3 cards share the phrasing → fix the parser + parser test.
  VEN cards have no .ts — patch `data/sets/ven.json` `abilities` or add an override.

## 12. Harness idioms (full table: `E/__tests__/cards/README.md`)
- Build: `await scenario().active(P1).resources(P1,{energy:2,power:{fury:1}}).battlefield("bf1",{controller:P2})
  .unit(P2,"bf1",{might:3},"foe").hand(P1,CARD,"c").build()` — declare battlefields before placing units; aliases become
  instance ids; inline `{might, keywords, name}` = vanilla; trailing `meta` `{damage, exhausted, buffed, stunned}`;
  `.legend/.gear/.trash/.deckTop/.facedown/.runes/.points/.xp/.script(P2,["decline"])`.
- Act (async, throw when illegal): `p1.cast("c",{targets:"foe"|["a","b"], x, repeat, payOptional})`,
  `play("u",{to:"bf1", accelerate:true, sacrifice:"ally"})`, `activate("gear",0,{answers:["x"]})`, `move("u","bf1")`,
  `endTurn()`, `game.advanceTurn()`; `await game.settle()` passes priority/focus, runs combat, consumes scripts and stops at
  an unanswered prompt → `p1.pick("x") / yes() / no() / decline() / chooseMode(1) / order([...]) / pick("a","b")` (multi);
  inspect `game.decision()`, `game.actingSeat()`. Replacement prompts have `timing:"RPL"` (372: pick which source applies
  first; 373: pick which dying card a single-use shield saves); a `{kind:"order", defaultable:true}` decision is the
  383.3.d soft trigger-order offer — answer with `seat.order([...])` or ignore it (any verb / `settle()` /
  `game.acceptTriggerOrder()` keeps the listed order); a 355.11.b subset re-pick is a `pick` with `semantics:"subset"`, min 0.
- Legality: `p1.can("cast","c")`, `p1.legal()`, `p1.option("cast","c")?.fields.find(f=>f.name==="targets")?.options`
  (the `targetsOffered` helper), `await p1.try(p=>p.cast(…))` → `{ok:false,error}`.
- Read: `game.state(id)` → `might, baseMight, damage, isExhausted, isStunned, isBuffed, isToken, keywords, grantedKeywords,
  controller, owner, meta`; `game.zoneOf / locationOf`; `p1.hand() / units("bf1") / energy() / power("fury") / points()`;
  `game.chain()`; `game.gameState.battlefields.bf1.{controller,contested}`; `game.violations()`.
- BUG flip: failing clauses are `test.failing("BUG: …")`. When your fix makes one pass bun prints
  `this test is marked as failing but it passed` → change to `test(` (keep assertions, drop the expected/actual comment).
- Queue CLI: `bun .claude/fix-queue/fix-queue.ts done <id> --note "…" --files a,b` · `fail <id> --note "…"` ·
  `release <id>` · `list claimed`. `bash .claude/fix-queue/land.sh <label> "<msg>"` = engine + parser suites, tracer, commit, push.

## 13. Ten most common bug → fix shapes
1. Target offered too broadly/narrowly (base units for "at a battlefield", enemies for "friendly", self for "another") →
   parsed target lacks `location/controller/excludeSelf/filter`; explicit abilities `{type:"unit", controller:"enemy",
   location:"battlefield"}` or parser pattern; new filter kinds must be added to `target-resolver.ts matchesFilter`.
2. "ALL X get …" touches one unit / prompts for a target → missing `quantity:"all"` (resolver takes the first candidate);
   inverse: a "choose" resolving silently → `quantity` wrongly `"all"`, or exactly one legal option was auto-bound in `resolve.ts`.
3. Trigger never fires → event not emitted at that path (`draw/heal/channel-rune/win-combat` have no emitter; combat deaths
   go through `dispatchUnitDied`), or `on`/`event`/`restrictions` string unhandled in `trigger-matcher.ts` (⇒ false), or the
   event lacks the owner/actor field, or the test never `settle()`d the chain.
4. Static needs a chain / stale after scoring or at scenario start → missing `recalculateStaticEffects` after that mutation
   (fixed once in flow beginning after hold scoring); dynamic "for each" amounts and `minimum` live in `applyStaticEffect`.
5. Castable/not castable in showdown or opponent's turn → spell timing comes from printed `[Action]/[Reaction]`
   (`enrich-cards.ts normalizeSpellTiming` + `chain-state.ts isLegalTiming`); abilities default to action timing in
   `activate-ability.ts`; there is no Focus-holder gate in `play-spell.ts` yet.
6. Additional/optional cost not offered, free, or skippable when mandatory → shape unknown to `cost.ts getOptionalPlayCost`;
   Accelerate's extra pip must reach `canAffordCard` as `extras.additionalCost`; payoff reads `paid-additional-cost`.
7. Cost reduction wrong → board static matching/minimum in `static-cost-reduction.ts`; self text in
   `getSelfScaledEnergyReduction`; one-shot `meta.costModifier`; floor at 0 (or card's stated minimum).
8. Unit survives/dies wrongly in combat → Assault/Shield raise own threshold only in role (`combat-resolver.ts lethalThreshold`);
   stunned should deal 0; damage == might is lethal; ALL damage goes through `operations/deal-damage.ts dealDamage` (a
   Double / Prevent / redirect / immunity mismatch between spell and combat damage is a choke-point bug, §3 DAMAGE).
9. Deathknell / "when a unit dies" / die-replacement skipped → the removal used raw `moveCard` to trash (Temporary in flow
   beginning, sacrifice costs in `play-unit.ts` / `activate-ability.ts`) instead of `effects/kill.ts`-style kill + `die`
   event or lethal damage + `cleanupAndFireDeaths`. SBA replacements already run the effect with the dying unit as `trigger-source`.
10. Wrong player acts/benefits ("its controller draws 2", "each other player chooses", "they discard") → handler must honour
    `effect.player` (`draw.ts` `each`, `discard.ts` `opponent`, `choice.ts` chooser/`controllerId`) or condition
    `target-controller`; controller vs owner: `getCardController ?? getCardOwner`.

## 14. Rewind (undo/redo) invariants — read before adding engine state
- `RuleEngine.undo()/redo()` (core `rule-engine.ts`) restore an `EngineCheckpoint`: `currentState`, `internalState`
  (zones/cards/metas — restored IN PLACE, never by reference swap: FlowManager ops close over that object), the flow
  machine (`FlowManager.serializeFlowState/restoreFlowState`), the RNG cursor (`SeededRNG.getState/setState`), the
  `TrackerSystem`, `gameEnded/gameEndResult`, and `GameDefinition.historyExtension` (Riftbound: the global
  `CardDefinitionRegistry.snapshotRuntime/restoreRuntime` — instance registrations + copy layers).
- THEREFORE: any NEW mutable engine state MUST live in one of those places — `draft` (game state), `internalState`
  (via ctx.zones/cards/counters), card meta, the flow, the rng, trackers, or the registry runtime layer. A module-level
  `let`, a WeakMap keyed by engine, a field on a move/effect module, `Math.random`, `Date.now()`-derived ids: all break
  "undo ⇒ identical position / redo ⇒ identical position" (spec: `E/__tests__/core-rules/undo-redo.test.ts`, a
  32-game property test that hashes state+internal+flow+rng+trackers+registry around EVERY move). If you truly need
  out-of-engine state, extend `historyExtension` in `E/game-definition/definition.ts`.
- Undo granularity = undo GROUP: `harness/turn-driver.ts applyMove` wraps "move + endTurn rotation + auto procedures"
  in `engine.withUndoGroup`; drivers must keep sequencing through `applyMove` (server: `applySessionMove`). Anything a
  driver does to the engine OUTSIDE executeMove (flow.setCurrentPlayer, applyPatches, replaceCurrentState) must
  happen inside the same `withUndoGroup` so the group's before/after checkpoints include it.
- `getReplayHistory()` is the APPLIED prefix (rewound entries are hidden until redone); entries carry `group` and a
  never-reused `serial` — key side data to `index~serial` (server `anchorKeyAfterLastMove`), not to the bare index.
- Server: ONE path `apps/riftbound-app/server/rewind.ts rewindSession` (WS + REST); Goldfish actions are skipped,
  Claude seat debounced + stale decisions dropped (`rewindEpoch`). Harness: `game.undo()/redo()/canUndo()/canRedo()/
  snapshotHash()` (EngineBackend; sandbox semantics, not transcript steps).

## Efficiency rules
- Read the 2–4 relevant files named above in ONE Read/cat call; no grep→sed chains, no `ls`/`find` of the tree.
- Dump the enriched abilities JSON (§1) before touching engine code — it decides card-def vs parser vs engine in seconds.
- Iterate with `bun test <that card's test file>` only; the full engine+parser suites run in `land.sh` at the end.
- Flip `test.failing` → `test` for EVERY BUG your change makes pass, across all files:
  `bun test packages/riftbound-engine/src/__tests__/cards 2>&1 | grep -B3 'marked as failing but it passed'`.
- Scratch files only under `packages/riftbound-engine/src/__tests__/cards/do_not_commit/`.
- Never revert/reformat other lanes' in-flight edits; keep condition↔enumerator and `canAffordCard`↔`deductCost` pairs in sync.

## Held-out data
`packages/riftbound-cards/src/data/rulings/test.json` (and the test-split entries inside all-rulings.json) are a HELD-OUT benchmark. Never read them, never write tests from them, never use them to motivate an engine change. Discovery/writers use train.json only.

## Known DESIGN deviations (do not "fix" the engine toward the rule; rewrite the test to the design with a `// DESIGN (DESIGN.md §…)` comment)
- **Unpayable optional trigger cost** (rule 404.2 says remove silently): DESIGN.md §Paying costs = manual pay → the yes/no IS shown with `canAccept:false` + reason so the player can tap runes and then accept; harness passivePolicy auto-declines it. Tests asserting "no prompt when the cost can't currently be paid" must be rewritten to: prompt offered, canAccept false, 'no'/settle removes the item with nothing paid. EXCEPTION: when a mandatory TARGET/OBJECT set is empty (nothing to kill/return/choose) the item IS removed silently (402.4) — that is not a payment question.
- **383.3.d same-controller trigger order**: SOFT prompt (stack popup); tests must not require settle() to stop on it.
- **Bo1 battlefield**: random in duel mode, manual in sandbox.
- **Battlefield control presence shortcut** (DESIGN.md § Battlefield control): in a Neutral Open Cleanup, an uncontested
  battlefield whose recorded controller has no unit there and where exactly one OTHER player has units is conquered by that
  player at once (no staged showdown) — the state only comes from seeded boards / simultaneous swaps.
- **Ruling vs Core Rules conflicts** (riftjudge data is community-sourced; some entries are self-flagged unverified): when a ruling test contradicts an explicit Core Rule AND an existing green core-rules/ruling test, do NOT flip the engine back and forth — cite both, keep the Core Rule behaviour, rewrite the ruling test's facet to the rule with `// RULING-CONFLICT: riftjudge <id> says X; CR <rule> says Y — engine follows CR`, and note it in your resolution. If two riftjudge rulings disagree with each other, same treatment. Only when the ruling clarifies something the CR leaves open does the ruling win.
- **File-level embargo**: `.claude/fix-queue/embargo-files.txt` lines `owner<TAB>regex`; `land-patch.sh` refuses patches touching matching files unless your land LABEL starts with `owner` (you'll see `embargoed_file=…` `committed=false`). If you hit it: DROP that file from your land list and land the rest (or mark the item failed with note "embargoed files (owner package)"). NEVER `git checkout -- <file>` / `git restore` / `git stash` ANY file in the shared working tree — other lanes' and package owners' uncommitted work lives there; reverting a shared file destroys it. The only sanctioned way to 'undo' your own hunk is to edit it back by hand.
- **Multi-execution / multi-instance damage vs replacements (rulings 87d4521a, 501859c8, 3afdd260, 6482271b):** DAMAGE-time replacements and prevention (The Boss 'would be dealt lethal damage', Counter Strike/'next time … prevent', Shield-style) apply PER damage instance/execution as it happens. DEATH ('if this would die' — Zhonya's Hourglass, Guardian Angel, Soraka) is a Cleanup event: no death check runs between [Repeat] executions or between instances of one resolving spell; lethal-damaged units die (and would-die replacements are consulted ONCE) in the single Cleanup after the item leaves the chain. Costs paid mid-resolution that make a unit lethal likewise wait for that Cleanup — EXCEPT where a rule inserts a Cleanup (319.x). Don't 'fix' one ruling by breaking the other class.
- **Land lock etiquette**: call `land-patch.sh` ONCE and let its own `flock -w 1800` wait; on `reason=lock_timeout` call it once more. Do NOT write polling loops / background scripts that repeatedly try the lock — they starve fair waiters. Package lands may be given priority via `.claude/fix-queue/.land.priority` (coordinator-managed); your call will simply wait a bit longer.
- **Coordinator note — editing land-patch.sh**: never edit it in place while lands are queued (bash reads scripts incrementally by byte offset; a running instance that holds the lock can fall into newly inserted lines). Write to a temp file and `mv` it over (new inode) so running instances keep the old text.
- **Same-file contention with another LIVE lane** (their uncommitted hunk in a shared file breaks your land, or vice versa): never edit/revert their hunk. Build YOUR version of that file (`git show HEAD:<path>` + only your hunk) under `do_not_commit/<you>-src/<same relative path>` and land with `LAND_SRC_DIR=$PWD/do_not_commit/<you>-src bash .claude/fix-queue/land-patch.sh …` — the gate takes that file from your override dir (`src_override=` in the output) and the rest from the shared tree. After your commit the shared file's diff vs HEAD is exactly the other lane's hunk.
- **/tmp is a 32 GB tmpfs shared by everyone**: keep scratch under do_not_commit/ in the repo when it's big; browser traces go under /tmp/playtest-traces/<pass>/ (auto-pruned after a day); per-worker /tmp/w<N>i<N>* dirs are swept after 12h — don't rely on them persisting.
- **Keep the shared tree PARSEABLE at all times.** Everyone runs `bun test` against the same working tree, so a half-written engine file (an unbalanced paren, an unterminated string) breaks EVERY lane, not just yours. After each edit to a file you are actively restructuring, run `bun -e 'import("./<path>")'` (fast, no tests) before doing anything else; if you must leave a file mid-refactor for more than a moment, leave it syntactically valid. If your own tests suddenly fail to parse in a file you did not touch, don't "fix" it — SendMessage the owner (or main) and keep working elsewhere.
- **Do NOT revert `soleOption` prompting (50d33ab).** A choice with exactly one legal option is prompted on purpose (rule 355.10.d.2, and the user asked for it explicitly: "don't short-circuit choices"). If sole-option prompts break a test you are fixing, the test is what changes: build the scenario with `.interactive()` when it asserts the prompt, or answer/confirm the prompt in the driver; non-interactive drivers (EngineBackend) already auto-confirm. The three files that implement it (`moves/chain/resolve.ts`, `moves/pending-choice.ts`, `harness/decision.ts`) are coordinator-embargoed — a land touching them is refused unless the label starts with `coordinator`; ask main instead of working around it.
- **Rebase your file copies onto HEAD before landing.** `land-patch.sh` copies WHOLE files, so if you captured your base hours ago and another lane has since landed in the same file, your land silently reverts theirs — no test catches it when the loss is a doc or an uncovered path (this nearly cost us the sole-option feature, and did delete a primer guardrail). The gate now refuses such a land with `stale_base=<file> (drops <sha>)`; when you see it, re-apply your hunks on top of `git show HEAD:<path>` and land again. `LAND_ALLOW_STALE=1` exists only for a revert you actually intend. Same discipline applies to `LAND_SRC_DIR` overrides — build the override dir from HEAD, not from your old worktree.
- **A sequence spell's play-time target cap is a trap.** If you are tempted to cap `supplied.length > 1 + reqRepeatCount` in `play-spell.ts` whenever `findSequenceLeadTarget` returns something (the Deathgrip / sfd-163-221 shape), don't: it fires for ANY sequence spell whose lead target lives on a sub-effect, so Icathian Rain (ogn-248-298 — six independent "Deal 2 to a unit" instructions) stops being castable with `CONDITION_FAILED`, taking ~30 files with it (~398 tests). Gate the cap on the sequence actually having a SINGLE play-time slot — count the play-time target descriptors among the sub-effects — and leave multi-instruction shapes to the ogn-206-298 / 355.8 path below it. Fast check while iterating: `bun test packages/riftbound-engine/src/__tests__/cards/interactions/bullet-time-one-event-vs-icathian-six.test.ts` fails instantly with the bad cap. A previous attempt measured itself green only because the shared tree carried another lane's uncommitted hunk that masked the regression — verify with the full sharded suite in a clean worktree, never one file in the shared tree.

### Model: "you may name this, but you cannot pay for it yet" (one vocabulary, four speakers)

Four surfaces now express the same idea and MUST share one vocabulary rather than growing dialects: `PickOption.surcharge`/`.needsAdd` (per prompt option, 43bb893), `ActionField.surcharge[]`/`.unaffordable[]`/`.needsAdd` (per option-value on a play's field, index-aligned with `options`, 621ec54), `ActionDecision.reachablePlays[]` (whole-card), and any future choice-plan entry. Rules for extending it:

- Reuse the `needsAdd` shape verbatim — `{energy?, power?: Record<Domain, number>, reason}` — importing the type from `harness/types.ts` instead of redeclaring it, so a client that dims one surface dims the next with no new code. Build `reason` with `decision.ts describeShortfall`, never a hand-rolled string: the app renders these side by side.
- Never write a second cost model. Reachability comes from `cost.ts reachableRuneAdds`, the pay line from `cost.ts playCostShortfall` (the same `computePlayResourceCost` the play will charge), what an Add produces from `prompt-cost.ts addYieldOfAbility`, and what the board can still add from `reactionAddsOnBoard`. A parallel calculation drifts, and the drift appears as a card the UI offers and the reducer refuses.
- Derive the unaffordable set as (raw enumeration − valid enumeration) wherever the enumerator can express the candidate — that is why `surchargedPlayTargetsOf` and `reachablePlaysOf` cannot disagree with `condition`. Re-price only when the enumerator cannot represent the candidate at all.
- Keep `payableNow` distinct from `reachable`: 402.2 auto-bind may only ever use `payableNow`. Collapsing them lets a sole-option auto-bind silently commit a payment.

Three invariants, each of which was broken and backed out during the work that built this:
1. **Enumerators credit reachable Adds; conditions never do.** That split *is* manual pay. Crediting an opt-in gate made "'yes' is refused while the pool is short" start accepting with the cost unpaid.
2. **Listing is not offering a shortcut.** A listed-but-unpayable entry must leave state byte-identical when answered — the refusal is the feature.
3. **Do not filter the offer list down to "Adds that can pay what is owed."** It contradicts ruling e2a35c364b15734f (floating energy while paying Power Nexus is explicitly legal) and rule 594 (a tapped rune still recycles), so a "useless" Add is never a one-way door. Price what an Add produces to decide REACHABILITY, never legality.

Finally, 429.4 earmarked Adds (Daughter of the Void, "use only to play spells") are excluded from reachability while staying legal to activate — go through `addYieldOfEffect` (it returns undefined for them) rather than reading `add-resource` directly.
- **Run a long land inside tmux.** Lands launched as background jobs from an agent session get reaped mid-flight (`nohup`, `setsid` and harness-managed background all behave the same), which looks exactly like a land that silently did nothing. `tmux new-session -d -s land<label> '<the land command> 2>&1 | tee /tmp/land-<label>.log'` then poll the log. A land that "produced no verdict" is almost always this, not a gate failure — check for the commit with `git log --oneline -3` before re-running, or you will land twice.
- **A brand-new file must reach the gate, not just the override dir.** `LAND_SRC_DIR` supplies the BYTES for a file, but the gate also has to recognise the path; a file that exists nowhere but the override dir used to be dropped from the land silently (it shipped a feature without its test once). The gate now prints `dropped_files=…` when a path matches nothing — never ignore that line.
- **If you retry a land, kill the earlier attempt the moment one commits.** Attempts queue on the shared flock, so a retry you thought was dead can wake up behind the winner and land the same change twice. After a `committed=true`, `tmux kill-session` (or kill the pid) for every other attempt of yours, then confirm with `git log --oneline -3` that exactly one commit exists.
- **Benchmarks and any "is the engine correct?" measurement must run against a clean worktree at committed HEAD, never the shared tree.** Other lanes keep in-flight — sometimes temporarily broken — edits in the shared working tree, so a measurement taken there both understates the result and invents failures: an RJ-4 run reported Icathian Rain uncastable and cited the repo's own committed tests as failing, while the same test passed 9/9 at HEAD in an isolated worktree. `riftbound-heldout-eval.js` now creates/refreshes `/tmp/rb-eval-head` pinned to HEAD and refuses to fall back. Apply the same rule to any ad-hoc verification you do before reporting a bug: reproduce it at HEAD (`git -C /tmp/... worktree add --detach`) before believing it.
- **Landing from a side dir leaves the shared tree shadowing HEAD — the gate now refreshes it for you.** After a successful land, `land-patch.sh` copies the new HEAD content over the shared working copy of every landed file whose shared copy still matched the PRE-land blob (i.e. nobody has local edits in it) and prints `refreshed_shared=<file>`; files carrying live hunks are left alone. This closes the outage class where a lane lands via `LAND_SRC_DIR`, the shared tree keeps the pre-land copy, a later commit adds an export to that file, and suddenly NOTHING under `packages/` can be imported (`SyntaxError: export 'X' not found`) — which cost the fleet ~40 minutes of blocked test runs today. If you still hit it: the broken file is the one whose shared copy is behind HEAD, and `git show HEAD:<path> > <path>` fixes it ONLY when the shared copy adds nothing of its own (`git diff HEAD -- <path> | grep -c '^+[^+]'` is 0). Otherwise it is someone's live work — message them, never clobber it.
- **Package lanes: work in your OWN detached worktree, not the shared tree.** `git worktree add --detach /tmp/rb-<yourlabel> HEAD`, edit there, verify there, and land with `LAND_SRC_DIR=/tmp/rb-<yourlabel>`. A half-finished refactor in the shared tree is a fleet-wide outage — one lane mid-move of helpers between `cost.ts` / `decision.ts` / `resolution-guard.ts` left the tree non-importing for ~40 minutes and blocked five test lanes, who could do nothing but poll. In your own worktree the same half-finished state costs nobody anything. Test-writing lanes may keep using the shared tree, but if it stops importing, move to a detached worktree at HEAD and carry on rather than waiting.
- **Sideboard cap is 10, not 8 — settled by the product owner.** Judge ruling a3c318ad00df797c quotes Tournament Rule 601.1.c.1 capping the sideboard at 8; the product owner explicitly changed it ("deckbuilding limits to 8 sideboard but the rules are changed to allow 10"), so `DECK_RULES.sideboardMax = 10` / `MAX_SIDEBOARD_SIZE = 10` are INTENTIONAL and the tournament rule is superseded. Do not "fix" the constant back to 8, and do not file a facet against it — `cards/rulings/sideboard-limit-a3c318ad00df797c.test.ts` records the decision. Related standing decision: the app deliberately ACCEPTS illegal decks (wrong counts, 0 or 2 legends, mismatched sets) so cards can be tested; legality is advisory, surfaced as a warning, never a hard block.
- **Verify a cited rule id against the shipped corpus before filing a defect.** A ruling that cites "601.1.c.1" cost two lanes real time because the *Tournament* rules and the *Core* rules both have a 601.1.c.1 and only the Core rules ship here (ours is about countering, not sideboards). Grep the references for the id AND for the concept — if the concept appears nowhere in `.claude/skills/riftbound-rules/` (as "sideboard" does not), it is a POLICY question, not a rules bug. And an explicit "the product owner directed this" comment in source marks the TARGET state: encode the override as a settled `RULING-CONFLICT`, never file it as a defect.
- **A check that reports green while silently doing less work than it looks like is not evidence — make the work count visible.** Emit `scanned=N` (files, ids, tests) alongside any all-clear and treat `scanned=0` as a FAILURE, not a pass. Real instances from one day: a sweep whose loop ran once over a whole id string and printed one misleading line; a detector that printed nothing when clean, indistinguishable from zero iterations; and a 137-test green run that said nothing about broken imports because it never pulled those modules into its import graph. Narrow shell note behind the first one: zsh does not word-split unquoted PARAMETER expansions (`for x in $IDS` → one iteration) but DOES split command substitution (`for f in $(git ...)` is fine) — use `${=IDS}`, an array, or `bash -c` only for the `$VAR` form.
- **This app is HOSTED — keep it compatible with the `research-app-seams` branch.** An internal research app runs this app as a confined child via env-var seams (`RB_LISTEN_UNIX`, `RB_BIND_HOST`, `RB_TRUST_PROXY_AUTH`, `RB_PROXY_SECRET`, `RB_STATIC_DIR`, `RB_SETS_DIR`, `RB_IMAGES_DIR`, `RB_LOG_DIR`, `RIFTBOUND_DB_PATH`, `RIFTBOUND_RULES_DB`, `SANDBOX_ENABLED`, and `ANTHROPIC_BASE_URL`/`ANTHROPIC_UNIX_SOCKET`/`ANTHROPIC_AUTH_TOKEN` for relay-only model access). Most are implemented on that branch, which merges ours in periodically — so when you touch `apps/riftbound-app/server/**`: never make a path, port or credential LESS overridable than it is today, never hard-code an absolute path, never add outbound network access outside the relay, and prefer `process.env.X ?? <default>` to a bare constant. Their branch edits `config.ts`, `http.ts`, `routes-static.ts` and `log.ts` most — flag it in your commit message if you restructure those. Full contract, current merge status and conflict-resolution guidance: `docs/harness/RESEARCH-APP-SEAMS-COMPAT.md`.
- **"The engine reproduces clean" does not close a user-visible report.** Reproducing at a clean HEAD worktree is the right test for an ENGINE claim, but the app layer can produce the identical symptom while the engine is provably correct — and then no unit scenario will ever reproduce it, because every test calls the engine directly. Real case: "at 0 pooled Energy the whole hand is inert" was NOT an engine bug (the engine listed the plays correctly), it was `server/turn.ts sandboxAutoPlay` broadcasting ONE seat-less snapshot (`buildGameSnapshot(session)` with no `viewingPlayer`), so the per-seat fields were gated off in the last frame the human held — one tap produced a per-seat frame and the hand lit up. When a report comes from a browser, reproduce it THROUGH THE SAME SURFACE the reporter used (the WS frame, the REST snapshot) before declaring it unreproducible, and instrument the server path rather than only the engine.
- **A snapshot broadcast to more than one client must be built per seat.** `buildGameSnapshot(session, viewer)` redacts by viewer; the seat-less shape is the spectator/unredacted view and has already leaked facedown card identities to the opponent once. Any code path that builds one frame and sends it to everyone is both a redaction bug and a missing-per-seat-fields bug (`reachablePlays`, `unaffordableTargets` are gated on `viewingPlayer !== undefined`). The same applies to REST: a seat-scoped endpoint must validate the requested `playerId` against session ownership and fall back to the redacted spectator view on mismatch — never the full state.
- **Land with `land-when-free.sh`, not by parking inside the lock.** An agent session's child processes are reaped after roughly ten minutes. With the queue committing every few minutes, a land launched into a BUSY lock spends its entire budget inside `flock -w 1800` and is killed before the suite even starts — it looks exactly like a land that silently did nothing, and several lanes lost hours to it (tmux does not save you; the tmux server gets killed too). Use `bash .claude/fix-queue/land-when-free.sh <label> "<msg>" <files...>`: it polls cheaply until the lock is free and only then execs `land-patch.sh`, so the expensive part starts inside your window. Same arguments, same output lines. If a land reports nothing at all, check `git log --oneline -3` before re-running — and kill any earlier attempt the moment one commits, or a queued retry lands the same change twice.
- **Build a verification worktree from an EXPLICIT file list, never from `git status`.** Copying every dirty file out of the shared tree drags other lanes' in-flight (often deliberately red) tests into your run — one lane saw 74 "failures" that were not its own and nearly chased them. Start from `git show HEAD:<path>` for each file you actually changed, and copy in only those. The corollary is the same as everywhere else in this document: the shared tree is not a coherent snapshot, so never let it define the scope of anything you measure.
- **A land that changes server or engine code must bounce the devbox; a client-only land need not.** Files under `public/` are read from disk per request, so they are live as soon as the rsync completes. Anything under `packages/` or `apps/riftbound-app/server/` only takes effect on restart — so the gate no longer rate-limits those bounces, and if a browser pass holds the lock it prints `bounce_owed=` and drops `/tmp/rb-bounce-owed`. If you see that line, bounce the box yourself once the pass finishes (`ssh emaynard-tcg 'kill $(cat /tmp/app.pid)'`, then confirm `/play` is 200) — otherwise a fresh client is talking to a stale server, which looks exactly like a bug in whatever you just landed.
- **Yield markers now self-heal — and a "lock never free" report usually is not the lock.** `land-patch.sh` sweeps `.land.fast-waiting.<pid>` markers at the TOP of the run, before the yield decision: anything older than `LAND_MARKER_TTL` (20 min default) is removed regardless of PID, and a same-container marker whose PID is dead goes immediately, printing `reaped_stale_marker=`. Age is the sound test because `kill -0` is namespace-local — a marker written by another container can never be verified alive from yours. Why this matters: eight orphans left by a container restart made EVERY ordinary land yield 15s × 60 before it even contended for the lock, so lands appeared to hang while HEAD kept advancing. If your land seems stuck, check for markers first (`ls .claude/fix-queue/.land.fast-waiting.*`) — `land-when-free.sh` will not save you there, because it waits on the LOCK while the yield loop lives inside land-patch.
