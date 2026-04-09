import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const kaisaEvolutionary: UnitCard = {
  cardNumber: 112,
  cardType: "unit",
  domain: "mind",
  energyCost: 6,
  id: createCardId("ogn-112-298"),
  isChampion: true,
  might: 6,
  name: "Kai'Sa, Evolutionary",
  rarity: "rare",
  rulesText:
    "[Ganking] (I can move from battlefield to battlefield.)\nWhen I conquer, you may play a spell from your trash with Energy cost less than your points without paying its Energy cost. Then recycle it. (You must still pay its Power cost.)",
  setId: "OGN",
  tags: ["Kai'Sa"],
};
