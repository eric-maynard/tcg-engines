import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const promisingFuture: SpellCard = {
  cardNumber: 115,
  cardType: "spell",
  domain: "mind",
  energyCost: 5,
  id: createCardId("ogn-115-298"),
  name: "Promising Future",
  rarity: "rare",
  rulesText:
    "Each player looks at the top 5 cards of their Main Deck, banishes one of them, then recycles the rest. Starting with the next player, each player plays those cards, ignoring Energy costs. (They must still pay Power costs.)",
  setId: "OGN",
  timing: "action",
};
