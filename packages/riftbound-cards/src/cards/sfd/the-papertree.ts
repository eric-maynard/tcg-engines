import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const thePapertree: BattlefieldCard = {
  cardNumber: 219,
  cardType: "battlefield",
  id: createCardId("sfd-219-221"),
  name: "The Papertree",
  rarity: "uncommon",
  rulesText: "When you hold here, each player channels 1 rune exhausted.",
  setId: "SFD",
};
