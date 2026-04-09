import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const heraldOfScales: UnitCard = {
  cardNumber: 140,
  cardType: "unit",
  domain: "body",
  energyCost: 4,
  id: createCardId("ogn-140-298"),
  might: 3,
  name: "Herald of Scales",
  rarity: "uncommon",
  rulesText: "Your Dragons' Energy costs are reduced by [2], to a minimum of [1].",
  setId: "OGN",
};
