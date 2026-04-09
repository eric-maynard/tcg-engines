import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const wilyNewtfish: UnitCard = {
  cardNumber: 108,
  cardType: "unit",
  domain: "body",
  energyCost: 4,
  id: createCardId("unl-108-219"),
  might: 4,
  name: "Wily Newtfish",
  rarity: "uncommon",
  rulesText:
    "If you've gained XP this turn, I have +1 [Might] and [Ganking]. (I can move from battlefield to battlefield.)",
  setId: "UNL",
};
