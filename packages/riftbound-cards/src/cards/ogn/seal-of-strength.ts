import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const sealOfStrength: GearCard = {
  cardNumber: 163,
  cardType: "gear",
  domain: "body",
  energyCost: 0,
  id: createCardId("ogn-163-298"),
  name: "Seal of Strength",
  rarity: "epic",
  rulesText:
    "[Exhaust]: [Reaction] — [Add] [body]. (Abilities that add resources can't be reacted to.)",
  setId: "OGN",
};
