import type { UnitCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const shadow: UnitCard = {
  cardNumber: 194,
  cardType: "unit",
  domain: ["calm", "chaos"],
  energyCost: 3,
  id: createCardId("unl-194-219"),
  might: 3,
  name: "Shadow",
  rarity: "epic",
  rulesText:
    "If you play me to a battlefield, I enter ready.\n[Action][&gt;] [1][rainbow], [Exhaust]: [Stun] an enemy unit attacking here. (It doesn't deal combat damage this turn.)",
  setId: "UNL",
};
