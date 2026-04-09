import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const frigidJewel: GearCard = {
  cardNumber: 74,
  cardType: "gear",
  domain: "mind",
  energyCost: 2,
  id: createCardId("unl-074-219"),
  name: "Frigid Jewel",
  rarity: "uncommon",
  rulesText: "When you draw your second card each turn, give a friendly unit +2 [Might] this turn.",
  setId: "UNL",
};
