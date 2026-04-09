import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const altarToUnity: BattlefieldCard = {
  cardNumber: 275,
  cardType: "battlefield",
  id: createCardId("ogn-275-298"),
  name: "Altar to Unity",
  rarity: "uncommon",
  rulesText: "When you hold here, play a 1 [Might] Recruit unit token in your base.",
  setId: "OGN",
};
