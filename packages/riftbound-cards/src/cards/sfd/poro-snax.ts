import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const poroSnax: GearCard = {
  cardNumber: 46,
  cardType: "gear",
  domain: "calm",
  energyCost: 1,
  id: createCardId("sfd-046-221"),
  name: "Poro Snax",
  rarity: "uncommon",
  rulesText: "When you play this, draw 1.\n[1][calm], [Exhaust], Kill this: Draw 1.",
  setId: "SFD",
};
