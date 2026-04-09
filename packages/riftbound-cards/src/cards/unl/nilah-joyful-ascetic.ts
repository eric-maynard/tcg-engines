import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const nilahJoyfulAscetic: UnitCard = {
  cardNumber: 115,
  cardType: "unit",
  domain: "body",
  energyCost: 3,
  id: createCardId("unl-115-219"),
  isChampion: true,
  might: 4,
  name: "Nilah, Joyful Ascetic",
  rarity: "rare",
  rulesText:
    "[Accelerate] (You may pay [1][body] as an additional cost to have me enter ready.)\n[Ganking] (I can move from battlefield to battlefield.)\nWhen I move, gain 1 XP.",
  setId: "UNL",
  tags: ["Nilah"],
};
