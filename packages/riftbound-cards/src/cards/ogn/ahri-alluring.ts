import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const ahriAlluring: UnitCard = {
  cardNumber: 66,
  cardType: "unit",
  domain: "calm",
  energyCost: 5,
  id: createCardId("ogn-066-298"),
  isChampion: true,
  might: 4,
  name: "Ahri, Alluring",
  rarity: "rare",
  rulesText: "When I hold, you score 1 point.",
  setId: "OGN",
  tags: ["Ahri"],
};
