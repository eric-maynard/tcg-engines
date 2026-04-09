import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const noxianGuillotine: SpellCard = {
  cardNumber: 254,
  cardType: "spell",
  domain: ["fury", "order"],
  energyCost: 4,
  id: createCardId("ogn-254-298"),
  name: "Noxian Guillotine",
  rarity: "epic",
  rulesText:
    "[Action] (Play on your turn or in showdowns.)\nChoose a unit. Kill it the next time it takes damage this turn.\n[Legion] — Kill it now instead. (Get the effect if you've played another card this turn.)",
  setId: "OGN",
  timing: "action",
};
