import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const peakGuardian: UnitCard = {
  cardNumber: 223,
  cardType: "unit",
  domain: "order",
  energyCost: 6,
  id: createCardId("ogn-223-298"),
  might: 5,
  name: "Peak Guardian",
  rarity: "uncommon",
  rulesText:
    "When you play me, buff me. Then, if I am at a battlefield, buff all other friendly units there. (To buff a unit, give it a +1 [Might] buff if it doesn't already have one.)",
  setId: "OGN",
};
