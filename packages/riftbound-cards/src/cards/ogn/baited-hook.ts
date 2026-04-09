import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const baitedHook: GearCard = {
  cardNumber: 242,
  cardType: "gear",
  domain: "order",
  energyCost: 3,
  id: createCardId("ogn-242-298"),
  name: "Baited Hook",
  rarity: "epic",
  rulesText:
    "[1][order], [Exhaust]: Kill a friendly unit. Look at the top 5 cards of your Main Deck. You may banish a unit from among them that has Might up to 1 more than the killed unit and play it, ignoring its cost. Then recycle the rest.",
  setId: "OGN",
};
