import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const chakramDancer: UnitCard = {
  cardNumber: 71,
  cardType: "unit",
  domain: "mind",
  energyCost: 3,
  id: createCardId("unl-071-219"),
  might: 3,
  name: "Chakram Dancer",
  rarity: "uncommon",
  rulesText:
    "[Ambush] (You may play me as a [Reaction] to a battlefield where you have units.)\nWhen you play me, give your other units here [Shield] this turn. (+1 [Might] while they're defenders.)",
  setId: "UNL",
};
