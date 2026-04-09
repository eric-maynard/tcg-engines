import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const zauniteBouncer: UnitCard = {
  cardNumber: 188,
  cardType: "unit",
  domain: "chaos",
  energyCost: 4,
  id: createCardId("ogn-188-298"),
  might: 2,
  name: "Zaunite Bouncer",
  rarity: "uncommon",
  rulesText: "When you play me, return another unit at a battlefield to its owner's hand.",
  setId: "OGN",
};
