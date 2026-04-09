import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const tacticalRetreat: SpellCard = {
  cardNumber: 175,
  cardType: "spell",
  domain: "order",
  energyCost: 2,
  id: createCardId("unl-175-219"),
  name: "Tactical Retreat",
  rarity: "rare",
  rulesText:
    "[Reaction] (Play any time, even before spells and abilities resolve.)\nChoose a friendly unit. The next time it would die this turn, heal it, exhaust it, and recall it instead. (Send it to base. This isn't a move.)",
  setId: "UNL",
  timing: "reaction",
};
