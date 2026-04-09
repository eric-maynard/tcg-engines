import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const poutyPoro: UnitCard = {
  cardNumber: 13,
  cardType: "unit",
  domain: "fury",
  energyCost: 2,
  id: createCardId("ogn-013-298"),
  might: 2,
  name: "Pouty Poro",
  rarity: "common",
  rulesText: "[Deflect] (Opponents must pay [rainbow] to choose me with a spell or ability.)",
  setId: "OGN",
};
