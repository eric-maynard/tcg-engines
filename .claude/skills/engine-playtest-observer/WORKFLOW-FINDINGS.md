# Workflow Verifier Results

72 observers × 12 traces → 62 verified findings

## CONFIRMED (45)

- `/root/src/tcg/tcg-engines/packages/riftbound-engine/src/combat/combat-resolver.ts:171 (kill check uses unit.baseMight; should use effective Might incl. Assault for attackers / Shield for defenders); also :114 (distributeDamage lethal threshold)`
  - Rule 719.1.c confirmed: Assault = "While I am an attacker, I have +X [S]" (Might). Rule 626.1.d.1.a: lethal is damage ≥ the unit's *Might* (current, not printed). So an attacking Daring Poro has Might
- `/root/src/tcg/tcg-engines/packages/riftbound-engine/src/game-definition/moves/chain-moves.ts:706-710 — activateAbility reducer places ability.effect on the chain without evaluating ability.condition (Legion gate); condition check at :424-538 also omits it. evaluateLegionCondition exists (abilities/legion-conditions.ts:34) but is only called from abilities/trigger-runner.ts:110, never from the activated-ability path.`
  - Rule 724.1.c verified: Legion = "If you have played another Main Deck card before this one already this turn, apply [Text]"; 724.1.c.2 explicitly says it applies to activated abilities. Parser attache
- `/root/src/tcg/tcg-engines/packages/riftbound-engine/src/game-definition/moves/combat.ts:226-254 (resolveFullCombat condition/enumerator lack a showdown-completed gate); see also chain-moves.ts:767 (startShowdown offered as parallel option)`
  - Rule text verified: 516.4.f "Combat will also include a Showdown" and 516.5.a "A Showdown occurs when a Combat occurs" + 516.5.a.1 (Showdown is a Sub-Phase of Combat) — the Showdown is mandatory, not 
- `/root/src/tcg/tcg-engines/packages/riftbound-engine/src/game-definition/moves/combat.ts:373-395 — kill loop moves units to trash without emitting a fireTriggers({type:"die",...}) event; also /root/src/tcg/tcg-engines/packages/riftbound-cards/src/cards/sfd/honest-broker.ts:4-15 lacks an abilities entry for Deathknell.`
  - Rule 720.1.c/d verified: Deathknell = triggered ability "When I die, [Effect]", trigger is being Killed and sent to trash. Honest Broker (sfd-155-221) has this keyword ("Deathknell — Play a Gold gear 
- `/root/src/tcg/tcg-engines/packages/riftbound-engine/src/game-definition/moves/turn.ts:47-65 (endTurn condition ignores contested battlefields); /root/src/tcg/tcg-engines/packages/riftbound-engine/src/game-definition/moves/combat.ts:226-255 (resolveFullCombat modeled as optional Discretionary Action, comment at :231 wrong); /root/src/tcg/tcg-engines/packages/riftbound-engine/src/cleanup/state-based-checks.ts:296-320 (rule 524 computed but rules 525-526 not enforced)`
  - Rule 526 is part of the Cleanup sequence (rules 518-526). Rule 519 fires Cleanup after every Move/Chain-item/Showdown/Combat; rule 524 marks Combat as Pending wherever two opposing players' units shar
- `packages/riftbound-cards/src/cards/ogn/gemcraft-seer.ts:4 (no abilities field — Vision unimplemented); packages/riftbound-engine/src/abilities/trigger-runner.ts:71-93 + operations/card-lookup.ts:162-164 (trigger scan reads only def.abilities, no keyword→trigger synthesis)`
  - Rule 729.1.b verified verbatim ("When this is played, look at the top card of your Main Deck. You may recycle it"; 729.1.c: trigger = permanent entering the Board). Trace game-wf-8.jsonl seq 65 confir
- `packages/riftbound-cards/src/cards/ogn/mystic-poro.ts:4-16 (missing abilities[] entry for Vision); packages/riftbound-engine/src/abilities/trigger-runner.ts:64-87 (toTriggerableAbilities does not expand Vision/trigger-category keywords into play-self triggers)`
  - Rule 729.1.b/c verified verbatim: Vision = triggered ability "When this is played, look at the top card of your Main Deck. You may recycle it", trigger = permanent entering the Board. Card def package
- `packages/riftbound-engine/src/abilities/trigger-matcher.ts:89-138 — triggerMatchesEvent treats trigger.on as a string enum; object-shaped `on` filters ({cardType, controller, filter}) fall through to the line-138 "match all" default, so play-card triggers fire regardless of controller/cardType/mighty.`
  - Rule text checked: 583.2.a "The Condition follows the When" + 583.3 "When a Condition is met, a Triggered Ability … is placed on the Chain". Relentless Storm's printed condition is "When you play a [M
- `packages/riftbound-engine/src/abilities/trigger-runner.ts:273 (chainActive gate → inline executeEffect at :302-335); packages/riftbound-engine/src/game-definition/moves/cards.ts:418 (playUnit fires play-self without opening a chain; contrast playSpell addToChain at :783)`
  - Rule 583.3 states unconditionally that a triggered ability "is placed on the Chain" (583.3.a: during Closed OR Open states). The engine violates this for play-self triggers on units.

Mechanism: fireT
- `packages/riftbound-engine/src/abilities/trigger-runner.ts:273 (chainActive gate → inline execution instead of chain placement); packages/riftbound-engine/src/game-definition/flow/riftbound-flow.ts:285-312 (scoring-step hold events fired with no chain open, phase auto-advances to main)`
  - Rule text verified: 583.3 says a triggered ability "is placed on the Chain"; 583.3.b says when multiple trigger simultaneously "the player that controls the Abilities selects the order to place them o
- `packages/riftbound-engine/src/abilities/trigger-runner.ts:273 (chainActive gate → inline resolution when no chain); packages/riftbound-engine/src/game-definition/flow/riftbound-flow.ts:233 (beginning.endIf: () => true → no priority window)`
  - Rule text matches the claim: 583.3 says a triggered ability "is placed on the Chain" and (via 577.3) 577.3.c.1 says "Opponents have an opportunity to respond." Engine source shows this is not honored 
- `packages/riftbound-engine/src/abilities/trigger-runner.ts:71 (toTriggerableAbilities ignores grantedKeywords and type:"keyword" abilities); packages/riftbound-cards/src/data/sets/ogn.json:3656 (Gemcraft Seer static grant misparsed as duplicate self-keyword)`
  - Rules 713.3.a + 729.1.b/c confirm: a granted Vision is a triggered ability that fires on entering the Board. Trace game-wf-10.jsonl seq 87→88 confirms the observable: Gemcraft Seer (player-1-main-1-og
- `packages/riftbound-engine/src/chain/chain-state.ts:226-227 (guard added in c785c657; pre-fix line was `activePlayer: item.controller`)`
  - Rules text matches the claim exactly (537.1: "The player that created the chain becomes the first Active Player"; 541.2: "They do not affect the order of the Active Player"). Trace game-wf-5.jsonl seq
- `packages/riftbound-engine/src/chain/chain-state.ts:226-235 (addToChain activePlayer assignment; pre-fix was bare `activePlayer: item.controller`) — already fixed in commit c785c65`
  - Rule 537.1 text verified verbatim ("The player that created the chain becomes the first Active Player"). Trace game-wf-6.jsonl seq 66→67→68 confirms: pre-state chain=null; player-2's playSpell creates
- `packages/riftbound-engine/src/chain/chain-state.ts:321-327 (resolveTopItem empty-chain branch does not advance enclosing showdown focus); caller at packages/riftbound-engine/src/game-definition/moves/chain-moves.ts:356-371`
  - Rule 552 verbatim: "When the last item on the chain resolves during a Showdown, Focus passes, and the next Relevant Player gains both Focus and Priority." The engine never implements this. `resolveTop
- `packages/riftbound-engine/src/cleanup/state-based-checks.ts:314 (computes combatPending but never sets bf.contested; result unused); packages/riftbound-engine/src/game-definition/moves/movement.ts:295 (standardMove reducer runs no post-move Cleanup / contested mark); packages/riftbound-engine/src/game-definition/moves/combat.ts:41 (contestBattlefield modeled as optional discretionary action)`
  - Rule 524 (verified via rule.ts): "Mark a Combat as Pending at each Battlefield with Units present from two opposing players" — a mandatory Cleanup step, and rule 519 confirms Cleanup occurs after a Mo
- `packages/riftbound-engine/src/combat/combat-resolver.ts:114 (and :171) — lethal/kill uses baseMight without adding Shield for defenders`
  - Rule 726.1.c ("+X [Might] while I am a defender") plus 625.1.b.2 ("Defending Units with Shield have their Might modulated by the value of Shield") plus 627.1.a ("Lethal Damage is nonzero damage equali
- `packages/riftbound-engine/src/combat/combat-resolver.ts:96 (distributeDamage is deterministic, no player input); packages/riftbound-engine/src/game-definition/moves/combat.ts:353 (resolveFullCombat invokes it atomically without a pendingChoice step)`
  - Rule 626.1.d gives each player the choice of how to distribute their summed Might among opposing units (626.1.d.4 explicitly: "that player may assign damage to those units in any order" when priority 
- `packages/riftbound-engine/src/game-definition/moves/cards.ts:383-399 (enumerator emits no Accelerate variant) and :412 (reducer unconditionally sets exhausted=true); packages/riftbound-engine/src/types/moves.ts:159 (playUnit params lack accelerate field)`
  - Rule text verified: 717.1.a = "As you play me, you may pay 1[C] as an additional cost. If you do, I enter ready"; 717.2 = Optional Additional Cost paid as part of playing the unit. Engine source: play
- `packages/riftbound-engine/src/game-definition/moves/cards.ts:540 (playGear reducer lacks exhausted-flag handling for cards with "enters exhausted" static); packages/riftbound-cards/src/cards/ogn/iron-ballista.ts (no static ability wired)`
  - Rule 569.1 text matches the claim verbatim. Iron Ballista (ogn-017-298) carries the passive "This enters exhausted" — ogn.json encodes it as abilities[0]={type:static, effect:{type:sequence, effects:[
- `packages/riftbound-engine/src/game-definition/moves/cards.ts:792 (fireTriggers called inside playSpell right after addToChain, instead of deferring to chain resolution per 543.2); also packages/riftbound-engine/src/abilities/trigger-runner.ts:275`
  - Rule text verified: 543 is the resolution step — 543.1 executes the top item, THEN 543.2 says "if there are any triggered abilities that trigger when a card is played, these trigger now"; 543.2.b puts
- `packages/riftbound-engine/src/game-definition/moves/chain-moves.ts:1028-1041`
  - Rule text: 542 loops back to 539 after any 540 action; 540.4.b requires all Relevant Players to pass "once in sequence" — any non-pass action breaks the sequence. Code: the `counterSpell` reducer (cha
- `packages/riftbound-engine/src/game-definition/moves/chain-moves.ts:1028-1041 (counterSpell reducer does not reset chain.passedPlayers / activePlayer); cf. packages/riftbound-engine/src/chain/chain-state.ts:236 where addToChain does reset it.`
  - Rule text: 540.4.b says the chain ends when all Relevant Players have "passed once in sequence" — the in-sequence wording supports the claim that an intervening non-pass action must break the pass str
- `packages/riftbound-engine/src/game-definition/moves/chain-moves.ts:423-711 (activateAbility condition/enumerator/reducer lack any 559.3 target selection or legal-target gate)`
  - Rule text verified: 577.3.b directs activated abilities through 557–563; 559.3 requires Game Object choices ("Choose a friendly unit" per 559.3.a's example) to be made at activation, and 559.3.c.1 mak
- `packages/riftbound-engine/src/game-definition/moves/chain-moves.ts:486-488 (condition) and :603-605 (enumerator) collapse no-keyword→"action"; packages/riftbound-engine/src/chain/chain-state.ts:161 then admits "action" in showdown-open.`
  - Rule check: 718.1.c.2 says Action = "can be activated during showdowns on any player's turn"; 718.1.b says Action *grants* Showdown permission. The default is set by 510.1.a ("by default … abilities a
- `packages/riftbound-engine/src/game-definition/moves/chain-moves.ts:706 — activateAbility reducer must detect ability.effect.type === "add-resource" and execute the effect immediately (via executeEffect/executeResolvedItem) instead of calling addToChain; also guard counterSpell condition (~line 1004) against add-resource chain items as defense-in-depth.`
  - Rule 605.2 verified verbatim: "Spells and activated abilities that Add resources resolve immediately. They can't be reacted to." The activateAbility reducer (chain-moves.ts:676-711) unconditionally ca
- `packages/riftbound-engine/src/game-definition/moves/chain-moves.ts:767 — `startShowdown` condition/enumerator gates only on `bf.contested && neutral-open`; needs a once-per-contest guard or (better) fold Showdown into a mandatory Combat state-machine step so that after the showdown closes the only legal continuation is the Damage/Resolution step, not another `startShowdown`.`
  - Rules: 516.5.a ("A Showdown occurs when a Combat occurs" — singular, event-driven) + 516.3 (structured phases occur *as a result of* a Discretionary Action) + 624-627 (Steps of Combat = Showdown Step 
- `packages/riftbound-engine/src/game-definition/moves/chain-moves.ts:818-835 (startShowdown reducer; buggy form at c05e29a^, fixed in c05e29a)`
  - Rule 550.1 text confirmed: combat-showdown Relevant Players = Attacking + Defending. Trace game-wf-3.jsonl seq 127/129/131 (and 287/289) shows showdown {attackingPlayer:"player-2", defendingPlayer:"pl
- `packages/riftbound-engine/src/game-definition/moves/chain-moves.ts:824 (startShowdown reducer relevantPlayers; fixed in c05e29a)`
  - Rule text supports the claim: 512.2.b grants Priority on gaining Focus in a Showdown; 550.1 requires both Attacking and Defending players to be Relevant in a combat showdown. Trace game-wf-5.jsonl seq
- `packages/riftbound-engine/src/game-definition/moves/combat.ts:226-254 (resolveFullCombat condition/enumerator lack showdown-closed prerequisite; sibling to startShowdown at chain-moves.ts:767)`
  - Rule 625.1 verbatim: "A Showdown opens at this time" (mandatory first step of Combat); 626.1: "When the Showdown closes, Attackers and Defenders resolve Combat Damage". Engine source at combat.ts:226-
- `packages/riftbound-engine/src/game-definition/moves/combat.ts:226-255 (resolveFullCombat condition/enumerator require only contested+neutral-open, not a completed showdown); packages/riftbound-engine/src/game-definition/moves/chain-moves.ts:767-811 (startShowdown offered as peer discretionary action on the same predicate)`
  - Rules 625→626→627 are an ordered sequence: 625.1 "A Showdown opens at this time" (establishes attacker/defender, modulates Assault/Shield, populates Initial Chain with "when I attack/defend" triggers,
- `packages/riftbound-engine/src/game-definition/moves/combat.ts:238 (resolveFullCombat gates on bf.contested); packages/riftbound-engine/src/game-definition/moves/turn.ts:47 (endTurn ignores pending combat); packages/riftbound-engine/src/cleanup/state-based-checks.ts:314 (combatPending computed but never consumed)`
  - Rule text: 621 "A Combat occurs when a Cleanup occurs … and a Battlefield has Units controlled by two opposing players"; 622 "Combat is considered Pending if there are units controlled by two opposing
- `packages/riftbound-engine/src/game-definition/moves/combat.ts:398-425 (resolveFullCombat awards Conquer VP without checking prior controller !== attackingPlayer); root cause at combat.ts:41-129 (contestBattlefield lacks `bf.controller !== playerId` guard, violating rule 181.3.a)`
  - Rule text matches the claim. 627.3.a: "This results in an exchange of Control of this battlefield, which subsequently will cause a Conquer." 630.1: "Conquer: A player gains Control of a Battlefield th
- `packages/riftbound-engine/src/game-definition/moves/combat.ts:41 (contestBattlefield enumerator), combat.ts:226 (resolveFullCombat enumerator), packages/riftbound-engine/src/game-definition/moves/chain-moves.ts:767 (startShowdown enumerator), packages/riftbound-engine/src/game-definition/moves/movement.ts:295-324 (standardMove reducer does not auto-contest/trigger combat when opposing units present)`
  - Rule text matches the claim: 589.2.a says a Limited Action "cannot be performed at-will"; 613.1/614.1 say showdown/combat are triggered *when a Move causes a Battlefield to become Contested* — directe
- `packages/riftbound-engine/src/game-definition/moves/combat.ts:485`
  - Rule text supports the claim. 630.1 defines Conquer as the event "a player gains Control of a Battlefield they did not yet Score this turn" — a definition, not an action a player elects. 181.4.a makes
- `packages/riftbound-engine/src/game-definition/moves/movement.ts:155-158 (condition `zone !== "base"` gate) and :206-239 (enumerator scans only base zone, only emits battlefield destinations)`
  - Rule text verified: 593.4.a (ready all non-spell objects each Ready Step), 596.3.a (Standard Move cost = Exhaust), 140.4.b (units may Standard Move Battlefield→Base). Engine source: `readyAll` (turn.t
- `packages/riftbound-engine/src/game-definition/moves/movement.ts:297-324 — hasOpponentUnit==true branch is unhandled; should set contested and enter Combat instead of returning to neutral-open. Related discretionary shim: packages/riftbound-engine/src/game-definition/moves/combat.ts:41 (contestBattlefield).`
  - Rule 516.4.a/b verbatim: Combat "occurs as a result of Units controlled by opposing players being present at the same Battlefield … This could be the result of a Standard Move Standard Action." The st
- `packages/riftbound-engine/src/game-definition/moves/movement.ts:307 (standardMove: hasOpponentUnit case unhandled); packages/riftbound-engine/src/game-definition/moves/movement.ts:423 (gankingMove reducer: no contested/combat logic); ad-hoc workaround at packages/riftbound-engine/src/game-definition/moves/combat.ts:41 (contestBattlefield as discretionary action)`
  - Rule text matches the claim: 614.1 states Combat is triggered when a Move causes a Battlefield to become Contested with opposing units present; 548/548.1 confirm the Showdown opens as a step of that C
- `packages/riftbound-engine/src/game-definition/moves/movement.ts:336 (gankingMove.condition) and :370 (enumerator) — missing the `getTurnState(interaction) !== "neutral-open"` gate that standardMove has at :149/:201`
  - Rule text matches the claim: 722.1.c/722.1.c.3 say Ganking is a static permission that only adds destinations to the Standard Move; 589.1.a says Discretionary Actions (Standard Move) are only performa
- `packages/riftbound-engine/src/game-definition/moves/resources.ts:132 — recycleRune.condition lacks activePlayer / open-state timing gate (also exhaustRune at :68)`
  - Rule text verified: 588 ("may only perform actions on their turn unless otherwise specified") and — more directly — 581 ("All Activated Abilities can only be activated on the Controlling Player's Turn
- `packages/riftbound-engine/src/game-definition/moves/turn.ts:47 (endTurn condition ignores contested battlefields); packages/riftbound-engine/src/chain/chain-state.ts:131 (getTurnState returns neutral-open regardless of pending combat); packages/riftbound-engine/src/game-definition/moves/combat.ts:226 (resolveFullCombat modeled as optional discretionary move, not mandatory structured phase)`
  - Rule text verified: 516.4.e says "Play proceeds following the steps of combat" (a structured phase per 516.3/516.4), and 621 makes it mandatory ("A Combat occurs when a Cleanup occurs, there are no it
- `packages/riftbound-engine/src/game-definition/moves/turn.ts:47 (endTurn condition lacks pending-combat guard); packages/riftbound-engine/src/game-definition/moves/combat.ts:226 (resolveFullCombat modeled as optional move instead of auto-step after showdown close)`
  - Rule text verified: 626.1 uses mandatory language ("When the Showdown closes, Attackers and Defenders resolve Combat Damage"); 621 makes Combat mandatory whenever a Cleanup occurs with opposing units 
- `packages/riftbound-engine/src/game-definition/moves/turn.ts:47-65 (endTurn condition lacks pending-combat gate); packages/riftbound-engine/src/cleanup/state-based-checks.ts:314-347 (combatPending computed but never consumed); packages/riftbound-engine/src/game-definition/moves/combat.ts:41 (contestBattlefield opt-in instead of mandatory)`
  - Rule 621 verbatim: "A Combat occurs when a Cleanup occurs, there are no items on the Chain, and a Battlefield has Units controlled by two opposing players." Rule 519 defines Cleanup as occurring after
- `packages/riftbound-engine/src/game-definition/moves/turn.ts:47-65 — endTurn condition/enumerator lack a pending-combat guard; should return false when any state.battlefields[*].contested === true (or when opposing-controller units share a battlefield).`
  - Rule text supports the claim: 505 ends the phase only when the chain is empty and the Turn Player declines further Discretionary Actions, but Combat is not a Discretionary Action — rule 621 says Comba
- `packages/riftbound-engine/src/game-definition/moves/turn.ts:47-65 — endTurn condition/enumerator lacks a gate on any `state.battlefields[*].contested === true` (pending combat); should return false when a contested battlefield exists (or the flow should force resolveFullCombat before re-entering neutral-open).`
  - Trace seq 100 confirmed: available includes both `endTurn` and `resolveFullCombat`, chosen=endTurn, success=true, while battlefields.player-2-bf-ogn-275-298 = {contested:true, controller:player-1, uni

## PLAUSIBLE (2)

- `/root/src/tcg/tcg-engines/packages/riftbound-engine/src/game-definition/moves/cards.ts:792-799 (sequential play-spell/play-card fireTriggers dispatch bypasses cross-event ordering); /root/src/tcg/tcg-engines/packages/riftbound-engine/src/abilities/trigger-runner.ts:213-249 (orderTriggers IS turn-player-aware — claim's mechanism refuted)`
  - Rule text confirmed: 583.3.b.1 says turn player places their simultaneous triggers on the chain first, then others in turn order. Trace seq=45 confirmed: turn.activePlayer=player-2, chain=[chain-5 spe
- `packages/riftbound-engine/src/testing/playtest/game-setup.ts:344 (advanceTurn omits the ending-phase turn-scoped-keyword expiry that riftbound-flow.ts:513-519 performs)`
  - Rule 713.3.a.2 is correctly stated, and the trace observation is accurate: at seq 65 (turn 5) `gankingMove` is offered and executed for player-1-main-2-sfd-007-221 (Gem Jammer), which has no printed G

## REFUTED (15)

- `/root/src/tcg/tcg-engines/packages/riftbound-engine/src/game-definition/moves/movement.ts:295-324`
  - The claim rests on reading 516.5.b ("Units move to an empty battlefield") as the exhaustive trigger for stand-alone Showdowns. It is not — 516.5.b is a turn-structure summary. The operative rules key 
- `Already fixed by c05e29a at packages/riftbound-engine/src/game-definition/moves/chain-moves.ts:822-825`
  - Rule 516.4.d ("A Combat can only occur between two players") and 550.1 ("the Attacking and Defending players are the Relevant Players") say what the claim asserts, and the trace evidence is accurate: 
- `Already fixed: /root/src/tcg/tcg-engines/packages/riftbound-engine/src/game-definition/moves/combat.ts:408-424 (commit 1ba4fcd3d0da5af82a4e4304cc7aa97f8fd1e77a)`
  - Rule 631 says exactly what the claim asserts, and the trace evidence is real: history-wf-7.json entry 119 (resolveFullCombat) immer patches show victoryPoints 2→3 + conqueredThisTurn add but NO scored
- `packages/riftbound-engine/src/abilities/effect-executor.ts:489-505 (return-to-hand zero-target self-fallback); trigger-runner.ts:273-335 (inline execution when chain inactive)`
  - The trigger was NOT silently skipped. Trace seq=3 shows player-1-main-1-sfd-138-221 back in hand immediately after seq=2's playUnit — the trigger fired inline (trigger-runner.ts:302-335, no-chain path
- `packages/riftbound-engine/src/abilities/trigger-runner.ts:79 (toTriggerableAbilities filters type==="triggered", so keyword-Vision never becomes a play-self trigger — 729.1 gap, not 729.2)`
  - The 729.2 claim rests on a false premise. (1) Gemcraft Seer does NOT have two Vision instances at runtime: the engine loads cards via getAllCards()→enrichCards()→parseAbilities(rulesText), which yield
- `packages/riftbound-engine/src/game-definition/moves/cards.ts:868 (enumerator present; added in bf949ac — traces predate the fix)`
  - Rule 723.1.c is quoted correctly and the trace evidence is accurate for the file on disk — but the trace is stale. game-wf-11.jsonl was generated at 2026-08-03 18:05, and commit bf949ac ("feat(engine)
- `packages/riftbound-engine/src/game-definition/moves/chain-moves.ts:100 (countered items skip execution); trace seq=59 shows chain-8 countered:true`
  - The claim's own caveat is dispositive. At seq=59 player-1 invoked counterSpell on chain-8 and the trace state confirms it took effect: the chain item carries `"countered":true` in the seq=59 and seq=6
- `packages/riftbound-engine/src/game-definition/moves/chain-moves.ts:1004-1041 (fixed in 4d33647; trace do_not_commit/wf-traces/game-wf-5.jsonl is stale)`
  - Rule text is accurate (601.2/601.2.a: Countering is a Limited Action; players may only Counter when directed by Game Effects). Trace evidence is accurate for game-wf-5.jsonl (seq 6 shows counterSpell 
- `packages/riftbound-engine/src/game-definition/moves/chain-moves.ts:1004-1042 (sandbox move; see comment at :1026); real counter path: packages/riftbound-engine/src/abilities/effect-executor.ts:632-648`
  - The claim misclassifies `counterSpell` as "a spell or activated ability played during a chain" that 540.1.b requires to be added as a chain item. The rules say otherwise:

- Rule 601 defines **Counter
- `packages/riftbound-engine/src/game-definition/moves/chain-moves.ts:1026 (already fixed by 4d33647)`
  - Rule reading is correct (601.2/601.2.a: Counter is a Limited Action, only when directed by a Game Effect), and the trace evidence is accurate (seq 95 in game-wf-1.jsonl shows counterSpell(chain-10/cha
- `packages/riftbound-engine/src/game-definition/moves/chain-moves.ts:484-490 (timing gate is correct; ability is Reaction per packages/riftbound-cards/src/cards/ogn/daughter-of-the-void.ts:21)`
  - Rule 581 is the default; rule 725.1.c.3 (Reaction keyword) is a permissive override: "On Rune, Legend, or Permanent Abilities: This can be activated during Closed States on any player's turn." The abi
- `packages/riftbound-engine/src/game-definition/moves/chain-moves.ts:822 (fixed by c05e29a); trace serializer gap at packages/riftbound-engine/src/testing/playtest/game-tracer.ts:76-78`
  - Rule 625.1.a.1 does say Attacker = player who applied Contested, and the trace at seq 137 does show attackingPlayer='player-1' after player-2 contested at seq 129 — so the observation is real for the 
- `packages/riftbound-engine/src/game-definition/moves/chain-moves.ts:822-825 (already fixed in c05e29a)`
  - Rule check: 513.2 + 516.5.c/550.1 do require both Attacking and Defending players to be Relevant (and thus receive Focus) in a Combat Showdown — the claim's rules reading is correct.

Trace check: gam
- `packages/riftbound-engine/src/game-definition/moves/chain-moves.ts:822-835 (already fixed by c05e29a)`
  - Rule text confirmed (625.1.b: "The Defender is the player who did not apply the Contested status"). Trace evidence is accurate — game-wf-5.jsonl seq=54 does show showdownStack[0] with attackingPlayer=
- `packages/riftbound-engine/src/game-definition/moves/combat.ts:398-437 (resolveFullCombat attacker-wins path awards VP without checking prior control or 632.1.b.2; contrast scorePoint at :736-761)`
  - Rule text is as claimed, and trace values are as claimed (seq 193: resolveFullCombat on player-1-bf-ogn-275-298 took vp 7→8 and set status=finished; player-2-bf never scored by player-1). However, the

