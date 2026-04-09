634.  Layers
635.  Layers are the mechanism in which  Game Effects  alter the Traits, Intrinsic Abilities, or other
properties of  Game Objects.
636.  Layers are an organizational structure.
636.1.  Layers do not have intrinsic rules or influence over the game.
636.2.  Layers only serve to structure the application and order that  Game Effects  apply to  Game
Objects  to maintain consistency.
637.  The layers are:
637.1.  Trait-Altering Effects
637.1.a.  This layer deals with effects that grant, remove, or replace inherent traits of  Game
Objects.
Name
Super Type
Type
Tags
Controller
Cost
Domain
637.1.a.1.  Assignment of Might is dealt with in this layer.
Example: A spell reads "A unit's Might becomes 4 this turn." The
unit's Might is set to 4 in this layer.
637.1.b.  One  Game Object  becoming a copy of another.
637.1.b.1.  All Traits, including the Rules Text, replace or are added to those of the
original  Game Object  as specified by the  Game Effect  directing the Copy.
This is applied in this layer.
637.1.c.  Effects for this layer can be identified by the phrase "become(s)", "give," "is," or "are"
in the text.
Example: A permanent has the ability "Other friendly units are Yordles."
Other friendly units gain the Yordle tag in this layer.
637.2.  Ability-Altering Effects
637.2.a.  This layer deals with effects that grant, remove, or replace the abilities or rules text
of  Game Objects .
Keywords
Passive Abilities
Appending rules text
Removing rules text
Duplicating Rules Text from one  Game Object  to another
637.2.b.  Effects for this layer can be identified by the phrase "become(s)," "give," "lose(s),"
"have," "has," "is," or "are" in the text.
Example: A permanent has the ability "Other friendly units have [Vision]."
Other friendly units gain the  Vision  keyword in this layer.
637.3.  Arithmetic
637.3.a.  This layer deals with the mathematics of increasing and decreasing the numeric
values of the traits of  Game Objects.
Might
Energy Cost
Power Cost
637.3.b.  All applications are applied arithmetically.
638.  If more than one effect applies to the same  Game Object  in the same  Layer , or to each other in the
same layer, then both effects will apply but their order will be determined by  Dependency.
638.1.  A  Dependency  is established if:
638.1.a.  Applying one of the effects alters the existence of the other; or
638.1.b.  Applying one of the effects alters the number of objects the other effect can
influence; or
638.1.c.  Applying one of the effects alters the outcome when applying the other
639.  If more than one effect applies in the same layer but no dependency is established, then  Timestamp
order is applied to the effects
639.1.  The first effect to have been played is applied first, and the newest effect is applied last.
