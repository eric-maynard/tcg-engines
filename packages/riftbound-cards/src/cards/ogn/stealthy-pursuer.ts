import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const stealthyPursuer: UnitCard = {
  cardNumber: 177,
  cardType: "unit",
  domain: "chaos",
  energyCost: 4,
  id: createCardId("ogn-177-298"),
  might: 4,
  name: "Stealthy Pursuer",
  rarity: "common",
  rulesText: "When a friendly unit moves from my location, I may be moved with it.",
  setId: "OGN",
};
