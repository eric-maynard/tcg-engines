import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const petriciteMonument: GearCard = {
  cardNumber: 104,
  cardType: "gear",
  domain: "body",
  energyCost: 2,
  id: createCardId("sfd-104-221"),
  name: "Petricite Monument",
  rarity: "uncommon",
  rulesText:
    "[Temporary] (Kill this at the start of its controller's Beginning Phase, before scoring.)\nFriendly units have [Deflect]. (Opponents must pay [rainbow] to choose them with a spell or ability.)",
  setId: "SFD",
};
