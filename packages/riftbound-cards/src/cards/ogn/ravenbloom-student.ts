import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const ravenbloomStudent: UnitCard = {
  cardNumber: 103,
  cardType: "unit",
  domain: "mind",
  energyCost: 2,
  id: createCardId("ogn-103-298"),
  might: 2,
  name: "Ravenbloom Student",
  rarity: "uncommon",
  rulesText: "When you play a spell, give me +1 [Might] this turn.",
  setId: "OGN",
};
