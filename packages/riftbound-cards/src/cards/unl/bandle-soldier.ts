import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const bandleSoldier: UnitCard = {
  cardNumber: 151,
  cardType: "unit",
  domain: "order",
  energyCost: 4,
  id: createCardId("unl-151-219"),
  might: 5,
  name: "Bandle Soldier",
  rarity: "common",
  rulesText: "[Level 3][&gt;] I enter ready. (While you have 3+ XP, get the effect.)",
  setId: "UNL",
};
