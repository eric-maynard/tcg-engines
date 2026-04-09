import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const packOfWonders: GearCard = {
  cardNumber: 181,
  cardType: "gear",
  domain: "chaos",
  energyCost: 2,
  id: createCardId("ogn-181-298"),
  name: "Pack of Wonders",
  rarity: "uncommon",
  rulesText: "[Exhaust]: Return another friendly gear, unit, or facedown card to its owner's hand.",
  setId: "OGN",
};
