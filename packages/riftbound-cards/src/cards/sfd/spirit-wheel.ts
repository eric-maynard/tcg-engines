import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const spiritWheel: GearCard = {
  cardNumber: 144,
  cardType: "gear",
  domain: "chaos",
  energyCost: 2,
  id: createCardId("sfd-144-221"),
  name: "Spirit Wheel",
  rarity: "rare",
  rulesText: "When you choose a friendly unit, you may pay [1] and exhaust this to draw 1.",
  setId: "SFD",
};
