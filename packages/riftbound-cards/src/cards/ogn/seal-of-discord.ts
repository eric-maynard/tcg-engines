import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const sealOfDiscord: GearCard = {
  cardNumber: 204,
  cardType: "gear",
  domain: "chaos",
  energyCost: 0,
  id: createCardId("ogn-204-298"),
  name: "Seal of Discord",
  rarity: "epic",
  rulesText:
    "[Exhaust]: [Reaction] — [Add] [chaos]. (Abilities that add resources can't be reacted to.)",
  setId: "OGN",
};
