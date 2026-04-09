import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const flameChompers: UnitCard = {
  cardNumber: 6,
  cardType: "unit",
  domain: "fury",
  energyCost: 3,
  id: createCardId("ogn-006-298"),
  might: 3,
  name: "Flame Chompers",
  rarity: "common",
  rulesText: "When you discard me, you may pay [fury] to play me.",
  setId: "OGN",
};
