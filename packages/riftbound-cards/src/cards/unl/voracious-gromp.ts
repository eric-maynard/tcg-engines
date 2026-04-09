import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const voraciousGromp: UnitCard = {
  cardNumber: 100,
  cardType: "unit",
  domain: "body",
  energyCost: 5,
  id: createCardId("unl-100-219"),
  might: 5,
  name: "Voracious Gromp",
  rarity: "common",
  rulesText: "[Hunt 3] (When I conquer or hold, gain 3 XP.)",
  setId: "UNL",
};
