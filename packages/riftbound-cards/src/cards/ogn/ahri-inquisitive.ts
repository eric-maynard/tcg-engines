import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const ahriInquisitive: UnitCard = {
  cardNumber: 119,
  cardType: "unit",
  domain: "mind",
  energyCost: 3,
  id: createCardId("ogn-119-298"),
  isChampion: true,
  might: 3,
  name: "Ahri, Inquisitive",
  rarity: "epic",
  rulesText:
    "When I attack or defend, give an enemy unit here -2 [Might] this turn, to a minimum of 1 [Might].",
  setId: "OGN",
  tags: ["Ahri"],
};
