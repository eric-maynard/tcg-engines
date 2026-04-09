import type { GearCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const symbolOfTheSolari: GearCard = {
  cardNumber: 227,
  cardType: "gear",
  domain: "order",
  energyCost: 1,
  id: createCardId("ogn-227-298"),
  name: "Symbol of the Solari",
  rarity: "uncommon",
  rulesText:
    "If a combat where you are the attacker ends in a tie, recall ALL units instead. (Send them to base. This isn't a move. Ties are calculated after combat damage is dealt.)",
  setId: "OGN",
};
