import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const revnaTheLorekeeper: UnitCard = {
  cardNumber: 5,
  cardType: "unit",
  domain: "fury",
  energyCost: 7,
  id: createCardId("unl-005-219"),
  might: 7,
  name: "Revna the Lorekeeper",
  rarity: "common",
  rulesText:
    "[Ganking] (I can move from battlefield to battlefield.)\nWhen you play a spell, if you spent [4] or more, ready me.",
  setId: "UNL",
};
