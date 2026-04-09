import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const poroHerder: UnitCard = {
  cardNumber: 61,
  cardType: "unit",
  domain: "calm",
  energyCost: 3,
  id: createCardId("ogn-061-298"),
  might: 3,
  name: "Poro Herder",
  rarity: "uncommon",
  rulesText:
    "When you play me, if you control a Poro, buff me and draw 1. (If I don't have a buff, I get a +1 [Might] buff.)",
  setId: "OGN",
};
