import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const eclipseHerald: UnitCard = {
  cardNumber: 59,
  cardType: "unit",
  domain: "calm",
  energyCost: 7,
  id: createCardId("ogn-059-298"),
  might: 7,
  name: "Eclipse Herald",
  rarity: "uncommon",
  rulesText: "When you stun an enemy unit, ready me and give me +1 [Might] this turn.",
  setId: "OGN",
};
