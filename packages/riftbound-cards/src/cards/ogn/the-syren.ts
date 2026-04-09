import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const theSyren: GearCard = {
  cardNumber: 184,
  cardType: "gear",
  domain: "chaos",
  energyCost: 2,
  id: createCardId("ogn-184-298"),
  name: "The Syren",
  rarity: "uncommon",
  rulesText: "[1], [Exhaust]: Move a friendly unit at a battlefield to its base.",
  setId: "OGN",
};
