import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const spiritsRefuge: GearCard = {
  cardNumber: 63,
  cardType: "gear",
  domain: "calm",
  energyCost: 2,
  id: createCardId("ogn-063-298"),
  name: "Spirit's Refuge",
  rarity: "uncommon",
  rulesText:
    "When you play this, buff a friendly unit. (If it doesn't have a buff, it gets a +1 [Might] buff.)\nFriendly buffed units have [Deflect] if they didn't already. (Opponents must pay [rainbow] to choose those units with a spell or ability.)",
  setId: "OGN",
};
