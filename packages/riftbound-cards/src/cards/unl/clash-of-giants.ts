import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const clashOfGiants: SpellCard = {
  cardNumber: 110,
  cardType: "spell",
  domain: "body",
  energyCost: 6,
  id: createCardId("unl-110-219"),
  name: "Clash of Giants",
  rarity: "rare",
  rulesText: "Choose two units. They deal damage equal to their Mights to each other.",
  setId: "UNL",
  timing: "action",
};
