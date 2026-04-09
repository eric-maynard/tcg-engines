import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const dazzlingAurora: GearCard = {
  cardNumber: 160,
  cardType: "gear",
  domain: "body",
  energyCost: 9,
  id: createCardId("ogn-160-298"),
  name: "Dazzling Aurora",
  rarity: "epic",
  rulesText:
    "At the end of your turn, reveal cards from the top of your Main Deck until you reveal a unit and banish it. Play it, ignoring its cost, and recycle the rest.",
  setId: "OGN",
};
