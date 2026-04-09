import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const theAcademy: BattlefieldCard = {
  cardNumber: 216,
  cardType: "battlefield",
  id: createCardId("unl-216-219"),
  name: "The Academy",
  rarity: "uncommon",
  rulesText:
    "When you hold here, give your next spell this turn [Repeat] equal to its base cost. (You may pay the additional cost to repeat the spell's effect.)",
  setId: "UNL",
};
