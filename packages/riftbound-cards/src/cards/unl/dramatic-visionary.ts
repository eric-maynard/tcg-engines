import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const dramaticVisionary: UnitCard = {
  cardNumber: 62,
  cardType: "unit",
  domain: "mind",
  energyCost: 4,
  id: createCardId("unl-062-219"),
  might: 4,
  name: "Dramatic Visionary",
  rarity: "common",
  rulesText:
    "[Deathknell][&gt;] [Predict 2]. (When I die, look at the top two cards of your Main Deck. Recycle any of them and put the rest back in any order.)",
  setId: "UNL",
};
