import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const brazenBuccaneer: UnitCard = {
  cardNumber: 2,
  cardType: "unit",
  domain: "fury",
  energyCost: 6,
  id: createCardId("ogn-002-298"),
  might: 5,
  name: "Brazen Buccaneer",
  rarity: "common",
  rulesText:
    "As you play me, you may discard 1 as an additional cost. If you do, reduce my cost by [2].",
  setId: "OGN",
};
