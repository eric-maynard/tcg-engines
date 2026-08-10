# Agent-harness prior art survey + design recommendations

## Part 1 — In-repo prior art (cited)

### 1.1 `@tcg/core` RuleEngine: moves, params, enumeration, results

| Concern | Shape | Where |
|---|---|---|
| Execute | `executeMove(moveId: string, ctx: MoveContextInput)` → `{success:true, patches, inversePatches} \| {success:false, error, errorCode, errorContext?}` | `packages/core/src/engine/rule-engine.ts:47-58`, `:379` |
| Caller input | `MoveContextInput<TParams> = { playerId; params; sourceCardId?; targets?: string[][]; timestamp? }` | `packages/core/src/moves/move-system.ts:40-60` |
| Move def | `GameMoveDefinition { reducer(draft, ctx); condition?(state, ctx) → boolean \| ConditionFailure; enumerator?(state, ctx) → TParams[]; metadata? }` | `packages/core/src/game-definition/move-definitions.ts:20-115` |
| Legality detail | `ConditionFailure { reason; errorCode; context? }` | `move-system.ts:351-402` |
| Enumerate | `enumerateMoves(playerId, {validOnly?, includeMetadata?, moveIds?, maxPerMove?})` → `EnumeratedMove { moveId; playerId; params; sourceCardId?; targets?; isValid; validationError?; metadata? }`. Moves without an enumerator surface as `NO_ENUMERATOR`; enumerator throws become `ENUMERATOR_ERROR` rows. | `rule-engine.ts:945-1076`; `packages/core/src/moves/move-enumeration.ts:42-76, 99-129, 210-222` |
| Cheap legality | `canExecuteMove(moveId, ctx)`; `getValidMoves(playerId)` (tries `params:{}` only — weak) | `rule-engine.ts:852-902` |
| Observation | `getState()` (structuredClone), `getPlayerView(playerId)` via `gameDefinition.playerView`; `getHistory({playerId, verbosity})` is visibility-aware | `rule-engine.ts:272-299, 338-340` |
| Hidden engine state | `internalState {zones, cards, cardMetas}` is **private and not in `getState()`**; every consumer casts into it | `rule-engine.ts:125,175-192`; readers: `game-setup.ts:46-48`, `rules-audit/helpers.ts:102-132`, `lorcana-test-engine.ts:279`, `apps/riftbound-app/server/snapshot.ts:320` |
| Determinism | `options.seed` → `SeededRNG` (`getSeed/setSeed/shuffle/pick/randomInt`) on `ctx.rng` | `rule-engine.ts:29-31,163`; `packages/core/src/rng/seeded-rng.ts:8-104` |
| Replay/undo | `undo()/redo()` restore complete `EngineCheckpoint`s (state, internalState, `serializeFlowState()`, `SeededRNG.getState()`, trackers, gameEnded, `GameDefinition.historyExtension`); `beginUndoGroup/endUndoGroup/withUndoGroup` make "move + auto procedures" one action; `canUndo/canRedo/peekRedo/getHistoryPosition`; `getReplayHistory()` = APPLIED prefix (entries carry `group` + `serial`); `replay(upTo?)`; `getPatches/applyPatches` for net sync | `rule-engine.ts` (`EngineCheckpoint`, `undo`, `redo`, `checkpoint`, `restoreCheckpoint`) |
| Flow | `getFlowManager()`; deferred `ctx.flow.endPhase/endTurn`; `FlowManager.serializeFlowState()` | `rule-engine.ts:498-519,1375`; `packages/core/src/flow/flow-manager.ts:198` |
| Targeting DSL (unused by Riftbound enumerators) | `TargetDefinition { filter; count: number \| {min,max}; restrictions? }` | `packages/core/src/targeting/target-definition.ts:7-37` |
| Multiplayer wrapper | `MultiplayerEngine` (authoritative/client, patch catch-up) | `packages/core/src/engine/multiplayer-engine.ts:96-400` |

Latent bugs relevant to a harness:
- ~~`undo()` restores `currentState` + `internalState` only~~ — FIXED (Aug 2026, "Rewind" package): history entries carry full `EngineCheckpoint`s (state, internalState, flow machine position, RNG cursor, trackers, gameEnded/gameEndResult, and the Riftbound registry runtime layer via `GameDefinition.historyExtension`); `after` is taken AFTER flow transitions (a turn's onBegin draw is redone, not lost); internalState is restored IN PLACE (the FlowManager's zone ops close over that object — the old reference swap orphaned every later channel/draw, also on a throwing reducer's rollback); undo/redo operate on undo GROUPS (`harness/turn-driver.ts applyMove` = one group). Specs: `E/__tests__/core-rules/undo-redo.test.ts` (32-game property + RNG + targeted), `apps/riftbound-app/server/__tests__/ws-undo.test.ts`, `E/__tests__/harness-browser/undo.test.ts`. Residual: `replay()` still doubles history (below); token instance ids embed `Date.now()` (`abilities/effects/create-token.ts`) and one recycle shuffle uses `Math.random` (`moves/chain/activate-ability.ts`, rule 416.5 branch), so "undo then re-issue the same move" is id-/order-identical everywhere except those two spots (redo IS exact — it restores the checkpoint).
- `replay()` re-calls `executeMove`, which `addToHistory` again → history doubles per replay (`rule-engine.ts:1336-1346` + `1431-1438`). History `timestamp: Date.now()` (`:590`) makes transcripts non-byte-stable.

### 1.2 `@tcg/core/testing`

Thin, engine-agnostic helpers; no zone seeding against a live engine.
- `createTestEngine(def, players?, options?)` → `new RuleEngine` (`packages/core/src/testing/test-engine-builder.ts:33-43`); `createTestPlayers(n, names?)` ids `test-p1..` (`test-player-builder.ts:32-46`); `createTestState(defaults, overrides)` deep merge (`test-state-builder.ts:40-51`).
- `expectMoveSuccess/expectMoveFailure(engine, moveId, ctx, code?)` (`test-assertions.ts:31-80`); `expectDeterministicReplay(engine)` JSON-compare + path diff (`test-replay-assertions.ts:41-70`); `createMockContext(input, mocks)` for reducer unit tests (`test-context-factory.ts:40-60`); RNG helpers `withSeed/testWithMultipleSeeds` (`index.ts:64-71`).
- Lorcana/Gundam both carry `TODO: @tcg/core should expose a proper TestEngine base class` (`lorcana-test-engine.ts:275`, `gundam-test-engine.ts:175`).

### 1.3 Lorcana / Gundam test engines (near-identical forks)

`LorcanaTestEngine(p1: TestInitialState, p2: TestInitialState, opts)` — `packages/lorcana-engine/src/testing/lorcana-test-engine.ts:171-253`
- Seeding: `TestInitialState { hand?|deck?|play?|inkwell?|discard?: number | CardDef[]; lore? }` (`:52-65`); populates via `internalState` backdoor + `zoneOps.createDeck` (`:277-356`); `skipPreGame` pokes FlowManager privates (`:232-252`); `createCharacterInPlay(player, {strength, willpower})` returns new id (`:725-775`); `moveCard` (`:783-791`).
- Choices: one typed method per move — `quest(cardId)`, `challenge(att, def)`, `alterHand(ids)`, `putCardInInkwell(id)`, `passTurn()` (auto-syncs acting seat from flow) (`:527-595`); seat via `changeActivePlayer()` (`:381-387`). Throws on failure (`:506-520`).
- Introspection: `getAvailableMoves / getAvailableMovesDetailed / enumerateMoveParameters / whyCannotExecuteMove` delegating to `LorcanaEngine` (`:605-642`).
- `LorcanaEngine` adds a schema-ish layer: `AvailableMoveInfo {moveId, displayName, description, paramSchema}`, `MoveParameterOptions {validCombinations, parameterInfo{type, validValues, min, max}}`, `MoveValidationError {errorCode, reason, context, suggestions}` (`packages/lorcana-engine/src/engine/lorcana-engine.ts:61-257`; `packages/lorcana-engine/src/types/move-enumeration.ts:14-125`). Pitfall: `whyCannotExecuteMove` literally calls `executeMove` — if the move is legal it mutates the game (`lorcana-engine.ts:239-246`).
- `GundamTestEngine` is a copy (`packages/gundam-engine/src/testing/gundam-test-engine.ts:38-153`). Riftbound has a third, unused, differently-shaped `types/move-enumeration.ts` (`packages/riftbound-engine/src/types/move-enumeration.ts:10-60`). Three drifting schema vocabularies → consolidate in core.

### 1.4 Riftbound

- `RiftboundTestEngine` (`packages/riftbound-engine/src/testing/riftbound-test-engine.ts:57-140`) wraps `RiftboundEngine.createGame` which only builds a state object; `getRuleEngine()` returns `null` (`src/engine/riftbound-engine.ts:35-95`). Effectively legacy; no moves.
- **Real scenario builder lives in tests**: `src/__tests__/rules-audit/helpers.ts`
  - `createMinimalGameState({turn, phase, currentPlayer, runePools, victoryScore, battlefields, playerCount})` → live `RuleEngine` (`:137-284`): resets the *global* `CardDefinitionRegistry` (`:166`), clones+patches frozen `currentState` (`:193-249`), forces FlowManager into `mainGame` + `syncState` + `setCurrentPlayer` + pokes private `turnNumber` (`:256-276`).
  - `createCard(engine, id, {zone, owner, cardType, might, energyCost, powerCost, domain, keywords, abilities, meta, name, controller, timing})` registers def (id doubles as definitionId) and places instance + meta (`:289-398`); `createBattlefield` incl. paired `facedown-*` zone (`:403-506`); `createDeck` (top = index 0) (`:942-962`).
  - Acting: `applyMove(engine, name, params)` infers seat from `params.playerId ?? turn.activePlayer` (`:572-583`); `checkMoveLegal` (`:588-598`); `enumerateLegalMoves` (`:915-927`); `drainChain` passes priority until empty (`:709-725`); `advancePhase`, `runPhaseHook`, `fireTrigger` (`:518-565, 745, 604`); chain readers `getChainItems/isChainActive/getChainActivePlayer/passChainPriority` (`:1095-1158`).
- `testing/playtest/game-setup.ts`: `createPlayableGame(allCards, deck1, deck2, seed)` → `{engine, instanceIds}` runs the real setup moves (`:243-370`); instance ids `${pid}-main-${i}-${defId}` (`:273`) **embed the definition id** (server has to redact them: `snapshot.ts:338-356`); `buildDefaultDeck(...)` (`:121-236`); `advanceTurn(engine, players)` (`:380-429`) re-implements server `turn.ts` `preparePlayerRotation/finalizeEndTurn` (`apps/riftbound-app/server/turn.ts:29,44`) — driver logic duplicated across headless and server.
- `testing/playtest/game-tracer.ts`: bot-vs-bot JSONL tracer. Key idea to lift: `actingPlayer(state)` = `pendingChoice.playerId ?? prompter` > `chain.activePlayer` > top `showdownStack.focusPlayer` > `turn.activePlayer` (`:119-127`). Own seeded RNG (`:51-61`), weighted pick (`:94-116`), escape hatches when enumeration is empty (`:158-177`), per-step record `{seq, turn, phase, player, available, chosen, success, error, enumErr, hand, state}` (`:212-231`), cost-paid invariant (`:186-210`), deadlock detection (`:233-242`), dumps `getReplayHistory` (`:245-248`). `coverage-check.ts` mines traces for "drawn-but-never-playable / enumerated-then-rejected" (`:1-40`).
- `bot/riftbound-bot.ts`: `RiftboundBot(engine, playerId, strategy).takeAction()/takeTurn()` over `enumerateMoves(validOnly)`; uses `Math.random` (`:149, :264`) and only acts when `turn.activePlayer === me` (`:110-124`) so it cannot answer off-turn prompts/priority.
- UI-driving scripts already form an informal second backend: `ui-rules-drive.ts` reads `window.__rbGameState/__rbAvailableMoves/__rbViewingPlayer` (defined `apps/riftbound-app/public/js/gameplay/state.js:15-25`) and calls `window.executeMove(moveId, params, pid)` (`ui-rules-drive.ts:23-61`) with fixed `waitForTimeout(500)`; `monkey-drive.ts` clicks stamped DOM (`data-mkey`, `:105-127`) and runs invariants I1–I8 engine-vs-DOM (`:134-183`); `ui-audit*.ts` cross-checks (README).
- Server wire protocol (what a WS backend must speak): `{"type":"move", moveId, params, requestId}` → `move_accepted {state, moves, seq, requestId, phaseChange}` | `move_rejected {error, errorCode, requestId}`; others get `state_update`; `resync`→`sync` (`apps/riftbound-app/server/ws-game.ts:67-200`); `SERVER_ONLY_MOVES` denylist (`server/config.ts:20-32`); `buildAvailableMoves = enumerateMoves(validOnly)` (`server/snapshot.ts:19-23`); `buildGameSnapshot` flattens zones with card details and redacts private zones to `hidden-${zone}-${owner}-${idx}` (`snapshot.ts:317-418`). REST mirror `/api/game/:id/{state,moves,move,history,undo,redo}` (`server/routes-game.ts:23-217`).
- Pending decisions today: `PendingChoice = reveal-and-pick | name-card | choose-target | choose-destination | choose-mode | opt-in | weaponmaster-equip` (`src/types/game-state.ts:338-518`), all answered by one move `resolvePendingChoice {playerId, pickedCardId?, pickedName?, pickedZoneId?, pickedMode?, accept?}` (`src/types/moves.ts:459-467`) with a per-kind enumerator (`src/game-definition/moves/pending-choice.ts:158-230`). Seat field is inconsistent (`prompter` vs `playerId`). Chain priority (`src/chain/chain-state.ts:67-88`) and showdown focus (`:90-98`) are two more independent "who decides" cursors.
- Combinatorial flattening in enumerators: `playSpell` emits one params row per target, per subset for "up to N" (`enumerateSubsetsUpTo`), per (attacker,defender) pair, per affordable `repeatCount`, per optional-additional-cost variant (`src/game-definition/moves/play/play-spell.ts:243-425`); `xAmount` is a raw numeric param (`moves.ts:196-201`).
- `.ai_memory/riftbound-mcp-plan.md` (unimplemented): `packages/riftbound-mcp` with `game.create/state/moves/execute/undo`, `bot.suggest`, stateful `GameManager`, and a contract test asserting MCP covers every `RiftboundMoves` key.

## Part 2 — External patterns worth stealing

| System | Pattern | Take-away for us |
|---|---|---|
| OpenSpiel | `state.current_player()` (incl. `CHANCE`, `SIMULTANEOUS`, `TERMINAL`), `legal_actions(p)`, `apply_action`, `action_to_string`, `information_state_string(p)` vs `observation`, `clone()`, `serialize()`, history = action list | One authoritative "decision cursor"; per-seat information state; clone-not-undo for search; replay = seed + action list. |
| boardgame.io | `moves`, `turn.stages`/`activePlayers` (several seats may each be in a named stage with its own move set), `ctx.random` seeded, `playerView` secret stripping, `INVALID_MOVE`, deterministic log replay | Model priority/showdown/pendingChoice as *stages* keyed by seat rather than ad-hoc fields. |
| Forge (MTG) | `PlayerController` interface the engine calls back into: `chooseTargetsFor`, `chooseNumber`, `orderBlockers`, `confirmAction`, `assignCombatDamage`…; Human/AI/scripted impls | Enumerate the *kinds* of question, not the moves; scripted controller = test double. |
| XMage `CardTestPlayerBase` | `addCard(Zone, player, "Name", n)`, `castSpell(turn, step, player, "Spell", "Target")`, `setChoice(player,"Yes")`, `addTarget`, `setModeChoice`, `setStopAt(turn, step)`, `execute()`, `assertPermanentCount/assertLife/...`, `setStrictChooseMode(true)` fails when the engine asks an unscripted question; name handles with `Name@suffix` disambiguation | Pre-queued answers per seat + strict mode; name-based handles with explicit disambiguation; "stop at" checkpoints. |
| SabberStone / Fireplace | `game.CurrentPlayer.Options()` returns fully-bound `PlayerTask`s; separate `Choice {ChoiceType, Choices[]}` for mulligan/discover; `Game.Clone()` for MCTS | Keep "open action menu" and "forced choice" as distinct decision kinds but one answer channel. |
| Gym / PettingZoo AEC | `agent_selection`, `observe(agent)`, `action_mask`, `step`, `last()`; `reset(seed)` | AEC turn-taking with a mask is the RL-facing projection of the same Decision object. |
| MTGO/Arena/TTS prompt model | `Prompt {kind, min, max, options, allowCancel}` incl. order and distribute (damage/counters) | Uniform min/max/options covers 90% of TCG questions; order + distribute are the two extra shapes. |

## Part 3 — Recommended shape (TypeScript sketches)

### (a) Typed handles vs raw ids

```ts
type CardId = string & { __brand: "CardId" };   // engine instance id (opaque; must NOT embed defId)
type ZoneKey = "hand" | "base" | "trash" | "runePool" | "mainDeck" | ... | `battlefield-${string}`;

interface CardRef { readonly kind: "card"; readonly id: CardId; toJSON(): CardId }
interface ZoneRef { readonly kind: "zone"; readonly zone: ZoneKey; readonly owner?: Seat }
interface CardView {                       // resolved lazily against the latest Observation
  ref: CardRef; defId?: string; name?: string; type?: string;
  owner: Seat; controller: Seat; zone: ZoneRef; meta: Readonly<RiftboundCardMeta>;
  hidden: boolean;                         // true when this seat can't see identity
}
interface Harness {
  card(ref: CardRef | CardId): CardView;                 // throws if unknown
  find(q: { name?: string|RegExp; defId?: string; owner?: Seat; zone?: ZoneKey; nth?: number }): CardRef; // throws on 0 or >1 unless nth
  findAll(q): CardRef[];
  zone(z: ZoneKey, owner?: Seat): CardRef[];
}
```
- Handles are id-only value objects; all attributes are re-read from the current observation (avoids stale copies). Wire/MCP form is the bare id plus a human `label`.
- Scenario builder assigns test-chosen aliases (`h.ref("scout")`) so tests never touch generated ids.
- Engine change to request: mint opaque instance ids (counter or seeded uuid) and keep `definitionId` only in `internal.cards` — today ids leak identity (`game-setup.ts:273`) and the server papers over it (`snapshot.ts:338-356`).

### (b) Uniform `Decision`

```ts
type Seat = PlayerId;
type OptionKey = string;                       // stable within a decision: hash(moveId+canonical(params)) or option index for picks

interface OptionBase { key: OptionKey; label: string; card?: CardRef; zone?: ZoneRef; value?: string|number }

type Decision =
  | { id: string; seat: Seat; kind: "action";               // open menu: main-phase, chain priority, showdown focus
      context: "main" | "chain" | "showdown" | "setup";
      options: (OptionBase & { moveId: string; params: unknown; category?: string;
                               needs?: FollowUp[] })[];      // e.g. [{kind:"pick",...},{kind:"number",...}] if not fully bound
      canPass: OptionKey | null }
  | { id: string; seat: Seat; kind: "pick"; source?: CardRef; prompt: string;
      options: OptionBase[]; min: number; max: number; optional?: boolean }   // targets, modes, destination, reveal-and-pick, opt-in (yes/no), mulligan
  | { id: string; seat: Seat; kind: "number"; source?: CardRef; prompt: string; min: number; max: number; label: "X"|"repeat"|string }
  | { id: string; seat: Seat; kind: "order"; source?: CardRef; prompt: string; items: OptionBase[] }              // simultaneous triggers, top-of-deck
  | { id: string; seat: Seat; kind: "distribute"; source?: CardRef; prompt: string; amount: number;
      buckets: (OptionBase & { min?: number; max?: number })[] }                                                   // split damage / counters
  | { id: string; seat: "none"; kind: "settled" };          // terminal or waiting on hidden/remote seat

type Answer =
  | { decisionId: string; kind: "action"; option: OptionKey; followUps?: Answer[] }
  | { decisionId: string; kind: "pick"; options: OptionKey[] }
  | { decisionId: string; kind: "number"; value: number }
  | { decisionId: string; kind: "order"; order: OptionKey[] }
  | { decisionId: string; kind: "distribute"; allocation: Record<OptionKey, number> };

interface ActResult { ok: boolean; error?: { code: string; reason: string; context?: unknown }; seq: number; next: Decision }
```
- `decision()` is derived by one function (promote `actingPlayer` from `game-tracer.ts:119-127` into `riftbound-engine/src/views`): pendingChoice → `pick|number|order|distribute`; chain active → `action/context:"chain"` for `chain.activePlayer`; showdown → `action/"showdown"` for focus player; else `action/"main"` for `turn.activePlayer`. `decision.id = hash(seq, seat, kind)` so stale answers are rejected (`STALE_DECISION`).
- Mapping today's `PendingChoice`: `choose-target/choose-destination/choose-mode/reveal-and-pick/weaponmaster-equip/name-card` → `pick{min:optional?0:1,max:1}`; `opt-in` → `pick{options:[yes,no],min:1,max:1}`; `choose-target` with `assign:true` → `distribute`. Ask the engine to normalise the seat field (`prompter` vs `playerId`).
- Keep the engine's flat `enumerateMoves` as the legality oracle, but let the harness *group* variants: `action.options` one per `(moveId, cardId)`; subsets/X/repeat become `needs: FollowUp[]` answered in the same `Answer.followUps` and re-validated by `condition` at execute. This avoids `enumerateSubsetsUpTo` blow-ups (`play-spell.ts:314-330`) reaching agents. Offer `listLegalActions({flat:true})` for exhaustive testing.

### (c) Seeding, replay, transcripts

```ts
interface Transcript {
  schema: 1; engineRev: string; seed: string; players: Seat[];
  setup: ScenarioOps[] | { decks: Record<Seat, DeckConfig> };
  steps: { n: number; seat: Seat; decision: Pick<Decision,"id"|"kind">; answer: Answer;
           resolved?: { moveId: string; params: unknown }; ok: boolean; error?: string;
           stateHash: string }[];
}
harness.record(): Transcript; Harness.replay(t, backend, { verifyHashes: true, stopAt?: n }): Promise<Harness>;
```
- One seed feeds `RuleEngineOptions.seed`; bot/policy RNG is `SeededRNG(seed+":policy:"+seat)` — never `Math.random` (fix `riftbound-bot.ts:149,264`).
- `stateHash` = hash of canonical JSON of `getState()` + zones/cards/metas (exclude `gameId` from `crypto.randomUUID()` in `riftbound-engine.ts:67`, timestamps). Replay by re-answering decisions, not `RuleEngine.replay()` (history doubling, flow not reset). Keep `getReplayHistory()` as a secondary artifact like `game-tracer.ts:245`.
- For search/`explain`, add `EngineBackend.fork()` = new engine from `{seed, transcript prefix}` (or engine-level serialize of state+internalState+`serializeFlowState()`). `undo()` is now exact (full checkpoints) and `game.undo()/redo()/snapshotHash()` exist on the harness, so undo-based search is safe too — but a transcript of a session that rewound no longer replays to `finalHash` (rewinds are not transcript steps).

### (d) Dual backends behind one interface

```ts
interface Observation { seq: number; seat: Seat; state: PlayerViewState; zones: Record<ZoneKey, CardView[]>; decision: Decision; legal?: FlatAction[] }

interface GameBackend {
  readonly seats: Seat[];
  observe(seat: Seat): Promise<Observation>;                 // always async, even in-proc
  decision(): Promise<Decision>;
  act(seat: Seat, answer: Answer): Promise<ActResult>;
  waitFor(pred: (o: Observation) => boolean, o?: { seat?: Seat; timeoutMs?: number }): Promise<Observation>; // event-driven, no sleeps
  events(): AsyncIterable<{ seq: number; type: "state"|"rejected"|"log"; payload: unknown }>;
  hash(): Promise<string>;
  fork?(): Promise<GameBackend>;                             // engine only
  close(): Promise<void>;
}
class EngineBackend implements GameBackend {}   // RuleEngine + createPlayableGame/scenario + shared TurnDriver
class WsBackend     implements GameBackend {}   // ws-game.ts protocol: requestId correlation, seq gap → resync
class BrowserBackend implements GameBackend {}  // Playwright: act via window.executeMove (semantic) or DOM map (visual mode); observe via __rbGameState; waitFor via page.waitForFunction(seq > n)
```
- Extract the server's `preparePlayerRotation/finalizeEndTurn/autoResolveCombat/sandboxAutoPlay` (`server/turn.ts:29-244`) and headless `advanceTurn` (`game-setup.ts:380-429`) into one `TurnDriver` in `riftbound-engine` used by both server and `EngineBackend`; otherwise the two backends will disagree on what "endTurn" does.
- `BrowserBackend` gets two act modes: `semantic` (call `window.executeMove`, same vocabulary as engine — what `ui-rules-drive.ts:55-61` does) and `visual` (option→selector map, what `monkey-drive.ts` does) so UI tests can assert the DOM affords every legal option.

### (e) Scenario builder (given/when/then)

```ts
const h = await scenario({ seed: "t1" })
  .players(2).turn(3).phase("main").active(P1)
  .runePool(P1, { energy: 5, power: { fury: 1 } })
  .battlefield("bf1", { controller: null })
  .card("scout", { def: "OGN-021", owner: P1, zone: "hand" })                       // real def id
  .card("brute", { def: { cardType: "unit", might: 4, keywords: ["Tank"] }, owner: P2,
                   zone: "battlefield-bf1", meta: { exhausted: true, damage: 1 } })  // inline def
  .deckTop(P1, ["a", "b", "c"])
  .script(P2, [{ kind: "pick", choose: byName("Brute") }], { strict: true })       // XMage-style queued answers
  .build(EngineBackend);                                                              // or WsBackend via a server-side /api/game/create {scenario}

await h.as(P1).play(h.ref("scout"), { to: "base" });   // sugar → finds action option, answers follow-ups
await h.settle();                                       // drain chain/showdown using scripts or default policy; fails in strict mode on unscripted question
expect(h.card("scout").zone.zone).toBe("base");
expect(h.violations()).toEqual([]);
```
- Implement by promoting `rules-audit/helpers.ts` (`createMinimalGameState/createCard/createBattlefield/createDeck/drainChain`) into `packages/riftbound-engine/src/testing/scenario/` and giving core a sanctioned `TestAccess` port (`engine.__test.{zones,cards,metas,flow}`) so the private-cast pattern (`helpers.ts:130-132`, `lorcana-test-engine.ts:234-251`) lives in one place. Per-engine global registry reset (`helpers.ts:166`, `game-setup.ts:249`) must become per-engine to allow parallel games in one process (MCP server, bot pools).

### (f) MCP / JSON-RPC surface

Tools (all take `gameId`; seat-scoped ones take `seat` and are filtered through the player view):
- `create_game {seed?, decks? | scenario?, mode}` → `{gameId, seats}`
- `describe_state {gameId, seat, detail: "summary"|"zones"|"full"}` → compact text + JSON (board, resources, hand for that seat only, chain, last N log lines)
- `current_decision {gameId}` → `Decision` (labels included; option keys stable for that `decision.id`)
- `list_legal_actions {gameId, seat, groupBy?: "card"|"move", flat?: boolean}`
- `act {gameId, seat, answer: Answer}` → `ActResult` (`STALE_DECISION`, `NOT_YOUR_DECISION`, engine `errorCode`s pass through)
- `explain {gameId, seat, moveId, params}` → dry-run on `fork()` returning `ConditionFailure` (never the Lorcana `whyCannotExecuteMove` pattern)
- `card_text {defId|cardId}`; `history {gameId, sinceSeq}`; `undo {gameId}` (sandbox only)
- Prefer one generic `act` keyed by `decisionId+optionKey` over 80 per-move tools; additionally publish per-move JSON Schemas generated from `RiftboundMoves` (zod) as an MCP resource for typed clients, guarded by the contract test from `.ai_memory/riftbound-mcp-plan.md`.
- Every response carries `seq` and `decision` so an LLM never needs a second round-trip to know what it may do next.

### (g) Invariants / oracles

```ts
interface Invariant { name: string; scope: "step"|"settled"|"end";
  check(prev: FullSnapshot|null, cur: FullSnapshot, step?: StepInfo): Violation[] }
harness.use(...invariants); harness.violations(): Violation[]; // also emitted into Transcript steps
```
Seed set: cost-paid (`game-tracer.ts:186-210`), monkey I1–I8 (`monkey-drive.ts:134-183`), plus generic: card conservation (multiset of instance ids constant modulo token mint/cleanup), no card in two zones / zone←→`cards[id].zone` agreement, energy/power ≥ 0, pendingChoice gates enumeration (⊆ {resolvePendingChoice, concede}), decision seat ∈ seats and exactly one non-settled decision, enumerate⇒execute agreement (sampled on a fork), determinism (same transcript ⇒ same hash), view non-leak (opponent observation contains no hidden `defId`/name; catches the id-embeds-defId class), and differential oracle (Engine vs Ws backend on the same transcript yield equal per-seat observations).

## Pitfalls to design around

- Async state arrival: WS/Browser backends must correlate `requestId` and gate on `seq` (`ws-game.ts:161-170`); never `waitForTimeout` (`ui-rules-drive.ts:60`, `monkey-drive.ts:280`). Make `EngineBackend` async too so tests can't accidentally depend on synchrony. Server auto-play (`sandboxAutoPlay`) can advance several seqs after one act — `waitFor(decision.seat === me || settled)`.
- Hidden information per seat: `getState()` is public-only but zones come from `internalState`; the harness must build observations through one redaction path (reuse `snapshot.ts:338-356` logic in-engine as `createSeatObservation`). `Decision` for another seat should be visible as `{kind, seat}` without options. Instance ids and history messages leak today.
- Legality drift between enumerate and execute: enumerators and conditions are separate code (`coverage-check.ts` already hunts "enumerated-then-rejected"); flow hooks/auto-play can change state between `list` and `act`. Mitigate with `decision.id` staleness checks, re-validation at execute, and the enumerate⇒execute invariant.
- Id stability: instance ids are stable for a card's lifetime but tokens are minted mid-game and hidden cards get positional pseudo-ids (`hidden-hand-p2-3`) that shift on every draw — never let agents hold those; expose counts instead. Option keys must be derived from canonical params, not array index of `enumerateMoves` (order depends on `Object.entries(moves)` and zone order).
- Global mutable registry (`setGlobalCardRegistry`) makes concurrent games in one process unsafe (`helpers.ts:166`, `game-setup.ts:249`) — blocker for an MCP server hosting >1 game.
- `replay()` limitation above (`undo()` is fixed); `Date.now()`/`crypto.randomUUID()` in state/history; bots using `Math.random`.
- Three divergent "move schema" type files (lorcana, riftbound, core targeting) — pick one home in core before adding a fourth in the harness.

Key files: `/root/src/tcg/tcg-engines/packages/core/src/engine/rule-engine.ts`, `/root/src/tcg/tcg-engines/packages/core/src/moves/move-enumeration.ts`, `/root/src/tcg/tcg-engines/packages/core/src/testing/index.ts`, `/root/src/tcg/tcg-engines/packages/lorcana-engine/src/testing/lorcana-test-engine.ts`, `/root/src/tcg/tcg-engines/packages/lorcana-engine/src/engine/lorcana-engine.ts`, `/root/src/tcg/tcg-engines/packages/riftbound-engine/src/__tests__/rules-audit/helpers.ts`, `/root/src/tcg/tcg-engines/packages/riftbound-engine/src/testing/playtest/game-setup.ts`, `/root/src/tcg/tcg-engines/packages/riftbound-engine/src/testing/playtest/game-tracer.ts`, `/root/src/tcg/tcg-engines/packages/riftbound-engine/src/testing/playtest/monkey-drive.ts`, `/root/src/tcg/tcg-engines/packages/riftbound-engine/src/bot/riftbound-bot.ts`, `/root/src/tcg/tcg-engines/packages/riftbound-engine/src/types/game-state.ts`, `/root/src/tcg/tcg-engines/packages/riftbound-engine/src/game-definition/moves/pending-choice.ts`, `/root/src/tcg/tcg-engines/packages/riftbound-engine/src/game-definition/moves/play/play-spell.ts`, `/root/src/tcg/tcg-engines/apps/riftbound-app/server/ws-game.ts`, `/root/src/tcg/tcg-engines/apps/riftbound-app/server/snapshot.ts`, `/root/src/tcg/tcg-engines/apps/riftbound-app/server/turn.ts`, `/root/src/tcg/tcg-engines/.ai_memory/riftbound-mcp-plan.md`.