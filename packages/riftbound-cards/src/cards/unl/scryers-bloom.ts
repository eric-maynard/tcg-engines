import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const scryersBloom: GearCard = {
  cardNumber: 136,
  cardType: "gear",
  domain: "chaos",
  energyCost: 1,
  id: createCardId("unl-136-219"),
  name: "Scryer's Bloom",
  rarity: "uncommon",
  rulesText:
    "This enters exhausted.\nKill this, [1], [Exhaust]: [Predict 2], then draw 1. Gain 1 XP.  (To Predict 2, look at the top two cards of your Main Deck. Recycle any of them and put the rest back in any order.)",
  setId: "UNL",
};
