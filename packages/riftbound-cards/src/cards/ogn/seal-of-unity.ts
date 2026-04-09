import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const sealOfUnity: GearCard = {
  cardNumber: 245,
  cardType: "gear",
  domain: "order",
  energyCost: 0,
  id: createCardId("ogn-245-298"),
  name: "Seal of Unity",
  rarity: "epic",
  rulesText:
    "[Exhaust]: [Reaction] — [Add] [order]. (Abilities that add resources can't be reacted to.)",
  setId: "OGN",
};
