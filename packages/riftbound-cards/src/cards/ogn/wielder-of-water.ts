import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const wielderOfWater: UnitCard = {
  cardNumber: 55,
  cardType: "unit",
  domain: "calm",
  energyCost: 3,
  id: createCardId("ogn-055-298"),
  might: 2,
  name: "Wielder of Water",
  rarity: "common",
  rulesText: "While I'm attacking or defending alone, I have +2 [Might].",
  setId: "OGN",
};
