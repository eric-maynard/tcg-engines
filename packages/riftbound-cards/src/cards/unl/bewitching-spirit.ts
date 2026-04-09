import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const bewitchingSpirit: UnitCard = {
  cardNumber: 121,
  cardType: "unit",
  domain: "chaos",
  energyCost: 3,
  id: createCardId("unl-121-219"),
  might: 2,
  name: "Bewitching Spirit",
  rarity: "common",
  rulesText: "When you play me, choose a player. They discard 1.",
  setId: "UNL",
};
