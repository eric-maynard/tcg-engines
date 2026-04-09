import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const kinkouMonk: UnitCard = {
  cardNumber: 141,
  cardType: "unit",
  domain: "body",
  energyCost: 4,
  id: createCardId("ogn-141-298"),
  might: 4,
  name: "Kinkou Monk",
  rarity: "uncommon",
  rulesText:
    "When you play me, buff up to two other friendly units. (Each one that doesn't have a buff gets a +1 [Might] buff.)",
  setId: "OGN",
};
