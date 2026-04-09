import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const sonaHarmonious: UnitCard = {
  cardNumber: 73,
  cardType: "unit",
  domain: "calm",
  energyCost: 4,
  id: createCardId("ogn-073-298"),
  isChampion: true,
  might: 4,
  name: "Sona, Harmonious",
  rarity: "rare",
  rulesText: "At the end of your turn, if I'm at a battlefield, ready up to 4 friendly runes.",
  setId: "OGN",
  tags: ["Sona"],
};
