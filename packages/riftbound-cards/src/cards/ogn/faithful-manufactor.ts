import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const faithfulManufactor: UnitCard = {
  cardNumber: 211,
  cardType: "unit",
  domain: "order",
  energyCost: 3,
  id: createCardId("ogn-211-298"),
  might: 2,
  name: "Faithful Manufactor",
  rarity: "common",
  rulesText: "When you play me, play a 1 [Might] Recruit unit token here.",
  setId: "OGN",
};
