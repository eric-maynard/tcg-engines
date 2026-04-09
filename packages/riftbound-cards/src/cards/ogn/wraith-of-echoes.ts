import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const wraithOfEchoes: UnitCard = {
  cardNumber: 118,
  cardType: "unit",
  domain: "mind",
  energyCost: 6,
  id: createCardId("ogn-118-298"),
  might: 5,
  name: "Wraith of Echoes",
  rarity: "rare",
  rulesText: "The first time a friendly unit dies each turn, draw 1.",
  setId: "OGN",
};
