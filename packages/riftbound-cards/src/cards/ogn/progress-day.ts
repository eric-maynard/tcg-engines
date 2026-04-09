import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const progressDay: SpellCard = {
  cardNumber: 114,
  cardType: "spell",
  domain: "mind",
  energyCost: 6,
  id: createCardId("ogn-114-298"),
  name: "Progress Day",
  rarity: "rare",
  rulesText: "Draw 4.",
  setId: "OGN",
  timing: "action",
};
