import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const blitzcrankImpassive: UnitCard = {
  cardNumber: 67,
  cardType: "unit",
  domain: "calm",
  energyCost: 5,
  id: createCardId("ogn-067-298"),
  isChampion: true,
  might: 5,
  name: "Blitzcrank, Impassive",
  rarity: "rare",
  rulesText:
    "[Tank] (I must be assigned combat damage first.)\nWhen you play me to a battlefield, you may move an enemy unit to here.\nWhen I hold, return me to my owner's hand.",
  setId: "OGN",
  tags: ["Blitzcrank"],
};
