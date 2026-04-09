import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const noxianDrummer: UnitCard = {
  cardNumber: 222,
  cardType: "unit",
  domain: "order",
  energyCost: 3,
  id: createCardId("ogn-222-298"),
  might: 3,
  name: "Noxian Drummer",
  rarity: "uncommon",
  rulesText:
    "When I move to a battlefield, play a 1 [Might] Recruit unit token here. (It is also at the battlefield.)",
  setId: "OGN",
};
