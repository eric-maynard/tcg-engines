import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const seatOfPower: BattlefieldCard = {
  cardNumber: 217,
  cardType: "battlefield",
  id: createCardId("sfd-217-221"),
  name: "Seat of Power",
  rarity: "uncommon",
  rulesText: "When you conquer here, draw 1 for each other battlefield you or allies control.",
  setId: "SFD",
};
