import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const reinforce: SpellCard = {
  cardNumber: 62,
  cardType: "spell",
  domain: "calm",
  energyCost: 5,
  id: createCardId("ogn-062-298"),
  name: "Reinforce",
  rarity: "uncommon",
  rulesText:
    "Look at the top 5 cards of your Main Deck. You may banish a unit from among them, then play it, reducing its cost by [5]. Recycle the remaining cards.",
  setId: "OGN",
  timing: "action",
};
