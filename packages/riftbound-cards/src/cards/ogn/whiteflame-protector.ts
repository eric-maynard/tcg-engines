import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const whiteflameProtector: UnitCard = {
  cardNumber: 82,
  cardType: "unit",
  domain: "calm",
  energyCost: 8,
  id: createCardId("ogn-082-298"),
  might: 8,
  name: "Whiteflame Protector",
  rarity: "epic",
  rulesText: "When you play me, give a unit +8 [Might] this turn.",
  setId: "OGN",
};
