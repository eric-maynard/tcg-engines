import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const maskOfForesight: GearCard = {
  cardNumber: 60,
  cardType: "gear",
  domain: "calm",
  energyCost: 2,
  id: createCardId("ogn-060-298"),
  name: "Mask of Foresight",
  rarity: "uncommon",
  rulesText: "When a friendly unit attacks or defends alone, give it +1 [Might] this turn.",
  setId: "OGN",
};
