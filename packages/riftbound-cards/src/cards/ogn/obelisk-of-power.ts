import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const obeliskOfPower: BattlefieldCard = {
  cardNumber: 284,
  cardType: "battlefield",
  id: createCardId("ogn-284-298"),
  name: "Obelisk of Power",
  rarity: "uncommon",
  rulesText: "At the start of each player's first Beginning Phase, that player channels 1 rune.",
  setId: "OGN",
};
