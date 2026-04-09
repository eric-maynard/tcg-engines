import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const theCandlelitSanctum: BattlefieldCard = {
  cardNumber: 291,
  cardType: "battlefield",
  id: createCardId("ogn-291-298"),
  name: "The Candlelit Sanctum",
  rarity: "uncommon",
  rulesText:
    "When you conquer here, look at the top two cards of your Main Deck. You may recycle one or both of them. Put those you don't back in any order.",
  setId: "OGN",
};
