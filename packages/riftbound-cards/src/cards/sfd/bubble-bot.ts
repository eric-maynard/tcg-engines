import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const bubbleBot: UnitCard = {
  cardNumber: 62,
  cardType: "unit",
  domain: "mind",
  energyCost: 3,
  id: createCardId("sfd-062-221"),
  might: 3,
  name: "Bubble Bot",
  rarity: "common",
  rulesText: "When you play me, ready another friendly Mech.",
  setId: "SFD",
};
