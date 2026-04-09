import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const yasuoRemorseful: UnitCard = {
  cardNumber: 76,
  cardType: "unit",
  domain: "calm",
  energyCost: 6,
  id: createCardId("ogn-076-298"),
  isChampion: true,
  might: 6,
  name: "Yasuo, Remorseful",
  rarity: "rare",
  rulesText: "When I attack, deal damage equal to my Might to an enemy unit here.",
  setId: "OGN",
  tags: ["Yasuo"],
};
