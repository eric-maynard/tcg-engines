# Riftbound Agent Harness — Design

Status: implemented headless core (`packages/riftbound-engine/src/harness/`), BrowserBackend + MCP are design-only.
Inputs: `01-engine-inventory.md`, `02-ui-surface.md`, `03-rules-decision-taxonomy.md`, `04-prior-art.md`.

---

## 1. Goals / non-goals

**Goals**

1. One typed API through which *anything that plays* (LLM agent, MCP client, bot, scripted test, the expert
   unit-test-writer) observes a game, learns exactly what it may decide next, and answers — with the same
   vocabulary whether the game is a headless `RuleEngine` or (later) the live web UI.
2. Every open-ended rules decision (targets, X, Repeat, Accelerate, multi-unit move, reveal-and-pick, opt-in, …)
   has a first-class, discoverable shape (`Decision`) and a single answer channel (`Answer`).
3. Card tests read like rules text: place cards, act with verbs (`cast`, `play`, `move`, `endTurn`), assert zones
   and card state. No `internalState` casts, no move-param archaeology, no hand-rolled end-turn driver.
4. Deterministic: seed in → same transcript → same state hash. Transcripts replay by *decisions*, not patches.
5. Invariants run on every step so harness users find engine bugs for free.

**Non-goals (this iteration)**

- Fixing engine rules gaps (multi-select, distribute, ordering, X-at-resolution, opaque instance ids, per-engine
  registry). The `Decision` union reserves their shapes; §10 lists them.
- Implementing `BrowserBackend`/`WsBackend`/MCP server (designed in §8/§9 so the L0 contract fits them).
- Pregame (battlefield select / mulligan) as Decisions — `createPlayableGame` skips it; scenario builder makes it moot.
- Search/fork (`clone()`); noted as a follow-up on `EngineBackend`.

---

## 2. Layering

```
L5  MCP tools (JSON)           create_game · observe · decision · act · settle · card_info · transcript
L4  Transcript + Invariants    record/replay by decisions, state hashes; per-step invariant hooks
L3  Scenario builder           scenario().turn().active().resources().battlefield().card()...build() → Game
L2  Game / Seat (ergonomic)    seat.play/cast/activate/move/hide/tapRune/recycleRune/pass/endTurn/answer, state(card)
L1  Decision / Answer protocol deriveDecision(source) · resolveAction(option,args) · answer→move mapping
L0  GameBackend                view(seat) · decision() · decisionFor(seat) · act(seat,answer) · waitFor · hash
        ├─ EngineBackend        RuleEngine + TurnDriver (+ createPlayableGame | scenario)
        └─ BrowserBackend (plan) Playwright: window.executeMove / __rbGameState / __rbAvailableMoves, seq-gated
```

Rules of the layering:

- L1 is **backend-agnostic**: it consumes a `DecisionSource` (`publicState`, `legal(seat) → FlatMove[]`,
  `describeCard(id)`), so the same grouping/derivation code runs over an engine or over a UI snapshot
  (`__rbGameState` + `__rbAvailableMoves`).
- L2 only talks to L0/L1. It never touches the engine (one escape hatch: `game.engine` for tests that must).
- The **TurnDriver** (`harness/turn-driver.ts`) is the single implementation of "end the turn" and "run automatic
  procedures"; `testing/playtest/game-setup.ts advanceTurn` delegates to it. `apps/riftbound-app/server/turn.ts`
  should migrate to it (out of scope: apps/ is read-only for this task).

---

## 3. Core vocabulary (`harness/types.ts`)

| Type | Shape | Notes |
|---|---|---|
| `Seat` | `string` (`"player-1"`, …); constants `P1..P4` | chooser identity everywhere |
| `CardRef` | `string` (engine instance id) | opaque; scenario aliases *are* the id (`"cleave"`), so tests never see generated ids |
| `ZoneKey` | `"hand" \| "base" \| "trash" \| "banishment" \| "mainDeck" \| "runeDeck" \| "runePool" \| "legendZone" \| "championZone" \| "battlefieldRow" \| "chain" \| `battlefield-${bf}` \| `facedown-${bf}`` | engine zone ids verbatim |
| `ZoneRef` | `{ zone: ZoneKey; owner?: Seat }` | per-player zones are shared engine zones filtered by owner |
| `CardState` | `{ id, defId, name, cardType, owner, controller, zone, location, damage, baseMight, might, energyCost, powerCost, domains, keywords[], grantedKeywords[], isExhausted(=isTapped), isReady, isStunned, isBuffed, isHidden, isEmpowered, isToken, attachedTo?, attachments[], combatRole, mightModifier, staticMightBonus, meta(raw) }` | merges `__flags`/`__counters` with meta; `might` = effective (base+buff+mod+static+equipment) |
| `CardView` | `CardState \| { hidden: true, owner, zone, index }` | what a *seat* sees |
| `Observation` | `{ seq, viewer, status, winner?, turn, actingSeat, state: public RiftboundGameState, resources, points, zones: Record<ZoneKey, CardView[]>, battlefields[], chain[], decision: Decision \| DecisionSummary \| null }` | one redaction path (mirrors server `snapshot.ts`) |
| `Decision` / `Answer` | §4 | |
| `ActResult` | `{ ok: true, seq, executed: {moveId, params, seat}[], decision: Decision \| null, followUp?: Decision, violations: Violation[] } \| { ok: false, error: HarnessErrorInfo, seq, decision }` | every response carries the next decision |
| `HarnessError` | `code ∈ NO_DECISION · NOT_YOUR_DECISION · STALE_DECISION · UNKNOWN_OPTION · AMBIGUOUS_ACTION · ILLEGAL_ARGS · ENGINE_REJECTED · CARD_NOT_FOUND · SCRIPT_EXHAUSTED · UNSCRIPTED_DECISION · INVARIANT · TIMEOUT` + `detail` | L2 throws; L0 returns |

---

## 4. The Decision / Answer protocol (L1)

### 4.1 The single acting-seat cursor

`getActingSeat(state)` (added to `src/views/acting-seat.ts`, re-exported by the harness):

```
pendingChoice ? chooserOf(pendingChoice)            // playerId ?? prompter, normalised by getPendingChoiceChooser()
: chain.active && chain.activePlayer ? chain.activePlayer
: topShowdown.active ? topShowdown.focusPlayer
: turn.activePlayer
```

`backend.decision()` is always *the cursor seat's* decision. Other seats may still hold "free" actions the engine
allows at any time (`exhaustRune`, `recycleRune`, `concede`, Reaction plays when they get priority):
`backend.decisionFor(seat)` returns that seat's `ActionDecision` (context `"free"`) or `null`. `act(seat, …)` is
legal for any seat whose own menu contains the option — the engine stays the legality oracle.

### 4.2 `Decision` union

Every variant carries `{ id, seat (chooser), kind, timing, prompt, source?: { cardId?, chainItemId?, moveId?, pendingChoiceType? }, synthetic?: boolean }`.
`timing ∈ PRE | ACT | FIN | PAY | RES | RPL | CLN | CMB | PROC` (taxonomy §1). `id = "d:" + seq + ":" + seat + ":" + kind` → stale answers are rejected.

| kind | payload | answered by |
|---|---|---|
| `action` | `context: "main" \| "chain" \| "showdown" \| "free" \| "procedure"`, `options: ActionOption[]`, `passKey?`, `endTurnKey?` | `{kind:"action", key, args?: PlayArgs}` |
| `pick` | `options: PickOption[]` (`{key, label, card?: CardRef, zone?, mode?: number, value?}`), `min`, `max`, `allowDecline`, `semantics?: "target" \| "drop-target" \| "destination" \| "mode" \| "from-revealed" \| "equip" \| "follow-up"` | `{kind:"pick", keys: OptionKey[]}` or `{kind:"decline"}` |
| `yes-no` | `consequence?: string` | `{kind:"yes-no", value}` |
| `integer` | `min`, `max`, `unit: "x" \| "repeat" \| "power" \| string` | `{kind:"integer", value}` |
| `distribute` | `total`, `buckets: {key, card?, min, max}[]` | `{kind:"distribute", allocation: Record<key, n>}` |
| `order` | `items: PickOption[]` | `{kind:"order", keys[]}` |
| `deck-arrange` | `cards: PickOption[]`, `mayRecycle: boolean`, `keepMax?` | `{kind:"deck-arrange", top: keys[], recycle: keys[]}` |
| `name` | `vocabulary: string[]` (may be hundreds), `cardType?` | `{kind:"name", name}` |

Answers may carry `decisionId` (checked when present; MCP always sends it). L2 accepts shorthand
(`seat.answer("brute")`, `seat.answer(3)`, `seat.answer(true)`, `seat.answer(["a","b"])`, `seat.decline()`)
coerced against the current decision kind.

### 4.3 `ActionOption` and the play bundle as ONE call

`enumerateMoves(seat, {validOnly:true})` stays the oracle but is **grouped** so agents never see the
`enumerateSubsetsUpTo` blow-up:

```
ActionOption {
  key: OptionKey            // `${moveId}:${primary}` — primary = cardId | runeId | unitId | battlefieldId | `${cardId}#${abilityIndex}` | destination (standardMove) | "-"
  moveId, verb              // play | cast | equip | activate | move | gank | hide | reveal | playChampion | tapRune | recycleRune
                            // | passPriority | passFocus | endTurn | concede | resolveCombat | conquer | startShowdown | endShowdown | resolveChain | invite | score
  card?: CardRef, label, variantCount
  fields: ActionField[]     // { name (engine param), arg (PlayArgs name), kind: card|cards|zone|enum|bool|int, options?: distinct values, min?, max?, required }
}
```

Option keys are derived from *canonical params*, never from enumeration order, and are stable for the lifetime of
the underlying card/zone ids (they survive re-enumeration within a turn; they change only when the primary id
leaves/enters a zone that changes the move id).

`PlayArgs` (the nested optional fields of the bundle, idiomatic names → engine params):

| PlayArgs | engine param | moves |
|---|---|---|
| `targets: CardRef \| CardRef[]` | `targets[]` (tuple order preserved: `[attacker, defender]`, `[ref, ...splits]`) | playSpell |
| `x: number` | `xAmount` | playSpell (X detected when the spell effect references `{variable:"x"}`; `max` probed with `canExecuteMove`) |
| `repeat: number` | `repeatCount` | playSpell |
| `flow: boolean` | `viaFlow` | playSpell (from trash) |
| `accelerate: boolean` / `payOptional: boolean` | `paidAdditionalCost` (+ `additionalCostSpec` copied from the variant) | playUnit, playSpell |
| `sacrifice: CardRef` | `sacrificeId` (+`paidAdditionalCost`) | playUnit, activateAbility |
| `discard: CardRef` | `discardId` | activateAbility |
| `to: "base" \| bf \| ZoneKey` | `location` (playUnit/playFromChampionZone: `battlefield-<bf>`), `destination` (standardMove: bare bf id), `toBattlefield` (gankingMove), `battlefieldId` (hideCard) — harness normalises either spelling | |
| `units: CardRef[]` | `unitIds[]` (set-equality match) | standardMove |
| `domain` | `domain` | recycleRune |
| `costTarget: CardRef` | `chosenTargetId` | playGear |
| `abilityIndex`, `source: CardRef` | `abilityIndex`, `sourceCardId` | activateAbility |

**Resolution algorithm** (`resolveAction(option, args)`): filter the option's flat variants by every supplied arg
(deep/set equality); for *unsupplied* cost knobs prefer the base variant (`!paidAdditionalCost`, `!repeatCount`,
`!viaFlow` unless the card is only playable via Flow) when that leaves ≥1 variant; then

- exactly one variant → execute it (plus `xAmount` if given);
- zero → `ILLEGAL_ARGS` (error lists the fields that eliminated all variants and the legal values);
- several → **degrade to a follow-up Decision**: the backend parks the partially bound action and `decision()`
  now returns a synthetic `pick` (`timing: FIN`, `semantics: "follow-up"`, `source.moveId`) over the *first still-varying
  field* in priority order `targets → to → units → sacrifice → discard → costTarget → domain → repeat → other`, or an
  `integer` decision for a missing X. Answering narrows; when one variant remains it executes. `{kind:"decline"}`
  cancels the parked action. L2 verbs treat a follow-up as `AMBIGUOUS_ACTION` (message names the missing arg)
  unless the seat has scripted answers queued — tests stay explicit, agents stay conversational.

This is the "single structured answer validated as a whole" recommended by taxonomy §2A, with the transactional
sub-dialog as the fallback; nothing executes until the bundle is complete, so rule 358.5 rewind is free.

### 4.4 Mapping today's engine onto the union

| Engine surface | Decision | timing | option key / answer → `resolvePendingChoice` params |
|---|---|---|---|
| `reveal-and-pick` | `pick{min: optional?0:1, max:1, allowDecline: optional, semantics:"from-revealed"}`; options carry revealed identities to the chooser only; `meta {onPicked, onRest}` in prompt | RES | key = cardId → `{pickedCardId}`; decline → `{accept:false}` |
| `name-card` | `name{vocabulary: options, cardType}` | RES | `{pickedName}` |
| `choose-target` (plain) | `pick{1,1, semantics:"target"}` | RES (trigger FIN in rules; engine asks at RES — noted) | `{pickedCardId}` |
| `choose-target` + `boundTargets` (drop) | `pick{1,1, semantics:"drop-target"}` | RES | `{pickedCardId}` |
| `choose-target` + `assign` | `distribute{total:1, buckets: options{min:0,max:1}}` — becomes `total:N` when the engine batches | RES | allocation `{id:1}` → `{pickedCardId:id}` |
| `choose-destination` | `pick{1,1, semantics:"destination"}`, options are zones (`base`, `battlefield-<bf>`, `mainDeck-top/bottom`) | RES | `{pickedZoneId}` |
| `choose-mode` | `pick{1,1, semantics:"mode"}`, labels from `effect.options[i].label/text` | RES | key = String(index) → `{pickedMode}` |
| `opt-in` | `yes-no` | RES (rules: FIN) | `{accept}` |
| `weaponmaster-equip` | `pick{0,1, allowDecline, semantics:"equip"}` | RES | `{pickedCardId}` / `{accept:false}` |
| chain priority | `action{context:"chain"}` (Reaction plays, rune adds, `passKey`) | ACT | |
| showdown focus | `action{context:"showdown"}` (Action/Reaction plays, `passKey`) | ACT | |
| main phase | `action{context:"main"}` | ACT | |
| `resolveFullCombat` / `endShowdown` / `resolveChain` enumerated | auto-run by TurnDriver (`autoProcedures`, default on); surfaced as `action{context:"procedure"}` when off | PROC | |
| play-time knobs (`targets[]`, `xAmount`, `repeatCount`, `viaFlow`, `paidAdditionalCost/additionalCostSpec`, `sacrificeId`, `discardId`, `chosenTargetId`, `location`, `standardMove.unitIds` subsets, `hideCard.battlefieldId`, `gankingMove.toBattlefield`, `recycleRune.domain`) | `ActionOption.fields` + `PlayArgs`; follow-up `pick`/`integer` when omitted | ACT→FIN | §4.3 |

**Future engine shapes slot in without API breaks**: multi-select → `pick{min,max>1}` (already in the union;
`Answer.keys` is already an array); split damage / combat assignment → `distribute{total:N}`; trigger/replacement/
Predict ordering → `order` / `deck-arrange`; X-at-resolution → `integer{timing: RES, unit:"power"}`; choose-player →
`pick` with `PickOption.seat`; each-player prompts → same kinds with a different `seat`. Consumers switch on `kind`
only, so new *producers* need no client change.

### 4.5 Async / seq semantics (all backends)

- `act()` and `waitFor()` are `Promise`-returning on every backend; reads (`view`, `decision`, `stateHash`) are
  synchronous against the backend's **latest known frame**. `EngineBackend` recomputes on read (always fresh);
  remote backends refresh the frame on every inbound message and gate `act()` resolution on
  `move_accepted|move_rejected` for their `requestId` **and** `seq` having advanced, then keep draining frames
  until `decision().seat` is a local seat or the game settled (`sandboxAutoPlay` may push several).
- `seq` is the backend's monotonic step counter; every `ActResult`/`Observation` carries it; `Decision.id` embeds it.
- One `act()` may execute several engine moves (the answer + auto procedures); all are listed in `executed[]` and in
  the transcript step.

### 4.6 Hidden information

`view(seat)` redacts other owners' `hand` and `facedown-*` (rule 127 *private*) and **everyone's** `mainDeck`/`runeDeck`
(rule 127 *secret* — stricter than `snapshot.ts`, which shows a player their own deck order) to
`{hidden:true, owner, zone, index}` (count-only; ids withheld because engine ids embed the def id).
`view("spectator")` is omniscient (tests; `seat.deck()` is the omniscient test accessor). A decision owned by another
seat is summarised as `{id, seat, kind, prompt}` without options. Reveal-and-pick options expose identities to the
chooser because the rules revealed them.

### 4.7 Error model

L0 never throws for game-level problems; it returns `{ok:false, error:{code, message, detail}}` and leaves state
untouched (bundle resolution happens before `executeMove`; engine rejections come back as `ENGINE_REJECTED` with the
engine `errorCode`). L2 verbs throw `HarnessError` (tests want a stack trace at the failing line); `seat.try(fn)`
converts to a result for negative tests, and `seat.can(verb…)`-style checks use `legal()`.

---

## 5. L2 — `Game` / `Seat` (the mockup vocabulary)

```ts
const game = await scenario({...}).build();          // or Game.fromDecks({decks, seed}) / Game.attach(engine)
const p1 = game.seat(P1);                              // also game.p1 / game.p2

// Observation (sync)                                  mockup name
p1.listZones(): ZoneSummary[]                          ListZones
p1.cardsAt(zone: ZoneKey | ZoneRef): CardRef[]         ListCardsAtZone
p1.hand() / base() / trash() / deck() / runes() / units(at?) / gear()   ListCardsInHand / ListRunes
p1.legend() / champion(): CardRef | undefined          ListLegend
p1.state(card): CardState                              GetCardState  (game.state(card) is the omniscient form)
p1.resources(): {energy, power}
p1.view(): Observation ; p1.decision(): Decision|null ; p1.legal(): ActionOption[] ; p1.isActing(): boolean

// Actions (async, throw HarnessError)                 mockup name
p1.play(card, {to?, accelerate?, payOptional?, sacrifice?, targets?, x?, repeat?})   PlayCard
p1.cast(card, {targets?, x?, repeat?, flow?, payOptional?})                          CastSpell
p1.equip / p1.playGear(card, {costTarget?})
p1.activate(card, abilityIndex=0, {sacrifice?, discard?, source?})                    ActivateAbility
p1.move(card | cards[], to)  ; p1.gank(unit, toBf) ; p1.recall(unit)                MoveCard
p1.hide(card, battlefield) ; p1.reveal(card)                                         HideCard
p1.playChampion(to?)
p1.tapRune(rune | {domain} | undefined) ; p1.tapRunes(n) ; p1.recycleRune(rune, domain?)   TapRune / RecycleRune
p1.passPriority() ; p1.passFocus() ; p1.pass() (whichever applies)                   PassPriority / PassFocus
p1.endTurn()  ; game.advanceTurn({settle}) ; p1.concede()                            EndTurn / Forfeit
p1.answer(valueOrAnswer) ; p1.pick(...cards) ; p1.decline() ; p1.yes() ; p1.no() ; p1.chooseX(n) ; p1.name(s)   AnswerPopup
p1.choose(optionKey, args?) ; p1.do(moveId, params)    // generic / raw escape hatches
game.settle({policy?: "passive" | PolicyFn, maxSteps?}) // drain priority/focus/forced picks using scripts + policy
game.script(P2, [answers...], {strict})                 // XMage-style queued answers per seat
game.expectOk(result) ; game.card(alias) ; game.find({name|defId, owner?, zone?}) ; game.zoneOf(card) ; game.cardsAt(zone, owner?)
```

Open-ended decisions "fit cleanly": Bullet Time is `p1.cast(bt, { x: 3 })`; if `x` is omitted an agent receives
`integer{min:0,max:<affordable>, unit:"x"}` as the follow-up; a test gets `AMBIGUOUS_ACTION: cast(bt) needs x (0..5)`.

---

## 6. L3 — Scenario builder (`harness/scenario.ts`)

Fluent builder → serialisable `ScenarioSpec` (JSON; embedded in transcripts) → `buildScenarioEngine(spec, pool)`.

```ts
scenario({ seed?: "t1", pool?: CardPool, players?: 2 })
  .turn(3).phase("main").active(P1)                       // default turn 2 / main / P1 (turn ≥2 avoids first-turn rules)
  .resources(P1, { energy: 5, power: { fury: 1, rainbow: 1 } })   // engine quirk: [rainbow] pips are paid from power.rainbow
  .points(P1, 6).victoryScore(8).xp(P1, 2)
  .battlefield("bf1", { controller: P2, def?: "ogn-275-298" | inline, inert?: true /*default: abilities stripped*/ })
  .card("cleave", { def: "ogn-004-298", owner: P1, zone: "hand" })                     // real def by id
  .card("brute", { def: { cardType: "unit", might: 4, keywords: ["Tank"] }, owner: P2, zone: "bf1", meta: { damage: 1, exhausted: true } })
  .hand(P1, "ogn-004-298", ...) .base(P2, ...) .unit(P2, "bf1", { might: 3 }, "e1")   // sugar
  .legend(P1, "ogn-251-298", "lc") .champion(P1, defId)
  .deck(P1, [defIds top→bottom]) .runeDeck(P1, [...]) .fillDecks({ main: 10, runes: 12 } | false)  // default fills with vanilla filler + basic runes so turn advance never burns out
  .script(P2, ["decline", ...], { strict: true })          // queued prompt answers; on an action decision only "pass"/{kind:"action"} is consumed
  .use(invariant, ...) .invariants([...] | []) .strictInvariants()   // add to / replace the starter set
  .autoProcedures(false)                                   // surface resolveFullCombat/endShowdown as options
  .build(): Promise<Game>                                  // also .toSpec() → ScenarioSpec JSON
```

Placement writes `internalState` directly (setup only — behaviour under test always goes through real moves), registers
each instance in the global `CardDefinitionRegistry` from the pool def (via the now-exported
`makeLookupPayload`), creates `battlefield-*`/`facedown-*` zones, patches `currentState` (status/turn/pools/battlefields),
moves the FlowManager into `mainGame` at `main` and aligns `turnNumber`/current player (same technique as
`rules-audit/helpers.ts`, which is left untouched for the 40+ suites importing it). Zone `"bf1"` is shorthand for
`battlefield-bf1`. Aliases become instance ids; unaliased cards get `k1, k2, …`.

---

## 7. L4 — Transcripts and invariants

`Transcript { schema:1, origin: {kind:"scenario", spec} | {kind:"decks", decks, seed}, players, steps: [{ n, seat, decision:{id,kind}, answer, executed:[{moveId,params,seat}], ok, error?, hash }] , finalHash }`.
`replayTranscript(t, {pool, verifyHashes})` rebuilds the origin and re-`act()`s each answer, reporting the first
divergent step. `stateHash` = FNV-1a over canonical JSON of `getState()` minus `gameId` + zones/cards/cardMetas.

`Invariant { name, when: "step" | "settled", check(ctx:{prev, cur, step, engine}) → string[] }`; violations are
attached to the `ActResult`, accumulated on `game.violations()`, and (opt-in `strictInvariants`) thrown.
Starter set: `energyNonNegative`, `cardConservation` (no id vanishes; every id in exactly one zone; `cards[id].zone`
agrees with zone membership; new ids must be tokens), `pendingChoiceGatesMoves` (with a pendingChoice every seat's
legal set ⊆ {resolvePendingChoice, concede} and only the chooser has resolvePendingChoice), `singleDecisionCursor`
(≤1 seat holds priority-class moves and it equals `getActingSeat`), `costPaid` (a successful play deducted ≥ printed
energy/power unless a cost modifier is present), `noOrphanChain` (chain.active ⇒ items.length>0).

---

## 8. BrowserBackend plan (not implemented)

- **Semantic mode**: `act` → `page.evaluate(executeMove(moveId, params, seat))` using the *same* `{moveId, params}` the
  L1 resolver produced from `__rbAvailableMoves` (grouping code is shared through `DecisionSource`); completion =
  `waitForFunction(lastSeq > before && !inFlight)` then re-read `__rbGameState/__rbAvailableMoves`; keep draining while
  `decision().seat` is remote (goldfish `sandboxAutoPlay` frames).
- **Visual mode**: option → selector map from `02-ui-surface.md` §1 (hand card click → targeting banner → target
  click; `#actionsList [data-target-play]`; `#choiceOverlay .choice-modal-card[data-pick-idx]`; Space/A/S/Q/W
  hotkeys) so UI tests assert that every legal option is *afforded* by the DOM; falls back to semantic mode for
  options the UI cannot express (multi-unit move, paid+targeted variants — listed as UI gaps).
- Endturn goes through the server's rotation (`move endTurn` over WS); pregame via `pregame_mulligan`.
- Per-seat pages (two browser contexts) or `switchPlayer`; observation redaction comes from the server.
- Same `Transcript`; the differential oracle (Engine vs Browser on one transcript ⇒ equal per-seat observations) is an
  invariant at `when:"settled"`.

---

## 9. L5 — MCP tool mapping (design only)

All tools take `gameId`; seat-scoped tools take `seat` and are filtered through `view(seat)`. Shapes are the TS types
of §3/§4 serialised as JSON (CardRef/OptionKey are strings). Every mutating response embeds `seq` and the next
`decision` so an LLM never needs a second round-trip.

| tool | input | output |
|---|---|---|
| `create_game` | `{ seed?, decks?: {P1: DeckConfig, P2: DeckConfig}, scenario?: ScenarioSpec, autoProcedures?: bool }` | `{ gameId, seats, seq, decision }` |
| `observe` | `{ gameId, seat, detail?: "summary" \| "zones" \| "full" }` | `Observation` (+ `text`: compact board rendering for LLMs) |
| `decision` | `{ gameId, seat? }` | `Decision \| DecisionSummary \| null` (cursor, or `decisionFor(seat)`) |
| `list_actions` | `{ gameId, seat, flat?: bool }` | `ActionOption[]` or flat `{moveId, params}[]` |
| `act` | `{ gameId, seat, answer: Answer }` (`answer.decisionId` required) | `ActResult` |
| `play` / `cast` / `activate` / `move` / `end_turn` / `pass` / `answer` | thin sugar over `act` with `PlayArgs` (`{gameId, seat, card, args}`) | `ActResult` |
| `settle` | `{ gameId, policy: "passive", maxSteps? }` | `{ steps, decision }` |
| `card_info` | `{ gameId?, card?: CardRef, defId? }` | `CardState` and/or definition (rules text, abilities) |
| `card_state` | `{ gameId, seat, card }` | `CardState` (redacted if not visible) |
| `transcript` | `{ gameId }` | `Transcript` |
| `undo` (sandbox only) | `{ gameId }` | `ActResult` |

Errors map 1:1 to `HarnessError.code`. Per-move JSON Schemas generated from `RiftboundMoves` are published as an MCP
*resource* for typed clients, guarded by the contract test from `.ai_memory/riftbound-mcp-plan.md`
(every enumerable move id must map to an `ActionOption.verb`).

---

## 10. Engine prerequisites

**Done in this change (small, safe):**

- `testing/playtest/game-setup.ts`: export `makeLookupPayload`, `registerCard`, `getInternal`; `advanceTurn` delegates
  to `harness/turn-driver.ts endTurn()` (identical semantics: set next player on the FlowManager, `endTurn`, respect
  ending/beginning holds and extra turns, safety patch).
- `views/acting-seat.ts`: `getPendingChoiceChooser(choice)` and `getActingSeat(state)`; exported from `views/index.ts`.
- `package.json` exports `./harness`; `src/index.ts` re-exports the harness as a namespace (`Harness`).

- `EngineBackend.activate()` re-installs the game's card registry before every call, so several `Game`s can coexist
  in one test file despite the process-global registry (sequential use only).

**Not done (listed for the engine backlog; the harness already has the receiving shape):**

1. Opaque instance ids (ids embed def ids → redaction must drop ids; `game-setup.ts:273`).
2. Per-engine `CardDefinitionRegistry` (global registry makes concurrent games in one process unsafe → MCP server must serialise games or fix this first).
3. Multi-select answers (`remaining>1`, discard N, "up to N" at resolution) → `pick{max>1}`.
4. Distribution answers (split damage, manual combat assignment for both sides) → `distribute{total:N}`.
5. Ordering answers (simultaneous triggers 383.3.d, replacements 372, Predict/deck order, detach order) → `order`/`deck-arrange`.
6. X paid at resolution as power (Bullet Time is charged as *energy at play time* today) → `integer{timing:RES}`.
7. Opt-in / trigger targeting at finalisation instead of resolution (D20/D12 timing divergence).
8. `activateAbility` has no `targets/modes/destination` params (pushed to resolution prompts); `playFromChampionZone`/`revealHidden` lack cost/target params.
9. Compound optional costs (Accelerate + another option), alternative costs beyond `viaFlow`, payment plans (which power pays a rainbow pip — today a `[rainbow]` pip is literally `power.rainbow`).
10. Server `turn.ts` should import `turn-driver.ts` (apps/ untouched here); `autoResolveCombat` there reads `state.zones` which does not exist on `getState()` (dead code).
11. `RuleEngine` reducer exceptions leave `internalState` partially mutated (no rollback) — harness reports `ENGINE_REJECTED/EXECUTION_ERROR` but cannot guarantee atomicity.
12. A sanctioned `TestAccess` port on `RuleEngine` to replace the `internalState` cast (one cast lives in `harness/internal.ts`).
13. `choose-mode` has no producer: the `choice` effect executor auto-picks option 0 (`abilities/effects/choice.ts`), so modal spells (Party Favors, Rocket Barrage) never prompt. The harness derives/answers the shape (tested by state injection).
14. Token instance ids use `Date.now()` (`abilities/effects/create-token.ts`) → transcripts of games that mint tokens are not hash-stable; `cardConservation` tolerates token ids.
15. Combat resolver ignores Assault (and buffs/`mightModifier` — it uses printed might) for the *lethal threshold* of attackers while honouring Shield for defenders (`combat/combat-resolver.ts lethalThreshold`) — surfaced by the Cleave exemplar as a `test.failing` BUG.

## 12. Known limitations of this implementation

- `EngineBackend.waitFor` is trivial (state cannot change without `act`); real event semantics arrive with remote backends.
- `Decision.timing` for engine prompts is reported as `RES` (when the engine asks), even where the rules say `FIN`.
- `ActionField.options` for `targets`/`unitIds` still enumerates what the engine enumerates (subsets for "up to N" / multi-unit moves); the grouping keeps it per card, but a 6-unit base yields 63 `units` options.
- `seat.legal()`/`decisionFor()` return nothing when a seat could only `concede`.
- X range is probed with `canExecuteMove` up to pool energy (+1); other non-enumerated integer knobs would need the same treatment.
- Scenario placement bypasses "enters the board" triggers/static recalculation until the first real move runs cleanup; assert after an action, or place the consequence explicitly via `meta`.
- 3–4 player scenarios build, but seat sugar (`game.p1/p2`) and `Game.fromDecks` are 2-player.

---

## 11. Worked examples (as implemented; see `src/__tests__/cards/*.test.ts` and `__tests__/harness/*.test.ts`)

**Cleave (targeted spell).**
```ts
const game = await scenario().resources(P1,{energy:1}).battlefield("bf1")
  .unit(P1,"base",{might:2},"ally").hand(P1,"ogn-004-298","cleave").build();
await game.p1.cast("cleave", { targets: "ally" });   // one call; variant playSpell{targets:["ally"]}
await game.settle();                                  // both pass → resolves
expect(game.state("ally").grantedKeywords).toContainEqual({keyword:"Assault", value:3, duration:"turn"});
expect(game.zoneOf("cleave")).toBe("trash");
```
Decision trace: `action(main)` option `playSpell:cleave` fields `[targets{options:[["ally"]]}]` → executed → `action(chain, seat P1, passKey)` → P1 pass → `action(chain, seat P2)` → pass → resolves.
Omitting `targets` with two units on board → `AMBIGUOUS_ACTION: cast(cleave) needs targets: ally | other`.

**Death from Below (kill + optional replay-from-trash).**
`p1.cast("dfb", { targets: "victim" })` (cost 4 + `power.rainbow:1`) → settle → `victim` in trash (clause 1 passes).
Clause 2 ("if it had ≤3 Might you may play this from your trash for [rainbow]") should surface as `yes-no{seat:P1, timing:RES, source:dfb}` followed by the normal play bundle; the engine does not parse it, so the test asserts it inside `test.failing("BUG: …")` by expecting a `yes-no` decision (or a `playSpell:dfb` option with `flow`-like alt cost) after resolution.

**Bullet Time (integer X).** `p1.cast("bt", { x: 2 })` → `playSpell{xAmount:2}`; energy −(1+2); on resolution every enemy unit at a battlefield takes 2. Without `x`: follow-up `integer{min:0, max: pool.energy−1, unit:"x", timing: FIN}`; `p1.chooseX(2)` completes the parked bundle. (Rules say X is rainbow *power* at RES — prerequisite 6.)

**Loose Cannon (turn advancement + conditional trigger).**
`scenario().turn(2).active(P2).legend(P1,"ogn-251-298").hand(P1, filler)…` → `await game.advanceTurn()` = TurnDriver `endTurn(P2)` → flow enters P1 `beginning`, trigger lands on the chain, phase **holds**; `advanceTurn` settles passively (P1 pass, P2 pass) → conditional draw resolves (hand ≤1 ⇒ +1) → channel → draw → `main`. Assert `p1.hand().length` is `before+2` (≤1 case) vs `before+1` (≥2 case). Decision trace shows `action(chain, seat:P1, source: legend)` while `state.turn.phase==="beginning"`.

**Accelerate unit.** `p1.play("rearguard", { accelerate: true })` selects the variant with `paidAdditionalCost:true, additionalCostSpec:{energy:1,power:["fury"]}`; assert `state.isReady === true` and pool deltas (−3 energy, −1 fury). `p1.play("rearguard")` prefers the base variant → enters exhausted.

**standardMove of 2 units.** `p1.move(["u1","u2"], "bf1")` matches the variant whose `unitIds` set-equals `{u1,u2}` and `destination:"bf1"`; if enemies are present a combat showdown opens: `decision()` = `action(showdown, seat:P1, passKey)`; `game.settle()` passes focus both ways, TurnDriver auto-runs `resolveFullCombat`, `executed[]` lists it, and the test asserts damage/control.

**Reveal-and-pick (Stacked Deck: look at 3, draw 1, recycle rest).** `p1.cast("sd")` → settle stops at `pick{seat:P1, timing:RES, semantics:"from-revealed", min:1,max:1, options:[d0,d1,d2 with names]}` → `p1.pick("d1")` → `d1` in hand, `d0,d2` at deck bottom. With `game.script(P1, ["d1"])` the settle consumes the scripted answer instead of stopping; in strict mode an unscripted prompt throws `UNSCRIPTED_DECISION`.
