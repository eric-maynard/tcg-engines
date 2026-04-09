import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const khazixEvolvingHunter: UnitCard = {
  cardNumber: 119,
  cardType: "unit",
  domain: "body",
  energyCost: 5,
  id: createCardId("unl-119-219"),
  isChampion: true,
  might: 5,
  name: "Kha'Zix, Evolving Hunter",
  rarity: "epic",
  rulesText:
    "[Hunt] (When I conquer or hold, gain 1 XP.)\nWhen I attack, you may spend 3 XP to deal damage equal to my Might to an enemy unit here.",
  setId: "UNL",
  tags: ["Kha'Zix"],
};
