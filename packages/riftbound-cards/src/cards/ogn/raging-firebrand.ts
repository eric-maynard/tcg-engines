import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const ragingFirebrand: UnitCard = {
  cardNumber: 31,
  cardType: "unit",
  domain: "fury",
  energyCost: 6,
  id: createCardId("ogn-031-298"),
  might: 4,
  name: "Raging Firebrand",
  rarity: "rare",
  rulesText: "When you play me, the next spell you play this turn costs [5] less.",
  setId: "OGN",
};
