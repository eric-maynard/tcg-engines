import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const ruinedRex: UnitCard = {
  cardNumber: 67,
  cardType: "unit",
  domain: "mind",
  energyCost: 6,
  id: createCardId("unl-067-219"),
  might: 6,
  name: "Ruined Rex",
  rarity: "common",
  rulesText: "[Deathknell][&gt;] Deal 4 to an enemy unit. (When I die, get the effect.)",
  setId: "UNL",
};
