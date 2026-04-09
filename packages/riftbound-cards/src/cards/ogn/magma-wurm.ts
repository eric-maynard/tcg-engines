import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const magmaWurm: UnitCard = {
  cardNumber: 11,
  cardType: "unit",
  domain: "fury",
  energyCost: 8,
  id: createCardId("ogn-011-298"),
  might: 8,
  name: "Magma Wurm",
  rarity: "common",
  rulesText: "Other friendly units enter ready.",
  setId: "OGN",
};
