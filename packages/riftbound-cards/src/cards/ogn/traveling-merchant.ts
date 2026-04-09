import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const travelingMerchant: UnitCard = {
  cardNumber: 185,
  cardType: "unit",
  domain: "chaos",
  energyCost: 2,
  id: createCardId("ogn-185-298"),
  might: 2,
  name: "Traveling Merchant",
  rarity: "uncommon",
  rulesText: "When I move, discard 1, then draw 1.",
  setId: "OGN",
};
