import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const carnivorousSnapvine: UnitCard = {
  cardNumber: 149,
  cardType: "unit",
  domain: "body",
  energyCost: 5,
  id: createCardId("ogn-149-298"),
  might: 6,
  name: "Carnivorous Snapvine",
  rarity: "rare",
  rulesText:
    "When you play me, choose an enemy unit at a battlefield. We deal damage equal to our Mights to each other.",
  setId: "OGN",
};
