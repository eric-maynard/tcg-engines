import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const pitRookie: UnitCard = {
  cardNumber: 136,
  cardType: "unit",
  domain: "body",
  energyCost: 2,
  id: createCardId("ogn-136-298"),
  might: 2,
  name: "Pit Rookie",
  rarity: "common",
  rulesText:
    "When you play me, buff another friendly unit. (If it doesn't have a buff, it gets a +1 [Might] buff.)",
  setId: "OGN",
};
