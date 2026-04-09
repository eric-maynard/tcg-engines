import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const reflection: UnitCard = {
  cardNumber: 6,
  cardType: "unit",
  id: createCardId("unl-t06"),
  might: 0,
  name: "Reflection",
  rarity: "common",
  rulesText: "(I become a copy of something when played. I don't get that card's play effects.)",
  setId: "UNL",
};
