Stopped harness work per scope change. No `card-harness.ts` or test files were created; the only artifacts are two throwaway scripts in `packages/riftbound-engine/src/__tests__/do_not_commit/` (gitignored). Working tree is otherwise unchanged. tsc baseline for `packages/riftbound-engine/tsconfig.json` is **276 errors** (mostly tests/playtest scripts; it also type-checks `riftbound-cards` files pulled in via relative imports).

# Riftbound engine inventory (for harness architect)

Paths are under `/root/src/tcg/tcg-engines/packages/riftbound-engine/src/` unless noted.

## 1. `RiftboundMoves` (`types/moves.ts`) — every move id + params

Legend: **[E]** = has an `enumerator` (surfaced by `engine.enumerateMoves(pid,{validOnly:true})`, i.e. a player decision); **[D]** = directed/flow/setup-only (no enumerator; invoked by flow, effects, or setup code); **[S]** = sandbox/tabletop meta move (no rules validation; app gates behind sandbox). All conditions additionally require `!state.pendingChoice && status==="playing"` for most gameplay moves.

Setup [D]:
- `rollForFirst {playerId}` · `chooseFirstPlayer {playerId, firstPlayerId}` · `selectBattlefield {playerId, battlefieldId, discardIds[]}` · `placeLegend {playerId, legendId}` · `placeChampion {playerId, championId}` · `placeBattlefields {battlefieldIds[]}` · `initializeMainDeck {playerId, cardIds[]}` · `initializeRuneDeck {playerId, runeIds[]}` · `shuffleDecks {playerId}` · `drawInitialHand {playerId}` · `mulligan {playerId, keepCards?[]}` · `transitionToPlay {}`

Chain/showdown:
- [E] `passChainPriority {playerId}` · [E] `resolveChain {}` · [E] `passShowdownFocus {playerId}` · [E] `startShowdown {playerId, battlefieldId}` · [E] `endShowdown {}` · [E] `invitePlayer {playerId, invitedPlayerId}` · [D] `counterSpell {playerId, targetChainItemId}` (rule 544.4: only via effects)

Turn: [D] `advancePhase {playerId}` · [E] `endTurn {playerId}` (harness must use `advanceTurn()` wrapper, not raw) · [E] `concede {playerId}` · [D] `readyAll {playerId}` · [D] `emptyRunePool {playerId, directed?}`

Card play:
- [E] `playUnit {playerId, cardId, location, paidAdditionalCost?, additionalCostSpec?{energy?,power?[]}, sacrificeId?}`
- [E] `playGear {playerId, cardId, chosenTargetId?}`
- [E] `playSpell {playerId, cardId, targets?[], xAmount?, repeatCount?, viaFlow?, paidAdditionalCost?, additionalCostSpec?}`
- [E] `hideCard {playerId, cardId, battlefieldId}` · [E] `revealHidden {playerId, cardId}` · [E] `playFromChampionZone {playerId, location}`

Movement: [E] `standardMove {playerId, unitIds[], destination}` · [E] `gankingMove {playerId, unitId, toBattlefield}` · [E] `recallUnit {playerId, unitId}` · [D] `recallGear {playerId, gearId}`

Resources: [D] `channelRunes {playerId, count, directed?}` · [E] `exhaustRune {playerId, runeId}` · [E] `recycleRune {playerId, runeId, domain}` · [D/S] `addResources {playerId, energy?, power?}` (what tutor uses) · [D] `spendResources {playerId, energy?, power?}`

Combat: [E] `contestBattlefield {playerId, battlefieldId}` · [D] `assignAttacker {playerId, unitId}` · [D] `assignDefender {playerId, unitId}` · [D] `assignDamage {playerId, targetId, amount}` · [D] `resolveCombat {battlefieldId}` · [E] `resolveFullCombat {battlefieldId}` · [E] `conquerBattlefield {playerId, battlefieldId}` · [E] `scorePoint {playerId, method:"conquer"|"hold", battlefieldId, previousController?}` · [D] `clearCombatState {battlefieldId}`

Counters/status [D/S]: `exhaustCard {cardId}` · `readyCard {cardId}` · `addDamage {cardId, amount}` · `removeDamage {cardId, amount}` · `clearDamage {cardId}` · `addBuff {cardId}` · `removeBuff {cardId}` · `stunUnit {cardId}` · `unstunUnit {cardId}`

Discard/trash [D/S]: `discardCard {playerId, cardId}` (has condition) · `killUnit {cardId}` · `banishCard {cardId}` · `recycleCard {cardId}`

XP [D]: `gainXp {playerId, amount}` · `spendXp {playerId, amount}`

Abilities: [E] `activateAbility {playerId, cardId, abilityIndex, sourceCardId?, sacrificeId?, discardId?}` (no `targets` param — targets are picked at resolution via `choose-target` pendingChoice)

Equipment [D]: `equipCard {playerId, equipmentId, unitId}` (condition only, no enumerator) · `unequipCard {playerId, equipmentId}`

Draw [D]: `drawCard {playerId, count?}` · `burnOut {playerId, opponentId, source?:"draw"|"look"|"mill"|"directed"}`

Pending choice: [E] `resolvePendingChoice {playerId, pickedCardId?, pickedName?, pickedZoneId?, pickedMode?, accept?}`

Sandbox meta [S]: `addToken {playerId, zoneId, tokenName:"Gold"|"Recruit"|"Mech"|"Sand Soldier"|"Sprite"|"Bird", count?}` · `addCounter {cardId, counterType:"plus"|"minus"|"poison"|"experience", delta}` · `modifyBuff {cardId, deltaMight, deltaToughness?}` · `duplicateCard {playerId, cardId, destinationZone}` · `labelCard {cardId, label}` · `transferControl {cardId, newControllerId}` · `peekTopN {playerId, count}` · `placeCardsOnTopOfDeckInOrder {playerId, cardIds[]}` · `revealTopToOpponent {playerId, count}` · `recycleMany {playerId, cardIds[]}` · `sendToHand {cardId}`

Moves with enumerators (the full player-decision surface, 24): exhaustRune, recycleRune, hideCard, revealHidden, endTurn, concede, activateAbility, recallUnit, gankingMove, playGear, invitePlayer, standardMove, conquerBattlefield, passChainPriority, resolveChain, resolvePendingChoice, playFromChampionZone, scorePoint, contestBattlefield, passShowdownFocus, startShowdown, endShowdown, playUnit, playSpell, resolveFullCombat.

## 2. `PendingChoice` union (`types/game-state.ts`) + `resolvePendingChoice` param per type

Reducer/enumerator: `game-definition/moves/pending-choice.ts` (also exports `pickDefaultForChoice(choice)`). While `state.pendingChoice` is set, only `resolvePendingChoice` is legal. Acting player = `choice.playerId ?? choice.prompter`.

| type | fields | resolve params | enumerated? |
|---|---|---|---|
| `reveal-and-pick` | prompter, revealer, revealed[], filter?{excludeCardTypes[]}, onPicked:"recycle"\|"banish"\|"discard"\|"draw"\|"play", playEnergyReduction?, optional?, onRest?:"recycle", sourceCardId?, then? | `{pickedCardId}`; if `optional`: `{accept:false}` to decline | yes, one per valid revealed id (+decline) |
| `name-card` | prompter, sourceCardId, cardType, options[] (names) | `{pickedName}` | yes, one per name (can be hundreds) |
| `choose-target` | playerId, sourceCardId, effect, options[] (cardIds), remaining, boundTargets?, assign? | `{pickedCardId}` (with `assign`: pick = +1 damage to that id; with `boundTargets` sans assign: pick = target to DROP) | yes |
| `choose-destination` | playerId, cardId, options[] (zoneIds: "base"/`battlefield-<id>`) | `{pickedZoneId}` | yes |
| `choose-mode` | playerId, sourceCardId, effect, options[] (indexes), notChosenThisTurn? | `{pickedMode}` | yes |
| `opt-in` | playerId, sourceCardId, resolved (ChainItem) | `{accept:true\|false}` | yes (both) |
| `weaponmaster-equip` | playerId, unitId, options[] (equipment ids) | `{pickedCardId}` or `{accept:false}` | yes |

Producers: `abilities/effects/{look,reveal-hand,discard}.ts` → reveal-and-pick; `damage.ts`, `move.ts`, `chain/resolve.ts:116` → choose-target; `move.ts`, `recycle.ts` → choose-destination; `name-card.ts` → name-card; `chain/resolve.ts:42` → opt-in (from `ChainItem.optional`); `play/play-unit.ts:436` → weaponmaster-equip. (`peekTopN` docs mention a `peek-top` choice but it is not in the union.)

## 3. Open-ended decision points (what a harness `play()`/`choose()` must be able to express)

Play-time (locked onto the chain item, enumerated as separate move variants unless noted):
- `playSpell.targets[]` — one variant per legal single target; `upTo:N` descriptors enumerate every subset (incl. empty); `fight` effects enumerate `[attacker, defender]` pairs; split-damage (unl-192) enumerates `[refUnit, ...subset]`.
- `playSpell.xAmount` — NOT enumerated; caller must supply (open integer).
- `playSpell.repeatCount` — enumerated 1..affordable when Repeat cost charges resources.
- `playSpell.viaFlow` — enumerated for Flow spells in trash.
- `playSpell/playUnit.paidAdditionalCost + additionalCostSpec` — paid variant enumerated alongside base.
- `playUnit.sacrificeId`, `activateAbility.sacrificeId/discardId` — one variant per legal sacrifice/discard.
- `playUnit.location` / `playFromChampionZone.location` — "base" or `battlefield-<bfId>` variants.
- `playGear.chosenTargetId` — interactive cost reduction (target's Might).
- `standardMove.unitIds[]` — every non-empty subset of ready base units × destination (rule 144.3).
- `hideCard.battlefieldId`, `gankingMove.toBattlefield`, `recycleRune.domain`, `scorePoint.method`.

Resolution-time (surface as `pendingChoice`): choose-target (incl. split-damage distribution via `assign`, drop-illegal via `boundTargets`), choose-destination (move with no stated destination), choose-mode (modal), reveal-and-pick (look/reveal-hand/discard-from-hand; `optional` decline; `onRest`), name-card, opt-in (`ChainItem.optional` "you may" triggers), weaponmaster-equip.

Not player-choosable today: simultaneous-trigger ordering (`abilities/trigger-runner.ts` ~L434: rule 585 uses turn-player-first then scan order; no choice surfaced); `counterSpell` target (effect-driven); combat damage assignment order inside `resolveFullCombat` (automated; manual `assignDamage` exists but is [D]); mulligan `keepCards`.

## 4. Read-side accessors

- `engine.getState(): RiftboundGameState` — `players[pid]{victoryPoints,xp,turnsTaken,victoryScoreModifier}`, `runePools[pid]{energy,power}`, `battlefields[bfId]{controller,contested,contestedBy,showdownComplete}`, `turn{number,activePlayer,phase}`, `status`, `winner`, `interaction{chain{items[],active,activePlayer,passedPlayers,relevantPlayers,turnOrder}|null, showdownStack[], nextChainItemId}`, `pendingChoice`, `conqueredThisTurn`, `scoredThisTurn`, `xpGainedThisTurn`, `cardsPlayedThisTurn`, `unitsMovedThisTurn`, `turnEvents`, `firstTurnNumber`, `consumedNextReplacements`, `activeReplacements`, `setup`.
- `ChainItem {id,type:"spell"|"permanent"|"ability",cardId,controller,effect?,targets?,triggered?,triggerEvent?,optional?,countered?,resolveTo?}` (`chain/chain-state.ts`; helper `getActiveShowdown`).
- Zones/cards are NOT in getState: `(engine as any).internalState` → `zones[zoneId]{config,cardIds[]}` (zone ids: mainDeck, hand, base, trash, banishment, runeDeck, runePool, legendZone, championZone, battlefieldRow, `battlefield-<bfInstanceId>`, `facedown-<bfInstanceId>`), `cards[instId]{definitionId,owner,controller,zone,position}`, `cardMetas[instId]` = `RiftboundCardMeta` (damage, buffed, stunned, exhausted, combatRole, hidden, attachedTo, equippedWith[], grantedKeywords[{keyword,value?,duration}], grantedAbilities[], mightModifier, staticMightBonus, empowered, costModifier, restrictions[], namedCard, modesChosenThisTurn[], controlEffects[], toughnessModifier, label…) plus reserved `__flags{exhausted,stunned,buffed}` and `__counters{damage,…}`. Note flags are authoritative for exhausted/stunned/buffed (meta mirrors may lag); damage is mirrored to both `__counters.damage` and `meta.damage`.
- Other engine API: `enumerateMoves(pid,{validOnly,moveIds,includeMetadata})`, `executeMove(id,{playerId,params}) → {success,error?,errorCode?}`, `canExecuteMove`, `getValidMoves`, `getPlayerView(pid)`, `hasGameEnded`, `getHistory`, `getReplayHistory`, `getPatches/applyPatches`, `undo/redo/replay`, `getRNG`, `getFlowManager()` (`setCurrentPlayer`), `getLogger`, `getTelemetry`.
- Registry (`operations/card-lookup.ts`): `getGlobalCardRegistry()/setGlobalCardRegistry()/clearGlobalCardRegistry()`; instance methods `register, get, hasKeyword, cantReady, getEnergyCost, getPowerCost, getMight, getMightBonus, getAbilities, getCardType, getSpellTiming, getSpellRepeatCost, getSpellFlowCost, getInteractiveCostReduction, hasMoveEscalation, canAfford, getCostToDeduct, listNames`. Keyed by INSTANCE id.
- Effective might: `getCardEffectiveMight(cardId, getCardMeta?)` in `game-definition/moves/play/cost.ts` (base + buffed + mightModifier + staticMightBonus + equipment; usable headless with `id => internal.cardMetas[id]`); `getEffectiveMight(cardId, ctx)` in `abilities/effects/_helpers.ts` (needs EffectContext); `calculateCombatMight` (`keywords/keyword-effects.ts`, Assault/Shield); `MIGHTY_THRESHOLD=5`.
- `views/player-view.ts createPlayerView(state,pid)`; `bot/riftbound-bot.ts RiftboundBot{isMyTurn,takeAction,takeTurn}`.
- `testing/riftbound-test-engine.ts RiftboundTestEngine` wraps the older state-only `RiftboundEngine` (not RuleEngine, no card registry) — not suitable for per-card tests.

## 5. What `testing/playtest/game-setup.ts` already provides

- `type Engine`, `DeckConfig {mainDeckCardIds, runeDeckCardIds, battlefieldIds, legendId?, championId?}`.
- `createPlayableGame(allCards, deck1, deck2, seed)` → `{engine, instanceIds{p1[],p2[]}}`: resets global registry, registers every instance (`<pid>-main-<i>-<defId>`, `-rune-`, `-legend-`, `-champion-`, `-bf-`), runs the full setup move sequence, creates `battlefield-<bf>`/`facedown-<bf>` zones, `transitionToPlay` → P1 turn 1 main phase (channel 2 + draw already applied). Players fixed as `player-1`/`player-2`. No mulligan.
- `buildDefaultDeck(allCards, d1, d2, strategy, seed)` — 40 main / 12 runes / 3 bfs / matching legend+champion.
- `advanceTurn(engine, players)` — the correct endTurn wrapper (sets flow current player, handles ending/beginning holds and extra turns).
- `getZoneCards(engine, zone, playerId?)`, `getCardMeta(engine, id)` (merges `__flags.exhausted`), `definitionIdOf(engine, id)`.
- Private (would need exporting for a harness): `makeLookupPayload(def, cid, overrides)`, `registerCard(internal, cid, defId, owner, zone)`, `getInternal(engine)`.
- Card pool: `getAllCards()` from `@tcg/riftbound-cards` resolves at runtime under bun (existing engine tests use `await import("../../../riftbound-cards/src/data/all-cards")`). Parsed abilities observed: Cleave = grant-keyword Assault 3/turn; Death from Below = only the `kill` clause (play-from-trash clause is unparsed, so it would be a `test.failing` BUG); Loose Cannon = triggered beginning-phase conditional draw. No vanilla battlefield exists (every battlefield def has an ability) — a harness wanting an inert board should register battlefields with `abilities: []`; vanilla filler units exist (e.g. `ogn-175-298` Shipyard Skulker, 3 might).
- App tutor reference: `/root/src/tcg/tcg-engines/apps/riftbound-app/server/routes-game.ts` L213-278 (spawn id `<pid>-main-999-<defId>`, `registry.register(found, def)`, then `addResources` energyCost+4 and one power per pip).