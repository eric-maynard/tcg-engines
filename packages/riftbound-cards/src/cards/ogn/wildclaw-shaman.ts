import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const wildclawShaman: UnitCard = {
  cardNumber: 147,
  cardType: "unit",
  domain: "body",
  energyCost: 4,
  id: createCardId("ogn-147-298"),
  might: 3,
  name: "Wildclaw Shaman",
  rarity: "uncommon",
  rulesText:
    "When you play me, you may spend a buff to buff me and ready me. (If I don't have a buff, I get a +1 [Might] buff.)",
  setId: "OGN",
};
