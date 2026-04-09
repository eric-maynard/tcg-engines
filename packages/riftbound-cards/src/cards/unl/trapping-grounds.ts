import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const trappingGrounds: BattlefieldCard = {
  cardNumber: 217,
  cardType: "battlefield",
  id: createCardId("unl-217-219"),
  name: "Trapping Grounds",
  rarity: "uncommon",
  rulesText:
    "When you conquer here, if you assigned 3 or more excess damage, play a 1 [Might] Bird unit token with [Deflect].",
  setId: "UNL",
};
