import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const eagerApprentice: UnitCard = {
  cardNumber: 84,
  cardType: "unit",
  domain: "mind",
  energyCost: 3,
  id: createCardId("ogn-084-298"),
  might: 3,
  name: "Eager Apprentice",
  rarity: "common",
  rulesText:
    "While I'm at a battlefield, the Energy costs for spells you play is reduced by [1], to a minimum of [1].",
  setId: "OGN",
};
