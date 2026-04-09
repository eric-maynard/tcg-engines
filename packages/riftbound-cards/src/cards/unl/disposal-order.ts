import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const disposalOrder: SpellCard = {
  cardNumber: 103,
  cardType: "spell",
  domain: "body",
  energyCost: 2,
  id: createCardId("unl-103-219"),
  name: "Disposal Order",
  rarity: "uncommon",
  rulesText:
    "[Reaction] (Play any time, even before spells and abilities resolve.)\nChoose one —Choose up to 3 cards from opponents' trashes. Their owners recycle them.Draw 1.",
  setId: "UNL",
  timing: "reaction",
};
