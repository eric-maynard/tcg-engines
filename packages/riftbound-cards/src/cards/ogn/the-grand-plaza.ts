import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const theGrandPlaza: BattlefieldCard = {
  cardNumber: 293,
  cardType: "battlefield",
  id: createCardId("ogn-293-298"),
  name: "The Grand Plaza",
  rarity: "uncommon",
  rulesText: "When you hold here, if you have 7+ units here, you win the game.",
  setId: "OGN",
};
