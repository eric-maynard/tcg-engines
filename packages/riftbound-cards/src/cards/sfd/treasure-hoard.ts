import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const treasureHoard: BattlefieldCard = {
  cardNumber: 220,
  cardType: "battlefield",
  id: createCardId("sfd-220-221"),
  name: "Treasure Hoard",
  rarity: "uncommon",
  rulesText: "When you conquer here, you may pay [1] to play a Gold gear token exhausted.",
  setId: "SFD",
};
