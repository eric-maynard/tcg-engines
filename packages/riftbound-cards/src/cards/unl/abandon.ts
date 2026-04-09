import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const abandon: SpellCard = {
  cardNumber: 131,
  cardType: "spell",
  domain: "chaos",
  energyCost: 2,
  id: createCardId("unl-131-219"),
  name: "Abandon",
  rarity: "uncommon",
  rulesText:
    "[Reaction] (Play any time, even before spells and abilities resolve.)\nCounter a spell. Return it to its owner's hand instead of putting it in their trash.\n[Predict]. (Look at the top card of your Main Deck. You may recycle it.)",
  setId: "UNL",
  timing: "reaction",
};
