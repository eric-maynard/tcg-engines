import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const pitCrew: UnitCard = {
  cardNumber: 91,
  cardType: "unit",
  domain: "mind",
  energyCost: 3,
  id: createCardId("ogn-091-298"),
  might: 3,
  name: "Pit Crew",
  rarity: "common",
  rulesText: "When you play a gear, ready me.",
  setId: "OGN",
};
