import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const shipyardSkulker: UnitCard = {
  cardNumber: 175,
  cardType: "unit",
  domain: "chaos",
  energyCost: 3,
  id: createCardId("ogn-175-298"),
  might: 3,
  name: "Shipyard Skulker",
  rarity: "common",
  setId: "OGN",
};
