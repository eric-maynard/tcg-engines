185.  Control


186.  Control is the concept of a player having inﬂuence of a Game Object and applies differently to different card types.
187.  Battleﬁelds
187.1.  Control is established over Battleﬁelds through the course of play.
187.2.  Control is a binary state for Battleﬁelds and an Identiﬁer for players.
187.2.a. A Battleﬁeld is Controlled or Uncontrolled.
187.2.b. A Battleﬁeld is Controlled by a speciﬁc player or Controlled by no one.
187.3.  Control can be Contested through the course of play.
187.3.a. Contested is a temporary status applied to the battleﬁeld when a Unit controlled by a Player who does not currently Control that Battleﬁeld Moves or otherwise becomes present there.
187.3.a.1. Units moving to or being played to a battleﬁeld apply Contested status if that battleﬁeld is not already contested and that Unit ’s controller does not already control that battleﬁeld.
187.3.b. A Battleﬁeld remains Contested until Control is established or re-established.
187.3.c. The state of a Battleﬁeld being Contested is used to determine when Combat should occur, when a Non-Combat Showdown should occur, and when Control will change.
187.3.d. At this time Game Effects cannot reference this status.
187.4.  Control is established by having Units at a Battleﬁeld at the end of a Showdown or Combat after applying the contested status.
187.4.a. If a player controls Units at a Battleﬁeld, outside of Combat, they maintain Control of that Battleﬁeld for as long as they have Units at that Battleﬁeld.
187.4.b. While a Combat or Showdown is ongoing at a Battleﬁeld , Control of that Battleﬁeld cannot change until instructed by steps of the Combat or Showdown .
187.4.c. If a player has no Units at a Battleﬁeld and the turn is in an Open state, they lose Control of that Battleﬁeld in the following cleanup, unless there is a Combat or Showdown ongoing there.
187.5.  Control is a constant state.
187.6.  Control of a Battleﬁeld determines Control of its Abilities.
187.6.a. While a Battleﬁeld is Controlled , its Controller controls its Abilities . That player takes responsibility for adding them to the Chain if applicable, and makes all choices required by them unless otherwise speciﬁed.
187.6.b. While a Battleﬁeld is Uncontrolled , its Abilities are also Uncontrolled. The Turn Player takes responsibility for adding them to the Chain if applicable, makes all choices required by them unless otherwise speciﬁed, and is treated as their Controller if any game rule or effect requires one. Example: The Arena’s Greatest is a battleﬁeld that reads “At the start of each player's ﬁrst Beginning Phase, that player gains 1 point.” This ability will usually trigger while the battleﬁeld has no controller. If it does, the Turn Player goes through the steps of adding the ability to the chain and receives priority after doing so, exactly as if they controlled the ability.
187.6.c. “You” in a battleﬁeld’s abilities refers to the battleﬁeld’s Controller , as does the implied “you” in instructions like “draw 1.” If the battleﬁeld has no Controller , “you” refers to no one, and all such instructions are ignored.
