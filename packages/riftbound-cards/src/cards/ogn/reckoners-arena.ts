import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const reckonersArena: BattlefieldCard = {
  cardNumber: 286,
  cardType: "battlefield",
  id: createCardId("ogn-286-298"),
  name: "Reckoner's Arena",
  rarity: "uncommon",
  rulesText: "When you hold here, activate the conquer effects of units here.",
  setId: "OGN",
};
