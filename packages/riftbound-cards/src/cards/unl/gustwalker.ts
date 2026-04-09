import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const gustwalker: UnitCard = {
  cardNumber: 75,
  cardType: "unit",
  domain: "mind",
  energyCost: 3,
  id: createCardId("unl-075-219"),
  might: 3,
  name: "Gustwalker",
  rarity: "uncommon",
  rulesText:
    "[Hunt 2] (When I conquer or hold, gain 2 XP.)\n[Level 3][&gt;] I have +1 [Might] and [Ganking]. (While you have 3+ XP, get the effect. A [Ganking] unit can move from battlefield to battlefield.)",
  setId: "UNL",
};
