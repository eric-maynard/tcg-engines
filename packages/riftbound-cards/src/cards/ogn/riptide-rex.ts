import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const riptideRex: UnitCard = {
  cardNumber: 92,
  cardType: "unit",
  domain: "mind",
  energyCost: 6,
  id: createCardId("ogn-092-298"),
  might: 6,
  name: "Riptide Rex",
  rarity: "common",
  rulesText: "When you play me, deal 6 to an enemy unit at a battlefield.",
  setId: "OGN",
};
