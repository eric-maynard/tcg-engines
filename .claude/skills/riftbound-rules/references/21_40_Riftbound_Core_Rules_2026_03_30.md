

186. Control is the concept of a player having inﬂuence of a Game Object and applies differently to different card types.
187. Battleﬁelds
187.1. Control is established over Battleﬁelds through the course of play.
187.2. Control is a binary state for Battleﬁelds and an Identiﬁer for players.
187.2.a. A Battleﬁeld is Controlled or Uncontrolled.
187.2.b. A Battleﬁeld is Controlled by a speciﬁc player or Controlled by no one.
187.3. Control can be Contested through the course of play.
187.3.a. Contested is a temporary status applied to the battleﬁeld when a Unit controlled by a Player who does not currently Control that Battleﬁeld Moves or otherwise becomes present there.
187.3.a.1. Units moving to or being played to a battleﬁeld apply Contested status if that battleﬁeld is not already contested and that Unit ’s controller does not already control that battleﬁeld.
187.3.b. A Battleﬁeld remains Contested until Control is established or re-established.
187.3.c. The state of a Battleﬁeld being Contested is used to determine when Combat should occur, when a Non-Combat Showdown should occur, and when Control will change.
187.3.d. At this time Game Effects cannot reference this status.
187.4. Control is established by having Units at a Battleﬁeld at the end of a Showdown or Combat after applying the contested status.
187.4.a. If a player controls Units at a Battleﬁeld, outside of Combat, they maintain Control of that Battleﬁeld for as long as they have Units at that Battleﬁeld.
187.4.b. While a Combat or Showdown is ongoing at a Battleﬁeld , Control of that Battleﬁeld cannot change until instructed by steps of the Combat or Showdown .
187.4.c. If a player has no Units at a Battleﬁeld and the turn is in an Open state, they lose Control of that Battleﬁeld in the following cleanup, unless there is a Combat or Showdown ongoing there.
187.5. Control is a constant state.
187.6. Control of a Battleﬁeld determines Control of its Abilities.
187.6.a. While a Battleﬁeld is Controlled , its Controller controls its Abilities . That player takes responsibility for adding them to the Chain if applicable, and makes all choices required by them unless otherwise speciﬁed.
187.6.b. While a Battleﬁeld is Uncontrolled , its Abilities are also Uncontrolled. The Turn Player takes responsibility for adding them to the Chain if applicable, makes all choices required by them unless otherwise speciﬁed, and is treated as their Controller if any game rule or effect requires one. Example: The Arena’s Greatest is a battleﬁeld that reads “At the start of each player's ﬁrst Beginning Phase, that player gains 1 point.” This ability will usually trigger while the battleﬁeld has no controller. If it does, the Turn Player goes through the steps of adding the ability to the chain and receives priority after doing so, exactly as if they controlled the ability.
187.6.c. “You” in a battleﬁeld’s abilities refers to the battleﬁeld’s Controller , as does the implied “you” in instructions like “draw 1.” If the battleﬁeld has no Controller , “you” refers to no one, and all such instructions are ignored.



188. Everything Else
188.1. When a player Plays a Card or other Game Object , they are established as that Game Object's Controller.
188.2. For Spells , they are the Spell's Controller.
188.2.a. That player chooses targets.
188.2.b. That player chooses modes.
188.2.c. That player pays costs.
188.3. For Permanents and Runes , when they Enter the Board , that player is assigned as that Game Object's Controller.
188.3.a. That player may make decisions about the Game Object's Inherent Abilities.
188.3.b. That player may make decisions about the Game Object's Unique Abilities.
188.3.c. That player may make decisions about any game effects or decisions necessary while the card is being played.
188.3.d. That player may make decisions about any game effects created from "When you play me" effects of Permanents.
188.4. For Abilities , they are the Ability’s Controller.
188.4.a. By default, the Controller of an Ability’s Source is the Controller of that Ability.
188.4.b. Changes to Control of an Ability’s Source do not change Control of that Ability.
188.4.c. That player chooses targets.
188.4.d. That player chooses modes.
188.4.e. That player pays costs.
189. When a game effect or rules text refers to the Controller of a speciﬁc object, it can be referring to either context interchangeably.
189.1. The method of assignment of control is different, but the status of Control is the same across all Game Objects.
300. Playing the Game
301. The Turn
302. Play continues cyclically until one player wins.
303. The phases of a turn are rigid, but the actions taken during those steps can be done in any order, unless otherwise speciﬁed.
303.1. Game Actions of any nature are performed one at a time and are executed completely.
303.2. Game Actions cannot be performed simultaneously for any reason.
303.2.a. If one or more game actions, game effects, or Triggered Abilities are activated simultaneously, then Turn Order is referenced to organize the sequence of actions.



See rule 382. Triggered Abilities for more information.
304. The Turn Player is the player taking the current turn.
305. When there are no items on the Chain and the Turn Player cannot or chooses not to perform any Discretionary Actions , the current phase or step of the turn ends and the next phase, step, or turn begins.
306. The Turn Player changes when the current Turn Player reaches the End of all of the Phases of their Turn.
307. States of the Turn
308. At any given time, the turn is in either a Neutral State or a Showdown State.
308.1. If a Showdown or Combat is in progress, the turn is in a Showdown State.
308.1.a. Only cards and abilities with the Action or Reaction keywords can be played or activated in a Showdown State.
308.2. If no Showdown or Combat is in progress, the turn is in a Neutral State.
309. At any given time, the turn is in either an Open State or a Closed State.
309.1. If a Chain exists, the turn is in a Closed State.
309.1.a. Only cards and abilities with the Reaction keyword can be played or activated in a Closed State.
309.2. If no Chain exists, the turn is in an Open State.
310. These descriptions can be combined, such that the turn is always in one of these four states:
310.1. Neutral Open: There is no Showdown or Combat in progress and no Chain exists.
310.1.a. By default, cards can be played and abilities activated only when a player has priority on their turn in a Neutral Open state.
310.2. Neutral Closed: There is no Showdown or Combat in progress and a Chain exists.
310.3. Showdown Open: A Showdown or Combat is in progress and no Chain exists.
310.4. Showdown Closed: A Showdown or Combat is in progress and a Chain exists.
311. Priority and Focus
312. At any given time, up to one player has Priority.
312.1. Priority is the singular exclusive right to take Discretionary Actions. See rule 410.1. Discretionary Actions for more information.
312.1.a. The player with Priority can take appropriately timed Discretionary Actions.
312.1.b. If no player has Priority , no player can take Discretionary Actions.
312.1.b.1. Players can always take and make choices for Limited Actions when instructed, regardless of Priority.
312.2. A player receives Priority at the following times:
312.2.a. When the turn is in a Neutral Open State during their Main Phase.
312.2.b. When the turn is in a Showdown State and they gain Focus.
312.2.c. When the turn is in a Closed State and they control the next item on the Chain.



312.2.d. When the turn is in a Closed State , they are the next Player in Turn Order , and the player with Priority passes.
312.3. When a player is granted Priority, it is either created if no player has it or taken from the player with Priority.
313. At any given time, up to one player has Focus.
313.1. Focus is the permission to take appropriately timed Discretionary Actions when the turn is in a Showdown Open State. See rule 307. States of the Turn for more information.
313.1.a. The player with Focus must obey any additional restrictions on which Discretionary Actions may be performed. Example: A player with Focus may not play spells or activate abilities that don't have the Action or Reaction keywords.
313.2. A player who gains Focus also gains Priority.
313.3. A player who passes Priority retains Focus.
313.4. A player may not make discretionary actions with Focus unless they also possess Priority.
313.5. If the turn is in a Neutral State , no player has Focus.
314. Phases of the Turn
315. Start of Turn
315.1. Awaken Phase
315.1.a. The following Task becomes Outstanding :
315.1.b. 1. The Turn Player readies all Game Objects they control that are able to be readied. See rule 415. Ready for more information.
315.2. Beginning Phase
315.2.a. Beginning Step
315.2.a.1. At the start of Beginning Phase game effects take place.
315.2.b. Scoring Step
315.2.b.1. The following Task becomes Outstanding :
315.2.b.2. 1. The Turn Player Holds all Battleﬁelds they Control . See rule 462. Scoring for more information.
315.2.b.3. Reminder: In Modes of Play with Teams , Battleﬁelds held by a Teammate of the Turn Player during this phase are disqualiﬁed from being scored this turn by the Turn Player.
315.3. Channel Phase
315.3.a. The following Task becomes Outstanding :
315.3.b. 1. The Turn Player channels 2 runes from their Rune Deck. See rule 430. Channel for more information.
315.3.b.1. If there are fewer than 2 runes in the Rune Deck, they channel as many as possible.



315.4. Draw Phase
315.4.a. The following Task becomes Outstanding :
315.4.b. 1. The Turn Player draws 1.
315.4.b.1. If there are no cards remaining in their Main Deck to draw, the Turn Player has been Burned Out . See rule 431. Burn Out for more information.
315.4.b.2. After completing the Burn Out the Turn Player still Draws 1.
315.4.c. The following Task becomes Outstanding:
315.4.d. 1. Each player's Rune Pool empties. Any unspent Energy and Power are lost. See rule 164. Rune Pools for more information.
316. Main Phase
316.1. When all steps of the Start of Turn have been completed, the Main Phase begins.
316.2. The Main Phase has no deﬁned structure.
316.2.a. A player may take any number of Discretionary Actions they are able to perform during this phase. See rule 410.1. Discretionary Actions for more information.
316.2.b. This is denoted as a Neutral Open State , and only the Turn Player has the ability to play spells or activate abilities. See rule 307. States of the Turn for more information.
316.2.b.1. In Modes of Play with teammates, the Turn Player's teammates may play spells and activate abilities, including ones without Action or Reaction. They can only do so when the Turn Player invites them to do so with their own Priority.
316.3. As a result of a player taking Discretionary Actions , one or more structured phases may occur.
316.4. Combat
316.4.a. A Combat occurs as a result of Units controlled by opposing players being present at the same Battleﬁeld .
316.4.b. This could be the result of a Standard Move Standard Action , a Spell , or other Game Effect.
316.4.c. The source effect does not change the structure or ﬂow of Combat once initiated.
316.4.d. A Combat can only occur between two players. See rule 454. Combat for more information.
316.4.e. Play proceeds following the steps of combat. See rule 458. The Steps of Combat for more information.
316.4.f. Combat will also include a Showdown.
316.5. Showdowns
316.5.a. A Showdown occurs when a Combat occurs.
316.5.a.1. Showdowns that occur as a result of Combat are a Sub-Phase of Combat.
316.5.b. A Showdown is marked as Staged at a Battleﬁeld when the Contested status is applied to a Battleﬁeld with no current controller.



316.5.b.1. Showdowns that occur as a result of a player moving to an empty Battleﬁeld are a stand-alone Phase and do not create a Combat.
316.5.b.1.a. These Showdowns are called Non-Combat Showdowns . During the proceedings of a Non-Combat Showdown , units controlled by a different player may become present at the Battleﬁeld where the Showdown is ongoing. This will cause the Showdown to become a Combat Showdown.
316.5.c. A Showdown is a structured Window of Opportunity where Players may play cards and activate abilities with Action or Reaction. See rule 341. Showdowns for more information.
316.6. When a player has no more Discretionary Actions they wish to execute, they must indicate they are ending their turn.
316.6.a. This ends the Main Phase.
316.6.b. Play proceeds to the Ending Phase.
317. Ending Phase
317.1. Ending Step
317.1.a. At the end of the turn Game Effects take place.
317.1.b. Speciﬁc game effects and abilities will reference this timing and phase as necessary.
317.2. Expiration Step
317.2.a. Invoke an Ending Special Cleanup. See rule 318. Cleanups for more information.
317.2.b. Insert “2c. Heal all Units .”
317.2.c. Insert “2d. All ‘this turn’ effects expire simultaneously.”
317.2.d. Insert “2e. Each player’s Rune Pool empties. Any unspent Energy and Power are lost.”
317.2.e. The following Task becomes Outstanding :
317.2.f. 1. If any items underwent the FEPR process, return to the start of the Expiration Step
317.3. The next player with their Turn queued becomes the Turn Player.
318. Cleanups
319. A Cleanup will be made an Outstanding Task at the following times:
319.1. After the game transitions to or from an Open or Closed state
319.2. After the game transitions between Phases, unless speciﬁed otherwise
319.3. After a Pending Item is added to the Chain
319.4. After a Pending Item becomes a Legal Item on the Chain
319.5. After a Chain Item is removed from the Chain for any reason
319.6. After any number of Game Objects enter or leave the Board
319.7. After the status of any number of Game Objects changes for any reason



319.8. After a Move is completed
320. While a Cleanup is occurring, Chain Items cannot be Resolved.
320.1. New Pending Items can be added, but Legal Items cannot be executed and Priority and Focus are not passed or awarded.
321. Similarly, while Chain Items are Resolving , a Cleanup cannot occur.
321.1. If an event occurs during the Resolution of a Chain Item that qualiﬁes for a Cleanup , that Cleanup will be made an Outstanding Task.
322. If an event occurs during a Cleanup that qualiﬁes for a Cleanup, another Cleanup will occur immediately after the ﬁrst completes, repeating until a Cleanup occurs with no new change in the game’s state.
322.1. These new Cleanups are themselves Outstanding Tasks.
323. When a Cleanup occurs, the following Tasks become Outstanding in the order described:
323.1. 1. If a player has points greater than or equal to the Victory Score, and more points than any opponent, that player wins.
323.2. 2. Assign or Remove the Attacker or Defender designation from Units as needed if there is a Combat in progress
323.2.a. If there are Units present at the Battleﬁeld the Combat is taking place at, but do not have a designation, they gain the same designation as their Controller now
323.2.b. If there are Units present at the Battleﬁeld the Combat is taking place at, but have the opposite designation of their controller, they lose that designation, and gain the same designation as their controller now
323.2.c. If there are Units at locations other than the Battleﬁeld that the Combat is taking place at, but have either Attacker or Defender designations, they lose those designations now
323.3. 3. Handle outstanding board state
323.4. 3a. All Units that have non-zero Damage marked on them equalling or exceeding their Might that have Deathknell abilities will trigger their Deathknell ability now, making note of their current location, attributes, and other information relevant to add the trigger as a Pending Item See rule 808 Deathknell for more information .
323.5. 3b. All Units that have non-zero Damage marked on them equalling or exceeding their Might are killed and placed in their owners' Trash.
323.6. 4. If the turn is in an Open State, Battleﬁelds with no Units occupying them and no Showdown or Combat ongoing become Uncontrolled.
323.7. 5. Recall all Unattached non- Unit Gear at Battleﬁelds, and all Permanents and Runes in Bases other than their controller’s. Remove all Hidden cards from all Battleﬁelds that are not controlled by the same player and place them in their owner's Trash.
323.8. 6. Mark a Showdown as Staged at each Battleﬁeld that Contested was applied to.
323.8.a. The Showdown remains Staged at each Battleﬁeld that is Contested and has units present controlled by the player that applied Contested.
323.9. 7. Mark a Combat as Staged at each Battleﬁeld that Contested was applied to that have Units present controlled by opposing players.
323.9.a. The Combat remains Staged at that Battleﬁeld as long as there are Units present from two opposing players there.



323.10. 7a. If Units of two opposing players are no longer present at a Battleﬁeld that has a Combat Staged before it has opened, the Combat will cease being Staged
323.11. 8. If the current state is a Neutral Open State and one or more Showdowns are Staged , the Turn Player chooses one of those Battleﬁelds. A Showdown begins there.
323.12. 8a. If a Showdown and Combat are staged at the same Battleﬁeld and the turn player chooses to initiate the Showdown there, the Showdown will open as a Combat Showdown.
323.13. 9. If the current state is a Neutral Open State and Combat is Staged at one or more Battleﬁelds , the Turn Player chooses one of those Battleﬁelds . Combat begins there.
323.14. 9a. If the current state is Showdown Open State and Combat is Staged at a Battleﬁeld where there is a Non-Combat Showdown ongoing, that Showdown becomes a Combat Showdown.
324. Special Cleanups are Cleanup steps invoked at speciﬁc times that have additional steps not present in a normal Cleanup.
324.1. When a Special Cleanup is invoked, the unique steps added will be inserted and deﬁned by the sub-section that invokes it. Example: When a Combat Cleanup is invoked, the Combat section deﬁnes what steps are added to the Cleanup. See rule 461. The Resolution Step for more information. Example: When an End of Turn Cleanup is invoked, the End of Turn Phase subsection deﬁnes what steps are added to the Cleanup. See rule 317. The Ending Phase for more information.
324.2. If events during a Special Cleanup require another Cleanup, a normal Cleanup is invoked, not another iteration of the Special Cleanup .
325. Chains and Showdowns
326. Players can act during the following Windows of Opportunity that occur during the course of regular play:
326.1. During a Chain
326.2. During a Showdown
327. Chains
328. The Chain is a Non-Board Zone that temporarily exists whenever a card is played or an ability is activated.
328.1. Cards are placed here as part of the process of being played.
328.2. Abilities are queued here as part of the process of resolving. See rule 360. Abilities for more information.
329. Cards and abilities added to the chain are added as Pending Chain Items that become Finalized Chain Items.
329.1. Pending Items are on the Chain.
329.2. Chain Items are Pending until the “Check Legality” step of playing a card. See rule 349. Playing Cards for more information.
329.3. When a Pending Chain Item is no longer Pending it is ﬁnalized and becomes a Finalized Chain Item .
330. The Chain exists as long as a Chain Item is on it.
330.1. Only one Chain can exist at a time.
330.2. If a card would begin to be played while a Chain already exists, it is placed on the existing Chain.



331. The State of the Turn is partially determined by whether or not the Chain currently exists.
331.1. The turn is said to be in a Closed State if a Chain exists.
331.1.a. Cards of all Categories, by default, cannot be played during a Closed State.
331.1.b. Card abilities, by default, cannot be played during a Closed State.
331.2. The turn is said to be in an Open State if no Chain exists.
332. Steps of Resolving Chain Items
333. Whenever a card or token is played or an ability is activated or triggered, a Chain is created.
333.1. The player that created the chain becomes the ﬁrst player with Priority.
334. A Task is one or more steps or processes that one or more Players must perform before continuing with any other actions.
334.1. Tasks include, but are not limited to: Cleanups , the actions performed during the Start of Turn Process , throughout Combat in its various steps, and the actions performed during the End of Turn Process. See rule 318. Cleanups for more information on Cleanups See rule 315. Start of Turn for more information on the Start of Turn process See rule 454. Combat for more information on the steps of Combat See rule 317. Ending Phase for more information.
335. Whenever a Player takes one or more actions that incur Tasks they should refer to the process of HOT FEPR: H andle O utstanding T asks; then F inalize, E xecute, P ass, R esolve.
335.1. In the course of Handling Outstanding Tasks, Chain Items may be added to the Chain . They will remain there until the Tasks are complete.
335.2. When all Outstanding Tasks are completed, all pending Chain Items will subsequently be processed by the FEPR process.
335.2.a. During the FEPR process, new Tasks may be incurred. Pause the process and complete the necessary Tasks before continuing.
335.3. If there are no Outstanding Tasks , no pending Chain Items , and it is the Main Phase, the Turn Player receives priority. If there are no Outstanding Tasks , no pending items, and it is any other phase of the turn, proceed to the next substep, step, phase, or turn.
336. When there are no outstanding Tasks and there are pending Chain Items on the Chain , players should refer to the FEPR process to proceed.
336.1. In the sequence of resolving FEPR more Chain Items may become Pending Chain Items . These will be processed by the same FEPR process that produced them.
337. Step 1: Finalize
337.1. If one or more Items are Pending , their controllers must complete the steps of Playing those Pending Items until they are Finalized Items or leave the Chain.
337.1.a. This process does not pass Priority.
337.1.b. Each Item is Finalized in the order it was appended to the Chain.
337.1.c. Units, Gear, and abilities that Add resources resolve immediately when Finalized and do not progress to Step 2: Execute. See rule 349. Playing Cards for more information.



337.1.c.1. If the Chain is empty, play proceeds in an Open State.
337.1.c.1.a. If this occurs during a Showdown , the next player in turn order gains Focus .
337.1.c.2. If the Chain is not empty and there are one or more Pending Items , repeat Step 1.
337.1.c.3. If the Chain is not empty and there are no Pending Items , the controller of the newest item on the chain gains Priority and becomes the Active Player. Proceed to Step 2: Execute.
338. Step 2: Execute
338.1. The player with Priority may do any the following:
338.1.a. Play a Card that is legally timed.
338.1.a.1. Cards , by default, cannot be played during a Closed State.
338.1.a.2. A Legally Timed Card would be a Card with Reaction or a card that will have Reaction when played under appropriate circumstances.
338.1.a.3. Other exceptions may be created during regular play.
338.1.a.4. The card will be added to the chain as a Pending Item , following the steps of playing a card.
338.1.a.5. This can be an additional card to the item that Started the Chain in the case of the ﬁrst player with Priority after creating the Chain.
338.1.a.6. Whether a Card is legally timed is evaluated during the “Check Legality” step of Playing a Card. See rule 349. Playing Cards for more information.
338.1.a.7. Playing a card will create one or more Pending Items . Return to Step 1: Finalize.
338.1.b. Activate Abilities of Game Objects that are legally timed. See rule 398. Playing or Activating Abilities for more information.
338.1.b.1. All rules for legally timed cards apply to legally timed abilities.
338.1.b.2. Activating abilities will create one or more Pending Items . Return to Step 1: Finalize.
338.1.c. Pass Priority
338.1.c.1. The player with Priority passes Priority to the next Player in Turn Order. Proceed to Step 3: Pass.
339. Step 3: Pass
339.1. If all players have passed Priority without adding any items to the Chain , proceed to Step 4: Resolve.
339.2. Otherwise, the player with Priority passes Priority to the next Player in Turn Order. Return to Step 3: Execute.
340. Step 4: Resolve
340.1. The newest item on the Chain resolves. Execute its game effects in their entirety. See rule 349. Playing Cards for more information on resolving spells. See rule 398. Playing or Activating Abilities for more information on resolving abilities.
340.2. If the Chain is empty, play proceeds in an Open State.



340.2.a. If this occurs during a Showdown , focus passes to the next player in turn order.
340.3. If the Chain is not empty and there are one or more Pending Items , return to Step 1: Finalize.
340.4. If the Chain is not empty and there are no Pending Items , the controller of the newest item on the chain gains Priority . Return to Step 2: Execute.
341. Showdowns
342. A Showdown is a Window of Opportunity in which Players have an Open State in which they may play Spells in an alternating fashion.
342.1. Each spell played this way creates a Chain as normal.
343. The State of the turn is partially determined by whether or not a Showdown or Combat is in progress.
343.1. The turn is said to be in a Showdown State if a Showdown or Combat is in progress.
343.1.a. Cards of all Categories, by default, cannot be played during a Showdown State.
343.1.b. Card abilities, by default, cannot be played during a Showdown State.
343.2. The turn is said to be in a Neutral State if no Showdown or Combat is in progress.
344. A Showdown begins when Control of a Battleﬁeld is Contested and the turn is in a Neutral Open State.
344.1. If Control of a Battleﬁeld is Contested between two players, then a Showdown will be opened as the ﬁrst step of Combat. See rule 454. Combat for more information.
344.2. If Control of a Battleﬁeld is Contested and the Battleﬁeld in question is uncontrolled when it becomes Contested , a Showdown is opened during the Cleanup at the end of the action that caused the Battleﬁeld to become Contested.
345. As a Showdown begins, the player who applied Contested status to the Battleﬁeld gains Focus.
346. When the last item on the chain resolves and the turn returns to an Open State during a Showdown , Focus passes, and the next Player gains both Focus and Priority.
346.1. Focus will not pass in this way if the chain opened as a result of a triggered ability being added to the chain, nor if it opened as a result of an Add ability being added to the chain. Example: the Initial Chain opens as a result of triggered abilities being added to the chain, so when the last item on the Initial Chain resolves and the turn returns to an Open State, Focus will not pass.
347. During a Showdown , the player with Focus may do one of the following:
347.1. Play a card that is legally timed.
347.1.a. The card will start a Chain as normal.
347.2. Activate Abilities of Game Objects that are legally timed. See rule 360. Abilities for more information.
347.3. Pass.
347.3.a. If all Players have passed once in sequence, the Showdown ends.
347.3.a.1. Perform a Cleanup.
347.4. Otherwise, Focus passes to the next Player in Turn Order.
348. If all players pass Focus without playing a spell or activating an ability, then the Showdown Closes.



348.1. If it is a Combat Showdown, proceed with the remaining steps of Combat to resolve the phase. See rule 458. The Steps of Combat for more information.
348.2. If it is a Non-Combat Showdown, do the following:
348.2.a. If only one player’s Units remain at the Battleﬁeld , and if that player does not already Control the Battleﬁeld , that player establishes Control over the Battleﬁeld . See rule 185. Control for more information on Control . See rule 464.1. for more information on Conquering .
348.2.a.1. This results in a Conquer if that player has not yet scored that Battleﬁeld this turn.
349. Playing Cards
350. Playing a card is the act of a player utilizing their cards.
350.1. A card is Played when it has ﬁnished this process in its entirety.
350.2. Tokens are not cards, but can still be Played. See rule 176. Tokens for more information.
351. Cards have different behaviors when played.
351.1. Permanents become Game Objects when Played.
351.2. Spells create game effects that are executed, then the card is placed in the trash when Played.
352. Cards have different states during the process of being played.
352.1. When initially being played cards are Pending, as Pending Chain Items.
352.2. Near the end of the process cards will cease being Pending and become Finalized Chain Items .
353. The Process of Play
354. 1. Remove the card from the zone you are playing it from and put it onto the Chain.
354.1. This Closes the State. See rule 307. States of the Turn for more information.
354.2. This item becomes Pending, awaiting the ﬁnalization process (steps 2 - 5)
354.3. If another Card Effect or ability is currently resolving, continue resolving it before proceeding with any further steps of this process.
354.4. If there are Tasks outstanding or currently being handled, ﬁnish those Tasks before continuing this process. See rule 334. for more information on Tasks.
355. 2. Make relevant choices.
355.1. If the card is a spell, or has an effect that speciﬁes a choice "As I am played," those choices are made now.
355.2. For Units , choose a valid Location where that Unit will be placed upon being Played.
355.2.a. By default, Valid locations include the controller’s Base or a Battleﬁeld the controller controls.
355.2.b. Some Game Effects may grant players permission to play Units to locations that are not normally Valid . Such locations become Valid for the purposes of Playing the Unit.



355.3. For Spells and Abilities with a bulleted list of modes to choose from, make the appropriate choices now.
355.4. For Spells and Abilities that Move one or more Units , choose a valid Location as the Move Destination for each Move that will be performed.
355.4.a. A valid Location is one other than the Units’ current Location where they are allowed to be present.
355.5. If a card requires you to speciﬁcally choose one or more Game Objects , that choice is made now.
355.5.a. This does not include cards that affect one or more Game Objects based on criteria. Example: "Stun a unit at a battleﬁeld" is a Choice. Example: "Kill all gear" is not a Choice.
355.5.b. This does not include making choices for Triggered Abilities of permanents, even if those abilities trigger when the permanent is played. Example: A unit with a triggered ability that says "When I'm played, kill a unit" does not require you to choose a target as it's played. The target will be chosen when the ability triggers. See rule 382. Triggered Abilities for more information.
355.6. Targeting
355.7. When a card Chooses one or more speciﬁc Game Objects to affect, it is Targeted unless indicated otherwise by the rules in this section.
355.8. In order to put a spell or ability on the chain, valid choices must be made for all targets.
355.9. A target is a valid choice if it meets all of the following requirements:
355.9.a. It is a permanent or rune on the board, a spell or ability on the chain, a player or zone, or speciﬁed explicitly or implicitly as being in some other zone. e.g., “Kill a unit” targets a unit on the board. e.g., “Recycle a unit from your trash” targets a unit card in your trash.
355.9.a.1. “Unit,” “gear,” and “rune” refer to objects on the Board unless speciﬁed otherwise.
355.9.a.2. “Spell” and “ability” refer to objects on the Chain unless speciﬁed otherwise.
355.9.a.3. “Facedown card” refers to a card in a Facedown Zone unless speciﬁed otherwise.
355.9.a.4. “Legend” refers to a legend in the Legend Zone.
355.9.a.5. “Chosen Champion” and “unit in the Champion Zone” refer to a unit in the Champion Zone unless speciﬁed otherwise.
355.9.b. It meets all targeting restrictions. e.g., A unit is a valid target for a spell that refers to a “unit at a battleﬁeld,” “enemy unit,” “unit you control,” or “unit with Might 4 or greater” only if it meets the appropriate criteria.
355.9.c. It is not the spell or ability itself. e.g., A spell that says “Counter a spell” cannot target itself. e.g., An ability of a permanent can target that permanent, because abilities and their sources are separate objects.
355.10. A game object, player, or zone mentioned in the text of a spell, activated ability, or triggered ability is a target UNLESS any of the following are true:



355.10.a. It is in a zone whose information status is not Public. e.g., “Ready a legend” targets a legend, because the Legend Zone is Public. e.g., “Return a unit from your trash to your hand” targets a unit card in your trash, because your trash is Public. e.g., “You may play a unit from your hand, ignoring its costs” does not target a unit card in your hand, because your hand is not a public zone.
355.10.a.1. Public zones are Battleﬁeld Zones, Bases, Trashes, Legend Zones, Champion Zones, and Facedown Zones.
355.10.b. It is included only as part of a targeting restriction for another choice. e.g., “Kill a unit at a battleﬁeld” targets a unit, but not a battleﬁeld, because the units are targets and “at a battleﬁeld” is a restriction. e.g., “Kill all units at a battleﬁeld” targets a battleﬁeld, but not any units.
355.10.c. It is included only as part of a cost, trigger condition, or replacement effect. e.g., “As an additional cost to play me, kill a friendly unit” doesn’t target anything. e.g., “When a friendly unit dies, kill a gear” targets a gear, but not a friendly unit. e.g., “When you play me, the next time a friendly unit would die this turn, return it to your hand instead” doesn’t target anything. The replacement effect applies when any friendly unit dies. e.g., “Choose a friendly unit. The next time it would die this turn, return it to your hand instead” targets a friendly unit, because “choose a friendly unit” is not part of the replacement effect.
355.10.c.1. This includes costs within instructions, identiﬁed by phrases like “[do X] to [do Y].” The cost within that instruction is “[do X].” e.g., “When I hold, you may kill another friendly unit here to draw 1” does not target anything. e.g., “When you play me, you may spend a buff to move a friendly unit” targets the friendly unit, but not the buff.
355.10.d. It is programmatically selected based on its characteristics rather than chosen by the spell or ability’s controller. e.g., “Kill all units at a battleﬁeld” targets a battleﬁeld, but does not target any units. e.g., “Kill all units at battleﬁelds” doesn’t target anything. e.g., “Destroy a unit. Its controller draws 2 cards” targets the unit, but not its controller. e.g., “Ready your legend” doesn’t target anything, because you can only have one legend. e.g., “Ready a friendly legend” targets a legend, because in a 2v2 game there are two friendly legends. e.g., “Recycle all cards in your trash” doesn’t target anything, because it affects all cards and you only have one trash.
355.10.d.1. This exception applies solely to objects for which no choice is ever possible.
355.10.d.2. This exception does not apply to objects that are the only valid choice at the moment a spell or ability is placed on the chain, but which would require a choice under other circumstances. e.g., “Kill a unit at a battleﬁeld” always targets a unit, even if that unit is the only unit currently at a battleﬁeld.
355.10.e. It is part of a set of objects chosen in whole or in part by other players. e.g., “Each player kills a unit they control” does not target. Each player, including the one who played the spell, chooses a unit to kill as the spell or ability resolves.



355.10.f. It is identiﬁed in an instruction that a player “must” complete. e.g., “You must recycle one of your runes” doesn’t target anything. You choose from among your runes as the spell or ability resolves. e.g., “Recycle a rune you control” targets a rune. You choose a rune you control as you put the spell or ability on the chain.
355.11. Some cards identify a group of Targets with Targeting Requirements that must be met by the group as a whole.
355.11.a. As they’re ﬁnalized on the chain, such cards can choose any group of valid targets that collectively fulﬁll the targeting restriction.
355.11.b. If the group of targets no longer collectively fulﬁll the targeting restriction as the spell or ability resolves, that spell or ability’s controller can choose a subset of the original targets that fulﬁlls the targeting requirement for the spell or ability to affect. Example: A player plays Fox-Fire, a spell that says in part “Kill any number of units at a battleﬁeld with total Might 4 or less.” That player chooses four 1 [M] Recruit tokens at a single battleﬁeld. As a Reaction, another player gives two of those Recruits +1 [M], so the Recruits’ Mights are 1, 1, 2, and 2. Then Fox-Fire resolves. The Recruits no longer have total Might 4 or less, so Fox-Fire’s controller must choose a legal subset of the original targets to affect. They could choose to kill the two 2 [M] Recruits, or the two 1 [M] Recruits plus one 2 [M] Recruit. The units they choose are Fox-Fire’s remaining legal targets. They can’t choose to affect units at the same battleﬁeld that weren’t initially chosen as targets. They can, however, choose to affect units that were initially chosen as targets that left the chosen battleﬁeld before Fox-Fire resolved as long as those units are all located at the same battleﬁeld.
355.12. If a spell speciﬁes that a player may perform a Game Action on some number of Game Objects , then all choices are considered targeted and chosen independently of the decision to perform the Game Action.
355.13. If a card speciﬁes that a player chooses “any number” or “up to” some number of Game Objects to be affected, they may choose any number of available targets, including zero. If they choose zero, the spell or ability can be played without any targets.
355.14. Splitting
355.14.a. If a card speciﬁes that an amount of damage may be split among some number of Units , then each Unit chosen is Targeted.
355.14.b. The Targets are chosen when the spell or ability is ﬁnalized on the chain.
355.14.c. A number of Targets can only be chosen up to, and not exceeding, the initial amount of damage available when the spell is played. Example: A player playing a spell that instructs them to "Split 5 damage" may only choose up to 5 units, but may choose fewer.
355.14.d. Each Target is valid, and contributes to Chosen triggers individually.
355.14.e. The choice of how much damage is divided across the split is not decided until the resolution of the spell or ability.
355.14.f. Each Target must receive a valid amount of damage.
355.14.g. Valid damage is a positive integer amount, greater than or equal to 1 damage. See rule 417. Deal for more information.
355.14.h. If, at resolution of the spell or effect, there are more Targets than available damage to divide, then the player who controls the effect dealing damage determines which Targets cease being Targets.
355.14.i. Any costs that were paid, or effects that were triggered as a result of those Game Objects



being chosen as Targets remain in effect, paid, or otherwise triggered.
355.15. These choices cannot be changed after this step.
355.16. A player may not make choices during this step that will deterministically result in illegal choices or actions later in this process unless they have no choice. Example: A player plays a card which reads “as an additional cost to play this, kill the unit you control with the most Might. Give a friendly unit +[M] equal to the killed unit’s Might this turn. Predict 2.” They cannot choose to target their unit with the highest Might during this step of ﬁnalization.
355.17. If a spell or ability requires one or more players to make choices that are not outlined in this section, they are made on resolution.
356. 3. Determine Total Cost.
356.1. Apply base cost modiﬁcations in any order.
356.1.a. If an ability or instruction allows you to play a card “for [Cost]”, replace the card’s Base Costs with [Cost].
356.1.b. If an ability or instruction allows you to "ignore" one or more of a card's costs, set the appropriate Base Cost(s) of the card to zero.
356.1.b.1. If a card allows a player to play a card "ignoring its cost," its base Energy cost and base Power cost are set to zero.
356.1.b.2. If a card instructs a player to play a card "ignoring its Energy cost" or "ignoring its Power cost," only the appropriate cost is set to zero, and the remaining cost still applies.
356.1.b.3. Further additional costs and/or cost increases applied in subsequent steps may raise the card's Total Cost above zero. Example: Legion Rearguard is a Fury unit that costs 2 Energy and 0 Power and has Accelerate. A player plays Legion Rearguard and is instructed to ignore its costs, but chooses to pay the Accelerate cost. They ignore Legion Rearguard's Base Cost of 2 Energy, but the optional additional cost of 1 Energy and 1 Fury Power is added to its Total Cost and must be paid.
356.2. Apply additional costs in any order.
356.2.a. Mandatory Additional Costs
356.2.a.1. Some Additional Costs speciﬁed by Passive Abilities on the card being played or another card are Mandatory , and must be paid to complete playing the card. They use the phrase "as an additional cost" and don't include the word "may." Example: A unit has the passive ability "As an additional cost to play me, kill a friendly unit." To play that unit, a player must kill a friendly unit. See rule 363. Passive Abilities for more information.
356.2.a.2. The cost imposed by the Deﬂect keyword is a Mandatory Additional Cost. See rule 809. Deﬂect for more information.
356.2.b. Optional Additional Costs
356.2.b.1. Some Optional Costs speciﬁed by Passive Abilities on the card being played or another card are Non-Mandatory , and must be paid only if the player made the choice to pay them in step 2. They use the phrase "as an additional cost" and the word "may." Example: A unit has the ability "As you play me, you may discard 1 as an additional cost. If you do, reduce my cost by [2]." While playing the unit, its



controller declares their intention to pay the additional cost in step 2 , applies that additional cost in rule 356.2 , applies the discount granted by paying that cost in rule 356.4 , and discards a card to pay that additional cost in rule 357.2. See rule 363. Passive Abilities for more information.
356.3. Apply cost increases.
356.4. Apply discounts.
356.4.a. Discounts may be applied by the card being played or by any other card or effect.
356.4.b. Discounts may say that cards "cost [amount] less" or that one or more of their costs are "reduced by [amount]."
356.4.c. Discounts that only apply to a component of the cost will be applied when that component is added to the cost of the spell and before any other discounts. Example: Ezreal, Prodigy reads “optional additional costs you pay cost [1] or [A] less.” When playing a Frigid Touch and choosing to pay the additional cost in step 2, as soon as the additional cost is added to the cost of the spell, Ezreal, Prodigy’s discount is applied to it.
356.4.c.1. Discounts that apply to a given component of a spell’s cost may be applied in any order to that component.
356.4.d. Discounts that apply to the total cost of a spell and not any one component of the cost must be applied after any discount that applies only to a component of the cost.
356.4.d.1. These discounts may be applied in any order as long as they are applied after component discounts.
356.4.e. If a discount applies a minimum cost, that minimum applies only to that discount. Example: Eager Apprentice says "While I'm at a battleﬁeld, the Energy costs for spells you play is reduced by [1], to a minimum of [1]." A player who controls Eager Apprentice and a unit with 7 Might plays Sky Splitter, a spell that costs 8 Energy and says "This spell's Energy cost is reduced by the highest Might among units you control." That player can choose to apply Eager Apprentice's discount ﬁrst, reducing Sky Splitter's Energy cost to 7, then apply Sky Splitter's discount, reducing its Energy cost to 0. If they applied these discounts in the other order, Sky Splitter's Energy cost would be 1.
356.4.f. Discounts can reduce additional costs, including to 0.
356.4.f.1. An optional additional cost was "paid" if the player made the decision to pay it. It doesn't matter how much the player actually paid. Example: Clockwork Keeper is a unit that costs 2 Energy and 0 Power and says "As you play me, you may pay [C] as an additional cost. If you do, draw 1." A player controls a card that says "Units you play cost [A] less." That player plays Clockwork Keeper and chooses to pay the optional additional cost of [C]. They will draw a card, even though the optional additional cost was reduced to 0.
356.5. Energy and Power costs can't be reduced below 0.
356.6. Costs may be Energy costs, Power costs, or non-standard costs. Example: A card reads "As an additional cost to play me, kill a friendly unit." Killing a friendly unit is an additional cost to play that card.
357. 4. Pay the card's costs.



357.1. In total, pay the combined Energy cost (if any) and Power cost (if any).
357.1.a. During this step, the card's controller can use activated abilities with the Reaction tag that Add resources to add Energy and Power to pay the card's costs. See rule 164. Rune Pools and rule 429. Add for more information.
357.2. In addition, pay any non-standard Cost summed in step 3 in any order.
357.2.a. Costs that are replaced with other events by replacement effects are still considered paid. Example: A player plays Cruel Patron, which says "As an additional cost to play me, kill a friendly unit." They also control Zhonya’s Hourglass, which says “If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it.” They choose to kill a friendly unit during step 3, but as they pay the cost in step 4, Zhonya’s Hourglass replaces that unit’s death. The cost is considered paid, and the player can continue playing Cruel Patron.
357.3. A player may not pay costs during this step that will deterministically result in illegal choices or actions later in this process unless they have no choice. Example: A player plays a card which reads “as an additional cost to play this, you may kill a friendly unit. Give a friendly unit +2 [M] this turn. If you paid the cost, give that unit +7 [M] this turn instead” If they chose to pay the cost, they must choose to kill a unit other than the targeted unit unless they have no choice.
358. 5. Check legality.
358.1. Check that all chosen targets are legal.
358.2. Ensure that the outcome of the effect of this card being played would not create an illegal state. Example: Check that a spell's execution does not create a state where a Battleﬁeld has Units controlled by 3 different players.
358.3. Ensure that the card has the appropriate permissions to be played at this timing. Example: If the state is Showdown Closed and the card was the one that Closed the state, ensure that it has [Action] or [Reaction]. Example: If the state is Closed and the card wasn’t the one that Closed the state, ensure that it has [Reaction].
358.4. If the card, if continued to be played, would create an illegal state, or if a choice or action at this state is illegal, the actions taken in this process are undone and the action is cancelled.
359. 6. Finish ﬁnalizing this card and proceed with the card's category of Play.
359.1. This card is no longer Pending .
359.2. A Permanent leaves the Chain and becomes a Game Object.
359.2.a. Any passive abilities become active.
359.2.b. Execute all rules text on the card, from top to bottom.
359.2.c. If it is a Unit , it enters the Board exhausted at the Location that was chosen.
359.2.d. If it is a Gear, it enters the Board Ready at the player's Base.
359.3. A Spell lingers on the Chain.
359.3.a. This card becomes a Finalized Chain Item.
359.3.b. If there are other Pending Items on the Chain, then the controller of those Pending Items completes Steps 2 through 5 of Playing Cards for those items before continuing. See rule 327. Chains for more information .



359.3.c. Other players have an opportunity to play Reactions before the resolution of spells. See rule 327. Chains for more information.
359.3.d. Otherwise, execute the game effect of the spell, from top to bottom of the rules text of the card and then place the card in the Trash of the owning player.
359.3.e. Handling illegal and impossible instructions
359.3.e.1. The spell resolves even if some or all of its targets are illegal.
359.3.e.2. A target is illegal as the spell resolves if it no longer meets the targeting requirements of the spell, or if it has changed Zones to or from a Non-Board Zone.
359.3.e.3. If a target ceases to meet the targeting requirements while the spell is on the chain, then meets them again, it's a legal target. Example: A spell targets "a unit at a battleﬁeld." A player reacts with a spell that moves the unit to base, then another player reacts with a spell that moves it back to that battleﬁeld, then the original spell resolves. The unit is a legal target.
359.3.e.4. If a target changes Zones to or from a Non-Board Zone and then returns to its original zone, it is no longer a legal target, because it's not treated as the same object. Examples: An enemy unit at a battleﬁeld is no longer a legal target if it is no longer an enemy, no longer a unit, or no longer at a battleﬁeld. A unit with 3 or less Might is no longer a legal target if it is no longer a unit or if its Might is greater than 3. Something that's exhausted is no longer a legal target if it is no longer exhausted. (It can't stop being "something.") A spell that's played from hidden can normally only target its own battleﬁeld or something at that battleﬁeld. A target for such a spell may cease to be a legal target if it moves from the battleﬁeld where that spell was played, even if the spell has no location targeting requirement otherwise.
359.3.e.5. If any of the spell's targets are no longer legal, those targets are unaffected by the spell as it resolves. Example: A player plays Void Seeker, a spell that says "Deal 4 to a unit at a battleﬁeld. Draw 1." The unit's controller uses a Reaction to move the unit to their base. Since the unit is no longer a legal target, it is not dealt any damage. Void Seeker's controller still draws 1.
359.3.e.6. Instructions that can't be followed, either because of illegal targets or other circumstances, are ignored.
359.3.e.7. If all of an instruction's Targets become Invalid or Unavailable by the time the spell is ﬁnished being played, that instruction will not execute.
359.3.e.8. If an instruction has more than one Target and fewer than all of the Targets become Invalid or Unavailable by the time the spell is ﬁnished being played, the instruction will execute, with only the Targets available and valid being operated on.



359.3.e.9. The process for a card's choice becoming Invalid or Unavailable is referred to as mistargeting. Example: A spell has the instruction "Deal 2 to a unit at a battleﬁeld." Before that instruction can execute, the chosen unit is moved to its base. The instruction will not be executed, because it speciﬁes that the unit it chooses must be at a Battleﬁeld, and by the time it attempted to execute, the unit was no longer valid as a choice.
359.3.e.10. It is possible for none of a spell's instructions to be executed as it resolves, due to all of them requiring targets to act on and all of those targets becoming Invalid or Unavailable . In this case, the spell has no effect but is still considered played. Example: A player plays a spell that reads "Deal 2 to a unit at a battleﬁeld" with no other instructions, and chooses an enemy unit at a battleﬁeld. They also control a unit with the ability "When you play a spell, give me +1 [M] this turn." Before the spell resolves, the chosen unit is moved to its base. The spell resolves and its only instruction cannot be executed, but the unit's ability still triggers as the spell resolves and gives it +1 [M].
359.3.e.11. Instructions that can be partially followed are followed as much as possible and ignored otherwise. Example: A player plays a spell that says "Discard 2, then draw 2" If their hand is empty, the instruction to discard 2 will be ignored. They'll still draw 2. If they had 1 card in hand, they would discard it and draw 2.
359.3.e.12. If the spell checks information about a target that is no longer legal or a card or permanent whose location, zone, or status has changed such that that information is no longer available, that check returns "null" and all calculations based on it are ignored. Examples: A unit that is no longer on the board is treated as having null Might, null cost, etc. A unit that is no longer on the board has no location, is neither exhausted nor readied, etc. Baited Hook says "[1][C], [E]: Kill a friendly unit. Look at the top 5 cards of your Main Deck. You may banish a unit from among them that has Might up to 1 more than the killed unit and play it, ignoring its cost. Then recycle the rest." While Baited Hook’s ability is on the chain, an opponent reacts with a spell that returns the friendly unit to its owner's hand. Because the friendly unit is no longer a legal target, it can't be killed and its Might is treated as null. Baited Hook’s controller looks at the top 5 cards of their Main Deck, but can’t choose any unit from among them.
359.3.e.12.a. If the spell checks information about a target that is legal, or a card or permanent whose location, zone, or status has not changed such that information is no longer available, that information is accessible.
359.3.e.13. A spell or ability that moves something to a different zone as a cost or effect can "look back" at its characteristics before it changes zones.
359.3.e.14. Some instructions may reference Game Objects affected by, or Game Actions performed in, other instructions in a card. The referenced and referencing instructions are called “linked instructions.”
359.3.e.14.a. In order for a later linked instruction to execute, its earlier linked instruction must have executed. If the earlier linked instruction is ignored for any reason, the later linked instruction will also be ignored.
359.3.e.14.b. If the Game Action performed in an earlier linked instruction is replaced, this will not affect the later linked instruction.
