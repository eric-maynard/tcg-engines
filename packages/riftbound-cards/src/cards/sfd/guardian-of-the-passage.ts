import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const guardianOfThePassage: UnitCard = {
  cardNumber: 35,
  cardType: "unit",
  domain: "calm",
  energyCost: 6,
  id: createCardId("sfd-035-221"),
  might: 6,
  name: "Guardian of the Passage",
  rarity: "common",
  rulesText: "When I hold, you may return a unit or gear from your trash to your hand.",
  setId: "SFD",
};
