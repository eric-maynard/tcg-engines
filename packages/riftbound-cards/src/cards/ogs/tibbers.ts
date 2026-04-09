import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const tibbers: UnitCard = {
  cardNumber: 18,
  cardType: "unit",
  domain: ["fury", "chaos"],
  energyCost: 8,
  id: createCardId("ogs-018-024"),
  might: 7,
  name: "Tibbers",
  rarity: "epic",
  rulesText: "When you play me, deal 3 to all units at battlefields.",
  setId: "OGS",
};
