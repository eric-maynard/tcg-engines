import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const cruelPatron: UnitCard = {
  cardNumber: 208,
  cardType: "unit",
  domain: "order",
  energyCost: 4,
  id: createCardId("ogn-208-298"),
  might: 6,
  name: "Cruel Patron",
  rarity: "common",
  rulesText: "As an additional cost to play me, kill a friendly unit.",
  setId: "OGN",
};
