import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const ornnBlacksmith: UnitCard = {
  cardNumber: 58,
  cardType: "unit",
  domain: "calm",
  energyCost: 5,
  id: createCardId("sfd-058-221"),
  isChampion: true,
  might: 5,
  name: "Ornn, Blacksmith",
  rarity: "epic",
  rulesText:
    "When you play me or when I hold, look at the top 4 cards of your Main Deck. You may reveal a gear from among them and draw it. Then recycle the rest.",
  setId: "SFD",
  tags: ["Ornn"],
};
