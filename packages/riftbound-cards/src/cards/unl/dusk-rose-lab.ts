import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const duskRoseLab: BattlefieldCard = {
  cardNumber: 209,
  cardType: "battlefield",
  id: createCardId("unl-209-219"),
  name: "Dusk Rose Lab",
  rarity: "uncommon",
  rulesText:
    "At the start of your Beginning Phase, you may kill a unit you control here to draw 1. (This happens before scoring.)",
  setId: "UNL",
};
