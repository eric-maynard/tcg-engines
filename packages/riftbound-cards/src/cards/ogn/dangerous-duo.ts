import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const dangerousDuo: UnitCard = {
  cardNumber: 16,
  cardType: "unit",
  domain: "fury",
  energyCost: 3,
  id: createCardId("ogn-016-298"),
  might: 3,
  name: "Dangerous Duo",
  rarity: "uncommon",
  rulesText:
    "[Legion] — When you play me, give a unit +2 [Might] this turn. (Get the effect if you've played another card this turn.)",
  setId: "OGN",
};
