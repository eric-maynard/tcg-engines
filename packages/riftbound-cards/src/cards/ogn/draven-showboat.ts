import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const dravenShowboat: UnitCard = {
  cardNumber: 28,
  cardType: "unit",
  domain: "fury",
  energyCost: 5,
  id: createCardId("ogn-028-298"),
  isChampion: true,
  might: 3,
  name: "Draven, Showboat",
  rarity: "rare",
  rulesText: "My Might is increased by your points.",
  setId: "OGN",
  tags: ["Draven"],
};
