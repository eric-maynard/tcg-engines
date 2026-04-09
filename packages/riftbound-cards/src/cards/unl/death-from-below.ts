import type { SpellCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const deathFromBelow: SpellCard = {
  cardNumber: 186,
  cardType: "spell",
  domain: ["fury", "chaos"],
  energyCost: 4,
  id: createCardId("unl-186-219"),
  name: "Death from Below",
  rarity: "epic",
  rulesText:
    "Kill a unit at a battlefield. Then, if it had 3 [Might] or less, you may play this from your trash for [rainbow].",
  setId: "UNL",
  timing: "action",
};
