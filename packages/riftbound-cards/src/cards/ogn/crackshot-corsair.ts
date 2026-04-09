import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const crackshotCorsair: UnitCard = {
  cardNumber: 130,
  cardType: "unit",
  domain: "body",
  energyCost: 3,
  id: createCardId("ogn-130-298"),
  might: 3,
  name: "Crackshot Corsair",
  rarity: "common",
  rulesText: "When I attack, deal 1 to an enemy unit here.",
  setId: "OGN",
};
