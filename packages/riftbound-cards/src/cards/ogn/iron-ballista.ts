import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const ironBallista: GearCard = {
  cardNumber: 17,
  cardType: "gear",
  domain: "fury",
  energyCost: 3,
  id: createCardId("ogn-017-298"),
  name: "Iron Ballista",
  rarity: "uncommon",
  rulesText: "This enters exhausted.\n[Exhaust]: Deal 2 to a unit at a battlefield.",
  setId: "OGN",
};
