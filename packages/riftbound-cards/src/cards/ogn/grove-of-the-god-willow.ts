import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const groveOfTheGodWillow: BattlefieldCard = {
  cardNumber: 280,
  cardType: "battlefield",
  id: createCardId("ogn-280-298"),
  name: "Grove of the God-Willow",
  rarity: "uncommon",
  rulesText: "When you hold here, draw 1.",
  setId: "OGN",
};
