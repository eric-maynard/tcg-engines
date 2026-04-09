import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const crowdFavorite: UnitCard = {
  cardNumber: 102,
  cardType: "unit",
  domain: "body",
  energyCost: 3,
  id: createCardId("unl-102-219"),
  might: 3,
  name: "Crowd Favorite",
  rarity: "uncommon",
  rulesText:
    "[Hunt] (When I conquer or hold, gain 1 XP.)\nSpend 2 XP: [Buff] me. (Give me a +1 [Might] buff if I don't have one.)",
  setId: "UNL",
};
