import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const soaringScout: UnitCard = {
  cardNumber: 216,
  cardType: "unit",
  domain: "order",
  energyCost: 2,
  id: createCardId("ogn-216-298"),
  might: 1,
  name: "Soaring Scout",
  rarity: "common",
  rulesText: "[Deathknell] — Channel 1 rune exhausted. (When I die, get the effect.)",
  setId: "OGN",
};
