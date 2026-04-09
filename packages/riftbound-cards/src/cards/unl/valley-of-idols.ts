import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const valleyOfIdols: BattlefieldCard = {
  cardNumber: 218,
  cardType: "battlefield",
  id: createCardId("unl-218-219"),
  name: "Valley of Idols",
  rarity: "uncommon",
  rulesText:
    "When a player plays a unit here, they may pay [1] to [Buff] it. (Give it a +1 [Might] buff if it doesn't have one.)",
  setId: "UNL",
};
