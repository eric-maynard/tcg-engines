import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const megatusk: UnitCard = {
  cardNumber: 126,
  cardType: "unit",
  domain: "chaos",
  energyCost: 6,
  id: createCardId("unl-126-219"),
  might: 6,
  name: "Megatusk",
  rarity: "common",
  rulesText:
    "Spend 3 XP: Give your units here [Ganking] this turn. (We can move from battlefield to battlefield.)",
  setId: "UNL",
};
