import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const trifarianGloryseeker: UnitCard = {
  cardNumber: 217,
  cardType: "unit",
  domain: "order",
  energyCost: 2,
  id: createCardId("ogn-217-298"),
  might: 2,
  name: "Trifarian Gloryseeker",
  rarity: "common",
  rulesText:
    "[Legion] — When you play me, buff me. (If I don't have a buff, I get a +1 [Might] buff. Get the effect if you've played another card this turn.)",
  setId: "OGN",
};
