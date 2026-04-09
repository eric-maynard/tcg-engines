554.  Playing Cards
555.  Playing a card is the act of a player utilizing their cards.
555.1.  A card is  Played  when it has finished this process in its entirety.
555.2.  Tokens are not cards, but can still be  Played.
See  rule 170. Tokens  for more information.
556.  Cards have different behaviors when played.
556.1.  Permanents  become  Game Objects  when  Played.
556.2.  Spells  create game effects that are executed, then the card is placed in the trash when
Played.
557.  The Process of Play
558.  Remove the card from the zone you are playing it from and put it onto the  Chain.
558.1.  This  Closes the State.
See  rule 507. States of the Turn  for more information.
559.  Make necessary choices.
559.1.  If the card is a spell, or has an effect that specifies a choice "As I am played," those choices
are made now.
559.2.  For  Units , choose a  Location  the player  Controls  on the  Board  where that  Unit  will be placed
upon being  Played.
559.3.  If a card requires you to specifically choose one or more  Game Objects , that choice is made
now.
559.3.a.  This does not include cards that affect one or more  Game Objects  based on criteria.
Example: "Stun a unit at a battlefield" is a  Choice.
Example: "Kill all gear" is not a  Choice.
559.3.b.  This does not include making choices for  Triggered Abilities  of permanents, even if
those abilities trigger when the permanent is played.
Example: A unit with a triggered ability that says "When I'm played, kill a
unit" does not require you to choose a target as it's played. The target will be
chosen when the ability triggers.
See  rule 582. Triggered Abilities  for more information.
559.3.c.  Targeting
559.3.c.1.  When a card  Chooses  one or more specific  Game Objects  to affect, it is
Targeted.
559.3.c.2.  If  all  of an instruction's  Targets  become  Invalid  or  Unavailable  by the time
the spell is finished being played, that instruction will not execute.
559.3.c.3.  If an instruction has more than one  Target  and fewer than  all  of the  Targets
become  Invalid  or  Unavailable  by the time the spell is finished being
played, the instruction will execute, with only the  Targets  available and valid
being operated on.
559.3.c.4.  The process for a card's choice  becoming Invalid  or  Unavailable  is referred
to as  mistargeting.
Example: A spell has the instruction "Deal 2 to a unit at a battlefield."
Before that instruction can execute, the chosen unit is moved to its
base. The instruction will not be executed, because it specifies that
the unit it chooses must be at a Battlefield, and by the time it
attempted to execute, the unit was no longer valid as a choice.
559.3.c.5.  It is possible for  none  of a spell's instructions to be executed as it resolves,
due to all of them requiring targets to act on and  all  of those targets
becoming  Invalid  or  Unavailable . In this case, the spell has no effect but is
still considered played.
Example: A player plays a spell that reads "Deal 2 to a unit at a
battlefield" with no other instructions, and chooses an enemy unit at
a battlefield. They also control a unit with the ability "When you play
a spell, give me +1 [S] this turn." Before the spell resolves, the chosen
unit is moved to its base. The spell resolves and its only instruction
cannot be executed, but the unit's ability still triggers as the spell
resolves and gives it +1 [S].
559.3.c.6.  If a card specifies that a player may choose some number of  Game Objects
to be affected by a card, then all choices are considered targeted and
chosen independently.
559.3.d.  Splitting
559.3.d.1.  If a card specifies that an amount of damage may be split among some
number of  Units , then each  Unit  chosen is  Targeted.
559.3.d.2.  The  Targets  are chosen when the spell is  Played  or the ability is added to the
chain.
559.3.d.3.  A number of  Targets  can only be chosen up to, and not exceeding, the initial
amount of damage available when the spell is played.
Example: A player playing a spell that instructs them to "Split 5
damage" may only choose up to 5 units, but may choose fewer.
559.3.d.4.  Each  Target  is valid, and contributes to  Chosen  triggers individually.
559.3.d.5.  The choice of how much damage is divided across the split is not decided
until the resolution of the spell or ability.
559.3.d.6.  Each  Target  must receive a valid amount of damage.
559.3.d.7.  Valid damage is a positive integer amount, greater than or equal to 1
damage.
559.3.d.8.  If, at resolution of the spell or effect, there are more  Targets  than available
damage to divide, then the player who controls the effect dealing damage
determines which  Targets  cease being  Targets.
559.3.d.9.  Any costs that were paid, or effects that were triggered as a result of those
Game Objects  being chosen as  Targets  remain in effect, paid, or otherwise
triggered.
559.4.  These choices cannot be changed after this step.
559.5.  A player may not make choices during this step that will deterministically result in illegal
choices or actions later in this process unless they have no choice.
Example: A player plays Cruel Patron, which says "As an additional cost to play me,
kill a friendly unit." They control exactly one unit, which is at a battlefield. They can't
choose to play Cruel Patron to that battlefield, because by the time they have
finished paying costs, they will no longer control that battlefield.
560.  Determine Total Cost.
560.1.  If an ability or instruction allows you to "ignore" one or more of a card's costs, set the
appropriate  Base Cost(s)  of the card to zero.
560.1.a.  If a card allows a player to play a card "ignoring its cost," its base  Energy cost  and
base  Power cost  are set to zero.
560.1.b.  If a card instructs a player to play a card "ignoring its Energy cost" or "ignoring its
Power cost," only the appropriate cost is set to zero, and the remaining cost still
applies.
560.1.c.  Further additional costs and/or cost increases applied in subsequent steps may raise
the card's  Total Cost  above zero.
Example: Legion Rearguard is a Fury unit that costs 2 Energy and 0 Power
and has Accelerate. A player plays Legion Rearguard and is instructed to
ignore its costs, but chooses to pay the Accelerate cost of [1][C]. They ignore
Legion Rearguard's  Base Cost  of 2 Energy, but the optional additional cost
of 1 Energy and 1 Fury Power is added to its  Total Cost  and must be paid.
560.2.  Apply additional costs in any order.
560.2.a.  Mandatory Additional Costs
560.2.a.1.  Some  Additional Costs  specified by  Passive Abilities  on the card being
played or another card are  Mandatory , and must be paid to complete
playing the card. They use the phrase "as an additional cost" and don't
include the word "may."
Example: A unit has the passive ability "As an additional cost to play
me, kill a friendly unit." To play that unit, a player must kill a friendly
unit.
See  rule 567. Passive Abilities  for more information.
560.2.a.2.  The cost imposed by the  Deflect  keyword is a  Mandatory Additional Cost.
See  rule 721. Deflect  for more information.
560.2.b.  Optional Additional Costs
560.2.b.1.  Some  Optional Costs  specified by  Passive Abilities  on the card being
played or another card are  Non-Mandatory , and must be paid only if the
player made the choice to pay them in  rule 559.  They use the phrase "as an
additional cost" and the word "may."
Example: A unit has the ability "As you play me, you may discard 1
as an additional cost. If you do, reduce my cost by [2]." While
playing the unit, its controller declares their intention to pay the
additional cost in  rule 559 , applies that additional cost in  rule 560.2 ,
applies the discount granted by paying that cost in  rule 560.4 , and
discards a card to pay that additional cost in  rule 561.
See  rule 567. Passive Abilities  for more information.
560.3.  Apply cost increases.
560.4.  Apply discounts in any order.
560.4.a.  Discounts may be applied by the card being played or by any other card or effect.
560.4.b.  Discounts may say that cards "cost [amount] less" or that one or more of their costs
are "reduced by [amount]."
560.4.c.  If a discount applies a minimum cost, that minimum applies only to that discount.
Example: Eager Apprentice says "While I'm at a battlefield, the Energy costs
for spells you play is reduced by [1], to a minimum of [1]." A player who
controls Eager Apprentice and a unit with 7 Might plays Sky Splitter, a spell
that costs 8 Energy and says "This spell's Energy cost is reduced by the
highest Might among units you control." That player can choose to apply
Eager Apprentice's discount first, reducing Sky Splitter's Energy cost to 7,
then apply Sky Splitter's discount, reducing its Energy cost to 0. If they
applied these discounts in the other order, Sky Splitter's Energy cost would
be 1.
560.4.d.  Discounts can reduce additional costs, including to 0.
560.4.d.1.  An optional additional cost was "paid" if the player made the decision in  rule
559  to pay it. It doesn't matter how much the player actually paid.
Example: Clockwork Keeper is a unit that costs 2 Energy and 0
Power and says "As you play me, you may pay [C] as an additional
cost. If you do, draw " A player controls a card that says "Units you
play cost [A] less." That player plays Clockwork Keeper and chooses
to pay the optional additional cost of [C]. They will draw a card,
even though the optional additional cost was reduced to 0.
560.5.  Energy and Power costs can't be reduced below 0.
560.6.  Costs  may be Energy costs, Power costs, or non-standard costs.
Example: A card reads "As an additional cost to play me, kill a friendly unit." Killing a
friendly unit is an additional cost to play that card.
561.  Pay the card's costs.
561.1.  In total, pay the combined  Energy  cost (if any) and  Power  cost (if any).
561.1.a.  During this step, the spell's controller can use activated abilities with the  Reaction
tag that  Add  resources to add  Energy  and  Power  to pay the spell's costs.
See  rule 158. Rune Pools  and  rule 605. Add  for more information.
561.2.  In addition, pay any non-standard  Cost  summed in  rule 560.2  in any order.
561.3.  A player may not pay costs during this step that will deterministically result in illegal choices
or actions later in this process unless they have no choice.
Example: A player plays Cruel Patron, which says "As an additional cost to play me,
kill a friendly unit." They control multiple units, one of which is alone at a battlefield.
During step b, they chose to play Cruel Patron to that battlefield. While paying costs,
they can't choose to kill the unit at that battlefield, because then they will no longer
control that battlefield and Cruel Patron cannot legally be played there. If they
controlled that battlefield with multiple units, any of those units would be a legal
choice, because they would still control the battlefield after killing one.
562.  Check legality.
562.1.  Check that all chosen targets are legal.
562.2.  Ensure that the outcome of the effect of this card being played would not create an illegal
state.
Example: Check that a spell's execution does not create a state where a Battlefield
has  Units  controlled by 3 different players.
562.3.  If the card, if continued to be played, would create an illegal state, or if a choice or action at
this state is illegal, the actions taken in this process are undone and the action is cancelled.
563.  Proceed with the card's category of  Play.
563.1.  A  Permanent  leaves the  Chain  and becomes a  Game Object.
563.1.a.  Any static rules text becomes active.
563.1.b.  Execute all rules text on the card, from top to bottom.
563.1.c.  If it is a  Unit , it enters  the Board exhausted  at the  Location  that was chosen.
563.1.d.  If it is a  Gear,  it enters  the Board Ready  at the player's  Base.
563.2.  A  Spell  lingers on the  Chain.
563.2.a.  Other players have an opportunity to play  Reactions  before the resolution of spells.
See  rule 532. Chains  for more information.
563.2.b.  Otherwise, execute the game effect of the spell, from top to bottom of the rules text
of the card and then place the card in the  Trash  of the owning player.
563.2.c.  Handling illegal and impossible instructions
563.2.c.1.  The spell resolves even if some or all of its targets are illegal.
563.2.c.2.  A target is illegal as the spell resolves if it no longer meets the targeting
requirements of the spell, or if it has changed  Zones  to or from a  Non-Board
Zone.
563.2.c.3.  If a target ceases to meet the targeting requirements while the spell is on
the chain, then meets them again, it's a legal target.
Example: A spell targets "a unit at a battlefield." A player reacts with
a spell that moves the unit to base, then another player reacts with a
spell that moves it back to that battlefield, then the original spell
resolves. The unit is a legal target.
563.2.c.4.  If a target changes  Zones  to or from a  Non-Board Zone  and then returns to
its original zone, it is no longer a legal target, because it's not treated as the
same object.
Examples:
An enemy unit at a battlefield is no longer a legal target if it is no
longer an enemy, no longer a unit, or no longer at a battlefield.
A unit with 3 or less Might is no longer a legal target if it is no longer
a unit or if its Might is greater than 3.
Something that's exhausted is no longer a legal target if it is no
longer exhausted. (It can't stop being "something.")
A spell that's played from hidden has the additional targeting
requirement "here." A target for such a spell ceases to be a legal
target if it moves from the battlefield where that spell was played,
even if the spell has no location targeting requirement otherwise.
563.2.c.5.  If any of the spell's targets are no longer legal, those targets are unaffected
by the spell as it resolves.
Example: A player plays Void Seeker, a spell that says "Deal 4 to a
unit at a battlefield. Draw " The unit's controller uses a Reaction to
move the unit to their base. Since the unit is no longer a legal target,
it is not dealt any damage. Void Seeker's controller still draws 1.
563.2.c.6.  Instructions that can't be followed, either because of illegal targets or other
circumstances, are ignored.
563.2.c.7.  Instructions that can be partially followed are followed as much as possible
and ignored otherwise.
Example: A player plays a spell that says "Discard 2, then draw 2" If
their hand is empty, the instruction to discard 2 will be ignored.
They'll still draw 2. If they had 1 card in hand, they would discard it
and draw 2.
563.2.c.8.  If the spell checks information about a target that is no longer legal or a
card or permanent whose location, zone, or status has changed such that
that information is no longer available, that check returns "zero" or "null" as
appropriate.
Example: A unit that is no longer on the board is treated as having 0
Might, 0 cost, etc.
Example: A unit that is no longer on the board has no location, is
neither exhausted nor readied, etc.
Example: Last Breath says "Ready a friendly unit. It deals damage
equal to its Might to an enemy unit at a battlefield." While Last
Breath is on the chain, an opponent reacts with a spell that returns
the friendly unit to its owner's hand. Because the friendly unit is no
longer a legal target, it can't be readied and its Might is treated as 0.
Last Breath readies nothing and deals 0 damage to the chosen
enemy unit.
563.2.c.9.  A spell or ability that moves something to a different zone as a cost or effect
can "look back" at its characteristics before it changes zones.
