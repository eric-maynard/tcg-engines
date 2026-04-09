import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const firstMate: UnitCard = {
  cardNumber: 132,
  cardType: "unit",
  domain: "body",
  energyCost: 3,
  id: createCardId("ogn-132-298"),
  might: 3,
  name: "First Mate",
  rarity: "common",
  rulesText: "When you play me, ready another unit.",
  setId: "OGN",
};
