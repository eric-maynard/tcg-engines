349.  Playing Cards
350.  Playing a card is the act of a player utilizing their cards.
350.1.  A card is Played when it has ﬁnished this process in its entirety.
350.2.  Tokens are not cards, but can still be Played. See rule 176. Tokens for more information.
351.  Cards have different behaviors when played.
351.1.  Permanents become Game Objects when Played.
351.2.  Spells create game effects that are executed, then the card is placed in the trash when Played.
352.  Cards have different states during the process of being played.
352.1.  When initially being played cards are Pending, as Pending Chain Items.
352.2.  Near the end of the process cards will cease being Pending and become Finalized Chain Items .
353.  The Process of Play
354.  1. Remove the card from the zone you are playing it from and put it onto the Chain.
354.1.  This Closes the State. See rule 307. States of the Turn for more information.
354.2.  This item becomes Pending, awaiting the ﬁnalization process (steps 2 - 5)
354.3.  If another Card Effect or ability is currently resolving, continue resolving it before proceeding with any further steps of this process.
354.4.  If there are Tasks outstanding or currently being handled, ﬁnish those Tasks before continuing this process. See rule 334. for more information on Tasks.
355.  2. Make relevant choices.
355.1.  If the card is a spell, or has an effect that speciﬁes a choice "As I am played," those choices are made now.
355.2.  For Units , choose a valid Location where that Unit will be placed upon being Played.
355.2.a. By default, Valid locations include the controller’s Base or a Battleﬁeld the controller controls.
355.2.b. Some Game Effects may grant players permission to play Units to locations that are not normally Valid . Such locations become Valid for the purposes of Playing the Unit.


355.3.  For Spells and Abilities with a bulleted list of modes to choose from, make the appropriate choices now.
355.4.  For Spells and Abilities that Move one or more Units , choose a valid Location as the Move Destination for each Move that will be performed.
355.4.a. A valid Location is one other than the Units’ current Location where they are allowed to be present.
355.5.  If a card requires you to speciﬁcally choose one or more Game Objects , that choice is made now.
355.5.a. This does not include cards that affect one or more Game Objects based on criteria. Example: "Stun a unit at a battleﬁeld" is a Choice. Example: "Kill all gear" is not a Choice.
355.5.b. This does not include making choices for Triggered Abilities of permanents, even if those abilities trigger when the permanent is played. Example: A unit with a triggered ability that says "When I'm played, kill a unit" does not require you to choose a target as it's played. The target will be chosen when the ability triggers. See rule 382. Triggered Abilities for more information.
355.6.  Targeting
355.7.  When a card Chooses one or more speciﬁc Game Objects to affect, it is Targeted unless indicated otherwise by the rules in this section.
355.8.  In order to put a spell or ability on the chain, valid choices must be made for all targets.
355.9.  A target is a valid choice if it meets all of the following requirements:
355.9.a. It is a permanent or rune on the board, a spell or ability on the chain, a player or zone, or speciﬁed explicitly or implicitly as being in some other zone. e.g., “Kill a unit” targets a unit on the board. e.g., “Recycle a unit from your trash” targets a unit card in your trash.
355.9.a.1. “Unit,” “gear,” and “rune” refer to objects on the Board unless speciﬁed otherwise.
355.9.a.2. “Spell” and “ability” refer to objects on the Chain unless speciﬁed otherwise.
355.9.a.3. “Facedown card” refers to a card in a Facedown Zone unless speciﬁed otherwise.
355.9.a.4. “Legend” refers to a legend in the Legend Zone.
355.9.a.5. “Chosen Champion” and “unit in the Champion Zone” refer to a unit in the Champion Zone unless speciﬁed otherwise.
355.9.b. It meets all targeting restrictions. e.g., A unit is a valid target for a spell that refers to a “unit at a battleﬁeld,” “enemy unit,” “unit you control,” or “unit with Might 4 or greater” only if it meets the appropriate criteria.
355.9.c. It is not the spell or ability itself. e.g., A spell that says “Counter a spell” cannot target itself. e.g., An ability of a permanent can target that permanent, because abilities and their sources are separate objects.
355.10.  A game object, player, or zone mentioned in the text of a spell, activated ability, or triggered ability is a target UNLESS any of the following are true:


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
355.11.  Some cards identify a group of Targets with Targeting Requirements that must be met by the group as a whole.
355.11.a. As they’re ﬁnalized on the chain, such cards can choose any group of valid targets that collectively fulﬁll the targeting restriction.
355.11.b. If the group of targets no longer collectively fulﬁll the targeting restriction as the spell or ability resolves, that spell or ability’s controller can choose a subset of the original targets that fulﬁlls the targeting requirement for the spell or ability to affect. Example: A player plays Fox-Fire, a spell that says in part “Kill any number of units at a battleﬁeld with total Might 4 or less.” That player chooses four 1 [M] Recruit tokens at a single battleﬁeld. As a Reaction, another player gives two of those Recruits +1 [M], so the Recruits’ Mights are 1, 1, 2, and 2. Then Fox-Fire resolves. The Recruits no longer have total Might 4 or less, so Fox-Fire’s controller must choose a legal subset of the original targets to affect. They could choose to kill the two 2 [M] Recruits, or the two 1 [M] Recruits plus one 2 [M] Recruit. The units they choose are Fox-Fire’s remaining legal targets. They can’t choose to affect units at the same battleﬁeld that weren’t initially chosen as targets. They can, however, choose to affect units that were initially chosen as targets that left the chosen battleﬁeld before Fox-Fire resolved as long as those units are all located at the same battleﬁeld.
355.12.  If a spell speciﬁes that a player may perform a Game Action on some number of Game Objects , then all choices are considered targeted and chosen independently of the decision to perform the Game Action.
355.13.  If a card speciﬁes that a player chooses “any number” or “up to” some number of Game Objects to be affected, they may choose any number of available targets, including zero. If they choose zero, the spell or ability can be played without any targets.
355.14.  Splitting
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
355.15.  These choices cannot be changed after this step.
355.16.  A player may not make choices during this step that will deterministically result in illegal choices or actions later in this process unless they have no choice. Example: A player plays a card which reads “as an additional cost to play this, kill the unit you control with the most Might. Give a friendly unit +[M] equal to the killed unit’s Might this turn. Predict 2.” They cannot choose to target their unit with the highest Might during this step of ﬁnalization.
355.17.  If a spell or ability requires one or more players to make choices that are not outlined in this section, they are made on resolution.
356.  3. Determine Total Cost.
356.1.  Apply base cost modiﬁcations in any order.
356.1.a. If an ability or instruction allows you to play a card “for [Cost]”, replace the card’s Base Costs with [Cost].
356.1.b. If an ability or instruction allows you to "ignore" one or more of a card's costs, set the appropriate Base Cost(s) of the card to zero.
356.1.b.1. If a card allows a player to play a card "ignoring its cost," its base Energy cost and base Power cost are set to zero.
356.1.b.2. If a card instructs a player to play a card "ignoring its Energy cost" or "ignoring its Power cost," only the appropriate cost is set to zero, and the remaining cost still applies.
356.1.b.3. Further additional costs and/or cost increases applied in subsequent steps may raise the card's Total Cost above zero. Example: Legion Rearguard is a Fury unit that costs 2 Energy and 0 Power and has Accelerate. A player plays Legion Rearguard and is instructed to ignore its costs, but chooses to pay the Accelerate cost. They ignore Legion Rearguard's Base Cost of 2 Energy, but the optional additional cost of 1 Energy and 1 Fury Power is added to its Total Cost and must be paid.
356.2.  Apply additional costs in any order.
356.2.a. Mandatory Additional Costs
356.2.a.1. Some Additional Costs speciﬁed by Passive Abilities on the card being played or another card are Mandatory , and must be paid to complete playing the card. They use the phrase "as an additional cost" and don't include the word "may." Example: A unit has the passive ability "As an additional cost to play me, kill a friendly unit." To play that unit, a player must kill a friendly unit. See rule 363. Passive Abilities for more information.
356.2.a.2. The cost imposed by the Deﬂect keyword is a Mandatory Additional Cost. See rule 809. Deﬂect for more information.
356.2.b. Optional Additional Costs
356.2.b.1. Some Optional Costs speciﬁed by Passive Abilities on the card being played or another card are Non-Mandatory , and must be paid only if the player made the choice to pay them in step 2. They use the phrase "as an additional cost" and the word "may." Example: A unit has the ability "As you play me, you may discard 1 as an additional cost. If you do, reduce my cost by [2]." While playing the unit, its


controller declares their intention to pay the additional cost in step 2 , applies that additional cost in rule 356.2 , applies the discount granted by paying that cost in rule 356.4 , and discards a card to pay that additional cost in rule 357.2. See rule 363. Passive Abilities for more information.
356.3.  Apply cost increases.
356.4.  Apply discounts.
356.4.a. Discounts may be applied by the card being played or by any other card or effect.
356.4.b. Discounts may say that cards "cost [amount] less" or that one or more of their costs are "reduced by [amount]."
356.4.c. Discounts that only apply to a component of the cost will be applied when that component is added to the cost of the spell and before any other discounts. Example: Ezreal, Prodigy reads “optional additional costs you pay cost [1] or [A] less.” When playing a Frigid Touch and choosing to pay the additional cost in step 2, as soon as the additional cost is added to the cost of the spell, Ezreal, Prodigy’s discount is applied to it.
356.4.c.1. Discounts that apply to a given component of a spell’s cost may be applied in any order to that component.
356.4.d. Discounts that apply to the total cost of a spell and not any one component of the cost must be applied after any discount that applies only to a component of the cost.
356.4.d.1. These discounts may be applied in any order as long as they are applied after component discounts.
356.4.e. If a discount applies a minimum cost, that minimum applies only to that discount. Example: Eager Apprentice says "While I'm at a battleﬁeld, the Energy costs for spells you play is reduced by [1], to a minimum of [1]." A player who controls Eager Apprentice and a unit with 7 Might plays Sky Splitter, a spell that costs 8 Energy and says "This spell's Energy cost is reduced by the highest Might among units you control." That player can choose to apply Eager Apprentice's discount ﬁrst, reducing Sky Splitter's Energy cost to 7, then apply Sky Splitter's discount, reducing its Energy cost to 0. If they applied these discounts in the other order, Sky Splitter's Energy cost would be 1.
356.4.f. Discounts can reduce additional costs, including to 0.
356.4.f.1. An optional additional cost was "paid" if the player made the decision to pay it. It doesn't matter how much the player actually paid. Example: Clockwork Keeper is a unit that costs 2 Energy and 0 Power and says "As you play me, you may pay [C] as an additional cost. If you do, draw 1." A player controls a card that says "Units you play cost [A] less." That player plays Clockwork Keeper and chooses to pay the optional additional cost of [C]. They will draw a card, even though the optional additional cost was reduced to 0.
356.5.  Energy and Power costs can't be reduced below 0.
356.6.  Costs may be Energy costs, Power costs, or non-standard costs. Example: A card reads "As an additional cost to play me, kill a friendly unit." Killing a friendly unit is an additional cost to play that card.
357.  4. Pay the card's costs.


357.1.  In total, pay the combined Energy cost (if any) and Power cost (if any).
357.1.a. During this step, the card's controller can use activated abilities with the Reaction tag that Add resources to add Energy and Power to pay the card's costs. See rule 164. Rune Pools and rule 429. Add for more information.
357.2.  In addition, pay any non-standard Cost summed in step 3 in any order.
357.2.a. Costs that are replaced with other events by replacement effects are still considered paid. Example: A player plays Cruel Patron, which says "As an additional cost to play me, kill a friendly unit." They also control Zhonya’s Hourglass, which says “If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it.” They choose to kill a friendly unit during step 3, but as they pay the cost in step 4, Zhonya’s Hourglass replaces that unit’s death. The cost is considered paid, and the player can continue playing Cruel Patron.
357.3.  A player may not pay costs during this step that will deterministically result in illegal choices or actions later in this process unless they have no choice. Example: A player plays a card which reads “as an additional cost to play this, you may kill a friendly unit. Give a friendly unit +2 [M] this turn. If you paid the cost, give that unit +7 [M] this turn instead” If they chose to pay the cost, they must choose to kill a unit other than the targeted unit unless they have no choice.
358.  5. Check legality.
358.1.  Check that all chosen targets are legal.
358.2.  Ensure that the outcome of the effect of this card being played would not create an illegal state. Example: Check that a spell's execution does not create a state where a Battleﬁeld has Units controlled by 3 different players.
358.3.  Ensure that the card has the appropriate permissions to be played at this timing. Example: If the state is Showdown Closed and the card was the one that Closed the state, ensure that it has [Action] or [Reaction]. Example: If the state is Closed and the card wasn’t the one that Closed the state, ensure that it has [Reaction].
358.4.  If the card, if continued to be played, would create an illegal state, or if a choice or action at this state is illegal, the actions taken in this process are undone and the action is cancelled.
359.  6. Finish ﬁnalizing this card and proceed with the card's category of Play.
359.1.  This card is no longer Pending .
359.2.  A Permanent leaves the Chain and becomes a Game Object.
359.2.a. Any passive abilities become active.
359.2.b. Execute all rules text on the card, from top to bottom.
359.2.c. If it is a Unit , it enters the Board exhausted at the Location that was chosen.
359.2.d. If it is a Gear, it enters the Board Ready at the player's Base.
359.3.  A Spell lingers on the Chain.
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


359.3.e.15. A spell or ability that leaves the chain during the process of its resolution will cease further execution of its instructions. This immediately causes the spell or ability to ﬁnish resolving.
359.3.f. Referents
359.3.f.1. Some information used by abilities is referenced from the source of those abilities, or from one or more targets of a spell or ability. This can usually be recognized by the presence of words like “here,” “my,” or “its.”
359.3.f.2. Information referenced in an instruction in this way will be checked on execution of the instruction. Examples: A player moves Yasuo, Remorseful to an occupied enemy battleﬁeld and initiates combat there. In reaction to the Yasuo, Remorseful attack trigger, their opponent plays Fight or Flight from hidden targeting Yasuo, moving him back to base. When the attack trigger resolves, “here” is no longer the battleﬁeld where combat is ongoing and the attack trigger mistargets. In reaction to a Yasuo, Remorseful attack trigger, an opponent plays Stupefy targeting Yasuo. When Yasuo’s attack trigger resolves, it will deal
damage

equal

to

his

current

Might

of

5.

359.3.f.3. Some information used by triggered abilities is referenced from the trigger condition of the ability. This information is checked when the trigger condition is fulﬁlled. Example: Lillia, Fae Fawn reads “when I move from a location, play a 3 [M] Sprite token with Temporary there.” If Lillia moves to a battleﬁeld, her triggered ability will be placed on the chain and it will note the location she moved from when it does so. If she moves to a non-board zone in reaction to the triggered ability on the chain, it will not affect where the Sprite token will be played when the triggered ability resolves.
359.3.f.3.a. In the case of a delayed triggered ability, the information is referenced when the triggered ability is created unless speciﬁed otherwise.
359.3.f.3.a.1 In the case of a linked ability that references information from a linked triggered ability, that information may be referenced from the trigger condition of the linked triggered ability if speciﬁed.
359.3.f.4. Some information used by the effect of a triggered ability is referenced from the triggered ability itself, such as “enemy” and “friendly” status. This information is checked on execution of the referencing instruction. Example: Yasuo, Remorseful reads “when I attack, deal damage equal to my Might to an enemy unit here.” Yasuo moves to an occupied enemy battleﬁeld and his attack trigger goes on the chain. In reaction to the attack trigger, the defending player plays a hidden Hostile Takeover and gains control of Yasuo. The triggered ability is unaffected by Yasuo changing controllers, and “enemy” is in reference to the triggered ability itself, so it will resolve with no issue. Example: In reaction to the same Yasuo, Remorseful trigger, say the defending player had instead played a spell that reads “[Reaction]. Gain control of a triggered ability. You may make new choices for it.” They chose the attack trigger. When Yasuo’s attack trigger resolves, if they didn’t make new choices for the trigger, the controller of the triggered ability will no longer be an enemy to the targeted unit, so the triggered ability will mistarget and do nothing. If they instead chose Yasuo with the attack trigger, he would be an enemy unit to the triggered ability and so it would deal damage equal to his Might to himself.
