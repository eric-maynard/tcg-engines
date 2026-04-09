import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const megaMech: UnitCard = {
  cardNumber: 88,
  cardType: "unit",
  domain: "mind",
  energyCost: 7,
  id: createCardId("ogn-088-298"),
  might: 8,
  name: "Mega-Mech",
  rarity: "common",
  setId: "OGN",
};
