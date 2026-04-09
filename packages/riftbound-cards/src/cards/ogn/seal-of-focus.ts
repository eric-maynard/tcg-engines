import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const sealOfFocus: GearCard = {
  cardNumber: 81,
  cardType: "gear",
  domain: "calm",
  energyCost: 0,
  id: createCardId("ogn-081-298"),
  name: "Seal of Focus",
  rarity: "epic",
  rulesText:
    "[Exhaust]: [Reaction] — [Add] [calm]. (Abilities that add resources can't be reacted to.)",
  setId: "OGN",
};
