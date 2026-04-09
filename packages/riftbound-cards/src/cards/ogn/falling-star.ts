import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const fallingStar: SpellCard = {
  cardNumber: 29,
  cardType: "spell",
  domain: "fury",
  energyCost: 2,
  id: createCardId("ogn-029-298"),
  name: "Falling Star",
  rarity: "rare",
  rulesText: "Deal 3 to a unit.\nDeal 3 to a unit.",
  setId: "OGN",
  timing: "action",
};
