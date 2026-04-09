import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const sealOfInsight: GearCard = {
  cardNumber: 120,
  cardType: "gear",
  domain: "mind",
  energyCost: 0,
  id: createCardId("ogn-120-298"),
  name: "Seal of Insight",
  rarity: "epic",
  rulesText:
    "[Exhaust]: [Reaction] — [Add] [mind]. (Abilities that add resources can't be reacted to.)",
  setId: "OGN",
};
