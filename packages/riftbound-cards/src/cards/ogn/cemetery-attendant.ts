import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const cemeteryAttendant: UnitCard = {
  cardNumber: 165,
  cardType: "unit",
  domain: "chaos",
  energyCost: 3,
  id: createCardId("ogn-165-298"),
  might: 3,
  name: "Cemetery Attendant",
  rarity: "common",
  rulesText: "When you play me, return a unit from your trash to your hand.",
  setId: "OGN",
};
