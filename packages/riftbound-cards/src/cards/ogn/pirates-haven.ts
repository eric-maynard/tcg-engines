import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const piratesHaven: GearCard = {
  cardNumber: 143,
  cardType: "gear",
  domain: "body",
  energyCost: 3,
  id: createCardId("ogn-143-298"),
  name: "Pirate's Haven",
  rarity: "uncommon",
  rulesText: "When you ready a friendly unit, give it +1 [Might] this turn.",
  setId: "OGN",
};
