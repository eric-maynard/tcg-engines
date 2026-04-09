import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const loyalPup: UnitCard = {
  cardNumber: 126,
  cardType: "unit",
  domain: "chaos",
  energyCost: 3,
  id: createCardId("sfd-126-221"),
  might: 3,
  name: "Loyal Pup",
  rarity: "common",
  rulesText: "When you defend at a battlefield, you may move me there.",
  setId: "SFD",
};
