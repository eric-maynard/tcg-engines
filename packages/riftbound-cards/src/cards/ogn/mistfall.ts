import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const mistfall: GearCard = {
  cardNumber: 152,
  cardType: "gear",
  domain: "body",
  energyCost: 3,
  id: createCardId("ogn-152-298"),
  name: "Mistfall",
  rarity: "rare",
  rulesText: "When you buff a friendly unit, you may pay [body] and exhaust this to ready it.",
  setId: "OGN",
};
