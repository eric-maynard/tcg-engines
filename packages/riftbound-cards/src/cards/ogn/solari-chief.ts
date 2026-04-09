import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const solariChief: UnitCard = {
  cardNumber: 225,
  cardType: "unit",
  domain: "order",
  energyCost: 5,
  id: createCardId("ogn-225-298"),
  might: 4,
  name: "Solari Chief",
  rarity: "uncommon",
  rulesText:
    "When you play me, choose an enemy unit. If it is stunned, kill it. Otherwise, stun it. (It doesn't deal combat damage this turn.)",
  setId: "OGN",
};
