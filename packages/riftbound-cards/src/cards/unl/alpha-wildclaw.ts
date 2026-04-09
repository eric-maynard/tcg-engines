import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const alphaWildclaw: UnitCard = {
  cardNumber: 57,
  cardType: "unit",
  domain: "calm",
  energyCost: 6,
  id: createCardId("unl-057-219"),
  might: 7,
  name: "Alpha Wildclaw",
  rarity: "epic",
  rulesText:
    "[Tank] (I must be assigned combat damage first.)\nYour units here with less Might than me can't be chosen by enemy spells and abilities.",
  setId: "UNL",
};
