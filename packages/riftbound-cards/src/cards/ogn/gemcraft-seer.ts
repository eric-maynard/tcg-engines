import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const gemcraftSeer: UnitCard = {
  cardNumber: 100,
  cardType: "unit",
  domain: "mind",
  energyCost: 3,
  id: createCardId("ogn-100-298"),
  might: 3,
  name: "Gemcraft Seer",
  rarity: "uncommon",
  rulesText:
    "[Vision] (When you play me, look at the top card of your Main Deck. You may recycle it.)\nOther friendly units have [Vision].",
  setId: "OGN",
};
