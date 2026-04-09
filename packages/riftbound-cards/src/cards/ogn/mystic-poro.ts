import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const mysticPoro: UnitCard = {
  cardNumber: 171,
  cardType: "unit",
  domain: "chaos",
  energyCost: 2,
  id: createCardId("ogn-171-298"),
  might: 2,
  name: "Mystic Poro",
  rarity: "common",
  rulesText:
    "[Vision] (When you play me, look at the top card of your Main Deck. You may recycle it.)",
  setId: "OGN",
};
