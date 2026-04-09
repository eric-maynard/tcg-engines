import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const yasuoWindrider: UnitCard = {
  cardNumber: 205,
  cardType: "unit",
  domain: "chaos",
  energyCost: 5,
  id: createCardId("ogn-205-298"),
  isChampion: true,
  might: 4,
  name: "Yasuo, Windrider",
  rarity: "epic",
  rulesText:
    "[Ganking] (I can move from battlefield to battlefield.)\nThe third time I move in a turn, you score 1 point.",
  setId: "OGN",
  tags: ["Yasuo"],
};
