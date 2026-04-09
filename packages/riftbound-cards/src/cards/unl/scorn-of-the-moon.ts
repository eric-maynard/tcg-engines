import type { LegendCard } from "@tcg/riftbound-types/cards";
import { createCardId } from "@tcg/riftbound-types/cards";

export const scornOfTheMoon: LegendCard = {
  cardNumber: 197,
  cardType: "legend",
  championTag: "Diana",
  domain: ["mind", "chaos"],
  id: createCardId("unl-197-219"),
  name: "Scorn of the Moon",
  rarity: "rare",
  rulesText:
    "[Reaction][&gt;] [Exhaust]: [Add] [1]. Spend this Energy only during showdowns. (Abilities that add resources can't be reacted to.)",
  setId: "UNL",
};
