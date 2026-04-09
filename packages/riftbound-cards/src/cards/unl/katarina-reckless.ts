import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const katarinaReckless: UnitCard = {
  cardNumber: 23,
  cardType: "unit",
  domain: "fury",
  energyCost: 5,
  id: createCardId("unl-023-219"),
  isChampion: true,
  might: 5,
  name: "Katarina, Reckless",
  rarity: "rare",
  rulesText:
    "When you hide a card, ready me.\nWhen you play a card from face down, deal 2 to an enemy unit.",
  setId: "UNL",
  tags: ["Katarina"],
};
