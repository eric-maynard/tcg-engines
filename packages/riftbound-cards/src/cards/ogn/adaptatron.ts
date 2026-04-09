import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const adaptatron: UnitCard = {
  cardNumber: 56,
  cardType: "unit",
  domain: "calm",
  energyCost: 4,
  id: createCardId("ogn-056-298"),
  might: 3,
  name: "Adaptatron",
  rarity: "uncommon",
  rulesText:
    "When I conquer, you may kill a gear. If you do, buff me. (If I don't have a buff, I get a +1 [Might] buff.)",
  setId: "OGN",
};
