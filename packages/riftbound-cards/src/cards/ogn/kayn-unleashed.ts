import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const kaynUnleashed: UnitCard = {
  cardNumber: 189,
  cardType: "unit",
  domain: "chaos",
  energyCost: 6,
  id: createCardId("ogn-189-298"),
  isChampion: true,
  might: 6,
  name: "Kayn, Unleashed",
  rarity: "rare",
  rulesText:
    "[Ganking] (I can move from battlefield to battlefield.)\nIf I have moved twice this turn, I don't take damage.",
  setId: "OGN",
  tags: ["Kayn"],
};
