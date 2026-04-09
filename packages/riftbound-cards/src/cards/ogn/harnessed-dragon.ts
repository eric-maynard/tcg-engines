import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const harnessedDragon: UnitCard = {
  cardNumber: 234,
  cardType: "unit",
  domain: "order",
  energyCost: 8,
  id: createCardId("ogn-234-298"),
  might: 6,
  name: "Harnessed Dragon",
  rarity: "rare",
  rulesText: "When you play me, kill an enemy unit.",
  setId: "OGN",
};
