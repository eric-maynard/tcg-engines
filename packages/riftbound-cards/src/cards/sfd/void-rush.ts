import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const voidRush: SpellCard = {
  cardNumber: 188,
  cardType: "spell",
  domain: ["fury", "order"],
  energyCost: 2,
  id: createCardId("sfd-188-221"),
  name: "Void Rush",
  rarity: "epic",
  rulesText:
    "Reveal the top 2 cards of your Main Deck. You may banish one, then play it, reducing its cost by [2]. Draw any you didn't banish.",
  setId: "SFD",
  timing: "action",
};
