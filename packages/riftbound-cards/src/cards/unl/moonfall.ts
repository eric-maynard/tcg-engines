import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const moonfall: SpellCard = {
  cardNumber: 198,
  cardType: "spell",
  domain: ["mind", "chaos"],
  energyCost: 3,
  id: createCardId("unl-198-219"),
  name: "Moonfall",
  rarity: "epic",
  rulesText:
    "[Action] (Play on your turn or in showdowns.)\nChoose a battlefield where you have units. You may move up to one enemy unit to that battlefield. Then give enemy units there -2 [Might] this turn.",
  setId: "UNL",
  timing: "action",
};
