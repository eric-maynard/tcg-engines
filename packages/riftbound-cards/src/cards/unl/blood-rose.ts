import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const bloodRose: GearCard = {
  cardNumber: 109,
  cardType: "gear",
  domain: "body",
  energyCost: 1,
  id: createCardId("unl-109-219"),
  name: "Blood Rose",
  rarity: "rare",
  rulesText:
    "When you play a unit, you may pay [1] to gain 1 XP.\nSpend 3 XP, [Exhaust]: Ready a unit.",
  setId: "UNL",
};
