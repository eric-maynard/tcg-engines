import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const heimerdingerInventor: UnitCard = {
  cardNumber: 111,
  cardType: "unit",
  domain: "mind",
  energyCost: 3,
  id: createCardId("ogn-111-298"),
  isChampion: true,
  might: 3,
  name: "Heimerdinger, Inventor",
  rarity: "rare",
  rulesText: "I have all [Exhaust] abilities of all friendly legends, units, and gear.",
  setId: "OGN",
  tags: ["Heimerdinger"],
};
