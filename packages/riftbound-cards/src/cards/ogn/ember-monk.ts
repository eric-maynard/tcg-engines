import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const emberMonk: UnitCard = {
  cardNumber: 167,
  cardType: "unit",
  domain: "chaos",
  energyCost: 4,
  id: createCardId("ogn-167-298"),
  might: 4,
  name: "Ember Monk",
  rarity: "common",
  rulesText: "When you play a card from [Hidden], give me +2 [Might] this turn.",
  setId: "OGN",
};
