import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const enthrallingProtector: UnitCard = {
  cardNumber: 162,
  cardType: "unit",
  domain: "order",
  energyCost: 2,
  id: createCardId("unl-162-219"),
  might: 2,
  name: "Enthralling Protector",
  rarity: "uncommon",
  rulesText:
    "[Hunt] (When I conquer or hold, gain 1 XP.)\nSpend 2 XP: [Buff] me. (Give me a +1 [Might] buff if I don't have one.)",
  setId: "UNL",
};
