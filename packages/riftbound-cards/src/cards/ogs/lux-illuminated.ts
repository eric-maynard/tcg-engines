import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const luxIlluminated: UnitCard = {
  cardNumber: 6,
  cardType: "unit",
  domain: "mind",
  energyCost: 6,
  id: createCardId("ogs-006-024"),
  isChampion: true,
  might: 5,
  name: "Lux, Illuminated",
  rarity: "rare",
  rulesText: "When you play a spell that costs [5] or more, give me +3 [Might] this turn.",
  setId: "OGS",
  tags: ["Lux"],
};
