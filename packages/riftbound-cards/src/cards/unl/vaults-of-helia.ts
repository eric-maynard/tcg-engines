import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const vaultsOfHelia: BattlefieldCard = {
  cardNumber: 219,
  cardType: "battlefield",
  id: createCardId("unl-219-219"),
  name: "Vaults of Helia",
  rarity: "uncommon",
  rulesText: "When you hold here, your non-token units cost [1] more to play this turn.",
  setId: "UNL",
};
