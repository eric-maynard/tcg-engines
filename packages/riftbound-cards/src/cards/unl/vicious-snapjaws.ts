import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const viciousSnapjaws: UnitCard = {
  cardNumber: 129,
  cardType: "unit",
  domain: "chaos",
  energyCost: 5,
  id: createCardId("unl-129-219"),
  might: 5,
  name: "Vicious Snapjaws",
  rarity: "common",
  rulesText: "When another friendly unit dies, gain 1 XP.",
  setId: "UNL",
};
