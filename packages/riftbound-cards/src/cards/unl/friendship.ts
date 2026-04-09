import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const friendship: SpellCard = {
  cardNumber: 46,
  cardType: "spell",
  domain: "calm",
  energyCost: 1,
  id: createCardId("unl-046-219"),
  name: "Friendship",
  rarity: "uncommon",
  rulesText:
    "[Reaction] (Play any time, even before spells and abilities resolve.)\nChoose a unit. Give it +1 [Might] this turn for each of the following tags among your units — Bird, Cat, Dog, and Poro.",
  setId: "UNL",
  timing: "reaction",
};
