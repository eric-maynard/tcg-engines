import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const energyConduit: GearCard = {
  cardNumber: 98,
  cardType: "gear",
  domain: "mind",
  energyCost: 3,
  id: createCardId("ogn-098-298"),
  name: "Energy Conduit",
  rarity: "uncommon",
  rulesText:
    "[Exhaust]: [Reaction] — [Add] [1]. (Abilities that add resources can't be reacted to.)",
  setId: "OGN",
};
