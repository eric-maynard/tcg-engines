import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const blackFlameAltar: BattlefieldCard = {
  cardNumber: 208,
  cardType: "battlefield",
  id: createCardId("unl-208-219"),
  name: "Black Flame Altar",
  rarity: "uncommon",
  rulesText: "Units here with [Temporary] have [Shield]. (+1 [Might] while they're defenders.)",
  setId: "UNL",
};
