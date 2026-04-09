import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const kadregrinTheInfernal: UnitCard = {
  cardNumber: 38,
  cardType: "unit",
  domain: "fury",
  energyCost: 9,
  id: createCardId("ogn-038-298"),
  might: 9,
  name: "Kadregrin the Infernal",
  rarity: "epic",
  rulesText:
    "When you play me, draw 1 for each of your [Mighty] units. (A unit is Mighty while it has 5+ [Might].)",
  setId: "OGN",
};
