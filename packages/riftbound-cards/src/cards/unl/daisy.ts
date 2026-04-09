import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const daisy: UnitCard = {
  cardNumber: 196,
  cardType: "unit",
  domain: ["calm", "order"],
  energyCost: 9,
  id: createCardId("unl-196-219"),
  might: 8,
  name: "Daisy!",
  rarity: "epic",
  rulesText:
    "I enter ready.\nReduce my cost by [1] for each of the following tags among your units — Bird, Cat, Dog, and Poro.\nWhen I attack while your units have all 4 tags, [Stun] an enemy unit here. (It doesn't deal combat damage this turn.)",
  setId: "UNL",
};
