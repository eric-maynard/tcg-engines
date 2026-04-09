import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const rhasaTheSunderer: UnitCard = {
  cardNumber: 195,
  cardType: "unit",
  domain: "chaos",
  energyCost: 10,
  id: createCardId("ogn-195-298"),
  might: 6,
  name: "Rhasa the Sunderer",
  rarity: "rare",
  rulesText: "I cost [1] less for each card in your trash.",
  setId: "OGN",
};
