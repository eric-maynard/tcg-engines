import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const maddenedMarauder: UnitCard = {
  cardNumber: 191,
  cardType: "unit",
  domain: "chaos",
  energyCost: 5,
  id: createCardId("ogn-191-298"),
  might: 4,
  name: "Maddened Marauder",
  rarity: "rare",
  rulesText:
    "[Tank] (I must be assigned combat damage first.)\nWhen you play me, move a unit from a battlefield to its base.",
  setId: "OGN",
};
