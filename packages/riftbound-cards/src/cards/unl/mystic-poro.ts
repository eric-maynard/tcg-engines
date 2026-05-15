import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const mysticPoro: UnitCard = {
  cardNumber: 224,
  cardType: "unit",
  domain: "chaos",
  energyCost: 2,
  id: createCardId("unl-224-219"),
  might: 2,
  name: "Mystic Poro",
  rarity: "common",
  rulesText: "[Vision]",
  setId: "UNL",
};
