import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const bandleTree: BattlefieldCard = {
  cardNumber: 278,
  cardType: "battlefield",
  id: createCardId("ogn-278-298"),
  name: "Bandle Tree",
  rarity: "uncommon",
  rulesText: "You may hide an additional card here.",
  setId: "OGN",
};
