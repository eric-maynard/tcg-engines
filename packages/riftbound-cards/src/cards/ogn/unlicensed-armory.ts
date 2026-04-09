import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const unlicensedArmory: GearCard = {
  cardNumber: 23,
  cardType: "gear",
  domain: "fury",
  energyCost: 2,
  id: createCardId("ogn-023-298"),
  name: "Unlicensed Armory",
  rarity: "uncommon",
  rulesText:
    "Discard 1, [Exhaust]: Choose a friendly unit. The next time it would die this turn, you may pay [fury] to heal it, exhaust it, and recall it instead. (Send it to base. This isn't a move.)",
  setId: "OGN",
};
