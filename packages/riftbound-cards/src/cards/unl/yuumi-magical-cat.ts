import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const yuumiMagicalCat: UnitCard = {
  cardNumber: 56,
  cardType: "unit",
  domain: "calm",
  energyCost: 3,
  id: createCardId("unl-056-219"),
  isChampion: true,
  might: 1,
  name: "Yuumi, Magical Cat",
  rarity: "rare",
  rulesText:
    "When I attack or defend, give one of your other units here +3 [Might] and [Tank] this turn. (It must be assigned combat damage first.)",
  setId: "UNL",
  tags: ["Yuumi"],
};
