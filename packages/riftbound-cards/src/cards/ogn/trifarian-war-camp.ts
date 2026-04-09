import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const trifarianWarCamp: BattlefieldCard = {
  cardNumber: 294,
  cardType: "battlefield",
  id: createCardId("ogn-294-298"),
  name: "Trifarian War Camp",
  rarity: "uncommon",
  rulesText: "Units here have +1 [Might]. (This includes attackers.)",
  setId: "OGN",
};
