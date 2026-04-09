import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const dianaLunari: UnitCard = {
  cardNumber: 79,
  cardType: "unit",
  domain: "mind",
  energyCost: 3,
  id: createCardId("unl-079-219"),
  isChampion: true,
  might: 3,
  name: "Diana, Lunari",
  rarity: "rare",
  rulesText:
    "When a showdown begins here, you may pay [1]. If you do, [Predict], then reveal the top card of your Main Deck. If it's a spell, draw it. (To Predict, look at the top card of your Main Deck. You may recycle it.)",
  setId: "UNL",
  tags: ["Diana"],
};
