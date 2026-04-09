import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const drMundoExpert: UnitCard = {
  cardNumber: 109,
  cardType: "unit",
  domain: "mind",
  energyCost: 8,
  id: createCardId("ogn-109-298"),
  isChampion: true,
  might: 6,
  name: "Dr. Mundo, Expert",
  rarity: "rare",
  rulesText:
    "My Might is increased by the number of cards in your trash.\nAt the start of your Beginning Phase, recycle 3 from your trash.",
  setId: "OGN",
  tags: ["Dr. Mundo"],
};
