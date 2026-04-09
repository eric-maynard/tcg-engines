import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const cithriaOfCloudfield: UnitCard = {
  cardNumber: 139,
  cardType: "unit",
  domain: "body",
  energyCost: 2,
  id: createCardId("ogn-139-298"),
  might: 1,
  name: "Cithria of Cloudfield",
  rarity: "uncommon",
  rulesText:
    "When you play another unit, buff me. (If I don't have a buff, I get a +1 [Might] buff.)",
  setId: "OGN",
};
