import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const minefield: BattlefieldCard = {
  cardNumber: 212,
  cardType: "battlefield",
  id: createCardId("sfd-212-221"),
  name: "Minefield",
  rarity: "uncommon",
  rulesText: "When you conquer here, put the top 2 cards of your Main Deck into your trash.",
  setId: "SFD",
};
