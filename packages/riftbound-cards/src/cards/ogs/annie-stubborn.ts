import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const annieStubborn: UnitCard = {
  cardNumber: 10,
  cardType: "unit",
  domain: "chaos",
  energyCost: 4,
  id: createCardId("ogs-010-024"),
  isChampion: true,
  might: 3,
  name: "Annie, Stubborn",
  rarity: "rare",
  rulesText: "When you play me, return a spell from your trash to your hand.",
  setId: "OGS",
  tags: ["Annie"],
};
