import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const stellacornHerder: UnitCard = {
  cardNumber: 48,
  cardType: "unit",
  domain: "calm",
  energyCost: 4,
  id: createCardId("sfd-048-221"),
  might: 3,
  name: "Stellacorn Herder",
  rarity: "uncommon",
  rulesText: "When I move, draw 1.",
  setId: "SFD",
};
