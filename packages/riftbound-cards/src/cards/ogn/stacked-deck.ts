import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const stackedDeck: SpellCard = {
  cardNumber: 183,
  cardType: "spell",
  domain: "chaos",
  energyCost: 1,
  id: createCardId("ogn-183-298"),
  name: "Stacked Deck",
  rarity: "uncommon",
  rulesText:
    "[Action] (Play on your turn or in showdowns.)\nLook at the top 3 cards of your Main Deck. Put 1 into your hand and recycle the rest.",
  setId: "OGN",
  timing: "action",
};
