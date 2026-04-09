import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const legionRearguard: UnitCard = {
  cardNumber: 10,
  cardType: "unit",
  domain: "fury",
  energyCost: 2,
  id: createCardId("ogn-010-298"),
  might: 2,
  name: "Legion Rearguard",
  rarity: "common",
  rulesText: "[Accelerate] (You may pay [1][fury] as an additional cost to have me enter ready.)",
  setId: "OGN",
};
