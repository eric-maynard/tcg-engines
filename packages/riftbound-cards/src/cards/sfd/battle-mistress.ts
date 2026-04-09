import type { LegendCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const battleMistress: LegendCard = {
  cardNumber: 203,
  cardType: "legend",
  championTag: "Sivir",
  domain: ["body", "chaos"],
  id: createCardId("sfd-203-221"),
  name: "Battle Mistress",
  rarity: "rare",
  rulesText:
    "When you recycle a rune, you may exhaust me to play a Gold gear token exhausted.\nWhen one or more enemy units die, ready me.",
  setId: "SFD",
};
