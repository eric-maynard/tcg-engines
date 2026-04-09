import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const preparedNeophyte: UnitCard = {
  cardNumber: 4,
  cardType: "unit",
  domain: "fury",
  energyCost: 3,
  id: createCardId("unl-004-219"),
  might: 1,
  name: "Prepared Neophyte",
  rarity: "common",
  rulesText: "If you've spent [4] or more to play a spell this turn, I have +4 [Might].",
  setId: "UNL",
};
