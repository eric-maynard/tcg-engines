import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const bilgewaterBully: UnitCard = {
  cardNumber: 125,
  cardType: "unit",
  domain: "body",
  energyCost: 6,
  id: createCardId("ogn-125-298"),
  might: 6,
  name: "Bilgewater Bully",
  rarity: "common",
  rulesText: "While I'm buffed, I have [Ganking]. (I can move from battlefield to battlefield.)",
  setId: "OGN",
};
