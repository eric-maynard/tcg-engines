import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const emperorsDais: BattlefieldCard = {
  cardNumber: 207,
  cardType: "battlefield",
  id: createCardId("sfd-207-221"),
  name: "Emperor's Dais",
  rarity: "uncommon",
  rulesText:
    "When you conquer here, you may pay [1] and return a unit you control here to its owner's hand. If you do, play a 2 [Might] Sand Soldier unit token here.",
  setId: "SFD",
};
