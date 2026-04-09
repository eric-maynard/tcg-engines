179.  Control
180.  Control  is the concept of a player having influence of a  Game Object  and applies differently to
different card types.
181.  Battlefields
181.1.  Control  is established over  Battlefields  through the course of play.
181.2.  Control  is a binary state for  Battlefields  and an  Identifier  for players.
181.2.a.  A  Battlefield  is  Controlled  or  Uncontrolled.
181.2.b.  A  Battlefield  is  Controlled by a specific player  or  Controlled by no one.
181.3.  Control  can be  Contested  through the course of play.
181.3.a.  Contested  is a temporary status applied to the battlefield when a  Unit  controlled by
a  Player  who does not currently  Control  that  Battlefield Moves  or otherwise
becomes present there.
181.3.b.  A  Battlefield  remains  Contested  until  Control  is established or re-established.
181.3.c.  The state of a  Battlefield  being  Contested  is used to determine when  Combat  should
occur, when a  Showdown  without a  Combat  should occur, and when  Control  will
change.
181.3.d.  At this time  Game Effects  cannot reference this status .
181.4.  Control  is established by the presence of  Units  controlled by a player.
181.4.a.  If a player controls  Units  at a  Battlefield,  outside of  Combat , they have  Control  of
that  Battlefield.
181.4.b.  A player maintains control of a  Battlefield  while it is being  Contested  by an
opponent.
181.4.c.  Control  changes immediately if, at the end of  Combat , the  Units  at a  Battlefield  are
controlled by a different player than before the  Combat.
181.4.d.  If a player has no  Units  at a  Battlefield,  they have no  Control  of that  Battlefield.
181.5.  Control  is a constant state with no reliance on timing.
182.  Everything Else
182.1.  When a player  Plays  a  Card , they are established as that  Game Object's Controller.
182.2.  For  Spells , they are the  Spell's Controller.
182.2.a.  That player chooses targets.
182.2.b.  That player chooses modes.
182.2.c.  That player pays costs.
182.3.  For  Permanents  and  Runes , when they  Enter the Board , that player is assigned as that
Game Object's Controller.
182.3.a.  That player may make decisions about the  Game Object's Inherent Abilities.
182.3.b.  That player may make decisions about the  Game Object's Unique Abilities.
182.3.c.  That player may make decisions about any game effects or decisions necessary
while the card is being played.
182.3.d.  That player may make decisions about any game effects created from "When you
play me" effects of  Permanents.
183.  When a game effect or rules text refers to the  Controller  of a specific object, it can be referring to
either context interchangeably.
183.1.  The method of assignment of control is different, but the status of  Control  is the same across
all  Game Objects.
