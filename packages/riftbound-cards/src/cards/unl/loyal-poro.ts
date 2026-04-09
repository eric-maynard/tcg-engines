import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const loyalPoro: UnitCard = {
  cardNumber: 156,
  cardType: "unit",
  domain: "order",
  energyCost: 3,
  id: createCardId("unl-156-219"),
  might: 3,
  name: "Loyal Poro",
  rarity: "common",
  rulesText:
    "[Deathknell][&gt;] If I didn't die alone, draw 1. (When I die, get the effect. I wasn't alone if there were other friendly units here.)",
  setId: "UNL",
};
