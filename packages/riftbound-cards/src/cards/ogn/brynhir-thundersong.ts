import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const brynhirThundersong: UnitCard = {
  cardNumber: 26,
  cardType: "unit",
  domain: "fury",
  energyCost: 6,
  id: createCardId("ogn-026-298"),
  might: 5,
  name: "Brynhir Thundersong",
  rarity: "rare",
  rulesText: "When you play me, opponents can't play cards this turn.",
  setId: "OGN",
};
