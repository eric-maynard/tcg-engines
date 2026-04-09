import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const aspirantsClimb: BattlefieldCard = {
  cardNumber: 276,
  cardType: "battlefield",
  id: createCardId("ogn-276-298"),
  name: "Aspirant's Climb",
  rarity: "uncommon",
  rulesText: "Increase the points needed to win the game by 1.",
  setId: "OGN",
};
