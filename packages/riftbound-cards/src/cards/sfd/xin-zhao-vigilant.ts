import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const xinZhaoVigilant: UnitCard = {
  cardNumber: 176,
  cardType: "unit",
  domain: "order",
  energyCost: 3,
  id: createCardId("sfd-176-221"),
  isChampion: true,
  might: 4,
  name: "Xin Zhao, Vigilant",
  rarity: "rare",
  rulesText:
    "[Tank] (I must be assigned combat damage first.)\nI enter ready if you have two or more other units in your base.",
  setId: "SFD",
  tags: ["Xin Zhao"],
};
