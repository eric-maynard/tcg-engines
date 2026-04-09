import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const freshBeans: GearCard = {
  cardNumber: 11,
  cardType: "gear",
  domain: "fury",
  energyCost: 2,
  id: createCardId("unl-011-219"),
  name: "Fresh Beans",
  rarity: "uncommon",
  rulesText: "When you play a unit during a showdown, you may exhaust this to draw 1.",
  setId: "UNL",
};
