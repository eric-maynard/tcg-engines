import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const sealOfRage: GearCard = {
  cardNumber: 40,
  cardType: "gear",
  domain: "fury",
  energyCost: 0,
  id: createCardId("ogn-040-298"),
  name: "Seal of Rage",
  rarity: "epic",
  rulesText:
    "[Exhaust]: [Reaction] — [Add] [fury]. (Abilities that add resources can't be reacted to.)",
  setId: "OGN",
};
