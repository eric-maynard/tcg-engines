import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const cullTheWeak: SpellCard = {
  cardNumber: 209,
  cardType: "spell",
  domain: "order",
  energyCost: 2,
  id: createCardId("ogn-209-298"),
  name: "Cull the Weak",
  rarity: "common",
  rulesText: "Each player kills one of their units.",
  setId: "OGN",
  timing: "action",
};
