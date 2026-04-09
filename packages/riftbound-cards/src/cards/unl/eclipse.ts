import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const eclipse: SpellCard = {
  cardNumber: 63,
  cardType: "spell",
  domain: "mind",
  energyCost: 3,
  id: createCardId("unl-063-219"),
  name: "Eclipse",
  rarity: "common",
  rulesText:
    "[Reaction] (Play any time, even before spells and abilities resolve.)\nGive a unit -4 [Might] this turn.\n[Predict]. (Look at the top card of your Main Deck. You may recycle it.)",
  setId: "UNL",
  timing: "reaction",
};
