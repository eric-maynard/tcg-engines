import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const sinisterPoro: UnitCard = {
  cardNumber: 137,
  cardType: "unit",
  domain: "chaos",
  energyCost: 2,
  id: createCardId("unl-137-219"),
  might: 1,
  name: "Sinister Poro",
  rarity: "uncommon",
  rulesText: "When I attack, you may pay [1] to move an enemy unit here to its base.",
  setId: "UNL",
};
