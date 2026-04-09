import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const baronNashor: UnitCard = {
  cardNumber: 147,
  cardType: "unit",
  domain: "chaos",
  energyCost: 10,
  id: createCardId("unl-147-219"),
  might: 12,
  name: "Baron Nashor",
  rarity: "epic",
  rulesText:
    "As you play me, add the Baron Pit battlefield token to the board if it's not there already. If you do, I enter there. (It has &quot;Units can move here from anywhere.&quot;)\nI can't be chosen by enemy spells and abilities.\nOther friendly units have +2 [Might].",
  setId: "UNL",
};
