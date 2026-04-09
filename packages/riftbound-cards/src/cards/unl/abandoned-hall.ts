import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const abandonedHall: BattlefieldCard = {
  cardNumber: 205,
  cardType: "battlefield",
  id: createCardId("unl-205-219"),
  name: "Abandoned Hall",
  rarity: "uncommon",
  rulesText:
    "When a player plays a spell, they may give a unit they control here +1 [Might] this turn.",
  setId: "UNL",
};
