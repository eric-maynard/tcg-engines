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
- Resolution-time choice for triggered/activated effects: `moves/chain/resolve.ts executeResolvedItem` raises a
  `choose-target` pendingChoice when ≥2 options, auto-binds when exactly 1, lifts sequence lead targets.
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
- `effects/choice.ts` — ≥2 `options` ⇒ `choose-mode` pendingChoice (`player:"opponent"` ⇒ opponent picks, `controllerId` resolves).
- PendingChoice kinds (`E/types/game-state.ts PendingChoice`): `reveal-and-pick` (discard.ts, look.ts, reveal-hand.ts,
  recycle.ts, predict.ts; carries `then`), `choose-target` (resolve.ts, damage.ts split), `choose-destination` (move.ts,
  create-token.ts), `choose-mode` (choice.ts), `opt-in` (resolve.ts), `name-card`, `weaponmaster-equip` (play-unit.ts).
  All answered by move `resolvePendingChoice` in `E/game-definition/moves/pending-choice.ts` (`isValidPendingPick`,
  `pickDefaultForChoice`, one reducer branch per `choice.type`, then `postChoiceCleanup`; `choice.then` executed at the tail).
  While `draft.pendingChoice` is set every other move's `condition` returns false.
- Damage → death: `effects/damage.ts` writes `meta.damage` (+ `lastDamagedBy/lastDamageSource`), consults replacements;
  the kill happens in `E/cleanup/state-based-checks.ts performCleanup` (damage ≥ effective Might) and `die` is emitted by
  `E/events/dispatcher.ts dispatchUnitDied`. `effects/kill.ts` trashes + fires `die` itself (with `killedBy/killSource/wasStunned`).
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
    `E/game-definition/flow/riftbound-flow.ts` (`awaken/beginning/main/ending.onBegin`, ctx from `buildFlowTriggerContext` — no-op counters!).
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
  `add-resource` effects and `ctx.resolveInline` run immediately. `optional:true` ⇒ `opt-in` prompt at resolution.
  `GRANTED_KEYWORD_TRIGGERS` synthesises Vision for granted keywords. `play-self` also triggers a static recalc here.
- Parser: `C/parser/impl/trigger-patterns.ts TRIGGER_PATTERNS` (regex → `{event, on, restrictions}`), `impl/triggers.ts
  parseTriggeredAbility` (leading/trailing "if" → `condition` via `parsers/condition-parser.ts`), `impl/keywords.ts
  KEYWORD_TRIGGER_EVENTS` (Deathknell→`die`, Vision→`play-self`) + `expandHuntKeywords`.
Recipe — trigger never fires: 1) dump abilities: need `{type:"triggered", trigger:{event,on}, effect}`; else parser/explicit.
2) Is `event` emitted (list above)? If not: add `fireTriggers` at the site and the shape to `GameEvent`/`EVENT_MAP`.
3) Does `on` hit a handled branch AND does the event carry the owner/actor field that branch reads (`owner`, `playerId`,
   `movedBy`, `killedBy`, `chooserId`)? Else extend `triggerMatchesEvent`. 4) `restrictions`/`condition` type returning false?
5) Triggered items sit on the chain — the test must `settle()`; `optional` ones need `yes()`.
Recipe — "first/only once each turn": implement in `restrictionSatisfied` with a per-card counter on the draft (pattern:
`draft.turnEvents` written in `fireTriggers`; clear it in flow `ending.onBegin`).
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
  (turn ones expire in flow `ending.onBegin`); statics use `duration:"static"`. Readers: `registry.hasKeyword` = printed only;
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
Recipe — keyword ignored in combat: CombatUnit build in `resolve-full-combat.ts` → `combat-resolver.ts` usage.
Recipe — timing wrong: spell → card `rulesText`/`normalizeSpellTiming`; ability → `activate-ability.ts` timing block
(both `condition` and `enumerator` copies); move → that move's `condition` turn-state check.

## 7. Costs
- `E/game-definition/moves/play/cost.ts canAffordCard(state, player, card, extras, getMeta)` and `deductCost` — KEEP IN SYNC.
  `extras: {additionalCost, xAmount, repeatCount, targets, chosenTargetId, viaFlow, board}`. Steps: base
  `registry.getCostToDeduct` (or Flow cost `getBaseCostForPlay`), `meta.costModifier` (`getCostModifier`; written by
  `effects/cost-reduction.ts` / `cost-increase.ts`), interactive target-Might reduction, board statics `getBoardCostReduction`
  → `static-cost-reduction.ts computeStaticCostReduction`, self static `getSelfScaledEnergyReduction`, X, Repeat
  (`getEffectiveSpellRepeatCost`, `getRepeatEnergySurcharge`, `getRepeatPowerSurcharge`), Deflect (`getDeflectSurcharge`:
  any-domain power, opponents' targets only, printed + granted).
- Power rules: a `"rainbow"` pip is payable from any domain; pooled `power.rainbow` covers any named-domain shortfall;
  multi-domain cards' pips are hybrid (`getHybridPipDomains`); energy reducers never waive power pips (`reducePowerCost` only).
- `getOptionalPlayCost(cardId)` recognises ONLY: keyword Accelerate `{cost}` (kind `accelerate`); `{type:"static"|
  "additional-cost-option", cost:{kill:Target}}` (kind `kill`, param `sacrificeId`); `{type:"static", effect:{type:
  "additional-cost-option", additionalCost:":rb_energy_N::rb_rune_fury:"|{energy,power,xp}, ifPaid}}` (kind `pay`).
  Discard / exhaust-a-unit / spend-buff / kill-any-number costs are unrecognised → add a kind here and handle it in
  `play-unit.ts` (enumerator variants with `paidAdditionalCost`, reducer `resolvePayableOptionalCost`/sacrifice block) and
  `play-spell.ts` (params `paidAdditionalCost`; `draft.additionalCostsPaid[cardId]` feeds condition `paid-additional-cost`).
  Mandatory additional cost ⇒ enumerate only the paid variant and reject unpaid in `condition`.
- Activated costs: `moves/chain/activate-ability.ts` condition checks energy, power (`chain/effect-context.ts canAffordPower`),
  xp, exhaust, `discard` (param `discardId`), `recycle` (`recycleIds`), `kill` (Target or `"self"`, param `sacrificeId`);
  reducer `deductAbilityCost` + exhaust host. Parser: `C/parser/impl/costs.ts parseActivationCost`, `impl/activated.ts`.
- X: `play-spell.ts` param `xAmount` → energy + `variables.x` for `resolveAmount({variable:"x"})`. Repeat: param
  `repeatCount`, reducer wraps the effect in a `sequence` of 1+n copies. Flow: param `viaFlow` (from trash, banish after).
Recipe — additional cost not offered/mandatory: dump abilities → reshape to what `getOptionalPlayCost` reads (explicit
abilities is fastest) → confirm enumerator variant (harness `play(c,{accelerate:true|payOptional:true|sacrifice:"x"})`).
Recipe — reducer not applied: other permanent's static → `static-cost-reduction.ts matchesPlayedCard` + `minimum`;
own text → `getSelfScaledEnergyReduction`; one-shot "next spell costs N less" → `meta.costModifier` via `effects/cost-reduction.ts`.
`[rainbow]` in tests: `.resources(P1,{power:{rainbow:1}})` (any domain also pays a rainbow pip).

## 8. Combat / movement / scoring
- Movement: `moves/movement/standard-move.ts standardMove` (exhausts, moves, `move` event, sets `bf.contested/contestedBy`,
  opens the showdown via `chain-state.ts startShowdown`, stamps `combatRole` + `attack`/`defend` events),
  `ganking-move.ts`, `recall-unit.ts` (no move event), `helpers.ts`. Effect-driven: `effects/move.ts handle_move /
  moveCardWithEvent / markContestedOnArrival` (may prompt `choose-destination`), `effects/recall.ts`.
- Showdown / Focus: `E/chain/chain-state.ts startShowdown, passFocus, endShowdown, resetShowdownPasses, getActiveShowdown`;
  moves `moves/chain/showdown.ts passShowdownFocus` (all passed ⇒ close; non-combat close auto-conquers for a sole occupant
  + `conquer` event; combat close sets `bf.showdownComplete`), `startShowdown`, `endShowdown`.
- Combat damage: `moves/combat/resolve-full-combat.ts resolveFullCombat` (legal when `bf.contested && bf.showdownComplete`
  in neutral-open; harness `settle()` auto-runs it) → build `CombatUnit`s → `combat-resolver.ts resolveCombat` → write
  `meta.damage`, heal survivors, mark `result.killed` lethal → `cleanupAndFireDeaths` (SBA deaths, Deathknell, die
  replacements) → winner by who remains: attacker ⇒ `bf.controller`, `points.ts scoreBattlefield(…,"conquer")`, `conquer`+`score`
  events; defender ⇒ attackers recalled; nobody ⇒ controller null; `expireCombatMight`; final `cleanupAndFireDeaths`.
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
- Battlefield control loss / combat staging: `performCleanup` step 6 (controller cleared in open state with no unit).
- Deaths happen ONLY in `performCleanup` (damage ≥ might) and `effects/kill.ts`. Flow `ending.onBegin` clears damage, stun,
  `mightModifier`, turn keywords, rune pools, `activeReplacements` (turn/next). Temporary units are trashed in
  `beginning.onBegin` by raw `moveCard` — no `die` event (Deathknell / Zhonya bugs).
Recipe — unit should/shouldn't die: which Might did the lethal check use (SBA: printed+buff+mightModifier+static+equip;
resolver adds Shield for defenders / Assault for attackers via `lethalThreshold`)? Was `meta.damage` written?
Recipe — conquer after killing the last defender mid-showdown: `resolveFullCombat` empty-defender branch must treat
remaining attackers as winners (today it recalls them); control flip otherwise via `passShowdownFocus` close.
Recipe — stun: `effects/stun.ts` sets flag + `stun` event; zero its combat damage in `resolve-full-combat.ts`; cleared at end of turn.

## 9. Replacement effects
- `E/abilities/replacement-effects.ts` — printed abilities `{type:"replacement", replaces:"die"|"take-damage"|"score"|…,
  replacement: Effect|"prevent", duration?:"next"|"turn", target?:{controller}, condition?}` on board cards:
  `checkReplacement(event, ctx)` (first match by `replaces===event.type` + friendly/enemy owner), `findAllReplacements`,
  `orderReplacementsByOwnerChoice`, `markReplacementConsumed` / `clearConsumedReplacements` (`draft.consumedNextReplacements`).
- Runtime-installed: `effects/replacement.ts handle_replacement` appends `{...effect, owner, sourceCardId, targetCardIds?}`
  to `draft.activeReplacements` (bound to targets for `die` / next `take-damage`); purged in flow `ending.onBegin`.
- Call sites: deaths — `state-based-checks.ts performCleanup` (`consumeActiveDieReplacement`, then `checkReplacement
  ({type:"die"})` → runs the replacement effect through `buildReplacementEffectContext` with the dying unit as
  `trigger-source`, clears damage); damage — `effects/damage.ts` (global prevent-all, bound entries, `checkReplacement
  ({type:"take-damage"})`) and combat `resolve-full-combat.ts killOnDamageIdx`; score — `scoring-rules.ts
  applyScoreReplacement` (called only from `points.ts awardPoints`, method-scoped); tokens — `create-token.ts applyPlayTokenReplacement`; enters-ready — `cost.ts consumeEntersReadyReplacement`.
- Parser: `C/parser/impl/replacement.ts parseReplacementAbility` ("If … would …, … instead"), "next time" spells → effect `replacement`.
Recipe — "if X would die / be dealt damage, instead …": 1) ability `type:"replacement"` whose `replaces` equals the string
the call site checks; 2) no call site for that event kind → add `checkReplacement` where it happens; 3) optional
("you may pay …") replacements need a prompt — reuse the `opt-in` pattern from `resolve.ts`; 4) `duration:"next"` ⇒
`markReplacementConsumed`; 5) effect referring to "it" ⇒ target `{type:"trigger-source"}`.

## 10. Zones / tokens / hidden
- Zone ids (`E/zones/zone-configs.ts`): per player `mainDeck hand runeDeck runePool base trash banishment legendZone
  championZone`; shared `battlefieldRow` (the battlefield cards), `battlefield-<bfId>` (units/gear there), `facedown-<bfId>`,
  `chain`. Harness `zoneOf()` → `hand|base|trash|banishment|chain|battlefield-bf1|facedown-bf1|mainDeck…`.
- Tokens: `effects/create-token.ts handle_createToken` — ids `token-<slug>-…`, registers a def per instance and
  `token-def-<slug>`, unit tokens enter exhausted unless static EntersReady (`_helpers.tokenEntersReadyFromStaticGrant`),
  fires `play-token-unit`, location `"here"`→source zone / explicit zone / else base + `choose-destination` prompt if a
  controlled battlefield exists. Parser `C/parser/impl/effects-tokens.ts`. Manual `moves/token.ts`. Off-board tokens vanish
  in `state-based-checks.ts sweepOffBoardTokens`. Detect: `id.startsWith("token-")`, harness `state().isToken`.
- Hidden: `moves/play/hide.ts hideCard` (needs keyword Hidden, pays 1 power of any domain, → `facedown-<bf>`, `hide`
  event) / `revealHidden` (plays it ignoring cost; `play-self` carries `fromHiddenAt` so `resolve.ts` limits targets to
  that battlefield). Orphan facedown cards trashed in `performCleanup` step 4.
- Leaving the board: kill path in `performCleanup` resets buffed/damage/exhausted/stunned/grantedKeywords/mightModifier and
  detaches equipment; `effects/return-to-hand.ts bounceToHand` resets too; `effects/banish.ts` → `banishment`;
  `effects/recall.ts` → base (keeps state, no `move` event). Play by effect: `effects/play.ts handle_play` (adds a pending
  chain item / places the card; cost handling inside), `reveal-and-pick onPicked:"play"` in `pending-choice.ts`, Flow via
  `play-spell.ts viaFlow`, Deathknell "play me from trash" uses `draft.recentDeaths` (dispatcher).

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
  an unanswered prompt → `p1.pick("x") / yes() / no() / decline() / chooseMode(1)`; inspect `game.decision()`, `game.actingSeat()`.
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
   stunned should deal 0; damage == might is lethal; spell damage must set `meta.damage` (`effects/damage.ts`).
9. Deathknell / "when a unit dies" / die-replacement skipped → the removal used raw `moveCard` to trash (Temporary in flow
   beginning, sacrifice costs in `play-unit.ts` / `activate-ability.ts`) instead of `effects/kill.ts`-style kill + `die`
   event or lethal damage + `cleanupAndFireDeaths`. SBA replacements already run the effect with the dying unit as `trigger-source`.
10. Wrong player acts/benefits ("its controller draws 2", "each other player chooses", "they discard") → handler must honour
    `effect.player` (`draw.ts` `each`, `discard.ts` `opponent`, `choice.ts` chooser/`controllerId`) or condition
    `target-controller`; controller vs owner: `getCardController ?? getCardOwner`.

## Efficiency rules
- Read the 2–4 relevant files named above in ONE Read/cat call; no grep→sed chains, no `ls`/`find` of the tree.
- Dump the enriched abilities JSON (§1) before touching engine code — it decides card-def vs parser vs engine in seconds.
- Iterate with `bun test <that card's test file>` only; the full engine+parser suites run in `land.sh` at the end.
- Flip `test.failing` → `test` for EVERY BUG your change makes pass, across all files:
  `bun test packages/riftbound-engine/src/__tests__/cards 2>&1 | grep -B3 'marked as failing but it passed'`.
- Scratch files only under `packages/riftbound-engine/src/__tests__/cards/do_not_commit/`.
- Never revert/reformat other lanes' in-flight edits; keep condition↔enumerator and `canAffordCard`↔`deductCost` pairs in sync.
