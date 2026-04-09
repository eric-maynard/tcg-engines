import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const hallOfLegends: BattlefieldCard = {
  cardNumber: 210,
  cardType: "battlefield",
  id: createCardId("sfd-210-221"),
  name: "Hall of Legends",
  rarity: "uncommon",
  rulesText: "When you conquer here, you may pay [1] to ready your legend.",
  setId: "SFD",
};
