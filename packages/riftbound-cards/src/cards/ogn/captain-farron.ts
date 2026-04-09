import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const captainFarron: UnitCard = {
  cardNumber: 15,
  cardType: "unit",
  domain: "fury",
  energyCost: 4,
  id: createCardId("ogn-015-298"),
  might: 5,
  name: "Captain Farron",
  rarity: "uncommon",
  rulesText: "Other friendly units here have [Assault]. (+1 [Might] while they're attackers.)",
  setId: "OGN",
};
