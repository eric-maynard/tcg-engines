import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const monch: UnitCard = {
  cardNumber: 35,
  cardType: "unit",
  domain: "calm",
  energyCost: 6,
  id: createCardId("unl-035-219"),
  might: 6,
  name: "Monch",
  rarity: "common",
  rulesText: "If an opponent controls a stunned unit, I cost [2] less and enter ready.",
  setId: "UNL",
};
