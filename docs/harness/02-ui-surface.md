# Riftbound web client + server — interface-level action/observation surface

> **Update (UI affordance audit, e31df16+)** — the move-kind → control map is now maintained (and test-backed) in
> [`UI-AFFORDANCES.md`](./UI-AFFORDANCES.md). Since this inventory was written: `equipCard` has a card-bar
> "Equip <cost> → choose a unit" button + drag-onto-unit + sidebar row; hand cards / the champion can be dragged to a
> lit battlefield (`location` variants, `hideCard`); facedown cards click → "Reveal"; `playSpell`/`playGear` get one
> sidebar row per card; every `pendingChoice` type has a titled modal (order / pick-many / pay-x get composite
> choosers; the 383.3.d trigger-order offer is a sidebar panel); the pending backdrop is click-through; the sidebar
> header names whoever holds priority / focus / the prompt. §5 "gaps" below is partially superseded by that table.

All paths under `/root/src/tcg/tcg-engines/apps/riftbound-app/` unless absolute. Client scripts are classic (non-module) globals loaded in the order at `public/gameplay.html:317-345`. **`auto-pay.js` is NOT loaded** (interactions.js:3).

---

## 1. User gestures → move / message

Single dispatch funnel: **`executeMove(moveId, params, playerId)`** (`public/js/gameplay/game-flow.js:3-27`).
- If `playerId === viewingPlayer` → WS `{type:"move", moveId, params, requestId:"req-N"}` (line 26).
- Else (hot-seat) → REST `POST /api/game/:id/move {moveId, playerId, params}` then `requestResync()` (lines 11-22). REST is **sandbox-only** (routes-game.ts:78).
- Every UI path picks a move object out of `availableMoves` and forwards its exact `params`/`playerId`; the UI almost never synthesizes params (exceptions flagged below with **[SYNTH]**).

### 1a. Per-zone pointer gestures
All cards render with `onpointerdown="onPointerDown(event,id)"`, `ondblclick="openZoom(id)"`, `onmouseenter=showPreview` (`render/card.js:207-229`, `render/runes.js:230-248`). `pointerup` without crossing 6px threshold → `onCardClick(cardId)` (`drag-drop.js:369-372`); crossing → drag (`drag-drop.js:179-273`). Cards are only draggable/`.playable` if `hasMovesForCard` finds a move whose `params.cardId|unitId|runeId|gearId|unitIds` references it (`drag-drop.js:47-60`).

| Zone (DOM) | Click (`onCardClick`, interactions.js:14-122) | Drag/drop (`drag-drop.js`) | Right-click (`audio.js:76-98`) | Dbl-click |
|---|---|---|---|---|
| **hand** `#player-hand [data-zone=hand]` | `enterHandCardSelected` (543-610): filter `playUnit/playSpell/playGear` with `params.cardId`. If any variant has a target (`params.targets[0]` or `params.chosenTargetId`) → **targeting mode** (`beginTargetingIfNeeded` 261-271). Else if >1 variant → `openPlayCostModal(cardId)`. Else `executeMove(playMoves[0])`. If 0 moves and energy short and rune moves exist → legacy `costPayment` mode (613-629). | drag to `#player-base[data-drop-zone=player-base]` → same three-way branch (drag-drop.js:305-317). Gear dragged onto a friendly unit `[data-card-id]` → `playGear` with **[SYNTH]** `{...gearMove.params, chosenTargetId: unitId}` (333-351). | `sendPing(cardId,"card")` → WS `game_ping` | `openZoom` |
| **base** `#player-base` | `enterBaseCardSelected` (694-728): `standardMove` where `params.unitIds` includes card; shows action bar buttons "Move to <bf>" → `onZoneClick(bfId)` | drag to `.battlefield[data-drop-zone=<bfId>]` → `standardMove` matched by `params.destination` (drag-drop.js:319-324) | ping | zoom |
| **battlefield-<bfId>** units | `enterBattlefieldCardSelected` (759-796): `gankingMove` (`params.toBattlefield`) + `recallUnit` (`params.unitId`); action bar "Recall to Base" → `executeInteractionMove("recallUnit")`, "Gank to X" → `onZoneClick` | drag to other battlefield → `gankingMove` | ping | zoom |
| **battlefield container** `.battlefield[data-bf-id]` | `onBattlefieldClick` (overlays.js:135-143) → `onZoneClick(bfId)` if in cardSelected w/ that target | drop target | `sendPing(bfId,"battlefield")` | `.bf-art` dblclick → zoom |
| **runePool** `.rune-stack .card[data-zone=runePool]` | `enterRuneSelected` (731-756): immediately `executeMove(exhaustRune)` matched by `params.runeId` | not draggable (no ctx) | `quickRecycleRune` (427-456): if ready → `exhaustRune` then polls ≤10×100ms for `meta.exhausted` then `recycleRune`; if already exhausted → `recycleRune` directly | zoom |
| **legendZone** | `enterLegendSelected` (459-484): `activateAbility` with `params.cardId`; action bar "Activate Ability N" → `executeInteractionMove("activateAbility", abilityIndex)` → targeting if variants carry targets | — | ping | zoom |
| **championZone** | `enterChampionSelected` (507-540): `playFromChampionZone`; action bar "Play Champion to Base" / click `#player-base` | drag to base or any battlefield → match `params.location` else **[SYNTH]** `{playerId, location}` (drag-drop.js:298-304) | ping | zoom |
| **mainDeck pile** `#player-decks .deck-stack--peekable` | — | — | `openPeekDialog(1)` (render/card.js:239) | — |
| runeDeck / trash / opponent piles | inert (count only, `renderDeckStack`) | — | — | — |
| opponent cards | select-for-preview only (interactions.js:98-103); clickable as **targets** via document listener (394-400) when `.valid-target` | — | ping | zoom |
| `#player-base` empty area | `init.js:48-58` → `onZoneClick("player-base")` when cardSelected/playCard | | | |
| empty board space | cancels targeting (interactions.js:385-390) | | | |

`onZoneClick(targetId)` (`drag-drop.js:4-39`): finds `interaction.matchingMoves` with `params.destination|toBattlefield|battlefieldId === targetId` → executeMove; or for base → targeting-or-first-variant.

### 1b. Targeting mode (interactions.js:196-400)
- Entered by `enterAwaitTargetMode(pendingMoves, sourceCardId)`; `interaction.mode="awaitTarget", action="chooseTarget"`, `validTargets` = union of all target ids; DOM gets `.valid-target` + `body.targeting-mode`; banner `#targetBanner` with buttons "No target" (zero-target variant) / "Done (n)" (exact multi-target variant) (308-347).
- Click legal target → if some variant strictly extends chosen set, accumulate; else `exactTargetVariant`/`pickTargetedMove` → executeMove (34-61). Prefers `!paidAdditionalCost && !repeatCount` variant (228-247).
- Esc / click elsewhere / illegal card → `cancelInteraction()`.

### 1c. Cost-payment legacy mode (interactions.js:613-669, render/actions.js:61-124)
Click unaffordable hand card → runes get `.rune-tappable`; clicking rune → `exhaustRune`; on each `move_accepted` `reevaluateCostPayment` transitions to cardSelected when a play move appears; action-bar button → `executeInteractionMove(moveId)`.

### 1d. Hotkeys
`init.js:4-45` (always active, not in inputs):
| Key | Action |
|---|---|
| Space | first of `passChainPriority`/`passShowdownFocus` in availableMoves, else `endTurn` |
| Esc | closeZoom → cancel targeting → (chain overlay: nothing) → cancelInteraction |
| Ctrl/Cmd+Z | `requestUndo()` → WS `{type:"undo"}` |
| Ctrl+Y / Ctrl+Shift+Z | `requestRedo()` → WS `{type:"redo"}` |

`hotkeys.js:358-477` (press):
| Key | Fn | Move |
|---|---|---|
| D | `hotkeyDrawCard` | `drawCard` — **always rejected**: in `SERVER_ONLY_MOVES` (config.ts:24) |
| R / Backspace | `hotkeyRewind` | WS `undo` |
| A | `hotkeyApproveChain` | `passChainPriority` or `passShowdownFocus` |
| S | `hotkeyResolveChain` | `resolveChain` |
| Q | `showdownHotkeyConquer` (showdown.js:281-303) | `conquerBattlefield` for focused showdown bf, fallback `endShowdown` |
| W | `showdownHotkeyPassFocus` (259-275) | `passShowdownFocus` (only if `sd.focusPlayer===viewingPlayer`) |
| ? | toggle help modal | — |

Hold-to-arm (hotkeys.js:33-158; click while held → `handleArmedCardClick`):
| Hold | Mode | Dispatch |
|---|---|---|
| C | counter | **[SYNTH]** `addCounter {cardId, counterType: "plus"|"minus", delta:1}` (meta-actions.js:66-76) |
| Shift+C | duplicate | **[SYNTH]** `duplicateCard {playerId, cardId, destinationZone:"hand"}` (sandbox-gated client-side, 94-110) |
| B | buff | **[SYNTH]** `modifyBuff {cardId, deltaMight:1, deltaToughness:0}` |
| Shift (bare) | top-of-deck | **[SYNTH]** `placeCardsOnTopOfDeckInOrder {playerId, cardIds:[cardId]}` (own hand only) |
| T | target | stub/toast only |
| L | label wheel | UI placeholder, no move |
| E | emote wheel | UI placeholder |
| P | ping | placeholder toast (does NOT call sendPing) |

### 1e. Sidebar / panels
- **`#actionsList`** (`render/actions.js:126-432`) — the canonical "everything legal" list. Sections turn/play/movement/runes/battlefield/other. Single-variant → button `onclick=executeMove(moveId, params, playerId)` verbatim. Targetable groups (`playSpell/playGear/playUnit/activateAbility` with targets) → `[data-target-play]` → `beginTargetingOrPlay`. `playUnit`/`playFromChampionZone` with ≥2 variants per card → `[data-play-cost-card]` → `openPlayCostModal`. `exhaustRune/recycleRune` grouped by domain, **button fires first rune of that domain** (380-386). Other multi groups collapsible `#move-group-<moveId>`, **capped at 15 shown** (401-415). Pending choice rendered at top with `resolvePendingChoice` buttons + revealed card imgs (197-244).
- **End Turn**: `renderEndTurnButton`/`onEndTurnClick` target `#endTurnBtn` which **does not exist in gameplay.html** (only CSS) → End Turn is reachable only via `#actionsList` "End Turn" button or Space.
- `#undoBtn`/`#redoBtn` → WS `undo`/`redo` (gameplay.html:198-199; render/log.js:199-207). Log row `↺` → `requestUndo` (single step regardless of row, log.js:137-142).
- **Leave**: `.leave-btn` → `showLeaveConfirm` → `#confirmLeave` → `confirmLeaveGame()` → WS `{type:"leave_game", role: lobbyRole}` then local teardown (overlays.js:147-186). Game-over overlay "Return to Lobby" → same.
- **Player switcher** `#playerSwitcher` → `switchPlayer(pid)`: sets `viewingPlayer`, reconnects WS as that player (interactions.js:5-12). Works in any game (server trusts `?player=`).
- **Meta-actions panel** `#actions-panel-mount [data-action=arm-counter|sign-plus|sign-minus|arm-buff|arm-duplicate|arm-label|arm-emote]` (meta-actions.js:118-216) — arms same modes as hotkeys.
- **Token panel** `.token-panel` on `#player-base` and each `.battlefield`: `+` opens grid; `.token-panel__btn` → **[SYNTH]** `addToken {playerId, zoneId: "base"|"battlefield-<bfId>", tokenName}` (token-panel.js:105-114). Tokens: base = Gold,Recruit,Mech,Sand Soldier,Sprite,Bird; bf = same minus Gold.
- **Resource bar sandbox ±** (only if `localStorage["rba-sandbox-mode"]==="true"`, toggle via `window.setSandboxMode(bool)`): **[SYNTH]** `addResources`/`spendResources {playerId, energy:1 | power:{dom:1}}` (render/runes.js:48-71).
- **Board toggles** `#board-toggles-panel [data-toggle-name]` — localStorage only, no moves (board-toggles.js).
- **Hand Hide/Show** `.card-hide-btn` — localStorage only (render/hand.js).

### 1f. Modals / overlays
| Overlay | Visible when | Buttons → dispatch |
|---|---|---|
| **Chain** `#chainOverlay.visible` / `#chainBox` (render/modals.js:187-296) | `gameState.interaction.chain.active` | if `chain.activePlayer===viewingPlayer`: `.chain-pass-btn` → `passChainPriority`; `.chain-resolve-btn` → `resolveChain`. Esc does NOT close. Reactions are played from hand/action list while overlay is up. |
| **Showdown panel** `.battlefield__showdown-panel[data-battlefield-id]` inside each `.battlefield` (showdown.js:143-252) | `interaction.showdown.active` (top of `showdownStack`) | `--pass` → `passShowdownFocus` (focus holder only); `--conquer` → `conquerBattlefield{battlefieldId}` (enabled when all `relevantPlayers` ⊆ `passedPlayers` or `!active`); `--cancel` → `endShowdown` (initiator, nobody passed). Panel is `pointer-events:none` while viewer has a pendingChoice. |
| **Pending choice** `#choiceOverlay.visible[data-mode=pending]` / `#choiceBox` (modals.js:24-109) | `gameState.pendingChoice && (prompter??playerId)===viewingPlayer` | `.choice-modal-card[data-pick-idx]` → `resolvePendingChoice` (variants with `params.pickedCardId`); `.choice-modal-btn[data-other-idx]` → variants with `pickedZoneId` / `pickedName` / `accept:true|false` (opt-in Yes/No). Title derived from `pending.type` (`opt-in`,`choose-target`,`choose-destination`,`name-card`) / `pending.onPicked` (`discard`,`banish`,`recycle`,`draw`,`play`). Board cards matching `pickedCardId` also glow and are clickable (`pendingChoicePickForCard`, interactions.js:365-370); overlay gets `.targeting` (click-through). |
| **Play-cost** `#choiceOverlay[data-mode=playCost]` (modals.js:145-183) | opened by UI for ≥2 `playUnit`/`playFromChampionZone` variants of one card | `.choice-modal-btn[data-variant-idx]` → that variant (labels from `describePlayVariant`: base / `+ Accelerate` (`paidAdditionalCost`,`additionalCostSpec`) / `+ sacrifice` (`sacrificeId`) / location); `.choice-modal-cancel` |
| **Target banner** `#targetBanner.visible` | targeting mode | `.target-banner-btn` "No target"/"Done (n)" |
| **Action bar** `#actionBar` (not `.hidden`) | cardSelected/costPayment | `#actionBarBtns .action-bar-btn` (inline `executeInteractionMove(...)`/`onZoneClick(...)`), `.cancel-btn` → `cancelInteraction` |
| **Peek dialog** `#peekDialog.visible` (peek-dialog.js) | right-click own main deck | open → **[SYNTH]** `peekTopN{playerId,count}`; `[data-peek-action=more]` → `peekTopN count+1`; `play` → matching play move; `recycle` → **[SYNTH]** `recycleCard{cardId}`; `tohand` → **[SYNTH]** `sendToHand{cardId}`; `ontop` toggles local order; `recycleAll` → `recycleMany{playerId,cardIds}`; `reveal` → `revealTopToOpponent{playerId,count}`; `close` → if On-Top list non-empty: `placeCardsOnTopOfDeckInOrder{playerId,cardIds}` + `recycleMany` for the rest. Reads cards from `gameState.zones.mainDeck` (index 0 = top). |
| **Card zoom** `#cardZoom.visible` | dblclick | click/Esc closes; refuses to open while any `.chain-overlay.visible` or targeting |
| **Hover preview** `#cardPreview.visible`, sidebar `#hover-preview` | mouseover | none |
| **Coin flip** `#coinOverlay.visible` (pregame.js:4-118) | lobby `coinFlip` w/o `firstPlayer` | `.coin-choose-btn` → `chooseTurnOrder('self'|'opponent')` → **lobby WS** `{type:"choose_first", choice}` (winner only; shown after ~1.5s roll animation + 500ms) |
| **Pregame** `#pregameOverlay.visible` / `#pregameContent` | `sync.pregame.phase` set | bf select: `.bf-choice` → `selectBattlefield(id)` → game WS `{type:"pregame_battlefield_select", battlefieldId}`; mulligan: `[data-mulligan-id]` toggles (max 2), `.mulligan-btn-keep`/`.mulligan-btn-redo` → `confirmMulligan()` → game WS `{type:"pregame_mulligan", sendBack:[cardIds]}` |
| **Game over** `#gameOverOverlay.visible` | `status==="finished"` | `.go-btn` → `returnToLobby` → leave_game |
| **Leave confirm** `#confirmLeave.visible` | Leave click | `.confirm-yes`/`.confirm-no` |
| **Sideboarding** `#pregameOverlay.visible #sbColumns` | `pregame.phase==="sideboard"` (only when a deck has a sideboard) | row click main→side (or drag) → `sideboard_swap {out,in}`; `#sbLockBtn` → `sideboard_lock`; `.sb-undo` |
| Help `#helpModal`, emote/label wheels | | no engine effect |

Concede: no dedicated UI; appears only as an `#actionsList` "Concede" button if the engine enumerates `concede`.

---

## 2. WebSocket / REST protocol

### Game WS `ws[s]://host/ws/game/:gameId?player=<player-1|player-2>` (ws-game.ts:18-39; **no auth, `player` is trusted**; 4004 close if game missing)

Client → server (`gameWsMessage`, ws-game.ts:57-309; pregame intercept pregame.ts:349-484):
| type | shape | notes |
|---|---|---|
| `move` | `{type, moveId, params, requestId?}` | `params` required (even `{}`); `SERVER_ONLY_MOVES` rejected with `{type:"error"}` (config.ts:20-37: channelRunes, emptyRunePool, readyAll, drawCard, advancePhase, clearDamage, initialize*, shuffleDecks, drawInitialHand, place*, transitionToPlay, scorePoint, removePlayer). playerId = socket's `?player`. During pregame: silently swallowed (pregame.ts:468-481). |
| `resync` | `{type}` | → `sync` |
| `undo` / `redo` | `{type}` | broadcast `state_update` with `moveId:"undo"|"redo"`; errors as `{type:"error", error}` |
| `leave_game` | `{type, role?}` | host (players[0]) → `game_ended` broadcast + session deleted; guest → `player_disconnected{voluntary:true}` |
| `ping` | `{type}` | → `pong` (client sends every 25s) |
| `game_ping` | `{type, target, targetType:"card"|"battlefield"|"zone", message?}` | rebroadcast to all incl. sender |
| `pregame_battlefield_select` | `{type, battlefieldId:<defId>}` | only in `battlefield_select` phase; must be in player's `battlefieldOptions` |
| `pregame_mulligan` | `{type, sendBack: string[]}` (0-2 card instance ids) | engine `mulligan{keepCards:sendBack}` (param is misnamed; it is the send-back list). Sandbox auto-completes the other seat. When all done → `finalizePregame` → `sync` with `pregame:null`. |

Server → client:
| type | shape | emitted |
|---|---|---|
| `sync` | `{type, seq, state, moves, pregame?}` | on open (ws-game.ts:328-334), on `resync`, on every pregame update (`broadcastPregameUpdate`), on pregame→playing transition (`pregame:null`) |
| `move_accepted` | `{type, seq, state, moves, moveId, playerId, requestId, phaseChange?:{from,to}}` | to acting socket only |
| `state_update` | `{type, seq, state, moves, moveId, playerId, phaseChange?}` | to all *other* sockets after a WS move; to **all** sockets after REST move, undo/redo (`moveId:"undo"/"redo"`), goldfish (`moveId:"sandboxAutoPlay"`, turn.ts:220-237), tutor (no moveId, includes `log`) |
| `move_rejected` | `{type, error, errorCode, requestId}` | acting socket |
| `error` | `{type, error, requestId?}` | bad JSON, missing params, server-only move, undo/redo failures, invalid bf choice |
| `player_connected` / `player_disconnected` | `{type, playerId, clientCount, voluntary?}` | |
| `game_ended` | `{type, reason:"host_left"}` | |
| `pong`, `game_ping{playerId,target,targetType,message}` | | |

`moves` (= `availableMoves`) is **always per-recipient** (`buildAvailableMoves(session, client.playerId)`, snapshot.ts:19-23 → `engine.enumerateMoves(pid,{validOnly:true})` mapped to `{moveId, params, playerId}`). `state.pendingChoice` rides in every snapshot (snapshot.ts:407).

### Lobby WS `/ws/lobby/:lobbyId?role=host|guest` (ws-lobby.ts)
Client → server: `select_deck{deckId}` ("default" or saved-deck id), `set_mode{mode:"duel"|"match"}`, `set_single_player{enabled}` (host, waiting only; fills Goldfish guest), `start_game{}` (host; both ready → rolls d20, sets `coinFlip{winner,p1Roll,p2Roll,firstPlayer:""}`), `choose_first{choice:"self"|"opponent"}` (roll winner only → creates GameSession, `status:"started"`, `gameId`), `ping`.
Server → client: only `lobby_update{lobby:{id,code,status,gameId,gameMode,sandbox,coinFlip,host:{name,hasDeck,ready},guest|null}}` (state.ts:65-83) on every change and on open.

### REST (routes-*.ts)
- `POST /api/auth/login {username,password}` → `{token,user}` + `Set-Cookie rb_token`; `GET /api/auth/dev-credentials` (loopback+SANDBOX_ENABLED+DEFAULT_USERNAME/PASSWORD env → auto token); `GET /api/auth/me`.
- `GET /api/config` → `{sandboxEnabled,...}`; `GET /api/saved-decks`, `/api/saved-decks/public`.
- `POST /api/lobby/create {name?, sandbox?, gameMode?}` → `{lobbyId, code}` (sandbox requires `SANDBOX_ENABLED=true`); `POST /api/lobby/join {code,name?}`; `GET /api/lobby/:id`.
- `POST /api/game/create {seed?, deck1?, deck2?, sandbox?}` → `{gameId, state}` — **duel, no lobby, but leaves `session.pregame.phase="mulligan"`**; must still send `pregame_mulligan` over WS.
- `GET /api/game/:id/state` (unredacted, no auth); sandbox-only: `GET /api/game/:id/moves?player=`, `POST /api/game/:id/move {moveId,playerId,params}` → `{success,state,phaseChange}|{success:false,error,errorCode}` (also broadcasts `state_update` to all WS), `POST .../undo`, `.../redo`, `GET .../history`.
- `POST /api/game/:id/tutor {defId, playerId?}` (SANDBOX_ENABLED + sandbox session): moves/spawns card into hand, `addResources` energy=cost+4 + power pips, pushes `state_update` (routes-game.ts:217-278).
- `GET /play/test` (SANDBOX_ENABLED): server creates a goldfish duel already past mulligan and injects `sessionStorage.rb_game` into the HTML → page auto-connects (routes-static.ts:101-127). **Fastest path to a playable board.**

---

## 3. Observation surface

### `window.__rbGameState` (state.js:15-18) = last `state` from sync/move_accepted/state_update = `buildGameSnapshot(session, viewingPlayer)` (snapshot.ts:317-418):
```
{ gameId, status: "setup"|"playing"|"finished", winner, victoryScore,
  turn: { phase: awaken|beginning|channel|draw|main|ending|cleanup, activePlayer, number },
  players: { [pid]: { victoryPoints, ... } },
  runePools: { [pid]: { energy, power: { fury|calm|mind|body|chaos|order: n } } },
  battlefields: { [bfCardId]: { controller, contested, ... } },      // bfCardId = "player-N-bf-<defId>"
  zones: { [zoneId]: Card[] },  // zoneIds: hand, mainDeck, runeDeck, base, runePool, legendZone, championZone,
                                //   battlefieldRow, trash, banishment, battlefield-<bfCardId>, facedown-<bfCardId>, ...
                                // ALL players' cards in one array per zone; filter by .owner. Index 0 = top for decks.
  // Card = { id, definitionId, owner, controller, name, cardType, energyCost?, powerCost?, might?, domain?, rulesText?,
  //          meta: { exhausted, stunned, buffed, damage, hidden, combatRole, mightModifier?, staticMightBonus?, empowered?, grantedKeywords?, __flags? } }
  // Non-sandbox: opponent hand/mainDeck/runeDeck redacted to { id:"hidden-<zone>-<owner>-<idx>", name:"Hidden card", cardType:"unknown" }.
  interaction: { chain: { active, activePlayer, items:[{cardId, controller, type, countered}] },
                 showdownStack: [...], showdown: top-of-stack|null  // {active, battlefieldId, focusPlayer, passedPlayers, relevantPlayers, isCombatShowdown, attackingPlayer, defendingPlayer}
               , ...rest of engine interaction },
  pendingChoice: { type, prompter|playerId, onPicked, sourceCardId, revealed?:cardId[] , ... } | undefined,
  setup: { firstPlayer, secondPlayer }, playerNames, canUndo,
  log: LogEntry[≤80] { text, timestamp, rewindable, key? }   // "Rewound their last action." is the rewind sentinel
}
```
Card instance id conventions (pregame.ts:53-115): `player-N-main-<i>-<defId>`, `player-N-rune-<i>-<defId>`, `player-N-legend-<defId>`, `player-N-champion-<defId>`, `player-N-bf-<defId>`, tutor-spawned `player-N-main-999-<defId>`, tokens `token-def-<slug>` defIds.

### Other globals
`window.__rbAvailableMoves` → `[{moveId, params, playerId}]` for `viewingPlayer`; `__rbViewingPlayer`; `__rbGameId` (state.js:19-26). Non-window but reachable via `eval` (classic-script globals): `interaction` (mode/action/validTargets/pendingMoves/chosenTargets), `pregameState`, `lobbyId/lobbyCode/lobbyRole/lobbyWs/ws`, `isSandboxGame`, `lastSeq`, `wsConnected`, and every function above (`executeMove`, `chooseTurnOrder`, `confirmMulligan`, `selectBattlefield`, `switchPlayer`, `openPlayCostModal`, `beginTargetingOrPlay`, `requestUndo`, ...). `sessionStorage.rb_game = {gameId, viewingPlayer, lobbyRole, isSandbox, playerNames}` drives auto-reconnect (init.js:61-89).

### DOM affordances (stable selectors)
`[data-card-id][data-zone][data-def-id]`, `.card.playable`, `.card.exhausted/.card--exhausted`, `.card.selected`, `.valid-target`, `.rune-tappable`, `body.targeting-mode`, `body.armed-mode[data-armed-mode]`, `.battlefield[data-bf-id][data-drop-zone]`, `#player-base[data-drop-zone=player-base]`, `#actionsList .action-btn` (+`.primary/.highlighted`, `[data-target-play]`, `[data-play-cost-card]`), `#chainOverlay.visible .chain-pass-btn/.chain-resolve-btn`, `#choiceOverlay.visible[data-mode] .choice-modal-card/.choice-modal-btn/.choice-modal-cancel`, `.battlefield__showdown-btn--pass/--conquer/--cancel`, `#targetBanner.visible .target-banner-btn`, `#actionBar:not(.hidden) #actionBarBtns button`, `#pregameOverlay.visible .bf-choice / [data-mulligan-id] / .mulligan-btn-keep|.mulligan-btn-redo`, `#coinOverlay.visible .coin-choose-btn`, `#gameOverOverlay.visible`, `#peekDialog.visible [data-peek-action][data-card-id]`, `.token-panel[data-zone-id] .token-panel__btn`, `#phaseBar .phase-item.current`, `#connStatus`, `.toast` (last error/hint text, 2.5s), `#logEntries .log-entry`.

### pw-repl (`/tmp/pwtest/pw-repl.ts`)
Unix-socket daemon holding one chromium page (1440x900). Commands: `goto <url>` (networkidle), `click <sel>` (first match, 5s), `fill <sel> <text>`, `drag <selA> <selB>` (Playwright `dragTo` — works with the pointer-event drag since it issues real mouse down/move/up), `key <key>`, `wait <ms>`, `shot <path>`, `dom <sel>` (textContent), `eval <expr>` (JSON of page.evaluate), `errs` (drained console errors/pageerrors), `state` (summary: turn,status, **player-1-only** energy/power/hand, base, runePool, trash count, pendingChoice, chain items, bfZones), `moves` (`__rbAvailableMoves` sans playerId), `reset`, `quit`. `--sock <id>` for parallel instances. Existing recipes: `/tmp/pwtest/setup-game.sh` (login → Goldfish → deck → click keep loop → prints gameId), `setup-and-tutor.sh`/`robust-setup.sh` (+ `chooseTurnOrder("self")` via eval + `/tutor`), `drive.ts` (full Playwright walk with screenshots).

---

## 4. Pregame / lobby flow to a playable board

A. **Login** (needed only for `/api/saved-decks` and display name; lobby/game endpoints and WS are unauthenticated): `/login` → `#loginUser`, `#loginPass`, `#loginBtn` → `POST /api/auth/login`; or auth.js auto-login via `/api/auth/dev-credentials` on `/play` load (loopback + env).

B. **Goldfish (solo)** — `/play`: click `#sandboxOption` (`showSoloDeckPicker`) → `#soloDeckSelect` (value `default` or saved id), radio `input[name=soloMode]` = `duel` (Bo1, random bf) | `match` (Bo3, pick bf) → `#soloDeckPicker .start-btn` (`startSoloGame`, lobby.js:384-411): `POST /api/lobby/create {gameMode, sandbox:true}` → lobby WS open → `select_deck` + `start_game` → on `lobby_update.coinFlip` auto-sends `choose_first{"self"}` (no coin overlay) → on `status:"started"` sets `gameId`, `saveSession()`, closes lobby WS, `connectWs()` → game `sync` with `pregame.phase` = `mulligan` (duel) or `battlefield_select` (match).
   Legacy `hostSandbox()` (Goldfish via lobby room) shows the coin overlay and needs `.coin-choose-btn`.

C. **Host/Join**: host `hostLobby()` → `POST /api/lobby/create` → `#lobbyCode`; guest `showJoinForm` → `#joinCodeInput` + `joinLobby()` → `POST /api/lobby/join{code}` (guest is `player-2`). Both: `#deckSelect` onchange → `select_deck`; host `#modeDuel/#modeMatch/#modeSinglePlayer` → `set_mode` / `set_single_player`; host `#lobbyStartBtn` → `start_game` → both get coin overlay; winner clicks `.coin-choose-btn` → `choose_first`; 1.5s later both `connectWs()`.

D. **Pregame over game WS**: (match only) each seat `pregame_battlefield_select{battlefieldId}` from `sync.pregame.battlefieldOptions[].id` → phase `mulligan` → each seat `pregame_mulligan{sendBack}` (sandbox: one seat suffices) → `sync{pregame:null}`, `state.status="playing"`, flow cascades to first player's `main` (channel 2 runes, draw 1 happen server-side).

E. **Shortcuts**: `GET /play/test` (board immediately, P1 first, default decks, sandbox); `POST /api/game/create` + WS + `pregame_mulligan`; `POST /api/game/:id/tutor` to force a card + resources.

---

## 5. Gaps / pitfalls for the harness

**UI auto-picks / lossy mappings**
- `beginTargetingOrPlay`/`enterHandCardSelected`: untargeted single-card plays with variants differing only in non-target, non-cost params → `moves[0]` (interactions.js:277, 561). `playSpell`/`playGear` with >1 untargeted variant (e.g. `repeatCount`) never opens the cost modal (modal filters `playUnit|playFromChampionZone` only, modals.js:148-151) → first variant.
- `pickTargetedMove` prefers base-cost single-target; **paidAdditionalCost + target** combos are unreachable by clicking (only via `#actionsList` collapsible list if not grouped as targetable — but targetable groups collapse them too, actions.js:270-293). Repeat×N targeted variants likewise.
- Rune domain buttons in `#actionsList` fire the first rune of the domain; `recycleRune` `params.domain` choice not surfaced separately from what engine enumerates.
- `standardMove` multi-unit (`unitIds` arrays >1) — UI matches any move containing the clicked unit and picks first by destination; no multi-select gesture.
- Collapsible groups truncate at 15 variants (actions.js:401).
- Gear drag-onto-unit synthesizes `chosenTargetId` even if engine variant had none (drag-drop.js:344).
- `hotkeys` P (ping) doesn't ping; T/L/E are stubs.
- `#endTurnBtn` missing from DOM → `onEndTurnClick` unreachable; use Space or action list.
- D hotkey → `drawCard` is server-only → always `error`.
- Showdown initiator/cancel eligibility is a client heuristic (showdown.js:82-116), not engine truth.

**Engine moves with no first-class UI** (only via generic `#actionsList` "Other" if enumerated, or not at all): `concede`, `assignAttacker/assignDefender`, `contestBattlefield`, `resolveFullCombat` (server auto-fires after standardMove/gankingMove, turn.ts:244-272), `startShowdown`, `hideCard/revealHidden`, `labelCard`, `transferControl`, `readyRune`, `discardCard`, `killUnit`, `recycleCard/sendToHand/recycleMany/peekTopN/revealTopToOpponent` (peek dialog only), `addResources/spendResources` (hidden sandbox flag), `mulligan` (only via `pregame_mulligan` WS type, not `move`). Anything in `SERVER_ONLY_MOVES` is unreachable from any client.

**Server-side automation the harness must expect** (state changes without a client action): `autoResolveCombat` after every standardMove/gankingMove (contest + resolveFullCombat inline, same seq); `sandboxAutoPlay` after **every** human WS move in sandbox (passChainPriority, resolvePendingChoice(first enumerated!), passShowdownFocus, resolveFullCombat, conquerBattlefield, endTurn; ≤20 iterations) → always emits an extra `state_update{moveId:"sandboxAutoPlay"}` even when goldfish did nothing (turn.ts:221 `iterations>0` is always true) and its `state` is built **without viewingPlayer** (unredacted); endTurn cascades ending→…→main for next player inside one move; REST moves do NOT trigger sandboxAutoPlay (routes-game.ts) — so hot-seat `executeMove` for the other seat behaves differently from WS.

**Timing / sequencing**
- No client-side request/response correlation: `requestId` is sent and echoed but never awaited; `executeMove` is fire-and-forget. Harness must wait for `lastSeq` to advance (or `move_accepted`/`move_rejected` with matching `requestId`) before reading `__rbAvailableMoves`. After one WS move expect 1-2 frames (`move_accepted` then possibly `state_update sandboxAutoPlay` with a higher seq and different moves).
- `seq` is per-session monotonic but the client never gap-checks; `sync` frames from pregame also bump it. `state_update` from REST/tutor/undo go to all sockets including the actor.
- `quickRecycleRune` issues two moves with client-side polling (≤1s); `closePeekDialog` issues two moves back-to-back without waiting.
- Hot-seat path (`playerId !== viewingPlayer`) uses REST → 403 outside sandbox; then `requestResync`. `resolvePendingChoice` for the opponent seat in non-sandbox requires `switchPlayer` (WS reconnect → new `sync`).
- Every incoming frame calls `resetInteractionSilent()` (websocket.js:92,121,136) — targeting mode / action bar / play-cost modal state is wiped by any opponent or goldfish frame; a harness clicking through multi-step UI (select → target → Done) can be interrupted by `sandboxAutoPlay` frames.
- Coin overlay: buttons appear ~2.1s after `lobby_update`; game WS connects 1.5s after `started` (lobby.js:167) unless `_soloAutoStart`.
- `connectWs` on `/play` load races auth auto-login; `sessionStorage.rb_game` from a previous run auto-reconnects (clear it, as setup-game.sh does).
- WS reconnect gives up after 5 attempts and dumps to lobby; 4004 clears session.
- `animateCardFly` is a no-op (drag-drop.js:389-391) so drops dispatch synchronously.
- `previousGameState` diffing drives combat banners only; no event stream of "what happened" other than `state.log` (last 80, rebuilt from replay history each snapshot) and `state_update.moveId`.
- Snapshot omits per-seat identity: harness must track which `?player=` it connected as; `moves[].playerId` tells you.

Key files: `/root/src/tcg/tcg-engines/apps/riftbound-app/public/js/gameplay/{interactions,drag-drop,game-flow,websocket,state,hotkeys,showdown,pregame,lobby,peek-dialog,meta-actions,token-panel,init,audio,overlays}.js`, `public/js/gameplay/render/{actions,modals,card,board,runes,log}.js`, `public/gameplay.html`, `server/{ws-game,ws-lobby,pregame,routes-game,routes-lobby,routes-static,snapshot,turn,config,state}.ts`, `/tmp/pwtest/{pw-repl.ts,setup-game.sh,setup-and-tutor.sh,drive.ts}`.