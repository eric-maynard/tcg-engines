468.  Layers
469.  Layers are the mechanism in which Game Effects alter the Traits, Intrinsic Abilities, or other properties of Game Objects.
470.  Layers are an organizational structure.
470.1.  Layers only serve to structure the application and order that Game Effects apply to Game Objects to maintain consistency.
471.  The layers are applied repeatedly until all effects operating on objects have been applied once and no changes have been processed.
471.1.  Layers are applied in sequence. Each effect in them is applied as soon as able, and only a single time across all sequences.
471.2.  When a sequence of applications completes, recur the process, and evaluate each layer again applying any effects that may now be applicable.
471.3.  The removal or disqualiﬁcation of an effect is separate from the application of the effect, but still can only be applied once. Example: Fiora, Victorious has printed Might 4 and says “While I'm Mighty, I have Deﬂect, Ganking, and Shield.” If a player places a buff on Fiora, her Might is increased in the Arithmetic layer, after the layer for Ability-Altering Effects. The Ability-Altering Effect layer is then re-checked and the abilities Deﬂect, Ganking, and Shield applied. Since each effect has been applied once and there are no other effects to apply, Fiora’s characteristics are ﬁnalized as 5 Might with Deﬂect, Ganking, and Shield. While a buffed Fiora, Victorious is in combat as a defender, an additional +1 Might will be applied in the Arithmetic layer, giving her 6 Might and the 3 keywords. Example: A buffed Fiora, Victorious is in combat as a defender when her buff is removed. Reevaluating the layers in sequence, she no longer gains Deﬂect, Ganking, and Shield


during the Ability-Altering Effect layer, so when the Arithmetic layer is evaluated, neither the buff (which is gone) nor Shield (which she no longer has) apply. She goes directly from 6 Might with three keywords to 4 Might with no keywords.
472.  Layers are applied in the following order:
472.1.  1. Trait-Altering Effects
472.1.a. This layer deals with effects that grant, remove, or replace inherent traits of Game Objects. Name Super Type Type Tags Controller Cost Domain
472.1.a.1. Assignment of Might is dealt with in this layer. Example: A spell reads "A unit's Might becomes 4 this turn." The unit's Might is set to 4 in this layer.
472.1.b. Copy effects are applied in this layer.
472.1.b.1. When one Game Object becomes a copy of another, all Traits, including the Rules Text, replace or are added to those of the original Game Object as speciﬁed by the Game Effect directing the Copy. This is applied in this layer.
472.1.b.2. Some Game Effects may specify copying certain traits of a card - only the traits speciﬁed by the Game Effect will be copied.
472.1.b.3. Copy effects will copy the copyable traits of a Game Object: by default, those are the printed traits of the Game Object . When a Game Object becomes a copy of something, its copyable traits are updated to the new traits it has received. Example: A player triggers Leblanc, Deceiver’s hold effect and plays a Reﬂection token, making it a copy of Honest Broker. That player then plays Mirror Image, targeting the Reﬂection token. When the Mirror Image Reﬂection token is played, it copies all of the copyable traits of the original Reﬂection token - which are currently those of Honest Broker which it is a copy of. That player will have three units named Honest Broker in play, two of which are token Copies with Temporary.
472.1.c. Effects for this layer can be identiﬁed by the phrase "become(s)", "give," "is," or "are" in the text. Example: A permanent has the ability "Other friendly units are Yordles." Other friendly units gain the Yordle tag in this layer.
472.2.  2. Ability-Altering Effects
472.2.a. This layer deals with effects that grant, remove, or replace the abilities or rules text of Game Objects . Keywords Passive Abilities Appending rules text Removing rules text Duplicating Rules Text from one Game Object to another
472.2.b. Effects for this layer can be identiﬁed by the phrase "become(s)," "give," "lose(s)," "have," "has," "is," or "are" in the text. Example: A permanent has the ability "Other friendly units have [Vision]." Other friendly units gain the Vision keyword in this layer.


472.2.c. Abilities of Effect Text of Attached cards are appended in this layer.
472.3.  3. Arithmetic
472.3.a. This layer deals with the mathematics of increasing and decreasing the numeric values of the traits of Game Objects. Might Energy Cost Power Cost
472.3.b. When an arithmetic effect has a limitation that applies, it is limited at the time of its application, and is “remembered” at that limited level for the duration of its effect. This process is called “snapshotting.” Example: If an effect gives a unit “-4 [M] to a min of 1 this turn” choosing a unit with 2 [M], then the effect will generate -1 [M] this turn.
472.3.c. Might Bonuses of Attached cards are applied in this layer.
472.3.d. This layer applies arithmetic in the following way.
472.3.d.1. 1. Increases
472.3.d.1.a. Positive values, or increases, to Might are applied ﬁrst.
472.3.d.1.b. If there is a restriction or limitation to this increase, the limitation is “snapshotted” for the duration of the effect.
472.3.d.2. 2. Decreases
472.3.d.2.a. Negative values, or decreases, to Might are applied last.
472.3.d.2.b. If there is a restriction or limitation to this decrease, the limitation is snapshotted for the duration of the effect.
473.  If more than one effect applies to the same Game Object in the Same Layer , or to each other in the same layer, then both effects will apply but their order may be determined by Dependency.
473.1.  A Dependency is established if:
473.1.a. Applying one of the effects alters the existence of the other; or
473.1.b. Applying one of the effects alters the number of objects the other effect can inﬂuence
473.1.c. Applying one of the effects alters the outcome when applying the other.
474.  To determine which effect Depends on another, determine which of the prior criteria applies, and then also which effect’s evaluation is altered by the sequence of applications. That effect is said to Depend on the other.
474.1.  To resolve a dependency, the effects within the same layer that created the dependency must be applied such that: 1. Identify which effect Depends on the other within the Layer. 2. Apply the effect that is depended on ﬁrst. 3. Immediately apply the effect that Depends on the ﬁrst effect next.
475.  If more than one effect applies in the same layer but no dependency is established, then Timestamp order is applied to the effects within that layer and sublayer
475.1.  When an effect begins applying, it establishes a time for which it is compared against other Game Effects for purposes of resolving Layered effects as its Timestamp.
475.1.a. Timestamps are not rote values.


475.1.b. Timestamps are relative comparisons between effects and when they began applying to the game.
475.1.c. Timestamps are not referenced by Game Effects in any way. They are only used to ﬁnalize layered effects.
475.2.  When Rules Text becomes Inactive for any reason, it loses its Timestamp. When it ceases to be Inactive, a new Timestamp is established.
475.3.  Effects are applied such that the earliest Timestamp within each Layer and Sublayer applies ﬁrst, followed by other Effects in that Layer and Sublayer in chronological order.
