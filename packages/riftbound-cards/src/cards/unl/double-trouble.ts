import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const doubleTrouble: SpellCard = {
  cardNumber: 32,
  cardType: "spell",
  domain: "calm",
  energyCost: 2,
  id: createCardId("unl-032-219"),
  name: "Double Trouble",
  rarity: "common",
  rulesText:
    "[Repeat] [2] (You may pay the additional cost to repeat this spell's effect.)\nLook at the top 3 cards of your Main Deck. You may reveal a unit from among them and draw it. Recycle the rest.",
  setId: "UNL",
  timing: "action",
};
