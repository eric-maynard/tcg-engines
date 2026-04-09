import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const altarOfMemories: GearCard = {
  cardNumber: 169,
  cardType: "gear",
  domain: "order",
  energyCost: 2,
  id: createCardId("sfd-169-221"),
  name: "Altar of Memories",
  rarity: "rare",
  rulesText:
    "When a friendly unit dies, you may exhaust me to draw 1, then put a card from your hand on the top or bottom of your Main Deck.",
  setId: "SFD",
};
