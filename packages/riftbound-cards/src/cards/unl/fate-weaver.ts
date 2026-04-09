import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const fateWeaver: UnitCard = {
  cardNumber: 64,
  cardType: "unit",
  domain: "mind",
  energyCost: 5,
  id: createCardId("unl-064-219"),
  might: 4,
  name: "Fate Weaver",
  rarity: "common",
  rulesText:
    "When you play me, look at the top 4 cards of your Main Deck. You may reveal a spell with Energy cost [4] or more from among them and draw it. Recycle the rest.",
  setId: "UNL",
};
