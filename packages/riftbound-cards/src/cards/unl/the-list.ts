import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const theList: GearCard = {
  cardNumber: 138,
  cardType: "gear",
  domain: "chaos",
  energyCost: 1,
  id: createCardId("unl-138-219"),
  name: "The List",
  rarity: "uncommon",
  rulesText:
    "As you play this, name a tag. (For example, Miss Fortune, Demacia, and Poro are tags.)\n[Exhaust]: Give a unit with the named tag -2 [Might] this turn.",
  setId: "UNL",
};
