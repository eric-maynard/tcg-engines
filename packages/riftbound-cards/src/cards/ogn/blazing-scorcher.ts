import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const blazingScorcher: UnitCard = {
  cardNumber: 1,
  cardType: "unit",
  domain: "fury",
  energyCost: 5,
  id: createCardId("ogn-001-298"),
  might: 5,
  name: "Blazing Scorcher",
  rarity: "common",
  rulesText: "[Accelerate] (You may pay [1][fury] as an additional cost to have me enter ready.)",
  setId: "OGN",
};
