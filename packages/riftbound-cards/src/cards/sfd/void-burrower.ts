import type { LegendCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const voidBurrower: LegendCard = {
  cardNumber: 187,
  cardType: "legend",
  championTag: "Rek'Sai",
  domain: ["fury", "order"],
  id: createCardId("sfd-187-221"),
  name: "Void Burrower",
  rarity: "rare",
  rulesText:
    "When you conquer, you may exhaust me to reveal the top 2 cards of your Main Deck. You may banish one, then play it. Recycle the rest.",
  setId: "SFD",
};
