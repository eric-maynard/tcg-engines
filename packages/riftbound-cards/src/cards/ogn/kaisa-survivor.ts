import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const kaisaSurvivor: UnitCard = {
  cardNumber: 39,
  cardType: "unit",
  domain: "fury",
  energyCost: 4,
  id: createCardId("ogn-039-298"),
  isChampion: true,
  might: 4,
  name: "Kai'Sa, Survivor",
  rarity: "epic",
  rulesText:
    "[Accelerate] (You may pay [1][fury] as an additional cost to have me enter ready.)\nWhen I conquer, draw 1.",
  setId: "OGN",
  tags: ["Kai'Sa"],
};
