import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const eminentBenefactor: UnitCard = {
  cardNumber: 152,
  cardType: "unit",
  domain: "order",
  energyCost: 6,
  id: createCardId("sfd-152-221"),
  might: 5,
  name: "Eminent Benefactor",
  rarity: "common",
  rulesText: "When I hold, play two Gold gear tokens exhausted.",
  setId: "SFD",
};
