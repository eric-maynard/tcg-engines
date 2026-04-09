import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const redBrambleback: UnitCard = {
  cardNumber: 29,
  cardType: "unit",
  domain: "fury",
  energyCost: 4,
  id: createCardId("unl-029-219"),
  might: 4,
  name: "Red Brambleback",
  rarity: "epic",
  rulesText:
    "[Accelerate] (You may pay [1][fury] as an additional cost to have me enter ready.)\nYour conquer effects for conquering here trigger an additional time.\nWhen I conquer, [Buff] a friendly unit. (Give it a +1 [Might] buff if it doesn't have one.)",
  setId: "UNL",
};
