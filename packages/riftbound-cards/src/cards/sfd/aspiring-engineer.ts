import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const aspiringEngineer: UnitCard = {
  cardNumber: 61,
  cardType: "unit",
  domain: "mind",
  energyCost: 3,
  id: createCardId("sfd-061-221"),
  might: 3,
  name: "Aspiring Engineer",
  rarity: "common",
  rulesText: "When you play me, return a gear from your trash to your hand.",
  setId: "SFD",
};
