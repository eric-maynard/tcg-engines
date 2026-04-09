import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const soulShepherd: UnitCard = {
  cardNumber: 77,
  cardType: "unit",
  domain: "mind",
  energyCost: 5,
  id: createCardId("unl-077-219"),
  might: 3,
  name: "Soul Shepherd",
  rarity: "uncommon",
  rulesText: "Your token units have +1 [Might].",
  setId: "UNL",
};
