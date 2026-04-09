import type { BattlefieldCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const forgottenLibrary: BattlefieldCard = {
  cardNumber: 211,
  cardType: "battlefield",
  id: createCardId("unl-211-219"),
  name: "Forgotten Library",
  rarity: "uncommon",
  rulesText:
    "While you control this battlefield, when you play a spell, if you spent [4] or more, [Predict]. (Look at the top card of your Main Deck. You may recycle it.)",
  setId: "UNL",
};
