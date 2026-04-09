import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const asheFocused: UnitCard = {
  cardNumber: 169,
  cardType: "unit",
  domain: "order",
  energyCost: 5,
  id: createCardId("unl-169-219"),
  isChampion: true,
  might: 4,
  name: "Ashe, Focused",
  rarity: "rare",
  rulesText:
    "When you play me, choose an opponent. They reveal their hand. Choose a card revealed this way and banish it. When they hold, return it to their hand (even if I'm no longer on the board).",
  setId: "UNL",
  tags: ["Ashe"],
};
